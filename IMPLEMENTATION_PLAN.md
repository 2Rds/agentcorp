# Implementation Plan

## Current Status

### Completed — v1.2.0 (2026-03-14)

**Department Agent Deployment (5 agents)**
- [x] COA Agent "Jordan" — 13 tools, Opus + Gemini + Grok Reasoning, executive tier
- [x] CMA Agent "Taylor" — 11 tools, Opus + Gemini + Sonar + Grok Fast (X/Twitter)
- [x] Compliance Agent (CCO) — 10 tools, Opus + Granite 4.0 + Command A + Cohere Rerank, audit-read-all
- [x] Legal Agent "Casey" — 11 tools, Opus + Command A + Grok Reasoning (2M context)
- [x] Sales Agent "Sam" — 12 tools, Opus + Sonar + Gemini
- [x] Agent configs + `AgentId` type in `@waas/shared` registry
- [x] Updated plugin allocations: COA (10), CMA (9), Compliance (8), Legal (8), Sales (10)
- [x] SQL migrations for all 5 agents with idempotent policies

**Security Hardening**
- [x] `@waas/runtime` tool-helpers: `safeFetch`, `safeFetchText`, `safeJsonParse`, `stripHtml`, `isAllowedUrl`
- [x] SSRF protection: private IPs, cloud metadata, internal hosts blocked
- [x] All `fetch()` replaced with `safeFetch()` (HTTP status validation)
- [x] All `JSON.parse()` replaced with `safeJsonParse()` (structured errors)
- [x] `stripHtml()` on all `fetch_url` output (prompt injection prevention)
- [x] Zod `.max()` constraints on all string schemas
- [x] Notion SDK proper types (`PageObjectResponse`, `DatabaseObjectResponse`)
- [x] Secure Dockerfiles (selective COPY, `npm ci --omit=dev`, `.dockerignore`)
- [x] Leaked Cloudflare secrets removed from `.gitignore`
- [x] Compliance `check_policy` LIKE wildcard escaping

**Infrastructure**
- [x] `agents/*` added to root npm workspaces
- [x] Grok Fast added to CMA model stack, Cohere Rerank added to Compliance stack
- [x] System prompts with personality, escalation rules ($5 threshold), tool documentation

### Completed — v1.1.1 (2026-03-09)

**Knowledge-Work-Plugins**
- [x] Full knowledge-work-plugins library for EA agent: 84 skills across 17 groups
- [x] Role-relevant plugins for CFO agent: 31 skills across 6 groups (brand-voice, data, enterprise-search, finance, legal, operations)
- [x] EA `tool-mapping.json` mapping `~~placeholder` tokens to actual tools
- [x] Plugin registries (`registry.json`) built for both agents

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
- **Inter-agent messaging** — Designed in @waas/shared but not wired into runtime yet (COA has `message_agent` tool writing to Supabase queue, not Redis Streams yet)
- **Department agents not yet deployed** — All 5 are built and tested locally but not yet added to DigitalOcean App Platform

## Technical Debt

- Supabase types file (`types.ts`) may be stale — needs `supabase gen types` refresh
- `investor-readonly.ts` tool file exists but isn't imported in the tool index
- Edge function `chat/` uses OpenAI API format, not Claude SDK
- `dataroom_interactions` table referenced in code but not in migration SQL
- No automated tests for any agent server (only frontend has Vitest)
- CFO agent still uses Claude Agent SDK; EA uses Anthropic Messages API directly — should standardize
- `@waas/runtime` exists but EA agent was built with direct Express setup (not using runtime package yet)
- Department agent tools have no automated tests (manual testing only)

## Roadmap

### Near-term

- [ ] Deploy 5 department agents to DigitalOcean App Platform (add service components)
- [ ] Self-hosted Redis 8.6 on DO droplet (replace Upstash free tier, enable Streams)
- [ ] Redis Streams inter-agent messaging (replace Supabase queue in `message_agent`)
- [ ] Add `message_agent` tool to EA agent (executive-tier cross-namespace messaging)
- [ ] Create "Inside BlockDrive" Notion pages (department pages, agent databases)
- [ ] Populate investor data room documents in DocSend
- [ ] Wire EA into @waas/runtime (replace direct Express setup)
- [ ] Google Calendar integration for EA (scheduling, meeting prep)
- [ ] Slack integration for EA (channel monitoring, message sending)
- [ ] Agent server test suite (Vitest + supertest)
- [ ] Password reset flow + email verification enforcement
- [ ] Supabase type regeneration

### Medium-term

- [ ] IR agent (Riley) — investor relations, dual-mode (cognitive + voice)
- [ ] Redis FT.HYBRID search for enrichment pipeline
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
