# Architecture

## Overview

Multi-tier system: a React 18 frontend (Vercel) providing workspace UIs for 7 Express agent servers (DigitalOcean), backed by Supabase (Postgres, Auth, RLS, Storage).

```
                    ┌─────────────────┐
                    │   Vercel CDN     │
                    │  AgentCorp UI    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼─────┐    ┌────────▼────────┐    ┌──────▼──────┐
   │ Supabase │    │  CFO + EA Agent  │    │ 5 Dept Agent │
   │ Postgres │    │  (custom Express)│    │  Servers     │
   └──────────┘    └──┬───┬───┬──────┘    │ (@waas/runtime)│
                      │   │   │           └──┬───┬───────┘
                 ┌────┘   │   └────┐         │   │
                 │        │        │         │   │
              ┌──▼──┐ ┌──▼──┐ ┌───▼───┐  ┌──▼──┐│
              │Opus │ │Open │ │ Redis  │  │Tele ││
              │4.6  │ │Route│ │ 8.4   │  │gram ││
              └─────┘ └─────┘ └───────┘  └─────┘│
                         ┌───▼──┐          ┌─────▼───┐
                         │ Mem0 │          │  Notion  │
                         └──────┘          └─────────┘
```

## Frontend (`src/`)

React 18 + TypeScript + Vite. Uses shadcn/ui (Radix primitives) with Tailwind CSS. TanStack Query for server state; React Context for auth only. The frontend is the **AgentCorp workspace** — a multi-agent chat and management UI for all 7 department agents.

### Routes

| Path | Component | Auth |
|------|-----------|------|
| `/auth` | Auth | Public — email+password sign-in |
| `/` | Dashboard | Protected — agent overview grid with health status |
| `/ea` | EAWorkspace | Protected — chat with Alex (Executive Assistant) |
| `/finance` | FinanceWorkspace | Protected — chat with Morgan (CFO Agent) |
| `/operations` | OperationsWorkspace | Protected — chat with Jordan (COA) |
| `/marketing` | MarketingWorkspace | Protected — chat with Taylor (CMA) |
| `/compliance` | ComplianceWorkspace | Protected — chat with CCO (Compliance) |
| `/legal` | LegalWorkspace | Protected — chat with Casey (Legal) |
| `/sales` | SalesWorkspace | Protected — chat with Sam (Sales) |
| `/settings` | Settings | Protected — user and org settings |

### Auth Flow

```
/auth (email+password) → ProtectedRoute → AppLayout (with org context)
```

`AuthProvider` (`src/contexts/AuthContext.tsx`) wraps the app. Uses `supabase.auth.onAuthStateChange()` exclusively for session tracking (no separate `getSession()` call). Fetches organization membership via `profiles` → `organizations`. Protected routes redirect unauthenticated users to `/auth`.

### Agent Chat

Each workspace page renders a `DepartmentWorkspace` component which maps the department to an agent config and renders `AgentChat`. The chat component:

- Streams responses via SSE from the agent's `/chat` endpoint
- Persists conversations and messages to Supabase
- Uses `messagesRef` to prevent stale closure issues during rapid sends
- Guards against missing `VITE_AGENT_URL` with user-facing error message
- Includes aria-labels for accessibility

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
| CCO (Compliance) | Opus 4.6 | Granite 4.0, Command A | Cohere v4.0 | Cohere v4.0 | 3005 |
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
│   ├── CCO (Compliance) — governance, audit-read-all
│   ├── Casey (Legal) — contracts, IP
│   └── Sam (Sales) — pipeline, prospecting
```

### Escalation

All department agents escalate to COA (Jordan) at $5 budget threshold. COA escalates to Sean for strategic decisions, hiring, vendor contracts, and cross-department conflicts.

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

Primary interface: Telegram bot (`@alex_executive_assistant_bot`) via grammy. Security: `TELEGRAM_CHAT_ID` whitelist. 20-message conversation history per chat.

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

## Deployment

- **Frontend:** Vercel (auto-builds from `npm run build`, aliased to `cfo.blockdrive.co`)
- **CFO Agent:** DigitalOcean App Platform (Docker, port 3001)
- **EA Agent:** DigitalOcean App Platform (Docker, port 3002, `/ea` ingress)
- **COA Agent:** DigitalOcean App Platform (Docker, port 3003, `/coa` ingress)
- **CMA Agent:** DigitalOcean App Platform (Docker, port 3004, `/cma` ingress)
- **Compliance Agent:** DigitalOcean App Platform (Docker, port 3005, `/compliance` ingress)
- **Legal Agent:** DigitalOcean App Platform (Docker, port 3006, `/legal` ingress)
- **Sales Agent:** DigitalOcean App Platform (Docker, port 3007, `/sales` ingress)
- **Redis:** Docker Compose alongside agent server
- **n8n:** DigitalOcean Droplet (`n8n.blockdrive.co`)
