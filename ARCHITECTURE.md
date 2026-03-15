# Architecture

## Overview

Three-tier system: a React 18 frontend deployed to Vercel, seven Express agent servers (CFO + EA + 5 department agents), and Supabase for database, auth, storage, Realtime, Vault, Database Webhooks, and edge function fallback. Full-stack observability via Sentry (error tracking) and PostHog (product analytics). Governance via C-Suite Telegram approval flow with per-agent daily spend tracking.

```
                    ┌─────────────────┐
                    │   Vercel CDN     │
                    │  React Frontend  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐ ┌───▼──────┐ ┌────▼────────┐
     │  CFO Agent      │ │ Supabase │ │  EA Agent    │
     │  (Agent SDK)    │ │ Postgres │ │  (Messages)  │
     │  31 MCP tools   │ │          │ │  11 tools    │
     └──┬───┬───┬──┬──┘ └──────────┘ └──┬───┬──────┘
        │   │   │  │                     │   │
   ┌────┘   │   │  └────┐          ┌────┘   └────┐
   │        │   │       │          │              │
┌──▼──┐ ┌──▼──┐│  ┌────▼────┐  ┌──▼──┐    ┌─────▼───┐
│Opus │ │Open ││  │  Redis   │  │Tele │    │  Notion  │
│4.6  │ │Route││  │  8.4     │  │gram │    │  API     │
└─────┘ └─────┘│  └──────────┘  └─────┘    └─────────┘
           ┌───▼──┐
           │ Mem0 │
           └──────┘
```

## Frontend (`src/`)

React 18 + TypeScript + Vite. Uses shadcn/ui (Radix primitives) with Tailwind CSS. Recharts for dashboard charts. TanStack Query for server state; React Context for auth only.

### Routes

| Path | Component | Auth |
|------|-----------|------|
| `/auth` | Auth | Public — email+password sign-in |
| `/` | Dashboard | Protected — agent health grid, department metrics |
| `/ea` | EAWorkspace | Protected — Executive Assistant chat + tasks |
| `/finance` | FinanceWorkspace | Protected — CFO agent chat + financial tools |
| `/operations` | OperationsWorkspace | Protected — COA agent chat + operations |
| `/marketing` | MarketingWorkspace | Protected — CMA agent chat + campaigns |
| `/compliance` | ComplianceWorkspace | Protected — CCA agent chat + governance |
| `/legal` | LegalWorkspace | Protected — Legal agent chat + reviews |
| `/sales` | SalesWorkspace | Protected — Sales agent chat + pipeline |
| `/settings` | Settings | Protected — user/org settings |

### Auth Flow

```
/auth (email+password) → ProtectedRoute → OrgGate → Onboarding or AppLayout
```

`AuthProvider` (`src/contexts/AuthContext.tsx`) wraps the app. Uses `supabase.auth.onAuthStateChange()` exclusively for session tracking — the `INITIAL_SESSION` event provides the session on page load, eliminating the need for a separate `getSession()` call. Fetches organization membership via `profiles` → `organizations` → `user_roles`. On auth, identifies user with PostHog and sets Sentry user context; on sign-out, resets both. Protected routes redirect unauthenticated users to `/auth`.

### Financial Engine

All financial data stored in `financial_model` table as line items with category (revenue/cogs/opex/headcount/funding), subcategory, month, amount, formula, and scenario. Derived metrics computed **client-side** in `useFinancialModel` via `useMemo`:

- **Burn rate** — `abs(min(0, latest_ebitda))`
- **Runway** — `(cumulative_ebitda + totalFunding) / monthlyBurn`
- **MRR** — Latest month's revenue
- **Gross margin** — `(grossProfit / revenue) * 100`
- **Monthly aggregates** — Per-month revenue, COGS, gross profit, OpEx, EBITDA, net burn
- **Breakdowns** — Revenue and OpEx by subcategory

## Agent Server (`agent/src/`)

Express server using the Claude Agent SDK. Claude Opus 4.6 as the primary reasoning model with 8 additional models via OpenRouter.

### Multi-Model Strategy

