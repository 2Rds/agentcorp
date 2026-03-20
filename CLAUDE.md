# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Persistent Memory

This project uses Redis-backed persistent memory with vector search (RediSearch + Cohere embeddings). User ID: `claude-code-universal` (shared across all projects).

When saving memories for this project, always tag with:
```json
{
  "project": "waas",
  "domain": "cognitive-agents"
}
```

### Session Protocol
- **On start**: Silently query memory for context relevant to the current task. Apply context naturally.
- **During work**: Proactively save memories when discovering architecture decisions, bug fixes, user preferences, or cross-project patterns. Do not wait to be asked.
- **On end**: Review what was accomplished and persist any new knowledge worth remembering.

### Memory Guidelines
- Keep entries concise (1-3 sentences), always include project metadata
- Search before adding to avoid duplicates
- Do NOT save trivial info, session-specific state, or secrets

## Quick Memory (Hot Cache)

### People
| Who | Role |
|-----|------|
| **Sean** | CEO/Founder, Head of Sales (whale deals), GitHub: 2rds |
| **Alex** | EA agent (blockdrive-ea, port 3002, deployed) |
| **Morgan** | CFA agent (blockdrive-cfa, port 3001, deployed) |
| **Jordan** | COA agent (blockdrive-coa, port 3003, built) |
| **Taylor** | CMA agent (blockdrive-cma, port 3004, built) |
| **Parker** | CCA agent (blockdrive-compliance, port 3005, built) |
| **Casey** | Legal agent (blockdrive-legal, port 3006, built) |
| **Sam** | Sales Manager (blockdrive-sales, port 3007, built) |
| **SDR Worker** | Sales SDR (blockdrive-sdr, internal, port 3007) |
| **Riley** | IR agent (blockdrive-ir, planned, under Morgan) |

### Terms
| Term | Meaning |
|------|---------|
| WaaS | Workforce-as-a-Service (the platform) |
| agentic loop | Claude API tool-use loop (max 15 turns for EA) |
| tool bridge | Native Anthropic API tool defs + handlers (EA pattern) |
| enrichment pipeline | Parallel memory + plugin loading (Promise.allSettled) |
| namespace isolation | ScopedRedisClient + ScopedMemoryClient per dept |
| org-scoped | Data access restricted by org via RLS closures |
| dual-mode | Cognitive (Claude + tools) + Conversational (voice) |
| sales swarm | 10 conversational sales reps under Sam |
| provider keys mode | CF AI Gateway injects API keys at edge |
| data room | Public investor-facing document portal |

### Active Model Stack (v3.2.0+)
| Model | Provider | Role |
|-------|----------|------|
| Opus 4.6 | Anthropic direct via CF AI Gateway | Primary reasoning, all customer-facing |
| Gemini 3 Flash | Google AI Studio via CF AI Gateway | Vision/OCR, internal orchestration |
| Grok 4.1 Fast | xAI direct via CF AI Gateway | X-Twitter, classification, routing |
| Gemini Embedding | Google AI Studio via @google/genai SDK | 1536-dim vector embeddings |
| Cohere rerank-v4.0 | Cohere direct | Search result reranking |

### Current Version: v3.2.0
Full detail: `memory/glossary.md`, `memory/people/`, `memory/projects/`, `memory/context/`

## Project Overview

**WaaS (Workforce-as-a-Service)** — Cognitive agent orchestration platform. Builds namespace-isolated, memory-enriched, inter-communicating AI agents for enterprise operations.

**GitHub**: `2Rds/agentcorp` (renamed from `2rds/waas` on 2026-03-14, originally `2rds/cfo`)

### Repo Structure

