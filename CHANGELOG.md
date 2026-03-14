# Changelog

All notable changes to the WaaS platform.

## [v2.2.0] - 2026-03-14

Governance system with C-Suite Telegram approval flow, Supabase Realtime for live frontend updates, Vault for encrypted secret storage, and Database Webhooks for event-driven agent notifications.

### Added

- **Governance Engine** — Dual-mode (startup/enterprise) governance with daily spend tracking per agent (Redis counters), pending approval management via Telegram inline keyboards, and authorized approver enforcement via C-Suite group chat
- **Governance types in `@waas/shared`** — `GovernanceConfig`, `ApprovalCategory`, `PendingApproval`, `GovernanceDecision`, `SpendEvent` types with `BLOCKDRIVE_GOVERNANCE` defaults
- **GovernanceEngine in `@waas/runtime`** — `checkSpendLimit()`, `recordSpend()`, `requestApproval()`, `setupCallbackHandler()` methods with Redis-backed state
- **Spend tracking in chat routes** — Estimated token costs written to Redis via GovernanceEngine after every agent query
- **Agent usage events bridge** — `agent_usage_events` table now receives writes from chat routes (was Redis-only, table stayed empty); Operations workspace AgentUsageTab shows real cost/latency data
- **Supabase Realtime** — `useRealtimeSubscription` hook with unique channel IDs, `.subscribe()` status callbacks, and race-condition-closing refetch on SUBSCRIBED; 17 department tables added to `supabase_realtime` publication (idempotent DO blocks)
- **Live frontend updates** — All 7 workspace pages + Dashboard subscribe to their department tables, auto-invalidating TanStack Query cache on changes
- **Supabase Vault** — Enabled pgsodium + pg_net extensions for encrypted secret storage and database-level HTTP calls
- **Database Webhooks** — `webhook-handler` Edge Function receives pg_net triggers and routes events to agent servers; INSERT triggers on `ea_tasks`, `agent_messages`, `compliance_governance_log`
- **Webhook security** — Exact Bearer token auth (not substring match), Content-Type validation, `REVOKE EXECUTE FROM PUBLIC` on trigger functions, `BEGIN..EXCEPTION` handler around `PERFORM`
- Governance directives added to all 7 agent system prompts (approval gates for external comms, marketing, social media, financial commitments)

### Changed

- GitHub repo references updated from `2rds/cfo` to `2Rds/agentcorp`
- Frontend URL renamed from `cfo.blockdrive.co` to `corp.blockdrive.co`
- Dashboard org hierarchy updated: CCO → Parker (CCA), Legal → Casey (CLA), Sales → Sam (CSA)

## [v2.1.0] - 2026-03-14

PostHog product analytics + Sentry error monitoring across the full stack (frontend + all 7 agent servers).

### Added

- **Frontend Sentry** — `@sentry/react` with `BrowserTracing`, `Replay` (on error), `ErrorBoundary`, source map upload via `@sentry/vite-plugin` (conditional on `SENTRY_AUTH_TOKEN`)
- **Frontend PostHog** — `posthog-js` with autocapture, SPA page view tracking via React Router `useLocation`, user identification on auth state change
- **CFO Agent observability** — `@sentry/node` + `posthog-node` with Express error handler, unhandled rejection/exception handlers, `agent_query` PostHog events
- **EA Agent observability** — Re-exports from `@waas/runtime` (DRY), same init pattern
- **@waas/runtime observability** — Shared `initSentry(agentId)` + `initPostHog()` + `shutdownObservability()` covering all 5 department agents (COA, CMA, Compliance, Legal, Sales)
- 3 custom PostHog events: `agent_chat_sent`, `workspace_viewed`, `agent_health_checked`
- Sentry user context + PostHog identify/reset on auth state changes in `AuthContext`
- Startup logs for all observability init (success/skip/failure)
- Graceful shutdown with Sentry flush timeout logging

### Fixed