| Model | Alias | Purpose |
|-------|-------|---------|
| Claude Opus 4.6 | (direct API) | Primary reasoning, tool orchestration, streaming chat |
| Kimi K2.5 | `kimi` | Structured data generation (financial rows, cap table, SQL) |
| Gemini 3 Flash | `gemini` | Document vision, embeddings, file processing |
| Gemini 3 Pro | `gemini-pro` | Advanced document reasoning |
| Gemini 2.5 Flash Lite | `gemini-lite` | Lightweight tasks at minimal cost |
| DeepSeek V3.2 | `deepseek` | Structured data, cost-effective alternative |
| DeepSeek V3.2 Speciale | `deepseek-speciale` | Extended capability variant |
| Sonar Pro | `sonar` | Web research and intelligence |
| Granite 4.0 Micro | `granite` | Lightweight/cheap tasks |
| Sonnet 4.6 | `sonnet` | High-quality via OpenRouter |

All non-Claude models route through OpenRouter via `model-router.ts` using native `fetch`. Optional Cloudflare AI Gateway proxy when `CF_ACCOUNT_ID` + `CF_GATEWAY_ID` are set.

### Tools (31 total across 11 domains)

| Domain | Count | Tools |
|--------|-------|-------|
| Financial Model | 3 | get, upsert (K2.5 plan generation + memory), delete |
| Derived Metrics | 1 | compute burn, runway, MRR, gross margin |
| Cap Table | 3 | get, upsert (graph memory for fundraising), delete |
| Knowledge Base | 5 | search (rerank + keyword), add, update, delete, rate_quality |
| Investor Links | 4 | CRUD with `enable_data_room` support |
| Documents | 2 | upload with Gemini vision + memory attribution |
| Document RAG | 1 | `query_documents` via Redis hybrid search |
| Google Sheets | 3 | populate_model_sheet, read_model_sheet, get_model_sheet_info |
| Analytics | 1 | natural language → SQL → chart suggestion |
| Notion | 4 | query_notion_database, create/update/append (CFA_SCOPE enforced) |
| PDF Export | 1 | generate_investor_document (Playwright HTML→PDF → Supabase Storage) |
| Utilities | 3 | web_fetch, headless_browser, excel_export |

Tools are org-scoped via closure — `orgId` passed to each factory function. Assembled into a single MCP server via `createSdkMcpServer`. Notion tools are conditional — only registered when `NOTION_API_KEY` is set.

### Routes

| Endpoint | Purpose |
|----------|---------|
| `POST /api/chat` | Streaming AI chat (SSE) with memory-enriched system prompt |
| `GET /api/model/status` | Google Sheets integration status |
| `POST /api/model/create-sheet, get-sheet, delete-sheet` | Model sheet CRUD |
| `GET /api/knowledge/graph` | Knowledge graph via Mem0 graph API |
| `GET/POST /dataroom/:slug/*` | Public investor data room |
| `POST /api/webhooks/mem0` | Memory event webhooks |
| `GET /health` | Health check |

### Streaming Chat Flow

```
Client POST /api/chat
  → authMiddleware (token verify + org check)
  → createAgentQuery(messages, orgId, userId)
    → Load org memories from Mem0
    → Inject into system prompt
    → Resolve knowledge plugins (keyword → vector → Cohere rerank)
    → Claude SDK query() with includePartialMessages
  → Stream SDK messages as SSE
  → On completion: extract knowledge (fire-and-forget)
```

## Department Agent Servers (`agents/{coa,cma,compliance,legal,sales}/`)

Five department head agents built on `@waas/runtime` with the Claude Agent SDK (`tool()` + Zod). Each runs as an independent Express server with org-scoped MCP tools, Notion integration (conditional), and mem0 memory.

### Agent Model Stacks

| Agent | Primary | Support Models | Embed | Rerank | Port |
|-------|---------|---------------|-------|--------|------|
| COA (Jordan) | Opus 4.6 | Gemini 3.1 Pro, Grok Reasoning | Cohere v4.0 | Cohere v4.0 | 3003 |
| CMA (Taylor) | Opus 4.6 | Gemini 3.1 Pro, Sonar Pro, Grok Fast | Cohere v4.0 | — | 3004 |
| CCA (Parker) | Opus 4.6 | Granite 4.0, Command A | Cohere v4.0 | Cohere v4.0 | 3005 |
| Legal (Casey) | Opus 4.6 | Command A, Grok Reasoning (2M ctx) | Cohere v4.0 | Cohere v4.0 | 3006 |
| Sales (Sam) | Opus 4.6 | Sonar Pro, Gemini 3.1 Pro | Cohere v4.0 | — | 3007 |