```
waas/
├── src/                    # React 18 frontend (Vite, deployed to Vercel)
├── agent/                  # CFO Agent (Express, Claude Agent SDK, port 3001)
├── agents/
│   ├── ea/                 # EA Agent "Alex" (Anthropic Messages API, port 3002)
│   ├── coa/                # COA Agent "Jordan" (Agent SDK, 13 tools, port 3003)
│   ├── cma/                # CMA Agent "Taylor" (Agent SDK, 11 tools, port 3004)
│   ├── compliance/         # CCA Agent "Parker" (Agent SDK, 10 tools, port 3005)
│   ├── legal/              # Legal Agent "Casey" (Agent SDK, 11 tools, port 3006)
│   └── sales/              # Sales Agent "Sam" (Agent SDK, 17 tools, port 3007)
├── packages/
│   ├── shared/             # @waas/shared — pure types + logic (zero runtime deps)
│   └── runtime/            # @waas/runtime — Express agent execution engine + tool-helpers
├── docs/waas/              # WaaS platform architecture docs
├── supabase/               # Migrations + edge functions
└── CLAUDE.md
```

## Commands

```bash
# Frontend
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run Vitest tests
npm run test:watch   # Watch mode tests

# CFO Agent server (agent/)
cd agent
npm run dev          # Dev server with hot reload (tsx watch, port 3001)
npm run build        # TypeScript compile to dist/
npm run start        # Production start (node dist/)

# EA Agent server (agents/ea/)
cd agents/ea
npm run dev          # Dev server with hot reload (tsx watch, port 3002)
npm run build        # Build registry + TypeScript compile
npm run start        # Production start (node dist/)

# Department Agents (agents/{coa,cma,compliance,legal,sales}/)
cd agents/<name>
npm run dev          # Dev server with hot reload (tsx watch)
npm run build        # Build registry + TypeScript compile
npm run start        # Production start (node dist/)

# WaaS packages
npm run build:packages      # Build @waas/shared then @waas/runtime
npm run typecheck:packages  # Type check packages
```

Tests use Vitest with jsdom. Test files live alongside source using `*.test.ts` or `*.spec.ts` naming. Setup: `src/test/setup.ts`.

## Architecture

### System

1. **React 18 Frontend** — Vite + shadcn/ui + Tailwind, deployed to Vercel at `corp.blockdrive.co`
2. **CFO Agent** (`agent/`) — Express + Claude Agent SDK, 31 MCP tools, multi-model orchestration
3. **EA Agent** (`agents/ea/`) — Express + Anthropic Messages API (direct), native tool loop, Telegram bot + Slack (BlockDrive Bot)
4. **Department Agents** (`agents/{coa,cma,compliance,legal,sales}/`) — Express + Agent SDK + @waas/runtime, specialized model stacks

Backend: Supabase (Postgres, Auth, RLS, Realtime, Vault, Edge Functions). Memory: Agent Memory Server (two-tier: working + long-term semantic search) with RedisMemoryClient fallback. Cache: SemanticCache (LLM response caching via Redis vector search). Feature Store: sub-ms Redis HASH features for Sales agent (4 types, 4 indexes). Governance: GovernanceEngine (spend tracking + Telegram approval flow).

### Auth & Multi-tenancy

Auth flow: `/auth` (email+password) → `ProtectedRoute` → `AppLayout` (sidebar navigation for all department workspaces).

Uses **native Supabase Auth** (email+password). `AuthProvider` uses `onAuthStateChange` exclusively — the `INITIAL_SESSION` event provides the session on page load (no separate `getSession()` call). On auth, identifies user with PostHog and sets Sentry user context; on sign-out, resets both. Users belong to organizations via `user_roles` table with roles: owner, cofounder, advisor, investor. All data access scoped by organization through RLS using `is_org_member(_user_id, _org_id)` and `has_role(_user_id, _role, _org_id)` PostgreSQL helper functions with UUID params and `auth.uid()`.

Org creation uses atomic RPC: `supabase.rpc("create_organization", { _name })` — creates org, assigns owner role, ensures profile, links org in a single transaction.

### CFO Agent (`agent/src/`)

Express + Claude Agent SDK. Multi-model orchestration via CF AI Gateway + persistent memory via Redis.

