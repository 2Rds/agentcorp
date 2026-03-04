# Implementation Plan

## Current Status (v1.0.0)

### Completed

**Core Platform**
- [x] React 18 + Vite frontend with shadcn/ui and Tailwind CSS
- [x] Express agent server with Claude Agent SDK
- [x] Native Supabase Auth (email+password) with RLS
- [x] Multi-tenancy via organizations with role-based access (owner/cofounder/advisor/investor)
- [x] Auto-profile creation on signup via database trigger

**AI Agent**
- [x] Streaming chat with Claude Opus 4.6 (SSE)
- [x] 26 MCP tools across 9 domains
- [x] Multi-model orchestration via OpenRouter (9 models)
- [x] Mem0 persistent memory with graph relationships and 6 categories
- [x] System prompt enriched with relevant org memories
- [x] Automatic knowledge extraction from conversations
- [x] 16 knowledge-work plugins with 3-stage resolution
- [x] Semantic caching for deterministic model outputs
- [x] Cohere Rerank v3.5 for plugin loading and document RAG
- [x] Edge function fallback when agent server unreachable

**Financial Engine**
- [x] Financial model with SaaS template (revenue/COGS/OpEx/headcount/funding)
- [x] Scenario modeling (base/best/worst)
- [x] Client-side derived metrics (burn, runway, MRR, gross margin)
- [x] P&L, burn/runway, cap table, and OpEx dashboard charts
- [x] Google Sheets integration (create, populate, read)
- [x] Excel export with multi-tab workbooks
- [x] Natural language to SQL analytics with chart suggestions

**Investor Portal**
- [x] DocSend-style shareable links
- [x] Password gating, email capture, expiry dates
- [x] View tracking and engagement analytics
- [x] Public data room with financial dashboards
- [x] Investor Q&A powered by investor agent

**Knowledge System**
- [x] Document uploads with Gemini vision processing
- [x] Redis hybrid search (text + vector) for document RAG
- [x] Knowledge graph visualization via Mem0 graph API
- [x] Memory quality feedback mechanism

**Infrastructure**
- [x] Redis 8.4 with 3 RediSearch indexes
- [x] Cloudflare AI Gateway support (optional)
- [x] Docker multi-stage build for agent server
- [x] SQL validator with injection prevention

### Auth Migration (v1.0.0)

- [x] Migrated from Clerk to native Supabase Auth
- [x] TEXT → UUID column type reversion with FK constraints
- [x] RLS policies rewritten with `auth.uid()` instead of `auth.jwt() ->> 'sub'`
- [x] Token verification cache (5-min TTL, bounded at 500 entries)
- [x] Rollback logic for multi-step org creation
- [x] Race condition fix in auth session initialization

## Known Limitations

- **No email verification enforcement** — Supabase Auth sends confirmation emails but the app doesn't block unverified users
- **No password reset flow** — No "Forgot Password" page or reset email trigger
- **Single-org per user** — Users can only belong to one organization (profile links to one org)
- **No invitation system** — New org members must be added manually or via direct database access
- **No OAuth/SSO** — Only email+password auth; no Google, GitHub, or SAML
- **Client-side metrics only** — All derived metrics computed in the browser, not cached server-side
- **No real-time collaboration** — Multiple users can't see each other's changes live (Supabase Realtime not wired for model updates)
- **Redis required for full features** — Without Redis, vector search, semantic cache, and plugin matching degrade to fallbacks
- **Mem0 dependency** — Knowledge base is entirely Mem0-dependent; no local fallback for memory storage

## Technical Debt

- `package.json` name is still `vite_react_shadcn_ts` (Lovable template holdover)
- Supabase types file (`types.ts`) may be stale — needs `supabase gen types` refresh
- Some early commits have non-conventional messages ("Changes", "Updated plan file")
- `investor-readonly.ts` tool file exists but isn't imported in the tool index
- Edge function `chat/` uses OpenAI API format, not Claude SDK — should be unified
- `dataroom_interactions` table referenced in code but not in migration SQL
- No automated tests for agent server (only frontend has Vitest)
- Model router has duplicate model aliases (e.g., `sonnet` vs direct Anthropic)

## Roadmap

### Near-term

- [ ] Password reset flow (`/forgot-password` page)
- [ ] Email verification enforcement
- [ ] Organization invitation system (email-based)
- [ ] Agent server test suite (Vitest + supertest)
- [ ] Supabase type regeneration and validation
- [ ] Rename root package.json to `cfo`

### Medium-term

- [ ] OAuth/SSO support (Google, GitHub)
- [ ] Multi-org support (org switcher)
- [ ] Real-time collaboration via Supabase Realtime
- [ ] Server-side metric caching for dashboard performance
- [ ] Audit log for org actions
- [ ] Webhook integrations (Slack, email notifications)
- [ ] Mobile-responsive improvements

### Long-term

- [ ] Custom financial model templates beyond SaaS
- [ ] Plaid/bank feed integration for actual vs. projected
- [ ] Fundraising CRM (investor pipeline, outreach tracking)
- [ ] AI-generated pitch deck builder
- [ ] Board meeting prep and reporting automation
- [ ] Multi-currency support
