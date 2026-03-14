# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Persistent Memory (mem0)

This project uses mem0 for persistent memory. User ID: `claude-code-universal` (shared across all projects).

When saving memories for this project, always tag with:
```json
{
  "project": "waas",
  "domain": "cognitive-agents"
}
```

### Session Protocol
- **On start**: Silently query mem0 for memories relevant to the current task. Apply context naturally.
- **During work**: Proactively save memories when discovering architecture decisions, bug fixes, user preferences, or cross-project patterns. Do not wait to be asked.
- **On end**: Review what was accomplished and persist any new knowledge worth remembering.

### Memory Guidelines
- Keep entries concise (1-3 sentences), always include project metadata
- Search before adding to avoid duplicates
- Do NOT save trivial info, session-specific state, or secrets

## Project Overview

**WaaS (Workforce-as-a-Service)** — Cognitive agent orchestration platform. Builds namespace-isolated, memory-enriched, inter-communicating AI agents for enterprise operations.

**GitHub**: `2rds/waas` (renamed from `2rds/cfo` on 2026-03-04)

### Repo Structure

```
waas/
├── src/                    # React 18 frontend (Vite, deployed to Vercel)
├── agent/                  # CFO Agent (Express, Claude Agent SDK, port 3001)
├── agents/
│   ├── ea/                 # EA Agent "Alex" (Anthropic Messages API, port 3002)
│   ├── coa/                # COA Agent "Jordan" (Agent SDK, 13 tools, port 3003)
│   ├── cma/                # CMA Agent "Taylor" (Agent SDK, 11 tools, port 3004)
│   ├── compliance/         # CCO Agent (Agent SDK, 10 tools, port 3005)
│   ├── legal/              # Legal Agent "Casey" (Agent SDK, 11 tools, port 3006)
│   └── sales/              # Sales Agent "Sam" (Agent SDK, 12 tools, port 3007)
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

1. **React 18 Frontend** — Vite + shadcn/ui + Tailwind, deployed to Vercel at `cfo.blockdrive.co`
2. **CFO Agent** (`agent/`) — Express + Claude Agent SDK, 31 MCP tools, multi-model orchestration
3. **EA Agent** (`agents/ea/`) — Express + Anthropic Messages API (direct), native tool loop, Telegram bot
4. **Department Agents** (`agents/{coa,cma,compliance,legal,sales}/`) — Express + Agent SDK + @waas/runtime, specialized model stacks

Backend: Supabase (Postgres, Auth, RLS, Edge Functions). Memory: Mem0 (org-scoped persistent memory with graph).

### Auth & Multi-tenancy

Auth flow: `/auth` (email+password) → `ProtectedRoute` → `OrgGate` (checks org membership) → Onboarding or `AppLayout`.

Uses **native Supabase Auth** (email+password). Users belong to organizations via `user_roles` table with roles: owner, cofounder, advisor, investor. All data access scoped by organization through RLS using `is_org_member(_user_id, _org_id)` and `has_role(_user_id, _role, _org_id)` PostgreSQL helper functions with UUID params and `auth.uid()`.

Org creation uses atomic RPC: `supabase.rpc("create_organization", { _name })` — creates org, assigns owner role, ensures profile, links org in a single transaction.

### CFO Agent (`agent/src/`)

Express + Claude Agent SDK. Multi-model orchestration via OpenRouter + persistent memory via Mem0.

**Models:**
- Claude Opus 4.6 (Anthropic direct) — Primary reasoning, tool orchestration, streaming chat
- Kimi K2.5, Gemini 3 Flash/Pro, Gemini 2.5 Flash Lite, DeepSeek V3.2/Speciale, Sonar Pro, Granite 4.0, Sonnet 4.6 (OpenRouter)

**Mem0 (persistent memory):**
- Sole knowledge store — no Supabase dual-write
- Graph memory with auto-extracted entity relationships
- 6 custom categories: `financial_metrics`, `fundraising`, `company_operations`, `strategic_decisions`, `investor_relations`, `financial_model`
- Multi-model attribution via `agent_id` (opus-brain, k2-builder, gemini-docs)
- Session memory via `run_id` (per conversation thread)
- System prompt enriched with relevant org memories before each query

**Key directories:**
- `agent/src/agent/` — Agent configurations (`cfo-agent.ts`, `investor-agent.ts`, `knowledge-extractor.ts`, `system-prompt.ts`)
- `agent/src/tools/` — 31 MCP tools across 11 domains, all org-scoped via closure
- `agent/src/lib/` — Multi-model clients (`model-router.ts`, `gemini-client.ts`, `mem0-client.ts`, `google-sheets-client.ts`, `notion-client.ts`), infrastructure (`redis-client.ts`, `semantic-cache.ts`, `plugin-loader.ts`, `pdf-generator.ts`), templates (`templates/metrics-one-pager.ts`)
- `agent/src/routes/` — Express routes (`chat.ts`, `model.ts`, `dataroom.ts`, `knowledge.ts`, `health.ts`, `webhooks.ts`)
- `agent/src/middleware/` — Auth (Supabase `getUser()` token verification with 5-min TTL cache + org membership check)

**Tools (31 total):**
- financial-model (3): get, upsert (K2.5 plan generation + memory), delete
- derived-metrics (1): compute burn, runway, MRR, gross margin
- cap-table (3): get, upsert (graph memory for fundraising), delete
- knowledge-base (5): search (rerank + keyword), add, update, delete, rate_quality
- investor-links (4): CRUD with `enable_data_room` support
- documents (2): upload with Gemini vision processing + memory attribution
- document-rag (1): `query_documents` via Redis hybrid search
- google-sheets (3): populate_model_sheet, read_model_sheet, get_model_sheet_info — uses **service account with domain-wide delegation** (`GOOGLE_SERVICE_ACCOUNT_KEY_FILE` env var)
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
- `GET /api/knowledge/graph` — Knowledge graph via Mem0 graph API
- `GET/POST /dataroom/:slug/*` — Public investor data room
- `POST /api/webhooks/mem0` — Memory event webhooks
- `GET /health` — Health check

**Environment:**
- Required: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `MEM0_API_KEY`
- Optional: `PORT` (default 3001), `CORS_ORIGINS`, `MOONSHOT_API_KEY`, `COHERE_API_KEY`, `REDIS_URL`, `CF_ACCOUNT_ID`, `CF_GATEWAY_ID`, `CF_API_TOKEN`, `CF_AIG_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (path to service account JSON key for Sheets/Drive), `NOTION_API_KEY` (enables Notion tools)

### EA Agent (`agents/ea/src/`)

**"Alex"** — Executive Assistant agent for Sean Weiss. Human-facing, primary point of contact.

**Runtime:** Express + Anthropic Messages API (direct `anthropic.messages.create()` with agentic tool loop, NOT Claude Agent SDK). Max 15 tool turns per request.

**System prompt** defines Alex's role, personality, autonomous operations, escalation rules ($500+ budget, legal, hiring, investor terms, public statements, strategic pivots, access grants), and tool usage patterns.

**Tools (11, defined natively in `bridge.ts`):**
- `search_knowledge` — Cross-namespace mem0 search (executive read access to all departments)
- `save_knowledge` — Persist facts/decisions to mem0 (9 categories: scheduling, communications, contacts, etc.)
- `create_task` — Create tasks in `ea_tasks` table
- `list_tasks` — List/filter tasks by status
- `save_meeting_notes` — Structured meeting notes with action items in `ea_meeting_notes`
- `draft_email` — Email drafts stored in `ea_communications_log`
- `web_search` — Real-time web search via Perplexity Sonar (OpenRouter)
- `search_notion` — Search Notion workspace by query (conditional on `NOTION_API_KEY`)
- `read_notion_page` — Read page content and properties by ID
- `create_notion_page` — Create in database or as child page
- `update_notion_page` — Update properties and/or append content

**Knowledge Plugins (84 skills across 17 groups):**
- apollo, brand-voice, common-room, customer-support, data, design, engineering, enterprise-search, finance, human-resources, legal, marketing, operations, product-management, productivity, sales, slack-by-salesforce
- Full knowledge-work-plugins library (EA needs breadth as executive assistant)
- `tool-mapping.json` maps `~~placeholder` tokens to EA's actual tools
- Registry: `agents/ea/plugins/registry.json` (built by `npm run build:registry`)

**Transport:** Telegram bot (`@alex_executive_assistant_bot`) via grammy. Security: `TELEGRAM_CHAT_ID` whitelist. 20-message conversation history per chat.

**Enrichment pipeline (parallel, Promise.allSettled):**
1. EA-scoped mem0 memories (top 10, rerank + keyword)
2. Cross-namespace memories (top 10, all departments)
3. Session memories (last 10 from conversation)
4. Matched skills (keyword → vector → dedup, max 3 skills / 4000 tokens)

**Database tables (EA-specific):**
- `ea_tasks` — Task queue (title, description, priority, status, due_date, assigned_to, tags)
- `ea_meeting_notes` — Meeting notes (title, date, attendees, summary, action_items JSONB, key_decisions)
- `ea_communications_log` — Comms log (type, subject, body, recipients, status)

**Environment (see `agents/ea/.env.example`):**
- Required: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MEM0_API_KEY`, `OPENROUTER_API_KEY`
- Optional: `PORT` (3002), `CORS_ORIGINS`, `CF_*` (AI Gateway), `REDIS_URL`, `COHERE_API_KEY`, `SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET`/`SLACK_APP_ID`, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`, `AGENT_MESSAGE_SECRET`, `NOTION_API_KEY` (enables Notion tools)

### WaaS Platform Packages

**`@waas/shared`** (`packages/shared/`) — Pure TypeScript types and logic. Zero runtime deps.
- `types.ts` — Core types: AgentConfig, ModelStack, AgentScope
- `agents.ts` — Agent registry (AGENT_CONFIGS) + department scopes
- `models/` — MODEL_REGISTRY (9 models with pricing), ModelRouter, BoardSession (multi-agent deliberation + quorum voting)
- `namespace/` — 7 AgentScopes (EA, CFA, CMA, COA, Legal, Sales, IR), ScopedRedisClient, ScopedMem0Client (fail-closed enforcement)
- `messaging/` — MessageBus: routing, inbox, threads, escalation

**`@waas/runtime`** (`packages/runtime/`) — Express-based agent execution engine.
- `agent-runtime.ts` — Main class: Express app, middleware, routes, lifecycle
- `middleware/auth.ts` — Supabase JWT verification + org membership + token cache
- `routes/` — health (GET /health) + chat (POST /chat, SSE streaming)
- `transport/telegram.ts` — Telegram bot transport (grammy) for inter-agent messaging
- `lib/` — redis-client, mem0-client, plugin-loader, stream-adapter, tool-helpers (safeFetch, SSRF protection, stripHtml)

### Key Hooks (src/hooks/)

- `useAuth` — Compatibility shim wrapping `useAuthContext()`
- `useAuthContext` — Full Supabase auth context (user, session, org, signOut)
- `useOrganization` — Active org ID from auth context, org creation via atomic RPC
- `useModelSheet(orgId)` — Google Sheets integration
- `useFinancialModel(orgId, scenario)` — Financial model data + derived metrics
- `useCapTable(orgId)` — Cap table entries with computed totals
- `useAgentThread` / `useConversations` — Chat thread management
- `useInvestorLinks` — DocSend-style shareable links

### Frontend Routes (src/App.tsx)

| Path | Page | Purpose |
|------|------|---------|
| `/auth` | Auth | Supabase email+password sign-in |
| `/sign-up` | SignUp | Account creation |
| `/` | Chat | AI CFO agent streaming chat |
| `/knowledge` | Knowledge | Document uploads + agent knowledge base |
| `/model` | FinancialModel | Google Sheets financial model |
| `/dashboard` | Dashboard | Financial charts (P&L, burn/runway, cap table) |
| `/investors` | Investors | Shareable links + engagement analytics |
| `/docs` | Docs | Platform documentation |
| `/settings` | SettingsPage | User and org settings |

### Edge Functions (supabase/functions/)

Deno runtime. Used as fallback when agent server is unreachable.
- `chat/` — Streaming AI chat via OpenAI API format
- `track-view/` — Analytics for investor link views

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

## Deployment

| Service | Platform | URL/Port |
|---------|----------|----------|
| Frontend | Vercel | `cfo.blockdrive.co` |
| CFO Agent | Docker / DigitalOcean App Platform | Port 3001 |
| EA Agent | DigitalOcean App Platform | Port 3002, ingress `/ea` |
| COA Agent | DigitalOcean App Platform | Port 3003, ingress `/coa` |
| CMA Agent | DigitalOcean App Platform | Port 3004, ingress `/cma` |
| Compliance Agent | DigitalOcean App Platform | Port 3005, ingress `/compliance` |
| Legal Agent | DigitalOcean App Platform | Port 3006, ingress `/legal` |
| Sales Agent | DigitalOcean App Platform | Port 3007, ingress `/sales` |
| n8n | DigitalOcean Droplet (167.172.24.255) | `n8n.blockdrive.co` |

**DigitalOcean App Platform:**
- App ID: `854138bf-004c-4992-a5f9-7af5a13bc3d9`
- EA health: `https://cfo-agent-9glt5.ondigitalocean.app/ea/health`
- Auto-deploy enabled from GitHub
- `doctl` CLI installed and authenticated locally

## Key Patterns

- **Tool bridge pattern** (EA): Tools defined as native Anthropic API `Tool` defs + handler functions in `bridge.ts`, NOT converted from Agent SDK `tool()` objects. `createEaTools()` returns `{ toolDefs, handlers }`.
- **Agentic loop** (EA): `createAgentQuery()` loops up to 15 turns — calls Claude, executes tool_use blocks, feeds results back until `end_turn`.
- **Org-scoped tools**: Both CFO and EA tools receive `orgId` via closure and scope all DB queries to that org.
- **Enrichment pipeline**: System prompt enriched with org memories + cross-namespace memories + session memories + matched skills (all via `Promise.allSettled` for resilience).
- **Namespace isolation**: Each agent department gets `ScopedRedisClient` + `ScopedMem0Client` that auto-prefix keys. Cross-department access denied by default.
- **Dual-mode agents**: Agents can run cognitive (Claude + tools + streaming) + conversational (ElevenLabs voice) modes sharing identity and memory. Voice deferred to Phase 2.
- **Inter-agent messaging**: MessageBus via Redis LISTs + Telegram bot-to-bot DMs (transitioning to CF Queues).
- **Provider Keys mode**: When `CF_AIG_TOKEN` is set, Cloudflare AI Gateway injects API keys at edge — provider keys become optional.
- **Google Sheets**: Switched from OAuth 2.0 to service account with domain-wide delegation (`GOOGLE_SERVICE_ACCOUNT_KEY_FILE`). Service account JSON must never be committed (gitignored).
- **Notion scope enforcement** (CFO): CFA_SCOPE Notion access rules inlined in `agent/src/lib/notion-client.ts` (agent package is outside npm workspaces, cannot import `@waas/shared`). EA agent has executive-tier access without scope enforcement.
- **Conditional tool loading**: Notion tools only register when `NOTION_API_KEY` is set (`config.notionEnabled`). All agents check this at tool factory time.
- **PDF generation**: Playwright HTML→PDF with branded template, uploads to Supabase Storage `{orgId}/investor-docs/`, returns 1hr signed URL (matches excel-export pattern).
- **Agent SDK tool pattern** (dept agents): Tools use `tool(name, description, zodRawShape, handler)` 4-arg signature with Zod schemas. All import `safeFetch`, `safeFetchText`, `safeJsonParse`, `stripHtml` from `@waas/runtime`.
- **SSRF protection**: `isAllowedUrl()` blocks private IPs, cloud metadata, localhost, `.internal`/`.local` suffixes before any `fetch_url` call.
- **$5 escalation threshold**: All department agents escalate to COA at $5 budget. COA escalates to Sean for strategic decisions.

## Agent Network

| Agent ID | Role | Port | Tools | Status |
|----------|------|------|-------|--------|
| `blockdrive-ea` | Executive Assistant (Alex) | 3002 | 11 | **Deployed** |
| `blockdrive-cfa` | Chief Financial Agent (Morgan) | 3001 | 31 | **Deployed** |
| `blockdrive-coa` | Chief Operating Agent (Jordan) | 3003 | 13 | **Built** |
| `blockdrive-cma` | Chief Marketing Agent (Taylor) | 3004 | 11 | **Built** |
| `blockdrive-compliance` | Chief Compliance Officer | 3005 | 10 | **Built** |
| `blockdrive-legal` | Legal Counsel (Casey) | 3006 | 11 | **Built** |
| `blockdrive-sales` | Head of Sales (Sam) | 3007 | 12 | **Built** |
| `blockdrive-ir` | Investor Relations (Riley) | — | — | Planned |

## UI Patterns

- shadcn/ui (Radix primitives) in `src/components/ui/` — don't modify directly
- Recharts for dashboard charts in `src/components/dashboard/`
- Tailwind CSS with CSS variables for theming (light/dark)
- `cn()` from `src/lib/utils.ts` for conditional class merging
- React Hook Form + Zod for form validation
- TanStack Query for server state; React Context for auth only
- Chat.tsx uses `VITE_AGENT_URL` env var with edge function fallback
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