- Sentry Express error handler ordering (after routes, before 404 handler)
- `uncaughtException` handlers now flush Sentry then `process.exit(1)` (process enters undefined state)
- All SDK init calls wrapped in try-catch (non-fatal on failure — app still starts)
- Source maps only generated when `SENTRY_AUTH_TOKEN` is set (prevents CDN exposure)
- `Sentry.close()` flush result now logged in shutdown
- PostHog `.capture()` wrapped in try-catch across all chat routes
- EA observability DRY — re-exports from `@waas/runtime` instead of duplicating
- Real `FallbackErrorBoundary` class component in `App.tsx` (was pass-through)
- Removed `persistence: 'localStorage'` from PostHog config (default is safer)
- Observability init moved to constructor (before async `start()` operations)
- `PermissionMode` type imported from Claude Agent SDK (removed unsafe `as` cast)
- Fixed `catch (err: any)` → `catch (err)` with `instanceof Error` checks

## [v2.0.0] - 2026-03-14

AgentCorp frontend migration — workspace UI for all 7 agents with department-specific dashboards, unified agent health monitoring, and comprehensive PR review fixes.

### Added

- **AgentCorp workspace UI** — 7 department workspaces (EA, Finance, Operations, Marketing, Compliance, Legal, Sales) with agent chat, task management, and department-specific dashboards
- `DepartmentWorkspace` reusable component with agent chat, task panels, and department metrics
- `AgentChat` streaming SSE component with Markdown rendering, conversation persistence, and per-agent URL routing
- `AppLayout` with sidebar navigation for all department workspaces
- `useAgentHealth` hook for real-time agent status monitoring
- Dashboard with agent health grid, department metrics, and activity feed

### Fixed

- AuthContext race condition — removed separate `getSession()` call, uses `onAuthStateChange` exclusively (`INITIAL_SESSION` event)
- AgentChat stale closure — added `messagesRef` to prevent stale messages in rapid sends
- SSE parser error swallowing — added `console.warn` for parse errors + error payload detection
- Supabase `{ error }` checks added across 25 query sites (Dashboard, all Workspaces, Settings)
- AgentChat conversation persistence error handling (create, insert, load)
- AuthContext `fetchOrg` + `signOut` error handling
- Missing `VITE_AGENT_URL` guard in AgentChat
- Outer catch in AgentChat logs error with agent name
- Dashboard `formatTime` NaN guard
- Password `minLength` 6 → 8
- Accessibility: `aria-label` on chat textarea and send button
- `prose-invert` → `dark:prose-invert` for dark-mode-conditional rendering
- `DepartmentWorkspace` null guard for unknown departments
- Excluded `_finance-archive` from vitest config
- Removed misleading auto-generated comments from Supabase client

## [v1.2.0] - 2026-03-14

Department agent deployment — 5 new agents built with @waas/runtime, shared tool-helpers for security hardening, and model stack specialization per department.

### Added

- **COA Agent "Jordan"** — Chief Operating Agent with 13 MCP tools (cross-namespace knowledge, Notion CRUD, agent health checks, task management, inter-agent messaging). Opus + Gemini + Grok Reasoning model stack.
- **CMA Agent "Taylor"** — Chief Marketing Agent with 11 tools (content drafting, campaign management, SEO analysis, X/Twitter search via Grok Fast). Opus + Gemini + Sonar + Grok Fast model stack.
- **Compliance Agent (CCO)** — 10 tools (cross-namespace audit scanning via Granite 4.0, risk assessment, governance logging, policy register). Opus + Granite + Command A model stack with Cohere Rerank.
- **Legal Agent "Casey"** — 11 tools (legal review with risk scoring, IP portfolio tracking, contract analysis via Grok 2M context). Opus + Command A + Grok Reasoning model stack.
- **Sales Agent "Sam"** — 12 tools (pipeline management, prospect research, call prep, proposal drafting, call logging). Opus + Sonar + Gemini model stack.
- `@waas/runtime` tool-helpers: `safeFetch`, `safeFetchText`, `safeJsonParse`, `stripHtml`, `isAllowedUrl` (SSRF protection)
- Agent configs for all 5 department heads in `@waas/shared` agent registry
- `AgentId` type union exported from `@waas/shared`
- Grok Fast added to CMA model stack (X/Twitter integration)
- Cohere Rerank added to Compliance model stack (noisy cross-namespace audit filtering)
- Updated plugin allocations: COA (10), CMA (9), Compliance (8), Legal (8), Sales (10)
- `agents/*` added to root npm workspaces
- Dockerfiles with secure multi-stage builds and `.dockerignore` for all 5 agents
- SQL migrations with idempotent policies (`DROP POLICY IF EXISTS` before `CREATE POLICY`)
- System prompts with personality, escalation rules ($5 budget threshold), and full tool documentation

