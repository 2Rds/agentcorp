# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run Vitest tests
npm run test:watch   # Watch mode tests
```

Tests use Vitest with jsdom. Test files live alongside source using `*.test.ts` or `*.spec.ts` naming. Setup: `src/test/setup.ts`.

## Architecture

AI-powered CFO SaaS for seed-stage startups. React 18 + TypeScript + Vite frontend with Supabase backend (PostgreSQL, Edge Functions, Auth, Storage).

### Auth & Multi-tenancy

Auth flow: `/auth` → Onboarding (org creation) → `ProtectedRoutes` → `AppLayout` with sidebar.

Users belong to organizations via `user_roles` table with roles: owner, cofounder, advisor, investor. All data access scoped by organization through RLS using `is_org_member()` and `has_role()` PostgreSQL helper functions.

### Core Data Model

Two tables drive the financial engine:

- **`financial_model`** — Line items with category (revenue/cogs/opex/headcount/funding), subcategory, month, amount, formula, scenario (base/best/worst). Single source of truth for finances.
- **`cap_table_entries`** — Equity positions: stakeholder info, shares, ownership %, round details.

All derived metrics (burn rate, runway, MRR, gross margin) are computed **client-side** in `useFinancialModel` via `useMemo` — not stored. Scenario toggle re-filters the same query for instant chart updates.

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

Written in Deno for Supabase Edge Functions runtime.

- **`chat/`** — Streaming AI chat via OpenAI API with CFO system prompt and knowledge extraction
- **`create-organization/`** — Org creation with initial role assignment
- **`track-view/`** — Analytics for investor link views

### UI Patterns

- shadcn/ui (Radix primitives) in `src/components/ui/` — don't modify these directly
- Recharts for dashboard charts in `src/components/dashboard/`
- Tailwind CSS with CSS variables for theming (light/dark)
- `cn()` from `src/lib/utils.ts` for conditional class merging
- React Hook Form + Zod for form validation
- TanStack Query for server state caching; React Context for auth only

### Path Alias

`@/*` → `./src/*` (configured in both tsconfig.json and vite.config.ts).

### Supabase Client

Import: `import { supabase } from "@/integrations/supabase/client"`. Types are auto-generated in `@/integrations/supabase/types.ts` — do not edit that file directly. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Investor Portal

`investor_links` table with `link_views` for tracking. Links have slugs, optional passwords, expiry dates. Realtime subscriptions on `link_views` enable live engagement alerts. Components in `src/components/investors/`.
