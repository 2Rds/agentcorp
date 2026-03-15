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

`AuthProvider` uses `onAuthStateChange` exclusively for session tracking — the `INITIAL_SESSION` event provides the session on page load, eliminating the need for a separate `getSession()` call. On auth, identifies user with PostHog and sets Sentry user context; on sign-out, resets both. All Supabase queries use the authenticated client, which automatically includes the JWT.

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

## SSRF Protection (Tool Helpers)

All department agent tools use `@waas/runtime` shared helpers for outbound HTTP requests. The `isAllowedUrl()` function validates URLs before any `fetch_url` or `safeFetchText` call:

1. **Protocol enforcement** — Only `http:` and `https:` allowed
2. **Private IP blocking** — `10.x`, `172.16-31.x`, `192.168.x`, `fc00:/fd:` IPv6
3. **Cloud metadata blocking** — `169.254.169.254`, `metadata.google.internal`
4. **Internal hostname blocking** — `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`
5. **Internal suffix blocking** — `.internal`, `.local`, `.localhost`

Additional tool-level protections:
- `safeFetch<T>()` — Validates HTTP status codes, returns structured `{ ok, data } | { ok: false, error }` instead of silent failure
- `safeJsonParse()` — Prevents `JSON.parse` crashes from malformed input
- `stripHtml()` — Removes HTML tags from fetched web pages to prevent prompt injection

## Namespace Isolation (Agent-to-Agent)

Each agent operates within a defined `ToolScope` that controls access to Redis, mem0, Supabase tables, and Notion databases. Enforcement is fail-closed via `ScopeEnforcer` (`@waas/shared/namespace`).

| Agent | Redis | Mem0 | Notion | Cross-Namespace |
|-------|-------|------|--------|-----------------|
| EA (Alex) | `blockdrive:ea:` RW, `blockdrive:` R | Own RW, `*` R | Decision Log RW, Project Hub RW, Pipeline R | Executive read all |
| CFA (Morgan) | `blockdrive:cfa:` RW | Own RW | Pipeline RW, Decision Log RW, Project Hub R | None |
| COA (Jordan) | `blockdrive:coa:` RW, `blockdrive:` R | Own RW, `*` R | Full workspace RW | Executive read all |
| CMA (Taylor) | `blockdrive:cma:` RW | Own RW | Project Hub R | None |
| CCO (Compliance) | `blockdrive:compliance:` RW, `blockdrive:` R | Own RW, `*` R | Decision Log R, Project Hub R | Audit read all |
| Legal (Casey) | `blockdrive:legal:` RW | Own RW | Decision Log RW | None |
| Sales (Sam) | `blockdrive:sales:` RW | Own RW | Pipeline R | None |

CFO agent inlines CFA_SCOPE Notion access rules directly in `notion-client.ts` (the CFO agent package is not a workspace member and cannot import from `@waas/shared`). EA agent has executive-tier cross-namespace read access to all department memories.

### Telegram Bot Security

EA agent's Telegram bot transport enforces:
- `TELEGRAM_CHAT_ID` whitelist — only authorized chat IDs can interact
- 20-message conversation history limit per chat

## API Key Management

| Key | Scope | Storage |
|-----|-------|---------|
| `ANTHROPIC_API_KEY` | All agent servers | `agent/.env`, `agents/*/.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | All agent servers | `agent/.env`, `agents/*/.env` |
| `OPENROUTER_API_KEY` | All agent servers | `agent/.env`, `agents/*/.env` |
| `MEM0_API_KEY` | All agent servers | `agent/.env`, `agents/*/.env` |
| `NOTION_API_KEY` | All agent servers (optional) | `agent/.env`, `agents/*/.env` |
| `PERPLEXITY_API_KEY` | Dept agents (optional, fallback to OpenRouter) | `agents/*/.env` |
| `SENTRY_DSN` | All agent servers (error tracking) | `agent/.env`, `agents/*/.env` |
| `POSTHOG_API_KEY` | All agent servers (analytics, write-only) | `agent/.env`, `agents/*/.env` |
| `VITE_SENTRY_DSN` | Frontend (error tracking) | `.env` |
| `VITE_POSTHOG_KEY` | Frontend (analytics, write-only) | `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend (public) | `.env` |
| `CSUITE_TELEGRAM_CHAT_ID` | All agents (governance group chat) | `agents/*/.env` |
| `GOVERNANCE_APPROVER_IDS` | All agents (authorized Telegram user IDs) | `agents/*/.env` |
| `WEBHOOK_SECRET` | Agent servers (webhook handler auth) | `agents/*/.env` |

Optional Cloudflare AI Gateway "Provider Keys" mode (`CF_AIG_TOKEN`) allows the gateway to inject API keys at the edge — keys never leave the server.

### Observability Key Security

- **PostHog project token** — Write-only, cannot read data. Safe to include in frontend bundles.
- **Sentry DSN** — Write-only, used for error reporting. Safe to include in frontend bundles.
- **Source maps** — Only generated during build when `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` are set. Uploaded to Sentry but NOT served via CDN. `SENTRY_AUTH_TOKEN` is a build-time secret, never shipped to the browser.

## Governance Controls

### Spend Tracking

GovernanceEngine tracks daily API spend per agent via Redis counters. Estimated token costs are computed after each agent query (character-based estimation with 3x multiplier for tool-use overhead) and recorded to both Redis (real-time limits) and Supabase `agent_usage_events` table (frontend visibility).

### Approval Gates

Actions in configured categories (external communications, marketing activities, social media posts, financial commitments) require CEO approval via Telegram inline keyboard in the C-Suite group chat before execution. Approvals are stored in Redis with TTL and resolved by authorized approver IDs.

### Agent Directives

All 7 agent system prompts include governance directives requiring approval before external-facing actions. Agents cannot bypass governance — the directives are injected into the system prompt, not agent-configurable.

## Database Webhooks Security

The `webhook-handler` Edge Function receives pg_net trigger events and forwards to agent servers.

- **Auth:** Timing-safe Bearer token comparison against `WEBHOOK_SECRET` env var (falls back to `SUPABASE_SERVICE_ROLE_KEY`)
- **Content-Type:** Validates `application/json` header (415 on mismatch)
- **Internal only:** No CORS headers — this endpoint is called by pg_net, not browsers
- **Trigger functions:** `SECURITY DEFINER` with `REVOKE EXECUTE FROM PUBLIC` — only the postgres role (table owner) can invoke
- **Exception handling:** `BEGIN..EXCEPTION WHEN OTHERS` around `net.http_post()` — trigger failures never block the originating INSERT
- **Response logging:** pg_net stores request/response in `net._http_response` (postgres-role access only, auto-cleaned)

## Organization Data Isolation

All user-facing data is scoped to organizations:

- Every data table has an `organization_id` column
- RLS policies enforce org membership on every query
- The agent server verifies org membership in middleware before processing any request
- Mem0 memories are org-scoped via `user_id` = organization UUID
- Redis indexes include `org_id` TAG filters
- Storage objects are organized by `{organization_id}/` folder prefix

There is no cross-organization data access path.