### Changed

- All agent tools use `safeFetch`/`safeFetchText` instead of raw `fetch()` (HTTP status validation)
- All `JSON.parse()` calls replaced with `safeJsonParse` (structured error handling)
- All `fetch_url` tools use `stripHtml` to prevent prompt injection from web content
- All Zod string schemas have `.max()` length constraints
- Notion SDK types use `PageObjectResponse`/`DatabaseObjectResponse` instead of `any` casts
- COA `get_agent_status` uses configurable `AGENT_BASE_URL` env var (not localhost)

### Fixed

- Leaked Cloudflare AI Gateway secrets removed from `.gitignore`
- Compliance `check_policy` escapes LIKE wildcards to prevent SQL pattern injection

## [v1.1.1] - 2026-03-09

Knowledge-work-plugins integration for both agents — contextual domain skills injected into system prompts via enrichment pipeline.

### Added

- Full knowledge-work-plugins library for EA agent: 84 skills across 17 groups (apollo, brand-voice, common-room, customer-support, data, design, engineering, enterprise-search, finance, human-resources, legal, marketing, operations, product-management, productivity, sales, slack-by-salesforce)
- Role-relevant knowledge-work-plugins for CFO agent: 31 skills across 6 groups (brand-voice, data, enterprise-search, finance, legal, operations)
- EA agent `tool-mapping.json` mapping `~~placeholder` tokens to EA's actual tools (search_knowledge, search_notion, draft_email, list_tasks)
- Plugin build scripts (`build-registry.ts`) and `registry.json` for both agents

## [v1.1.0] - 2026-03-09

WaaS platform expansion: EA agent deployment, Notion integration for both agents, PDF generation for CFO agent, and multiple bug fixes.

### Added

- WaaS platform packages: `@waas/shared` (agent registry, model registry, namespace scopes, MessageBus, BoardSession) and `@waas/runtime` (Express agent execution engine, auth middleware, Telegram transport)
- EA Agent "Alex" — Anthropic Messages API with agentic tool loop (15 turns max), 7 native tools (knowledge search/save, tasks, meeting notes, email drafts, web search), cross-namespace mem0 read access
- Telegram bot transport for EA agent (`@alex_executive_assistant_bot`)
- Google service account auth for Sheets integration (domain-wide delegation)
- Atomic org creation RPC (`create_organization`) — single transaction for org + role + profile
- Notion API integration for CFO agent: 4 tools (`query_notion_database`, `create_notion_page`, `update_notion_page`, `append_notion_content`) with CFA_SCOPE enforcement
- Notion API integration for EA agent: 4 conditional tools (`search_notion`, `read_notion_page`, `create_notion_page`, `update_notion_page`) with executive-tier access
- PDF generation tool for CFO agent (`generate_investor_document`) — Playwright HTML→PDF with branded BlockDrive template, uploads to Supabase Storage with signed URL
- Metrics one-pager template for structured financial data → HTML rendering
- Notion config (`NOTION_API_KEY`) as optional env var for both agents
- EA database tables: `ea_tasks`, `ea_meeting_notes`, `ea_communications_log`
- Enrichment pipeline for EA: parallel mem0 + cross-namespace + session + skills loading

### Changed

- CFO agent now has 31 tools (26 → 31 with Notion + PDF), EA has 11 tools (7 → 11 with Notion) when Notion is enabled
- Comprehensive documentation update for WaaS platform + EA agent

### Fixed

- Investor link URL bug: `/share/:slug` → `/dataroom/:slug` (LinkCard + LinkDetailPanel)
- Investor agent model: Sonnet → Opus 4.6 (policy compliance)
- Documents vision fallback model: Sonnet → Opus 4.6 (policy compliance)
- Notion DB IDs in `scopes.ts` reconciled with workspace (Decision Log + Project Hub)
- EA Dockerfile COPY syntax for DigitalOcean App Platform build
- EA switched from Agent SDK to Anthropic Messages API (better tool loop control)
- `claude-opus-4-6` model ID (without date suffix)
- EA agent tool result handling: handlers return `string`, not `{ content, isError }`
- Stale mem0 user ID in `enforcement.ts`: `project-block-drive-vault` → `project-waas`

