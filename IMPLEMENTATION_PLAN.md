# Implementation Plan

## Current Status

### Completed — v1.1.0 (2026-03-09)

**Notion Integration**
- [x] Notion client library for CFO agent (`agent/src/lib/notion-client.ts`) with inlined CFA_SCOPE enforcement
- [x] 4 Notion MCP tools for CFO agent: `query_notion_database`, `create_notion_page`, `update_notion_page`, `append_notion_content`
- [x] Notion client library for EA agent (`agents/ea/src/lib/notion-client.ts`)
- [x] 4 Notion tools for EA agent: `search_notion`, `read_notion_page`, `create_notion_page`, `update_notion_page`
- [x] `NOTION_API_KEY` env var in both agents (conditional — tools only register when set)
- [x] Notion DB IDs in `scopes.ts` reconciled with workspace (Decision Log, Project Hub, Investor Pipeline)

**PDF Generation**
- [x] Playwright HTML→PDF generator (`agent/src/lib/pdf-generator.ts`) with branded BlockDrive template
- [x] Metrics one-pager template (`agent/src/lib/templates/metrics-one-pager.ts`)
- [x] `generate_investor_document` tool — markdown or structured metrics → PDF → Supabase Storage → signed URL

**Bug Fixes**
- [x] Investor link URL: `/share/` → `/dataroom/` in LinkCard + LinkDetailPanel
- [x] Investor agent + documents vision fallback: Sonnet → Opus 4.6
- [x] EA tool result handling: handlers return `string`, not `{ content, isError }`
- [x] Stale mem0 user ID in `enforcement.ts`: `project-block-drive-vault` → `project-waas`

### Completed — CFO Platform (v1.0.0, 2026-03-04)

**Core Platform**
- [x] React 18 + Vite frontend with shadcn/ui and Tailwind CSS
- [x] Express CFO agent server with Claude Agent SDK + 26 MCP tools
- [x] Native Supabase Auth (email+password) with RLS
- [x] Multi-tenancy via organizations with role-based access
- [x] Atomic org creation RPC (`create_organization`)

**Financial Engine**
- [x] Financial model with SaaS template, scenario modeling, derived metrics
- [x] Google Sheets integration (service account with domain-wide delegation)
- [x] Cap table, investor portal (DocSend-style), knowledge base with Gemini vision
- [x] Multi-model orchestration (9 models via OpenRouter), semantic caching, Cohere rerank

### Completed — WaaS Platform (2026-03-04 → 2026-03-09)

**Platform Packages**
- [x] `@waas/shared` — Agent registry, model registry, namespace scopes, MessageBus, BoardSession
- [x] `@waas/runtime` — AgentRuntime (Express), auth middleware, chat/health routes, Telegram transport, Redis/mem0 clients

**EA Agent "Alex" (2026-03-05 → 2026-03-09)**
- [x] Scaffolded at `agents/ea/` (28 source files)
- [x] Anthropic Messages API with agentic tool loop (15 turns max)
- [x] 7 native tools: knowledge search/save, tasks, meeting notes, email drafts, web search
- [x] Cross-namespace mem0 read access (executive tier)
- [x] System prompt with autonomous ops + escalation rules
- [x] Telegram bot transport (@alex_executive_assistant_bot)
- [x] Enrichment pipeline: EA memories + cross-dept + session + skills (parallel)
- [x] Database: `ea_tasks`, `ea_meeting_notes`, `ea_communications_log` tables
- [x] Deployed to DigitalOcean App Platform (port 3002, `/ea` ingress)

**Auth Migration (v1.0.0)**
- [x] Clerk → native Supabase Auth (UUID RLS, token cache, race condition fixes)

### Completed — Infrastructure (2026-03-04 → 2026-03-09)

- [x] DigitalOcean App Platform for agent deployment (auto-deploy from GitHub)
- [x] n8n automation hub on DO droplet (167.172.24.255, `n8n.blockdrive.co`)
- [x] Google Sheets switched from OAuth to service account + domain-wide delegation
- [x] `doctl` CLI installed and authenticated locally

## Known Limitations

- **No email verification enforcement** — Supabase Auth sends confirmation emails but doesn't block unverified users
- **No password reset flow** — No "Forgot Password" page
- **Single-org per user** — Profile links to one org
- **No invitation system** — Org members added manually
- **No OAuth/SSO** — Only email+password
- **Client-side metrics only** — Derived metrics computed in browser
- **Redis optional** — Vector search, semantic cache, plugin matching degrade to fallbacks without it
- **Mem0 dependency** — Knowledge base entirely Mem0-dependent
- **EA tool set is growing** — Has knowledge, tasks, meeting notes, email drafts, web search, and Notion, but no calendar integration or actual email sending yet
- **Inter-agent messaging** — Designed in @waas/shared but not wired into EA yet (using Telegram transport only)

## Technical Debt

- Supabase types file (`types.ts`) may be stale — needs `supabase gen types` refresh
- `investor-readonly.ts` tool file exists but isn't imported in the tool index
- Edge function `chat/` uses OpenAI API format, not Claude SDK
- `dataroom_interactions` table referenced in code but not in migration SQL
- No automated tests for any agent server (only frontend has Vitest)
- CFO agent still uses Claude Agent SDK; EA uses Anthropic Messages API directly — should standardize
- `@waas/runtime` exists but EA agent was built with direct Express setup (not using runtime package yet)

## Roadmap

### Near-term

- [ ] Create "Inside BlockDrive" Notion pages (department pages, agent databases)
- [ ] Populate investor data room documents in DocSend
- [ ] Wire EA into @waas/runtime (replace direct Express setup)
- [ ] Google Calendar integration for EA (scheduling, meeting prep)
- [ ] Slack integration for EA (channel monitoring, message sending)
- [ ] EA → CFO inter-agent messaging (real tool calls, not just Telegram relay)
- [ ] Agent server test suite (Vitest + supertest)
- [ ] Password reset flow + email verification enforcement
- [ ] Supabase type regeneration

### Medium-term

- [ ] Additional agents: COA, CMA, IR (using @waas/runtime scaffolding)
- [ ] CF Queues for inter-agent messaging (replace Telegram bot-to-bot)
- [ ] ElevenLabs voice integration (Phase 2 — TTS/STT, phone calls, batch calling)
- [ ] OAuth/SSO support (Google, GitHub)
- [ ] Multi-org support (org switcher)
- [ ] Server-side metric caching

### Long-term

- [ ] Board deliberation via BoardSession (multi-agent quorum voting)
- [ ] Custom financial model templates beyond SaaS
- [ ] Plaid/bank feed integration for actual vs. projected
- [ ] Fundraising CRM (investor pipeline, outreach tracking)
- [ ] AI-generated pitch deck builder
- [ ] Multi-currency support
