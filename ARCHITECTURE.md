# Architecture

## Overview

Two-tier system: a React 18 frontend deployed to Vercel, and an Express agent server powered by the Claude Agent SDK with multi-model orchestration and persistent memory. Supabase provides the database, auth, storage, and edge function fallback layer.

```
                    ┌─────────────────┐
                    │   Vercel CDN     │
                    │  React Frontend  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐ ┌───▼──────┐ ┌────▼────────┐
     │  Agent Server   │ │ Supabase │ │  Edge Fns   │
     │  (Express/SDK)  │ │ Postgres │ │  (fallback) │
     └──┬───┬───┬──┬──┘ └──────────┘ └─────────────┘
        │   │   │  │
   ┌────┘   │   │  └────┐
   │        │   │       │
┌──▼──┐ ┌──▼──┐│  ┌────▼────┐
│Opus │ │Open ││  │  Redis   │
│4.6  │ │Route││  │  8.4     │
│     │ │r    ││  │          │
└─────┘ └─────┘│  └──────────┘
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
| `/sign-up` | SignUp | Public — account creation |
| `/` | Chat | Protected — AI CFO streaming chat |
| `/knowledge` | Knowledge | Protected — documents + knowledge graph |
| `/dashboard` | Dashboard | Protected — financial charts |
| `/model` | FinancialModel | Protected — Google Sheets model |
| `/investors` | Investors | Protected — shareable links + analytics |
| `/docs` | Docs | Protected — platform documentation |
| `/settings` | SettingsPage | Protected — user/org settings |
| `/dataroom/:slug` | DataRoom | Public — investor portal |

### Auth Flow

```
/auth (email+password) → ProtectedRoute → OrgGate → Onboarding or AppLayout
```

`AuthProvider` (`src/contexts/AuthContext.tsx`) wraps the app. Uses `supabase.auth.onAuthStateChange()` for session tracking. Fetches organization membership via `profiles` → `organizations` → `user_roles`. Protected routes redirect unauthenticated users to `/auth`. `OrgGate` checks org membership and shows onboarding if none found.

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

### Tools (26 total across 9 domains)

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
| Utilities | 3 | web_fetch, headless_browser, excel_export |

Tools are org-scoped via closure — `orgId` passed to each factory function. Assembled into a single MCP server via `createSdkMcpServer`.

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

16 skills from Anthropic knowledge-work-plugins. 3-stage resolution:

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

## Deployment

- **Frontend:** Vercel (auto-builds from `npm run build`, aliased to `cfo.blockdrive.co`)
- **Agent server:** Docker (multi-stage build for TypeScript compilation)
- **Redis:** Docker Compose alongside agent server