**Models (collapsed stack):**
- Claude Opus 4.6 (Anthropic direct via CF AI Gateway) — Primary reasoning, tool orchestration, streaming chat, all customer-facing output
- Gemini 3 Flash (Google AI Studio via CF AI Gateway + @google/genai SDK) — Vision/OCR, internal orchestration, structured generation
- Grok 4.1 Fast (xAI direct via CF AI Gateway) — X/Twitter data, classification

**Persistent Memory (Redis):**
- Sole knowledge store — no Supabase dual-write
- 6 custom categories: `financial_metrics`, `fundraising`, `company_operations`, `strategic_decisions`, `investor_relations`, `financial_model`
- Multi-model attribution via `agent_id` (opus-brain, gemini-builder, gemini-docs)
- Session memory via `run_id` (per conversation thread)
- System prompt enriched with relevant org memories before each query

**Key directories:**
- `agent/src/agent/` — Agent configurations (`cfo-agent.ts`, `investor-agent.ts`, `knowledge-extractor.ts`, `system-prompt.ts`)
- `agent/src/tools/` — 31 MCP tools across 11 domains, all org-scoped via closure
- `agent/src/lib/` — Multi-model clients (`model-router.ts`, `gemini-client.ts`, `memory-client.ts`, `google-sheets-client.ts`, `notion-client.ts`), infrastructure (`redis-client.ts`, `semantic-cache.ts`, `plugin-loader.ts`, `pdf-generator.ts`), templates (`templates/metrics-one-pager.ts`)
- `agent/src/routes/` — Express routes (`chat.ts`, `model.ts`, `dataroom.ts`, `knowledge.ts`, `health.ts`, `webhooks.ts`)
- `agent/src/middleware/` — Auth (Supabase `getUser()` token verification with 5-min TTL cache + org membership check)