### Tool Summary

| Agent | Tools | Specialties |
|-------|-------|-------------|
| COA | 13 | Cross-namespace knowledge, Notion CRUD, agent health, task queue, inter-agent messaging |
| CMA | 11 | Content drafting, campaign CRUD, SEO analysis, X/Twitter via Grok |
| Compliance | 10 | Audit scan (Granite routing), risk assessment, governance log, policy register |
| Legal | 11 | Legal review + risk scoring, IP portfolio, contract analysis (Grok 2M), Notion write |
| Sales | 12 | Pipeline CRUD, prospect research, call prep, proposal drafting, call logging |

### Shared Tool Helpers (`@waas/runtime`)

All department agents import from `@waas/runtime`:

- `safeFetch<T>()` — HTTP fetch with status validation, returns `{ ok, data } | { ok: false, error }`
- `safeFetchText()` — Same + SSRF URL validation via `isAllowedUrl()`
- `safeJsonParse()` — Structured JSON parse errors instead of thrown SyntaxError
- `stripHtml()` — Remove HTML tags from fetched web content (prompt injection prevention)
- `isAllowedUrl()` — Blocks private IPs, cloud metadata (169.254.169.254), localhost, `.internal`/`.local` suffixes

### Org Hierarchy

```
Sean (Human Principal)
├── Alex (EA) — executive tier, cross-namespace read
├── Jordan (COA) — executive tier, manages department heads
│   ├── Morgan (CFA) — financial modeling
│   │   └── Riley (IR) — investor relations (planned)
│   ├── Taylor (CMA) — marketing/content
│   ├── Parker (CCA) — governance, audit-read-all
│   ├── Casey (Legal) — contracts, IP
│   └── Sam (Sales) — pipeline, prospecting
```

### Governance

Dual-mode governance system (startup/enterprise) managed by GovernanceEngine in `@waas/runtime`. Types and defaults in `@waas/shared/governance`.

