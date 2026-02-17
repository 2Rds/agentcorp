# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Persistent Memory (mem0)

This project uses mem0 for persistent memory. User ID: `claude-code-universal` (shared across all projects).

When saving memories for this project, always tag with:
```json
{
  "project": "cfo",
  "domain": "finance/saas/ai-agents"
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

## Commands

```bash
# Frontend
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run Vitest tests
npm run test:watch   # Watch mode tests

# Agent server
cd agent
npm run dev          # Dev server with hot reload (tsx watch, port 3001)
npm run build        # TypeScript compile to dist/
npm run start        # Production start (node dist/)
```

Tests use Vitest with jsdom. Test files live alongside source using `*.test.ts` or `*.spec.ts` naming. Setup: `src/test/setup.ts`.

## Architecture

AI-powered CFO SaaS for seed-stage startups (v1.0.0). Two-tier: React 18 + TypeScript + Vite frontend (Vercel) with Supabase backend, plus an Express agent server (Docker) using the Claude Agent SDK.

### Auth & Multi-tenancy

Auth flow: `/auth` (Clerk `<SignIn />`) → `ClerkProtectedRoute` → `OrgGate` (checks org membership) → Onboarding or `AppLayout` with sidebar.

Users belong to organizations via `user_roles` table with roles: owner, cofounder, advisor, investor. All data access scoped by organization through RLS using `is_org_member(_user_id, _org_id)` and `has_role(_user_id, _role, _org_id)` PostgreSQL helper functions. Auth uses Clerk (`@clerk/clerk-react` frontend, `@clerk/express` agent server) with Supabase RLS via `auth.jwt() ->> 'sub'`.

### Core Data Model

Two tables drive the financial engine:

- **`financial_model`** — Line items with category (revenue/cogs/opex/headcount/funding), subcategory, month, amount, formula, scenario (base/best/worst). Single source of truth for finances.
- **`cap_table_entries`** — Equity positions: stakeholder info, shares, ownership %, round details.

All derived metrics (burn rate, runway, MRR, gross margin) are computed **client-side** in `useFinancialModel` via `useMemo` — not stored. Scenario toggle re-filters the same query for instant chart updates.

### Agent Server (`agent/src/`)

Express + Claude Agent SDK. Multi-model orchestration via OpenRouter + persistent memory via Mem0.

**Models:**
- Claude Opus 4.6 (Anthropic direct) — Primary reasoning, tool orchestration, streaming chat
- Kimi K2.5 (OpenRouter) — Structured data generation (financial rows, cap table entries, SQL)
- Gemini 3 Flash (OpenRouter) — Document vision, file processing, embeddings, RAG
- Gemini 3 Pro (OpenRouter) — Document vision, advanced reasoning
- Gemini 2.5 Flash Lite (OpenRouter) — Lightweight tasks at minimal cost
- DeepSeek V3.2 (OpenRouter) — Structured data, cost-effective alternative
- DeepSeek V3.2 Speciale (OpenRouter) — Extended capability variant
- Sonar Pro (OpenRouter) — Web research and intelligence gathering

**Mem0 (persistent memory):**
- Sole knowledge store — no Supabase dual-write
- Graph memory with auto-extracted entity relationships
- 6 custom categories: `financial_metrics`, `fundraising`, `company_operations`, `strategic_decisions`, `investor_relations`, `financial_model`
- Multi-model attribution via `agent_id` (opus-brain, k2-builder, gemini-docs)
- Session memory via `run_id` (per conversation thread)
- System prompt enriched with relevant org memories before each query
- Feedback mechanism for self-healing memory quality
- Project config auto-discovered and validated on server startup

**Key directories:**
- `agent/src/agent/` — Agent configurations (`cfo-agent.ts`, `investor-agent.ts`, `knowledge-extractor.ts`, `system-prompt.ts`)
- `agent/src/tools/` — 26 MCP tools across 9 domains, all org-scoped via closure
- `agent/src/lib/` — Multi-model clients (`model-router.ts`, `gemini-client.ts`, `moonshot-client.ts`, `dual-verify.ts`, `mem0-client.ts`, `mem0-setup.ts`), infrastructure (`redis-client.ts`, `semantic-cache.ts`, `plugin-loader.ts`, `google-sheets-client.ts`), utilities (`sql-validator.ts`, `chart-suggestor.ts`, `document-indexer.ts`, `stream-adapter.ts`)
- `agent/src/routes/` — Express routes (`chat.ts`, `model.ts`, `dataroom.ts`, `knowledge.ts`, `health.ts`, `webhooks.ts`)
- `agent/src/middleware/` — Auth (Clerk JWT verification via `@clerk/express` + org membership check via Supabase service role) and CORS

**Tools (26 total):**
- financial-model (3): get, upsert (with K2.5 plan generation + memory), delete
- derived-metrics (1): compute burn, runway, MRR, gross margin
- cap-table (3): get, upsert (with graph memory for fundraising), delete
- knowledge-base (5): search (rerank + keyword), add (with categories/graph/timestamps), update, delete, rate_quality
- investor-links (4): CRUD with `enable_data_room` support
- documents (2): upload with Gemini vision processing + memory attribution
- document-rag (1): `query_documents` via Redis hybrid search (primary) with Gemini + pgvector fallbacks
- google-sheets (3): populate_model_sheet, read_model_sheet, get_model_sheet_info
- analytics (1): `run_analytics_query` — natural language → SQL → chart suggestion
- web-fetch (1), headless-browser (1), excel-export (1)

**Routes:**
- `POST /api/chat` — Streaming AI chat (SDK `query()` with `includePartialMessages`, memory-enriched system prompt)
- `GET /api/model/status` — Google Sheets integration status (no auth)
- `POST /api/model/create-sheet, get-sheet, delete-sheet` — Org model sheet CRUD
- `GET /api/knowledge/graph` — Knowledge graph via Mem0 graph API (native `output_format: v1.1`)
- `GET/POST /dataroom/:slug/*` — Public investor data room (validate, financials, cap-table, ask, view)
- `POST /api/webhooks/mem0` — Memory event webhooks (memory_add, memory_update, memory_delete)
- `GET /health` — Health check

**Security:**
- SQL validator: UUID validation, comment stripping, table allowlisting, schema blocking
- Data room: rate limiting, scenario validation, no leaked org IDs
- Link-level document access control via `allowedDocumentIds`
- Service role key bypasses RLS for agent operations

**Environment:**
- Required: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `MEM0_API_KEY`, `CLERK_SECRET_KEY`
- Optional: `PORT` (default 3001), `CORS_ORIGINS` (comma-separated), `MOONSHOT_API_KEY`, `REDIS_URL`, `CF_ACCOUNT_ID`, `CF_GATEWAY_ID`, `CF_API_TOKEN`, `CF_AIG_TOKEN` (enables Provider Keys mode — gateway injects API keys at edge), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

### Key Hooks (src/hooks/)

- `useAuth` — Compatibility shim wrapping `useClerkAuth()`, provides legacy interface for existing consumers
- `useClerkAuth` — Full Clerk auth context (user, session, org, Supabase client)
- `useOrganization` — Resolves Clerk org ID to Supabase UUID with retry logic, used for data scoping everywhere
- `useModelSheet(orgId)` — Google Sheets integration (create/delete model sheets)
- `useFinancialModel(orgId, scenario)` — Fetches financial_model, computes `DerivedMetrics` (burn, runway, MRR, gross margin, monthly aggregates, breakdowns)
- `useCapTable(orgId)` — Cap table entries with computed totals
- `useAgentThread` / `useConversations` — Chat thread management (one thread per org)
- `useInvestorLinks` — DocSend-style shareable links with view tracking and realtime alerts

### Routes (src/App.tsx)

| Path | Page | Purpose |
|------|------|---------|
| `/auth` | Auth | Clerk sign-in (unprotected) |
| `/sign-up` | SignUp | Clerk sign-up (unprotected) |
| `/` | Chat | AI CFO agent streaming chat |
| `/knowledge` | Knowledge | Document uploads + agent knowledge base with graph |
| `/model` | FinancialModel | Google Sheets financial model with template selector |
| `/dashboard` | Dashboard | Financial model charts (P&L, burn/runway, cap table, OpEx) |
| `/investors` | Investors | Investor portal with shareable links and engagement analytics |
| `/docs` | Docs | Comprehensive platform documentation |
| `/settings` | SettingsPage | User and org settings |

### Edge Functions (supabase/functions/)

Written in Deno for Supabase Edge Functions runtime. Used as fallback when agent server is unreachable.

- **`chat/`** — Streaming AI chat via OpenAI API with CFO system prompt and knowledge extraction
- **`clerk-webhook/`** — Clerk webhook handler (organization.created, membership.created/deleted, user.created/updated) — syncs Clerk to Supabase
- **`create-organization/`** — Org creation with initial role assignment
- **`track-view/`** — Analytics for investor link views

### Data Room (`src/pages/DataRoom.tsx`, `src/components/dataroom/`)

Public-facing investor portal. Accessed via `/dataroom/:slug`. Supports password gating, email capture, and expiry dates. Renders financial dashboards and cap table for investors, with a Q&A interface powered by the investor agent. View tracking via `dataroom_interactions` table.

### UI Patterns

- shadcn/ui (Radix primitives) in `src/components/ui/` — don't modify these directly
- Recharts for dashboard charts in `src/components/dashboard/`
- Tailwind CSS with CSS variables for theming (light/dark)
- `cn()` from `src/lib/utils.ts` for conditional class merging
- React Hook Form + Zod for form validation
- TanStack Query for server state caching; React Context for auth only
- Chat.tsx uses `VITE_AGENT_URL` env var with edge function fallback

### Path Alias

`@/*` → `./src/*` (configured in both tsconfig.json and vite.config.ts).

### Supabase Client

Import: `import { supabase } from "@/integrations/supabase/client"`. Types are auto-generated in `@/integrations/supabase/types.ts` — do not edit that file directly. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Deployment

- **Frontend:** Vercel (auto-builds from `npm run build`, aliased to `cfo.blockdrive.co`)
- **Agent server:** Docker (`agent/Dockerfile`, multi-stage build for TypeScript compilation)
