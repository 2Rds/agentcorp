# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

AI-powered CFO SaaS for seed-stage startups. Two-tier: React 18 + TypeScript + Vite frontend (Vercel) with Supabase backend, plus an Express agent server (Docker) using the Claude Agent SDK.

### Auth & Multi-tenancy

Auth flow: `/auth` → Onboarding (org creation) → `ProtectedRoutes` → `AppLayout` with sidebar.

Users belong to organizations via `user_roles` table with roles: owner, cofounder, advisor, investor. All data access scoped by organization through RLS using `is_org_member()` and `has_role()` PostgreSQL helper functions.

### Core Data Model

Two tables drive the financial engine:

- **`financial_model`** — Line items with category (revenue/cogs/opex/headcount/funding), subcategory, month, amount, formula, scenario (base/best/worst). Single source of truth for finances.
- **`cap_table_entries`** — Equity positions: stakeholder info, shares, ownership %, round details.

All derived metrics (burn rate, runway, MRR, gross margin) are computed **client-side** in `useFinancialModel` via `useMemo` — not stored. Scenario toggle re-filters the same query for instant chart updates.

### Agent Server (`agent/src/`)

Express + Claude Agent SDK. Multi-model orchestration with feature flags that auto-enable based on API keys.

**Models:**
- Claude Opus 4.6 — Primary reasoning, tool orchestration, streaming chat
- Kimi K2 (Moonshot) — Structured data generation (financial rows, cap table entries, SQL)
- Gemini Flash — Document vision, file processing, embeddings, RAG
- Mem0 — Org-scoped intelligent memory with Supabase dual-write fallback

**Key directories:**
- `agent/src/agent/` — Agent configurations (`cfo-agent.ts`, `investor-agent.ts`, `knowledge-extractor.ts`, `system-prompt.ts`)
- `agent/src/tools/` — 20 MCP tools across 7 domains, all org-scoped via closure
- `agent/src/lib/` — Multi-model clients (`model-router.ts`, `gemini-client.ts`, `kimi-builder.ts`, `mem0-client.ts`), utilities (`sql-validator.ts`, `chart-suggestor.ts`, `document-indexer.ts`, `stream-adapter.ts`)
- `agent/src/routes/` — Express routes (`chat.ts`, `dataroom.ts`, `knowledge.ts`, `health.ts`)
- `agent/src/middleware/` — CORS configuration

**Tools (20 total):**
- financial-model (3): get, upsert (with K2 plan generation), delete
- derived-metrics (1): compute burn, runway, MRR, gross margin
- cap-table (3): get, upsert, delete entries
- knowledge-base (2): search/store with Mem0 + Supabase fallback
- investor-links (4): CRUD with `enable_data_room` support
- documents (2): upload with Gemini vision processing
- document-rag (1): `query_documents` via Gemini grounded generation + pgvector
- analytics (1): `run_analytics_query` — natural language → SQL → chart suggestion
- web-fetch (1), headless-browser (1), excel-export (1)

**Routes:**
- `POST /api/chat` — Streaming AI chat (SDK `query()` with `includePartialMessages`)
- `GET /api/knowledge/graph` — Knowledge graph data
- `GET/POST /dataroom/:slug/*` — Public investor data room (validate, financials, cap-table, ask, view)
- `GET /health` — Health check

**Security:**
- SQL validator: UUID validation, comment stripping, table allowlisting, schema blocking
- Data room: rate limiting, scenario validation, no leaked org IDs
- Link-level document access control via `allowedDocumentIds`
- Service role key bypasses RLS for agent operations

**Environment:**
- Required: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `MOONSHOT_API_KEY`, `GEMINI_API_KEY`, `MEM0_API_KEY`
- `PORT=3001`, `CORS_ORIGINS` comma-separated

### Key Hooks (src/hooks/)

- `useAuth` — Auth state context, wraps Supabase auth
- `useOrganization` — Current org ID from user's role, used for data scoping everywhere
- `useFinancialModel(orgId, scenario)` — Fetches financial_model, computes `DerivedMetrics` (burn, runway, MRR, gross margin, monthly aggregates, breakdowns)
- `useCapTable(orgId)` — Cap table entries with computed totals
- `useAgentThread` / `useConversations` — Chat thread management (one thread per org)
- `useInvestorLinks` — DocSend-style shareable links with view tracking and realtime alerts

### Routes (src/App.tsx)

| Path | Page | Purpose |
|------|------|---------|
| `/auth` | Auth | Sign in/up (unprotected) |
| `/` | Chat | AI CFO agent streaming chat |
| `/dashboard` | Dashboard | Financial model charts (P&L, burn/runway, cap table, OpEx) |
| `/knowledge` | Knowledge | Document uploads + agent knowledge base |
| `/investors` | Investors | Investor portal with shareable links and engagement analytics |
| `/settings` | SettingsPage | User and org settings |

### Edge Functions (supabase/functions/)

Written in Deno for Supabase Edge Functions runtime. Used as fallback when agent server is unreachable.

- **`chat/`** — Streaming AI chat via OpenAI API with CFO system prompt and knowledge extraction
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