**Tools (31 total):**
- financial-model (3): get, upsert (Gemini structured generation + memory), delete
- derived-metrics (1): compute burn, runway, MRR, gross margin
- cap-table (3): get, upsert (memory for fundraising), delete
- knowledge-base (5): search (rerank + keyword), add, update, delete, rate_quality
- investor-links (4): CRUD with `enable_data_room` support
- documents (2): upload with Gemini vision processing + memory attribution
- document-rag (1): `query_documents` via Redis hybrid search
- google-sheets (3): populate_model_sheet, read_model_sheet, get_model_sheet_info — uses **service account with domain-wide delegation** (`GOOGLE_SERVICE_ACCOUNT_KEY_JSON` env var for cloud, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` for local dev)
- analytics (1): `run_analytics_query` — natural language → SQL → chart suggestion
- notion (4): query_notion_database, create/update/append — CFA_SCOPE enforced, conditional on `NOTION_API_KEY`
- pdf-export (1): `generate_investor_document` — markdown/metrics → Playwright PDF → Supabase Storage signed URL
- web-fetch (1), headless-browser (1), excel-export (1)

**Knowledge Plugins (31 skills across 6 groups):**
- brand-voice (3), data (7), enterprise-search (3), finance (6), legal (6), operations (6)
- Resolved via enrichment pipeline: keyword pre-filter → Redis vector → Cohere rerank
- Max 3 skills / 4000 tokens per query
- Registry: `agent/plugins/registry.json` (built by `npm run build:registry`)

**Routes:**
- `POST /api/chat` — Streaming AI chat (SSE with memory-enriched system prompt)
- `GET /api/model/status` — Google Sheets integration status
- `POST /api/model/create-sheet, get-sheet, delete-sheet` — Model sheet CRUD
- `GET /api/knowledge/graph` — Knowledge graph visualization
- `GET/POST /dataroom/:slug/*` — Public investor data room
- `GET /health` — Health check

**Environment:**
- Required: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `COHERE_API_KEY`
- Optional: `PORT` (default 3001), `CORS_ORIGINS`, `GOOGLE_AI_API_KEY` (Gemini via CF AIG), `XAI_API_KEY` (Grok via CF AIG), `CF_ACCOUNT_ID`, `CF_GATEWAY_ID`, `CF_API_TOKEN`, `CF_AIG_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (local dev), `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` (cloud — raw JSON content), `NOTION_API_KEY` (enables Notion tools), `SENTRY_DSN`, `POSTHOG_API_KEY`, `POSTHOG_HOST`

### EA Agent (`agents/ea/src/`)

**"Alex"** — Executive Assistant agent for Sean Weiss. Human-facing, primary point of contact.

**Runtime:** Express + Anthropic Messages API (direct `anthropic.messages.create()` with agentic tool loop, NOT Claude Agent SDK). Max 15 tool turns per request.

**System prompt** defines Alex's role, personality, autonomous operations, escalation rules (legal, hiring, investor terms, public statements, strategic pivots, access grants), governance directives (approval required for external comms), and tool usage patterns.

**Tools (up to 14, defined natively in `bridge.ts`):**
- `search_knowledge` — Cross-namespace memory search (executive read access to all departments)
- `save_knowledge` — Persist facts/decisions to memory (9 categories: scheduling, communications, contacts, etc.)
- `create_task` — Create tasks in `ea_tasks` table
- `list_tasks` — List/filter tasks by status
- `save_meeting_notes` — Structured meeting notes with action items in `ea_meeting_notes`
- `draft_email` — Email drafts stored in `ea_communications_log`
- `web_search` — Real-time web search via Gemini Search Grounding (@google/genai SDK)
- `send_slack_message` — Send to any Slack channel (conditional on `SLACK_BOT_TOKEN`)
- `read_slack_channel` — Read recent messages from any channel (EA admin access)
- `list_slack_channels` — List all channels with type/description classification
- `search_notion` — Search Notion workspace by query (conditional on `NOTION_API_KEY`)
- `read_notion_page` — Read page content and properties by ID
- `create_notion_page` — Create in database or as child page
- `update_notion_page` — Update properties and/or append content

**Knowledge Plugins (84 skills across 17 groups):**
- apollo, brand-voice, common-room, customer-support, data, design, engineering, enterprise-search, finance, human-resources, legal, marketing, operations, product-management, productivity, sales, slack-by-salesforce
- Full knowledge-work-plugins library (EA needs breadth as executive assistant)
- `tool-mapping.json` maps `~~placeholder` tokens to EA's actual tools
- Registry: `agents/ea/plugins/registry.json` (built by `npm run build:registry`)

**Transport:**
- Telegram bot (`@alex_executive_assistant_bot`) via grammy. Security: `TELEGRAM_CHAT_ID` whitelist. 20-message conversation history per chat.
- Slack bot (BlockDrive Bot) via `@slack/bolt` Socket Mode. Channel-aware routing with department context injection. EA has admin access to all channels. Workforce channels: `#workforce-{alex,finance,ops,marketing,legal,sales}`. Purpose channels: `#brain-dump`, `#command-center`, `#agents`, `#brand`, `#data-room`, `#fundraise`, `#gtm`, `#waitlist-signups`, `#general`. Feed channels (notification-only): `#feed-ops`, `#feed-pipeline`.

**Enrichment pipeline (parallel, Promise.allSettled):**
1. EA-scoped memories (top 10, rerank + keyword)
2. Cross-namespace memories (top 10, all departments)
3. Session memories (last 10 from conversation)
4. Matched skills (keyword → vector → dedup, max 3 skills / 4000 tokens)

**Database tables (EA-specific):**
- `ea_tasks` — Task queue (title, description, priority, status, due_date, assigned_to, tags)
- `ea_meeting_notes` — Meeting notes (title, date, attendees, summary, action_items JSONB, key_decisions)
- `ea_communications_log` — Comms log (type, subject, body, recipients, status)

**Environment (see `agents/ea/.env.example`):**
- Required: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `PORT` (3002), `CORS_ORIGINS`, `GOOGLE_AI_API_KEY` (Gemini via CF AIG), `CF_*` (AI Gateway), `REDIS_URL`, `COHERE_API_KEY`, `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN`/`SLACK_SIGNING_SECRET`/`SLACK_APP_ID` (enables Slack transport + tools), `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`, `AGENT_MESSAGE_SECRET`, `NOTION_API_KEY` (enables Notion tools), `BLOCKDRIVE_ORG_ID` (real org UUID for Slack/Telegram transports), `SENTRY_DSN`, `POSTHOG_API_KEY`, `POSTHOG_HOST`

### WaaS Platform Packages

**`@waas/shared`** (`packages/shared/`) — Pure TypeScript types and logic. Zero runtime deps.
- `types.ts` — Core types: AgentConfig, ModelStack, AgentScope
- `agents.ts` — Agent registry (AGENT_CONFIGS) + department scopes
- `models/` — MODEL_REGISTRY (6 models with pricing), ModelRouter, BoardSession (multi-agent deliberation + quorum voting)
- `namespace/` — 7 AgentScopes (EA, CFA, CMA, COA, Legal, Sales, IR), ScopedRedisClient, ScopedMemoryClient (fail-closed enforcement)
- `messaging/` — MessageBus: dual-mode persistence (Redis Streams + LIST fallback), routing, inbox, threads, escalation
- `governance/` — GovernanceConfig, ApprovalCategory, PendingApproval, GovernanceDecision, SpendEvent types + BLOCKDRIVE_GOVERNANCE defaults

**`@waas/runtime`** (`packages/runtime/`) — Express-based agent execution engine.
- `agent-runtime.ts` — Main class: Express app, middleware, routes, lifecycle
- `middleware/auth.ts` — Supabase JWT verification + org membership + token cache
- `routes/` — health (GET /health) + chat (POST /chat, SSE streaming)
- `transport/telegram.ts` — Telegram bot transport (grammy) for inter-agent messaging
- `lib/` — redis-client, semantic-cache (LLM response caching via RediSearch), agent-memory-server (AMS two-tier memory client), feature-store (sub-ms Redis HASH features for Sales), elevenlabs-client (WebSocket TTS/STT), plugin-loader, stream-adapter, tool-helpers (safeFetch, SSRF protection, stripHtml), observability (Sentry + PostHog init/shutdown), governance (GovernanceEngine: spend tracking, Telegram approval flow)
- `voice/` — VoicePipeline (NextGenSwitch ↔ ElevenLabs ↔ Claude bridge), VoiceTransport (WebSocket server + outbound calls)

### Key Hooks (src/hooks/)

- `useAuth` — Auth context from `AuthProvider` (user, session, org, signOut)
- `useOrganization` — Active org ID from auth context, org creation via atomic RPC
- `useAgentHealth` — Real-time agent status monitoring (online/offline/unknown)
- `useRealtimeSubscription(table, filter, queryKeys, enabled)` — Supabase Realtime postgres_changes subscription with TanStack Query invalidation, unique channel IDs, subscribe status callbacks
- `useModelSheet(orgId)` — Google Sheets integration
- `useFinancialModel(orgId, scenario)` — Financial model data + derived metrics
- `useCapTable(orgId)` — Cap table entries with computed totals
- `useAgentThread` / `useConversations` — Chat thread management
- `useInvestorLinks` — DocSend-style shareable links

### Frontend Routes (src/App.tsx)

| Path | Page | Purpose |
|------|------|---------|
| `/auth` | Auth | Supabase email+password sign-in |
| `/` | Dashboard | Agent health grid, department metrics, activity feed |
| `/ea` | EAWorkspace | Executive Assistant chat + tasks |
| `/finance` | FinanceWorkspace | CFO agent chat + overview, financial model, cap table, investors, knowledge base |
| `/operations` | OperationsWorkspace | COA agent chat + operations |
| `/marketing` | MarketingWorkspace | CMA agent chat + campaigns |
| `/compliance` | ComplianceWorkspace | CCA agent chat + governance |
| `/legal` | LegalWorkspace | Legal agent chat + reviews |
| `/sales` | SalesWorkspace | Sales agent chat + pipeline |
| `/settings` | Settings | User and org settings |
| `/dataroom/:slug` | DataRoom | Public investor data room (no auth) |

### Edge Functions (supabase/functions/)

Deno runtime.
- `chat/` — Streaming AI chat via OpenAI API format (fallback when agent server unreachable)
- `track-view/` — Analytics for investor link views
- `webhook-handler/` — Database Webhook receiver: validates Bearer token, routes pg_net trigger events to agent servers (`/ea/webhook`, `/coa/webhook`, `/compliance/webhook`)

### Supabase

- **Project**: `eisiohgjfviwxgdyfnsd.supabase.co` (WaaS project, NOT block-drive-vault's)
- Auth: native email+password with `auth.uid()` UUID-based RLS
- RPC: `create_organization(_name)` — atomic org creation
- Helper functions: `is_org_member()`, `has_role()` (SECURITY DEFINER)
- Core tables: organizations, profiles, user_roles, financial_model, cap_table_entries, conversations, messages, knowledge_base, documents, investor_links, link_views, model_sheets, integrations
- EA tables: ea_tasks, ea_meeting_notes, ea_communications_log
- COA tables: coa_tasks, coa_communications, coa_processes, agent_messages
- CMA tables: cma_content_drafts, cma_campaigns
- Compliance tables: compliance_policy_register, compliance_risk_assessments, compliance_governance_log
- Legal tables: legal_reviews, legal_ip_portfolio
- Sales tables: sales_pipeline, sales_call_logs
- Cross-cutting: agent_usage_events (cost/latency tracking, written by chat routes)
- Realtime: 17 tables added to `supabase_realtime` publication for live frontend updates
- Extensions: pgsodium (Vault), pg_net (Database Webhooks)

## Deployment

| Service | Platform | URL/Port |
|---------|----------|----------|
| Frontend | Vercel | `corp.blockdrive.co` |
| CFO Agent | DO App Platform NYC1 (shared $12/mo) | Port 3001 |
| EA Agent | DO App Platform NYC1 (dedicated $29/mo) | Port 3002, ingress `/ea` |
| COA Agent | DO App Platform NYC1 (shared $12/mo) | Port 3003, ingress `/coa` |
| CMA Agent | DO App Platform NYC1 (shared $12/mo) | Port 3004, ingress `/cma` |
| Compliance Agent | DO App Platform NYC1 (shared $12/mo) | Port 3005, ingress `/compliance` |
| Legal Agent | DO App Platform NYC1 (shared $12/mo) | Port 3006, ingress `/legal` |
| Sales Agent | DO App Platform NYC1 (dedicated $29/mo, auto-scales 1→3) | Port 3007, ingress `/sales` |
| Redis | DO Droplet NYC1 (159.223.179.119) | Redis 8.6.1 + RediSearch + RedisJSON, VPC `10.116.0.6` |
| n8n | DO Droplet NYC1 (134.209.67.70) | `n8n.blockdrive.co`, Docker + Caddy |

**DigitalOcean App Platform:**
- App ID: `2742c227-ee68-44a3-b157-0a991bd3a522` (NYC1, `agentcorp-ghgvq.ondigitalocean.app`)
- Health check: `https://agentcorp-ghgvq.ondigitalocean.app/ea/health`
- Auto-deploy enabled from GitHub (`2Rds/agentcorp`, branch `main`)
- `doctl` CLI installed and authenticated locally
- EA builds from `source_dir: agents/ea` (standalone, no @waas/runtime access)
- Dept agents omit `source_dir` (monorepo root build context for `packages/` COPY)

## Key Patterns

- **Tool bridge pattern** (EA): Tools defined as native Anthropic API `Tool` defs + handler functions in `bridge.ts`, NOT converted from Agent SDK `tool()` objects. `createEaTools()` returns `{ toolDefs, handlers }`.
- **Agentic loop** (EA): `createAgentQuery()` loops up to 15 turns — calls Claude, executes tool_use blocks, feeds results back until `end_turn`.
- **Org-scoped tools**: Both CFO and EA tools receive `orgId` via closure and scope all DB queries to that org.
- **Enrichment pipeline**: System prompt enriched with org memories + cross-namespace memories + session memories + matched skills (all via `Promise.allSettled` for resilience).
- **Namespace isolation**: Each agent department gets `ScopedRedisClient` + `ScopedMemoryClient` that auto-prefix keys. Cross-department access denied by default.
- **Dual-mode agents**: Agents can run cognitive (Claude + tools + streaming) + conversational (ElevenLabs voice) modes sharing identity and memory. Voice deferred to Phase 2.
- **Inter-agent messaging**: MessageBus with dual-mode persistence (Redis Streams + LIST fallback) + Telegram transport. All 6 department agents have `message_agent` tool; bus not yet instantiated in AgentRuntime.
- **Provider Keys mode**: When `CF_AIG_TOKEN` is set, Cloudflare AI Gateway injects API keys at edge — provider keys become optional.
- **Google Sheets**: Service account with domain-wide delegation. Supports `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` (raw JSON content for cloud platforms) or `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (file path for local dev). Service account JSON must never be committed (gitignored).
- **Notion scope enforcement** (CFO): CFA_SCOPE Notion access rules inlined in `agent/src/lib/notion-client.ts` (agent package is outside npm workspaces, cannot import `@waas/shared`). EA agent has executive-tier access without scope enforcement.
- **Conditional tool loading**: Notion and Slack tools only register when their env vars are set (`config.notionEnabled`, `config.slackEnabled`). All agents check this at tool factory time.
- **Three-tier communication**: Telegram (top, personal/push 70-80%) → Slack (middle, business ops 20-30%) → corp.blockdrive.co (base, full workspace). Slack transport injects channel context (department, purpose, routing guidance) into each message so the EA knows which channel it's operating in.
- **Channel-per-agent architecture**: Each agent has a `#workforce-*` channel. EA (Alex) has admin access to ALL channels. At startup, the Slack transport discovers channel IDs via `conversations.list` and builds a routing map. Messages in workforce channels get department context injected; feed channels are notification-only (no responses).
- **PDF generation**: Playwright HTML→PDF with branded template, uploads to Supabase Storage `{orgId}/investor-docs/`, returns 1hr signed URL (matches excel-export pattern).
- **Agent SDK tool pattern** (dept agents): Tools use `tool(name, description, zodRawShape, handler)` 4-arg signature with Zod schemas. All import `safeFetch`, `safeFetchText`, `safeJsonParse`, `stripHtml` from `@waas/runtime`.
- **SSRF protection**: `isAllowedUrl()` blocks private IPs, cloud metadata, localhost, `.internal`/`.local` suffixes before any `fetch_url` call.
- **Governance system**: GovernanceEngine in `@waas/runtime` tracks daily spend per agent (Redis counters), gates external actions via Telegram inline keyboard approval in C-Suite group chat. Types + defaults in `@waas/shared/governance`. All agent system prompts include governance directives.
- **Supabase Realtime pattern**: `useRealtimeSubscription` hook subscribes to `postgres_changes`, invalidates TanStack Query keys on change. Each component gets a unique channel ID (module-level counter) to prevent collision. Refetches on SUBSCRIBED to close race condition.
- **Database Webhooks**: pg_net triggers → `webhook-handler` Edge Function → agent servers. Trigger function uses `SECURITY DEFINER` + `BEGIN..EXCEPTION` (never blocks INSERT). `REVOKE EXECUTE FROM PUBLIC` on trigger functions.
- **Observability (Sentry + PostHog)**: All SDK init wrapped in try-catch (non-fatal). Zero-config when env vars unset. Frontend: `@sentry/react` + `posthog-js`. Agents: `@sentry/node` + `posthog-node`. EA inlines observability (standalone Docker build, no @waas/runtime access). `uncaughtException` → Sentry flush + `process.exit(1)`. Source maps conditional on `SENTRY_AUTH_TOKEN`.
- **Runtime-ref pattern** (dept agents): `runtime-ref.ts` module exports a mutable `AgentRuntime` reference set after `runtime.start()`. Tool factories import this for lazy access to runtime services (memory, feature store, etc.).
- **AMS health fallback**: AgentRuntime checks AMS health at startup. If healthy, uses `AgentMemoryServerClient`; otherwise falls back to `RedisMemoryClient`. Both implement `MemoryClient` interface.
- **Feature Store per-method orgId**: All 14 FeatureStore methods accept optional `orgId` parameter for multi-tenant safety. `resolveOrgId()` warns on empty orgId.
- **Promise lock on ensureIndex**: SemanticCache and FeatureStore use stored promise fields to prevent concurrent duplicate Redis index creation.
- **Chat route cache integration**: `POST /chat` checks SemanticCache before Claude API call, stores response on completion (fire-and-forget).

## Agent Network

| Agent ID | Role | Port | Tools | Status |
|----------|------|------|-------|--------|
| `blockdrive-ea` | Executive Assistant (Alex) | 3002 | 7-14 | **Deployed** |
| `blockdrive-cfa` | Chief Financial Agent (Morgan) | 3001 | 31 | **Deployed** |
| `blockdrive-coa` | Chief Operating Agent (Jordan) | 3003 | 13 | **Built** |
| `blockdrive-cma` | Chief Marketing Agent (Taylor) | 3004 | 11 | **Built** |
| `blockdrive-compliance` | Chief Compliance Agent Parker (CCA) | 3005 | 10 | **Built** |
| `blockdrive-legal` | Legal Counsel (Casey) | 3006 | 11 | **Built** |
| `blockdrive-sales` | Sales Manager (Sam) | 3007 | 16-18 | **Built** |
| `blockdrive-sdr` | SDR Worker (internal) | (3007) | 14 | **Built** |
| `blockdrive-ir` | Investor Relations (Riley) | — | — | Planned |

## UI Patterns

- shadcn/ui (Radix primitives) in `src/components/ui/` — don't modify directly
- `AgentChat` (`src/components/chat/AgentChat.tsx`) — streaming SSE chat with Markdown rendering, conversation persistence, per-agent URL routing via `VITE_*_AGENT_URL` env vars
- `DepartmentWorkspace` (`src/components/workspace/DepartmentWorkspace.tsx`) — reusable layout for all 7 department workspace pages
- Tailwind CSS with CSS variables (dark-only, no light theme)
- `cn()` from `src/lib/utils.ts` for conditional class merging
- TanStack Query for server state; React Context for auth only
- Sentry `ErrorBoundary` wraps all routes (falls back to `FallbackErrorBoundary` class component)
- PostHog SPA page views tracked via `useLocation` in `PostHogPageView` component
- `@/*` → `./src/*` path alias (tsconfig + vite config)

## Supabase Client

Import: `import { supabase } from "@/integrations/supabase/client"`. Types auto-generated in `@/integrations/supabase/types.ts` — do not edit directly. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Conventions

- Subagent model policy: ALL agents and subagents MUST use `model: "opus"` (Opus 4.6) — no sonnet, no haiku, no exceptions
- Package name: `waas` (root), agents are independent packages with their own `package.json`
- Root `package.json` uses `"workspaces": ["packages/*", "agents/*"]` for shared packages and department agents
- Agent servers use `"type": "module"` with `.js` import extensions in TypeScript
- EA agent uses Anthropic Messages API directly (NOT Claude Agent SDK) — better control over tool loop
- CFO agent uses Claude Agent SDK with MCP tools
- Always use `Promise.allSettled` for parallel enrichment (memory + plugins) — never let one failure block others
- Telegram bot messages: 4096 char limit, split if needed, try Markdown parse_mode first then fallback to plain text