**Startup mode (current):** Human-configured tripwires with Telegram approval flow.
- Daily spend tracking per agent via Redis counters (keyed by `{orgId}:{agentId}:{date}`)
- Pending approvals stored in Redis with TTL, resolved via Lua atomic check-and-set (no TOCTOU race), presented via Telegram inline keyboards in C-Suite group chat
- Authorized approver enforcement (Sean's Telegram user ID)
- 6 approval categories: external_communication, marketing_activity, social_media_post, financial_commitment, escalation, spend_limit_exceeded
- All agent system prompts include governance directives requiring approval before external actions

**Enterprise mode (future):** CCA (Parker) manages policy enforcement programmatically.

### Escalation

Department agents escalate to COA (Jordan) for strategic decisions. COA escalates to Sean for hiring, vendor contracts, and cross-department conflicts.

## EA Agent Server (`agents/ea/src/`)

Express server using the Anthropic Messages API directly (not Claude Agent SDK). Claude Opus 4.6 as the primary model with an agentic tool loop (max 15 turns).

### Tools (11 total)

| Domain | Count | Tools |
|--------|-------|-------|
| Knowledge | 2 | search_knowledge (cross-namespace), save_knowledge |
| Tasks | 2 | create_task, list_tasks |
| Meeting Notes | 1 | save_meeting_notes |
| Communications | 1 | draft_email |
| Web Search | 1 | web_search (Perplexity Sonar) |
| Notion | 4 | search_notion, read_notion_page, create_notion_page, update_notion_page |

Tools are defined as native Anthropic API `Tool` definitions + handler functions in `bridge.ts` (tool bridge pattern). Notion tools are conditional — only registered when `NOTION_API_KEY` is set.

### Transport

**Telegram:** Primary interface via grammy (`@alex_executive_assistant_bot`). Security: `TELEGRAM_CHAT_ID` whitelist. 20-message conversation history per chat.

**Slack:** Channel-aware EA integration via `@slack/bolt` Socket Mode. Admin access to all channels. Channel classification (`channel-config.ts`): workforce (per-agent), purpose (topic-specific), feed (notification-only), DM. Thread history capped at 500 (FIFO eviction). Context builder enriches messages with channel purpose and department info.

### Enrichment Pipeline

System prompt enriched via `Promise.allSettled` (parallel):
1. EA-scoped mem0 memories (top 10)
2. Cross-namespace memories (top 10, all departments)
3. Session memories (last 10 from conversation)
4. Matched skills (keyword → vector → dedup)

## Infrastructure

### Redis (vector search + caching)

Redis 8.4 via Docker Compose. Three RediSearch indexes:

| Index | Prefix | Purpose |
|-------|--------|---------|
| `idx:plugins` | `plugin:` | Skill vector matching for plugin loader |
| `idx:documents` | `doc:` | Document RAG with hybrid search |
| `idx:llm_cache` | `cache:` | Semantic caching of model responses |

All vectors are 768-dimensional (COSINE, HNSW, FLOAT32). Embeddings via Cloudflare Workers AI (`bge-base-en-v1.5`, free tier) with OpenRouter fallback.

### Mem0 (persistent memory)

Organization-scoped persistent memory with graph relationships.

- 6 custom categories: `financial_metrics`, `fundraising`, `company_operations`, `strategic_decisions`, `investor_relations`, `financial_model`
- Multi-model attribution via `agent_id`
- Session memory via `run_id` per conversation thread
- System prompt enriched with relevant org memories before each query
- Feedback mechanism for memory quality

### Semantic Cache

Wraps model calls for deterministic outputs. Caches Kimi, Gemini, DeepSeek responses. Skips Claude Opus (conversational) and Sonar (web results change). 95% cosine similarity threshold, 1-hour default TTL.

### Knowledge Plugins

CFO agent: 31 skills across 6 groups (brand-voice, data, enterprise-search, finance, legal, operations). EA agent: 84 skills across 17 groups (full library). 3-stage resolution:

1. **Keyword pre-filter** — Tokenize query, score against skill keywords
2. **Redis vector re-rank** — KNN search on `idx:plugins`, filter to keyword candidates
3. **Cohere rerank** — Cross-encoder reranking via `rerank-v3.5`

Budget: max 4000 tokens, max 3 skills per query. Conversation-aware caching avoids re-injecting active skills.

## Database

Supabase PostgreSQL with Row-Level Security. See [SECURITY.md](SECURITY.md) for RLS details.

### Core Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Org entities |
| `profiles` | User profiles with org link |
| `user_roles` | Org membership (owner, cofounder, advisor, investor) |
| `financial_model` | Line items by category/subcategory/month/scenario |
| `cap_table_entries` | Equity positions |
| `conversations` / `messages` | Chat threads |
| `knowledge_base` | AI-extracted knowledge |
| `documents` | Uploaded files |
| `investor_links` / `link_views` | Shareable links + analytics |
| `model_sheets` | Google Sheets references |
| `integrations` | Third-party connections |
| `ea_tasks` | EA task queue |
| `ea_meeting_notes` | EA meeting notes with action items |
| `ea_communications_log` | EA email drafts and comms |
| `coa_tasks` | COA operational task queue |
| `coa_communications` | COA department communications |
| `coa_processes` | COA process tracking with metrics |
| `agent_messages` | Inter-agent message queue |
| `cma_content_drafts` | CMA content drafts (blog, social, email, landing page) |
| `cma_campaigns` | CMA campaign management with metrics |
| `compliance_policy_register` | Policy register with review cycles |
| `compliance_risk_assessments` | Risk assessments with scoring |
| `compliance_governance_log` | Governance action log |
| `legal_reviews` | Legal reviews with risk scoring |
| `legal_ip_portfolio` | IP portfolio (patents, trademarks, copyrights) |
| `sales_pipeline` | Sales deal pipeline with stages |
| `sales_call_logs` | Sales call summaries with action items |

## Observability

Full-stack error tracking (Sentry) and product analytics (PostHog). All init is zero-config — safe no-op when env vars are unset.

### Sentry (Error Tracking)

| Layer | SDK | Key Features |
|-------|-----|-------------|
| Frontend | `@sentry/react` | BrowserTracing, Replay (on error), ErrorBoundary, source maps via `@sentry/vite-plugin` |
| CFO Agent | `@sentry/node` | Express error handler, unhandled rejection/exception → flush + exit |
| EA Agent | `@sentry/node` | Self-contained init (standalone Docker build, no `@waas/runtime` access) |
| @waas/runtime | `@sentry/node` | `initSentry(agentId)` — covers COA, CMA, Compliance, Legal, Sales |

All agent servers: `uncaughtException` handler calls `Sentry.close(2000)` then `process.exit(1)` (Node enters undefined state after uncaught exception). Express error handler placed after routes but before 404 handler.

### PostHog (Product Analytics)

| Layer | SDK | Key Features |
|-------|-----|-------------|
| Frontend | `posthog-js` | Autocapture, SPA page views via `useLocation`, user identify/reset on auth |
| All agents | `posthog-node` | `agent_query` event on every chat request (distinctId = userId) |

Custom events: `agent_chat_sent`, `workspace_viewed`, `agent_health_checked`.

### Architecture (3 init modules)

| Module | Location | Covers |
|--------|----------|--------|
| Frontend | `src/lib/sentry.ts` + `src/lib/posthog.ts` | React SPA |
| CFO Agent | `agent/src/lib/observability.ts` | CFO server |
| @waas/runtime | `packages/runtime/src/lib/observability.ts` | COA, CMA, Compliance, Legal, Sales |
| EA Agent | `agents/ea/src/lib/observability.ts` | Self-contained (standalone Docker build) |

## Deployment

### Supabase Realtime

17 department tables added to the `supabase_realtime` publication. Frontend uses `useRealtimeSubscription` hook (unique channel IDs per component, `.subscribe()` status callbacks, race-condition-closing refetch on SUBSCRIBED). On any INSERT/UPDATE/DELETE matching the org filter, invalidates TanStack Query cache keys to trigger automatic refetch.

### Supabase Vault + Database Webhooks

**Vault:** pgsodium extension enabled for encrypted secret storage at the database layer.

**Database Webhooks:** pg_net extension fires async HTTP requests from SQL triggers on high-value table events:

```
INSERT on ea_tasks / agent_messages / compliance_governance_log
  → notify_webhook() trigger function (SECURITY DEFINER, BEGIN..EXCEPTION)
  → net.http_post() to webhook-handler Edge Function
  → Edge Function routes to agent server (/ea/webhook, /coa/webhook, /compliance/webhook)
```

Webhook handler uses timing-safe comparison for `WEBHOOK_SECRET` (or `SUPABASE_SERVICE_ROLE_KEY` fallback), validates Content-Type, and forwards events with `X-Webhook-Secret`. Returns 200 even on agent errors to prevent pg_net retries. Non-2xx agent responses are logged as warnings with response body.

## Deployment

- **Frontend:** Vercel (auto-builds from `npm run build`, aliased to `corp.blockdrive.co`)
- **All 7 Agents:** DigitalOcean App Platform NYC1 (`agentcorp-ghgvq.ondigitalocean.app`), auto-deploy from GitHub
  - EA Agent — dedicated `apps-d-1vcpu-0.5gb` ($29/mo), port 3002, `/ea` ingress
  - Sales Agent — dedicated `apps-d-1vcpu-0.5gb` ($29/mo), auto-scales 1→3 at 75% CPU, port 3007, `/sales` ingress
  - CFO Agent — shared `apps-s-1vcpu-1gb` ($12/mo), port 3001, `/` ingress
  - COA, CMA, Compliance, Legal — shared `apps-s-1vcpu-1gb` ($12/mo each), ports 3003-3006
- **Redis:** DigitalOcean Droplet NYC1 (`waas-redis-nyc1`, 67.205.165.14), password-protected, VPC `10.116.0.2`
- **n8n:** DigitalOcean Droplet NYC1 (`n8n-nyc1`, 134.209.67.70, `n8n.blockdrive.co`), Docker + Caddy reverse proxy with auto-TLS
