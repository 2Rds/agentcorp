# WaaS Security

## Authentication

### Supabase JWT Verification

Every protected route requires a valid Supabase JWT:

```
Authorization: Bearer <supabase-jwt>
```

1. Token extracted from `Authorization` header
2. Verified via `supabaseAdmin.auth.getUser(token)`
3. Cached for 5 minutes (bounded at 500 entries, LRU eviction)
4. `userId` extracted from verified user object

**Token cache is instance-scoped** — each AgentRuntime has its own cache map, not a shared module-level singleton. This prevents cross-agent cache pollution.

### Organization Membership

After JWT verification, every request must include `organizationId`:

1. Extracted from request body or query params
2. Format-validated: max 128 chars, alphanumeric + hyphens only
3. Membership verified via `user_roles` table lookup
4. Non-members receive 403

```sql
SELECT id FROM user_roles
WHERE user_id = $userId AND organization_id = $organizationId
LIMIT 1;
```

## Namespace Isolation

### Scoped Redis

Each agent's Redis keys are prefixed with `{department}:{agentId}:`:

```
finance:blockdrive-cfa:cache:query-hash
finance:blockdrive-cfa:inbox
operations:blockdrive-coa:cache:query-hash
```

Read access follows scope rules:
- Own namespace: full read/write
- Department namespace: read-only (configurable)
- `shared:*` namespace: read-only for all agents
- Other departments: denied

### Scoped Memory

Memory queries are scoped to `agent_id` + `org_id`:

```json
{
  "agent_id": "blockdrive-cfa",
  "org_id": "org-uuid",
  "query": "user message"
}
```

Agents cannot read other agents' memories. Session memories are further scoped by `conversation_id`.

### Inter-Agent Message Access

Scope enforcement is **fail-closed**:

- Unregistered agents are denied (not allowed by default)
- `canMessage` arrays are explicit — only listed agents can be messaged
- Escalation messages bypass `canMessage` (intentional — routed to EA for triage)
- Telegram chat IDs are verified against a registered allowlist

## Input Validation

### Conversation History

Client-provided history messages are:
1. Filtered to whitelist roles only (`user`, `assistant`)
2. XML-escaped to prevent injection: `& < > " '`
3. Wrapped in `<conversation_history>` XML blocks

### organizationId

- Type-checked: must be string (not array from query params)
- Length-bounded: max 128 characters
- Format-validated: `/[^\w-]/` rejects special characters
- Membership-verified: checked against `user_roles` table

### Plugin File Loading

- Path traversal protection: `resolve()` + `normalize()` + `startsWith()` check
- Skills loaded from filesystem are validated against resolved plugin directory
- Blocked paths are logged and rejected

## Network Security

### API Timeouts

All external API calls use AbortController with enforced timeouts:

| Target | Timeout | Rationale |
|--------|---------|-----------|
| Anthropic API | 60s | Complex reasoning can be slow |
| OpenRouter API | 60s | Proxied model calls |
| Perplexity API | 60s | Deep research queries |
| Cohere API | 30s | Embed/rerank are fast operations |
| Redis memory API | 15s | Memory operations are simple |

### Rate Limiting

- Default: 100 requests per 15-minute window
- `/health` endpoint is exempt (monitoring probes)
- Trust proxy: enabled (default: 1 — single reverse proxy)
- Rate limit headers: standard (`RateLimit-*`), no legacy (`X-RateLimit-*`)

### SSE Connection Management

- Client disconnect detection: `req.on("close")` handler
- Agent query loop breaks immediately on disconnect
- Server shutdown: 5-second timeout for hanging SSE connections
- Signal handler registered once (prevents listener leak)

## Telegram Transport Security

- Only messages from registered chat IDs are processed
- Unregistered chat IDs are logged and rejected
- Bot-to-bot messages are JSON-encoded (non-JSON messages from humans are ignored)
- Each agent has a dedicated Telegram bot (no shared bots)

## Error Handling

### Auth Errors
- Missing/malformed JWT: 401
- Expired/invalid token: 401
- Missing organizationId: 400
- Invalid organizationId format: 400
- Non-member: 403
- Internal auth failure: 500

### Chat Errors
- Missing message: 400
- Agent query failure: SSE error event + stream end
- SDK errors: surfaced to client as error SSE events (not swallowed)

### Memory Client Rate Limiting
- Redis connection errors detected with circuit breaker pattern
- Errors thrown (not swallowed) — caller decides retry strategy

## Secret Management

| Secret | Scope | Usage |
|--------|-------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Per deployment | Token verification, org membership lookup |
| `ANTHROPIC_API_KEY` | Per deployment | Claude Opus API calls |
| `OPENROUTER_API_KEY` | Per deployment | Secondary model routing |
| `COHERE_API_KEY` | Per deployment | Embeddings for persistent memory |
| `REDIS_URL` | Per deployment | Cache + vector search |
| `TELEGRAM_BOT_TOKEN` | Per agent | Inter-agent messaging |

Secrets are never logged, cached, or included in SSE responses.

## Voice Security

### API Key Isolation

ElevenLabs API key (`ELEVENLABS_API_KEY`) is stored server-side only. Client connections use **signed URLs**:

1. Client authenticates to our server (Supabase JWT)
2. Server generates time-limited signed URL via ElevenLabs API (`POST /v1/convai/conversation/get-signed-url`)
3. Client connects directly to ElevenLabs WebSocket using signed URL
4. Signed URL expires after 15 minutes (single-use)

API key never touches client code, network responses, or browser storage.

### Call Recording Compliance

- All agents must disclose AI nature at the start of every call: "I'm [Name], an AI assistant at BlockDrive"
- Consider state-by-state recording consent laws (one-party vs two-party)
- Call transcripts stored in Redis with configurable TTL (7 days default)
- ElevenLabs stores conversation data per their own retention policy

### Phone Number Validation

All phone numbers validated as E.164 format before API calls:
- Pattern: `^\+[1-9]\d{1,14}$`
- Invalid formats rejected and logged
- Prevents malformed numbers from reaching Twilio/ElevenLabs APIs

### WebSocket Security

- All connections use `wss://` (TLS encrypted)
- Signed URLs are single-use tokens (cannot be replayed)
- Connection drops trigger cleanup (active call status → ended, resources freed)
- No persistent WebSocket connections — each conversation gets a fresh signed URL

### Voice Cloning Ethics

- Only clone voices with explicit consent
- Never clone real people's voices without authorization
- All agent voices are clearly synthetic (not impersonating real individuals)
- Voice IDs stored in agent config, not user-facing

### Transcript Data Handling

- Call transcripts may contain PII (names, phone numbers, business details)
- Redis TTL ensures automatic cleanup:
  - Active calls: 1 hour (auto-cleanup for abandoned calls)
  - Transcripts: 7 days
  - Action items: 30 days
  - Call log: bounded at 100 entries (LTRIM)
- No transcript data sent to third parties beyond ElevenLabs (processing) and Redis (storage)
- Persistent memories extracted from calls should be anonymized where possible