## [v1.0.0] - 2026-03-04

Initial public release. Full-featured AI CFO platform with multi-model orchestration, persistent memory, and native Supabase Auth.

### Added

- Claude Agent SDK server with 26 MCP tools across 9 domains (financial model, cap table, knowledge base, investor links, documents, document RAG, analytics, Google Sheets, web/browser)
- Multi-model orchestration via OpenRouter: Kimi K2.5, Gemini 3 Flash/Pro, Gemini 2.5 Flash Lite, DeepSeek V3.2/Speciale, Sonar Pro, Granite 4.0, Sonnet 4.6
- Mem0 persistent memory with graph relationships, 6 custom categories, multi-model attribution, and session memory
- Redis 8.4 vector search infrastructure with 3 indexes (plugins, documents, LLM cache)
- Semantic caching for deterministic model outputs (Kimi, Gemini, DeepSeek)
- 16 knowledge-work plugins with 3-stage resolution (keyword pre-filter, Redis vector re-rank, Cohere rerank)
- Cohere Rerank v3.5 cross-encoder integration for plugin loading and document RAG
- Financial model with SaaS template (10 acquisition channels, 3 revenue streams, full P&L)
- Client-side derived metrics: burn rate, runway, MRR, gross margin, monthly aggregates
- Scenario toggling (base/best/worst) with instant chart updates
- Cap table management with equity positions and round tracking
- DocSend-style investor links with password gating, email capture, expiry, and view tracking
- Public data room portal (`/dataroom/:slug`) with Q&A powered by investor agent
- Document uploads with Gemini vision processing and automatic knowledge extraction
- Document RAG via Redis hybrid search with Gemini + pgvector fallbacks
- Google Sheets integration (create, populate, read model sheets)
- Natural language to SQL analytics with chart suggestions
- Excel export with multi-tab workbook generation
- Knowledge graph visualization via Mem0 native graph API
- Cloudflare AI Gateway support for LLM proxy and cost analytics (optional)
- Edge function fallback when agent server is unreachable
- Vision-based reading for images and scanned PDFs
- Headless browser tool for JS-rendered pages
- Custom .xlsx upload and financial system integrations
- CLAUDE.md, hooks, and skills for Claude Code automation
- Comprehensive platform documentation page (`/docs`)
- Dual-verify consensus mechanism (Opus + DeepSeek)
- Batch processing for parallel model dispatch

### Changed

- Migrated from Clerk to native Supabase Auth (email+password)
- All RLS policies rewritten with `auth.uid()` (UUID) instead of `auth.jwt() ->> 'sub'` (TEXT)
- Agent server auth middleware uses `supabaseAdmin.auth.getUser()` with 5-minute TTL cache
- User/org data columns reverted from TEXT to UUID with FK constraints to `auth.users(id)`
- Migrated Supabase backend from Lovable Cloud to self-hosted project
- Replaced OpenAI npm SDK with native `fetch` to OpenRouter REST API
- Docker multi-stage build for TypeScript compilation

### Fixed

- Race condition in AuthContext session initialization (subscribe before getSession)
- Non-transactional org creation with rollback on partial failure
- Missing `.catch()` on `getSession()` in AuthContext
- Org lookup queries silently discarding errors and defaulting role
- signOut errors swallowed silently
- Auth/SignUp pages missing try-catch for network errors
- Missing `DROP TRIGGER IF EXISTS` in migration SQL
- Missing `UPDATE` policy for `user_roles` table
- Infinite re-render loop in Chat page
- RLS security vulnerabilities from multiple PR reviews
- SQL injection prevention in analytics queries
- Org-scoped storage access controls

### Removed

- `@clerk/clerk-react` and `@clerk/express` dependencies
- Clerk webhook edge function (`supabase/functions/clerk-webhook/`)
- Organization creation edge function (replaced by client-side flow)
- `clerk_org_id` column from organizations table
- `openai` npm SDK dependency
- `grok` model alias
