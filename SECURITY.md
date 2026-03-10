# Security

## Authentication

### Supabase Auth (Native)

The platform uses native Supabase Auth with email+password authentication. No third-party auth providers.

- **Sign-in:** `supabase.auth.signInWithPassword()` via custom form
- **Sign-up:** `supabase.auth.signUp()` with `display_name` metadata
- **Session management:** Supabase JS SDK manages sessions via localStorage
- **Token format:** JWT access tokens issued by Supabase Auth

### Frontend Auth Flow

```
/auth (email+password form)
  → supabase.auth.signInWithPassword()
  → AuthProvider catches onAuthStateChange
  → ProtectedRoute checks isSignedIn
  → OrgGate checks org membership
  → Onboarding (if no org) or AppLayout
```

`AuthProvider` subscribes to `onAuthStateChange` before calling `getSession()` to avoid race conditions. All Supabase queries use the authenticated client, which automatically includes the JWT.

### Agent Server Auth

The agent server validates tokens independently using the Supabase service role:

```
Client sends: Authorization: Bearer <access_token>
  → authMiddleware extracts token
  → verifyToken() checks in-memory TTL cache (5 min)
  → Cache miss: supabaseAdmin.auth.getUser(token)
  → Verify org membership via user_roles table
  → Attach userId + organizationId to request
```

The token cache prevents per-request Supabase round-trips. Cache is bounded at 500 entries with automatic stale-entry pruning.

## Row-Level Security (RLS)

All tables have RLS enabled. Policies use `auth.uid()` (UUID) for user identification.

### Helper Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `is_org_member` | `(UUID, UUID) → BOOLEAN` | Check if user belongs to organization |
| `has_role` | `(UUID, app_role, UUID) → BOOLEAN` | Check if user has specific role in org |
| `get_user_org` | `(UUID) → UUID` | Get user's organization ID |
| `can_create_org` | `(UUID) → BOOLEAN` | Check if user can create a new org |

All functions are `SECURITY DEFINER` with `search_path = public`.

### Policy Patterns

**Read access:** All org members can read their organization's data.
```sql
USING (public.is_org_member(auth.uid(), organization_id))
```

**Write access:** Only owners and cofounders can modify data.
```sql
WITH CHECK (
  public.is_org_member(auth.uid(), organization_id)
  AND (
    public.has_role(auth.uid(), 'owner', organization_id)
    OR public.has_role(auth.uid(), 'cofounder', organization_id)
  )
)
```

**Self-scoped:** Users can only modify their own profiles.
```sql
USING (user_id = auth.uid())
```

### Role Hierarchy

| Role | Read | Write | Manage Roles | Delete Org |
|------|------|-------|--------------|------------|
| `owner` | Yes | Yes | Yes | Yes |
| `cofounder` | Yes | Yes | No | No |
| `advisor` | Yes | No | No | No |
| `investor` | Yes | No | No | No |

### Public Access

The data room and link tracking are accessible without authentication:
- `investor_links` — SELECT for anon (validates via slug)
- `link_views` — INSERT for anon (view tracking)
- `organizations` — SELECT for anon (name display in data room)

## SQL Injection Prevention

The `sql-validator.ts` module validates all AI-generated SQL queries before execution:

1. **UUID validation** — Organization ID must match UUID format
2. **SELECT-only** — Only SELECT statements allowed
3. **Forbidden keywords** — Blocks 28 mutation/admin keywords (INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, GRANT, EXEC, UNION, etc.)
4. **Schema blocking** — Blocks access to `pg_*`, `information_schema`, `auth`
5. **Multi-statement prevention** — Single statement only (no semicolons)
6. **Table allowlist** — Only 7 tables: `financial_model`, `cap_table_entries`, `knowledge_base`, `documents`, `investor_links`, `link_views`, `organizations`
7. **Org-scoping injection** — Auto-injects `WHERE organization_id = '<orgId>'` if missing
8. **LIMIT enforcement** — Adds `LIMIT 1000` if absent, caps existing limits at 1000
9. **Comment stripping** — Removes `--` and `/* */` comments to prevent bypass

## Data Room Security

Public investor data rooms (`/dataroom/:slug`) have additional controls:

- **Rate limiting** — Per-IP request throttling
- **Scenario validation** — Only `base`, `best`, `worst` accepted
- **No leaked org IDs** — Accessed via slug, not organization UUID
- **Password gating** — Optional password requirement per link
- **Email capture** — Optional email collection before access
- **Expiry dates** — Links can be time-limited
- **Link-level document access** — `allowedDocumentIds` restricts which documents are visible
- **View tracking** — All views logged to `link_views` with IP, user agent, timestamp

## Service Role Key

The agent server uses the Supabase service role key (bypasses RLS) for:
- Token verification (`supabaseAdmin.auth.getUser()`)
- Org membership checks
- Knowledge extraction (background writes)
- Document processing

The service role key is never exposed to the frontend. The frontend uses the anon/publishable key exclusively.

## Namespace Isolation (Agent-to-Agent)

Each agent operates within a defined `ToolScope` that controls access to Redis, mem0, Supabase tables, and Notion databases. Enforcement is fail-closed via `ScopeEnforcer` (`@waas/shared/namespace`).

| Agent | Redis | Mem0 | Notion | Cross-Namespace |
|-------|-------|------|--------|-----------------|
| EA (Alex) | `blockdrive:ea:` RW, `blockdrive:` R | Own RW, `*` R | Decision Log RW, Project Hub RW, Pipeline R | Executive read all |
| CFA (Morgan) | `blockdrive:cfa:` RW | Own RW | Pipeline RW, Decision Log RW, Project Hub R | None |

CFO agent inlines CFA_SCOPE Notion access rules directly in `notion-client.ts` (the CFO agent package is not a workspace member and cannot import from `@waas/shared`). EA agent has executive-tier cross-namespace read access to all department memories.

### Telegram Bot Security

EA agent's Telegram bot transport enforces:
- `TELEGRAM_CHAT_ID` whitelist — only authorized chat IDs can interact
- 20-message conversation history limit per chat

## API Key Management

| Key | Scope | Storage |
|-----|-------|---------|
| `ANTHROPIC_API_KEY` | Both agent servers | `agent/.env`, `agents/ea/.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | Both agent servers | `agent/.env`, `agents/ea/.env` |
| `OPENROUTER_API_KEY` | Both agent servers | `agent/.env`, `agents/ea/.env` |
| `MEM0_API_KEY` | Both agent servers | `agent/.env`, `agents/ea/.env` |
| `NOTION_API_KEY` | Both agent servers (optional) | `agent/.env`, `agents/ea/.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend (public) | `.env` |

Optional Cloudflare AI Gateway "Provider Keys" mode (`CF_AIG_TOKEN`) allows the gateway to inject API keys at the edge — keys never leave the server.

## Organization Data Isolation

All user-facing data is scoped to organizations:

- Every data table has an `organization_id` column
- RLS policies enforce org membership on every query
- The agent server verifies org membership in middleware before processing any request
- Mem0 memories are org-scoped via `user_id` = organization UUID
- Redis indexes include `org_id` TAG filters
- Storage objects are organized by `{organization_id}/` folder prefix

There is no cross-organization data access path.
