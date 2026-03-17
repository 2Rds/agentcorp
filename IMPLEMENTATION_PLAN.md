# Implementation Plan

## Current Status

### Completed — v3.1.2 (2026-03-17)

**Model Stack Collapse (10 → 4 LLMs + 2 utilities)**
- [x] Removed 6 LLMs: Gemini 3 Pro, Sonar Deep, Command A, Granite 4.0, Grok Reasoning, Kimi K2.5/DeepSeek/Sonnet
- [x] GEMINI registry unified to `google/gemini-3-flash-preview` across all agents
- [x] Opus registry updated to non-dated `claude-opus-4-6` alias
- [x] All 12 agent stacks simplified to use only kept models
- [x] Board of Directors models updated (Grok→Fast, Granite→Gemini)
- [x] Compliance `scan_compliance`: Granite 8B → Opus (Anthropic direct)
- [x] Legal `analyze_contract`: Grok Reasoning → Opus (Anthropic direct)
- [x] CFO structured generation: Kimi K2.5 → Gemini Flash (`structured-builder.ts`)
- [x] Deleted: `kimi-builder.ts`, `moonshot-client.ts`, `dual-verify.ts`
- [x] Cleaned 7 dead aliases from CFO model-router, 1 from EA model-router
- [x] Pre-release model audit gate added to `/release` skill
- [x] Voice pipeline: added 30s timeout, fixed dated Opus ID

### Completed — v3.1.1 (2026-03-17)

**Sales Department Restructuring (Sam → Sales Manager + SDR Worker)**
- [x] Sam repositioned from CSA/SDR to Sales Manager — system prompt, tools, identity
- [x] SDR Worker module (`agents/sales/src/sdr/`) — internal agentic loop (Anthropic Messages API, 14 tools, 10 turns max)
- [x] `delegate_to_sdr` tool — Sam delegates structured tasks to SDR, gets results back
- [x] `review_team_performance` tool — Sam reads FeatureStore agent leaderboard
- [x] Tool redistribution: 5 Feature Store write + research tools moved from Sam to SDR
- [x] `SDR_CONFIG` + `SDR_STACK` + `SDR_SCOPE` in @waas/shared (junior tier, sales namespace)
- [x] Plugin split: manager gets strategic plugins, SDR gets prospecting plugins
- [x] EA + COA system prompts updated (stale "Chief Sales Agent" → "Sales Manager")
- [x] SdrWorker race condition fixed (init before runtime.start())
- [x] SDR memory silo fixed (searches shared sales namespace)
- [x] sonarQuery timeout added (30s AbortSignal)

### Completed — v3.1.0 (2026-03-17)

**Cohere embed-v4.0 1536-dim Migration**
- [x] All RediSearch indexes migrated from 768-dim to 1536-dim (idx:memories, idx:plugins, idx:documents, idx:llm_cache_v2, idx:prospect_features)
- [x] CFO agent `embed()` migrated from Cloudflare bge-base/Google to Cohere embed-v4.0 (1536-dim)
- [x] EA agent `embed()` migrated from Cloudflare bge-base/Google to Cohere embed-v4.0 (1536-dim)
- [x] CFO `memory-client.ts`, `redis-client.ts` EMBEDDING_DIM updated
- [x] EA `memory-client.ts`, `redis-client.ts` EMBEDDING_DIM updated
- [x] `@waas/runtime` modules (`redis-memory.ts`, `semantic-cache.ts`, `feature-store.ts`) updated

**Dark-Only UI + Design Cleanup**
- [x] Removed `next-themes` dependency, `ThemeProvider`, `ThemeToggle` component
- [x] Removed light-mode CSS variables (dark-only)
- [x] Removed unused CSS classes and Tailwind animations
- [x] Cleaned `AgentInfo` type (removed `color`/`colorClass`)

**Redis MCP Integration for Claude Code**
- [x] Custom Redis Memory MCP server at `~/.claude/mcp-servers/redis-memory/`
- [x] Claude Code auto-memory files (`memory/` directory) committed
- [x] `.claude/settings.local.json` updated with redis-memory tool permissions

**Critical Audit Fixes (3 issues from Opus 4.6 review)**
- [x] CRITICAL: EA agent 768→1536 dimension mismatch (would corrupt shared index)
- [x] CRITICAL: CFO embed() producing wrong dimension vectors for semantic cache + plugin loader
- [x] CRITICAL: DataRoom route accidentally removed during frontend merge
- [x] Parker/CCA name regression fixed
- [x] Version regression (3.0.1→2.1.0) fixed
- [x] Stale memory files updated (DO App ID, n8n IP, health check URLs)

### Completed — v3.0.1 (2026-03-16)

**Finance Workspace Migration**
- [x] Replaced `PlaceholderTab` stubs with real finance tab components (Overview, Financial Model, Investors, Knowledge Base)
- [x] `CapTableTab` — Dedicated cap table tab with summary stats, pie chart, DataTable, add/delete entry dialog
- [x] Realtime subscriptions for `financial_model`, `cap_table_entries`, `knowledge_base`, `documents` tables
- [x] UI overhaul — decluttered dashboard, muted colors, glass-card design system, framer-motion animations

### Completed — v3.0.0 (2026-03-15)

**Redis AI Infrastructure (3 new runtime modules)**
- [x] `SemanticCache` — LLM response caching via Redis vector search (Cohere embed-v4.0, 1536-dim HNSW COSINE, `idx:llm_cache_v2` index). Cross-agent sharing, 95% similarity threshold, configurable TTL. Promise lock on `ensureIndex()`.
- [x] `AgentMemoryServerClient` — HTTP client for Redis Agent Memory Server (two-tier: working memory + long-term semantic search). Implements `MemoryClient` interface. Health-check fallback to `RedisMemoryClient`.
- [x] `FeatureStore` — Sub-millisecond Redis HASH feature retrieval for Sales agent. 4 feature types × 4 RediSearch indexes (`idx:prospect_features`, `idx:industry_features`, `idx:agent_performance`, `idx:call_brief`). Per-method `orgId` override.
- [x] `AgentRuntime.start()` initializes all three modules during startup lifecycle

**Voice Pipeline Foundation**
- [x] `ElevenLabsClient` — WebSocket TTS/STT (Flash v2.5, u-law 8kHz passthrough)
- [x] `VoicePipeline` — NextGenSwitch ↔ ElevenLabs ↔ Claude bridge, Redis call state
- [x] `VoiceTransport` — WebSocket server + outbound REST API
- [x] All voice types exported from `@waas/runtime`

**Sales Agent Feature Store Integration**
- [x] 5 new MCP tools: `update_prospect_features`, `get_call_intelligence`, `get_hottest_prospects`, `update_industry_features`, `create_call_brief`
- [x] All tools pass `orgId` from closure for multi-tenant isolation
- [x] `runtime-ref.ts` pattern for lazy runtime access

**Redis Shared Infrastructure**
- [x] `createIndex()`, `vectorSearch()`, `escapeTag()`, `nowSecs()` exported from `redis-client.ts`
- [x] Chat route cache integration (check cache → Claude API → store response)
- [x] All new modules exported from `@waas/runtime` index

**9 Critical/High Review Fixes**
- [x] CRITICAL: FeatureStore `orgId=""` — per-method `orgId` parameter + `resolveOrgId()` helper
- [x] CRITICAL: `KEYS` command in `getCallBriefForProspect` — replaced with `FT.SEARCH` on `idx:call_brief`
- [x] CRITICAL: AMS `healthy:false` doesn't fallback — added `if (healthy)` condition
- [x] HIGH: `claude-opus-4-6` in `DEFAULT_SKIP_MODELS` — removed (was making cache dead code)
- [x] HIGH: Zero Sentry in catch blocks — added `Sentry.captureException()` to 19 catch blocks across AMS/SemanticCache/FeatureStore
- [x] HIGH: `ensureIndex` race condition — promise lock in SemanticCache + FeatureStore
- [x] HIGH: `hasMemory` stale in health route — changed to getter
- [x] HIGH: Embedding failures silently return null — added `console.warn`
- [x] HIGH: `setProspectFeatures` bare catch — added error logging

### Completed — v2.4.1 (2026-03-15)

(was previous: Completed — v2.4.0)

### Completed — v2.4.0 (2026-03-15)

**MessageBus Dual-Mode + Stream Operations**
- [x] MessageBus dual-mode persistence: Redis Streams (XADD/XRANGE/MAXLEN) with automatic LIST fallback
- [x] `StreamEntry` type exported from `@waas/shared/namespace`
- [x] `ScopedRedisClient` stream operations (`xadd`, `xrange`, `xlen`, `xtrim`) with namespace enforcement
- [x] Agent-runtime stream adapters (maps `redis` npm PascalCase to `@waas/shared` lowercase)
- [x] MessageBus safe JSON parsing (`safeParseMessage`, `safeParseMessages`)
- [x] MessageBus persistence mode logging on first message

**Governance + Reliability**
- [x] GovernanceEngine in-memory spend fallback when Redis unavailable
- [x] Governance callback handler calls `next()` for non-governance callbacks
- [x] Spend limits tightened: $10→$5/agent/day, $100→$50 global/day
- [x] Chat route token estimation: 3x multiplier on input only (output at face value)

**EA Agent Org-Scoping**
- [x] `BLOCKDRIVE_ORG_ID` config added to EA agent
- [x] Slack transport uses real org UUID (was hardcoded `"slack-workspace"`)
- [x] Telegram transport uses real org UUID (was hardcoded `"telegram-direct"`)
- [x] `BLOCKDRIVE_ORG_ID` env var set in DO App Platform

**Inter-Agent Messaging**
- [x] `message_agent` tool added to CMA, Compliance, Legal, Sales agents via MessageBus
- [x] COA `message_agent` Supabase fallback removed (MessageBus-only)

**25-Issue Code Review Fixes**
- [x] Telemetry Worker fail-closed auth (was accepting unauthenticated requests when API key unset)
- [x] Telemetry Worker split error responses: JSON parse → 400, write → 500
- [x] RedisMemoryClient circuit breaker: `ensureIndex()` stops after 3 failures
- [x] Zero-vector embedding guard: skip embedding on failure, return NOOP event
- [x] `updateMemory` keeps existing embedding on re-embed failure
- [x] `hashToMemory` empty catch → `console.warn` with key
- [x] `RedisMemoryClient` declares `implements MemoryClient`
- [x] Supabase audit log INSERT checks `{ error }` field
- [x] Webhook handler includes `fetchErr` in logs, warns when `AGENT_BASE_URL` not configured
- [x] Track-view Worker type-safe input validation
- [x] Sales `prep_call` bare catch → error logging
- [x] DataRoom auth credentials moved from GET query params to POST body + headers
- [x] `useModelSheet` uses `useAuth()` context instead of `supabase.auth.getSession()`

### Completed — v2.3.1 (2026-03-15)

**PR Review Fixes (21 issues)**
- [x] Fixed broken imports in KnowledgeGraph.tsx and KnowledgeDocuments.tsx
- [x] Fixed `enable_data_room` silently dropped in useInvestorLinks mutation
- [x] Replaced `Math.random()` with `crypto.getRandomValues()` for slug generation
- [x] Added missing `workforce-compliance` to WORKFORCE_CHANNELS
- [x] Added Slack thread history cap (MAX_THREADS=500 with FIFO eviction)
- [x] sendSlackMessage/readSlackChannel now throw when bot not initialized
- [x] DM channel detection via `/^D[A-Z0-9]+$/` regex
- [x] useInvestorLinks realtime uses unique channel ID (HMR-safe)
- [x] KnowledgeBaseTab error handling for fetch and upload
- [x] DataRoom input validation (agentUrl/slug early check)
- [x] CapTableTab renamed to FinancialOverviewTab

**Pure Function Extraction + Test Coverage**
- [x] `channel-config.ts` extracted from `slack.ts` (zero runtime deps)
- [x] `computeDerivedMetrics()` extracted from `useFinancialModel` hook
- [x] `computeCapTableSummary()` extracted from `useCapTable` hook
- [x] `computeLinkAnalytics()` + `generateSlug()` extracted from `useInvestorLinks` hook
- [x] 59 unit tests across 4 test files (all passing)

**Infrastructure Consolidation (NYC3 → NYC1)**
- [x] Redis droplet migrated to NYC1 (`waas-redis-nyc1`, 159.223.179.119, NVMe SSD)
- [x] n8n droplet migrated to NYC1 (`n8n-nyc1`, 134.209.67.70, Docker + Caddy)
- [x] Old NYC3 Redis and n8n droplets deleted
- [x] DNS updated via Cloudflare API (`n8n.blockdrive.co` → NYC1 IP)

### Completed — v2.3.0 (2026-03-14)

**DO App Platform Migration (ATL → NYC3)**
- [x] All 7 agent services migrated to NYC3 region (co-located with Redis + n8n)
- [x] EA + Sales on dedicated instances ($29/mo), other 5 on shared ($12/mo) — total $118/mo (was $203/mo)
- [x] Sales agent auto-scales 1→3 instances at 75% CPU
- [x] Google Sheets `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` env var support for cloud platforms
- [x] PostHog proxy rewrite (`/ingest/*`) in Vercel config for ad-blocker bypass
- [x] Vercel `VITE_AGENT_URL` updated to NYC3 app URL

**Governance Engine Hardening (21-issue PR review)**
- [x] `isPendingApproval()` runtime type guard for Redis deserialization
- [x] `validateGovernanceConfig()` fail-fast startup validation
- [x] `AGENT_REGISTRY` typed with `satisfies Record<AgentId, AgentConfig>`
- [x] `requireApproval` keyed on `ApprovalCategory` (no manual switch)
- [x] `GovernanceDecision` refactored to discriminated union
- [x] Redis TOCTOU race fixed with Lua atomic check-and-set in `resolveApproval`
- [x] Silent failures replaced with logging + Sentry alerts across governance engine
- [x] Spend recording made fire-and-forget (no event loop blocking after response)
- [x] Webhook handler: timing-safe auth, `WEBHOOK_SECRET` env var, non-2xx logging, error details
- [x] Database webhook migration: `app.webhook_secret` with service role key fallback
- [x] HMR-safe channel IDs in `useRealtimeSubscription`

**Build Fixes**
- [x] EA `package-lock.json` synced (was missing @sentry/node, posthog-node)
- [x] EA `observability.ts` inlined (standalone Docker build can't access @waas/runtime)

### Completed — v2.2.0 (2026-03-14)

**Governance System (C-Suite Telegram Approval Flow)**
- [x] Governance types in `@waas/shared/governance`: `GovernanceConfig`, `ApprovalCategory`, `PendingApproval`, `GovernanceDecision`, `SpendEvent`, `BLOCKDRIVE_GOVERNANCE` defaults
- [x] GovernanceEngine in `@waas/runtime`: daily spend tracking (Redis), pending approval management (Telegram inline keyboards), authorized approver enforcement
- [x] Spend tracking in chat routes: estimated token costs recorded to Redis via GovernanceEngine after every agent query
- [x] Agent usage events bridge: `agent_usage_events` table now receives writes from chat routes (was Redis-only); Operations workspace AgentUsageTab shows real cost/latency data
- [x] Governance directives added to all 7 agent system prompts (approval gates for external comms, marketing, social media, financial commitments)
- [x] CCO renamed to Parker (CCA), naming standardization: CFA, CCA, CMA, COA, CSA, CLA

**Supabase Realtime (Live Frontend Updates)**
- [x] `useRealtimeSubscription` hook with unique channel IDs, `.subscribe()` status callbacks, race-condition-closing refetch on SUBSCRIBED
- [x] 17 department tables added to `supabase_realtime` publication (idempotent DO blocks)
- [x] All 7 workspace pages + Dashboard subscribe to their department tables, auto-invalidating TanStack Query cache on changes

**Supabase Vault + Database Webhooks**
- [x] pgsodium + pg_net extensions enabled
- [x] `webhook-handler` Edge Function with exact Bearer token auth, Content-Type validation, reduced log verbosity
- [x] INSERT triggers on `ea_tasks`, `agent_messages`, `compliance_governance_log` with `REVOKE EXECUTE FROM PUBLIC` and `BEGIN..EXCEPTION` handler
- [x] Webhook trigger functions are idempotent (DROP TRIGGER IF EXISTS before CREATE)

**Housekeeping**
- [x] GitHub repo references updated to `2Rds/agentcorp`
- [x] Frontend URL renamed from `cfo.blockdrive.co` to `corp.blockdrive.co`

### Completed — v2.1.0 (2026-03-14)

**Full-Stack Observability (Sentry + PostHog)**
- [x] Frontend: `@sentry/react` with ErrorBoundary, BrowserTracing, Replay (on error), source map upload via `@sentry/vite-plugin`
- [x] Frontend: `posthog-js` with autocapture, SPA page views, user identify/reset on auth
- [x] CFO Agent: `@sentry/node` + `posthog-node` with Express error handler, shutdown flush
- [x] EA Agent: Self-contained observability (standalone Docker build, no `@waas/runtime` access)
- [x] @waas/runtime: Shared `initSentry(agentId)` + `initPostHog()` + `shutdownObservability()` — covers COA, CMA, Compliance, Legal, Sales
- [x] All agent servers: `uncaughtException` → Sentry flush + `process.exit(1)`
- [x] All SDK init calls wrapped in try-catch (non-fatal on failure)
- [x] Conditional source maps (only when `SENTRY_AUTH_TOKEN` set)
- [x] PostHog `.capture()` wrapped in try-catch across all chat routes
- [x] 3 custom PostHog events: `agent_chat_sent`, `workspace_viewed`, `agent_health_checked`
- [x] Zero-config: safe no-op when env vars unset

**Hardening (4-agent Opus code review)**
- [x] Sentry Express error handler ordering (after routes, before 404)
- [x] `PermissionMode` type imported from SDK (removed unsafe `as` cast)
- [x] Fixed `catch (err: any)` typing across chat routes
- [x] Real `FallbackErrorBoundary` class component in App.tsx
- [x] Removed `persistence: 'localStorage'` from PostHog config
- [x] Observability init moved to constructor (before async start)

### Completed — v2.0.0 (2026-03-14)

**AgentCorp Frontend Migration**
- [x] 7 department workspaces (EA, Finance, Operations, Marketing, Compliance, Legal, Sales)
- [x] `DepartmentWorkspace` reusable component with agent chat, task panels, department metrics
- [x] `AgentChat` streaming SSE with Markdown, conversation persistence, per-agent URL routing
- [x] `AppLayout` sidebar navigation + `ProtectedRoute` wrapping
- [x] `useAgentHealth` hook for real-time agent status monitoring
- [x] Dashboard with agent health grid and department activity

**PR Review Fixes (15 issues)**
- [x] AuthContext race condition (onAuthStateChange exclusively, no getSession())
- [x] AgentChat stale closure (messagesRef)
- [x] Supabase `{ error }` checks across 25 query sites
- [x] Missing VITE_AGENT_URL guard, aria-labels, dark:prose-invert, password minLength 8
- [x] Excluded `_finance-archive` from vitest

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
- [x] `@waas/runtime` — AgentRuntime (Express), auth middleware, chat/health routes, Telegram transport, Redis memory clients

**EA Agent "Alex" (2026-03-05 → 2026-03-09)**
- [x] Scaffolded at `agents/ea/` (28 source files)
- [x] Anthropic Messages API with agentic tool loop (15 turns max)
- [x] 7 native tools: knowledge search/save, tasks, meeting notes, email drafts, web search
- [x] Cross-namespace memory read access (executive tier)
- [x] System prompt with autonomous ops + escalation rules
- [x] Telegram bot transport (@alex_executive_assistant_bot)
- [x] Enrichment pipeline: EA memories + cross-dept + session + skills (parallel)
- [x] Database: `ea_tasks`, `ea_meeting_notes`, `ea_communications_log` tables
- [x] Deployed to DigitalOcean App Platform (port 3002, `/ea` ingress)

**Auth Migration (v1.0.0)**
- [x] Clerk → native Supabase Auth (UUID RLS, token cache, race condition fixes)

### Completed — Infrastructure (2026-03-04 → 2026-03-09)

- [x] DigitalOcean App Platform for agent deployment (auto-deploy from GitHub)
- [x] n8n automation hub on DO droplet NYC1 (134.209.67.70, `n8n.blockdrive.co`)
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
- **Redis dependency** — Knowledge base entirely Redis-dependent
- **EA tool set is growing** — Has knowledge, tasks, meeting notes, email drafts, web search, and Notion, but no calendar integration or actual email sending yet
- **Inter-agent messaging** — MessageBus supports dual-mode persistence (Redis Streams + LIST fallback) and all 6 department agents have `message_agent` tool, but MessageBus is not yet instantiated in AgentRuntime (`bus.send()` delivery not wired)
- **Governance approval flow untested end-to-end** — GovernanceEngine built and hardened, but agent webhook routes (`/webhook`) not yet implemented
- **Database webhooks require deployed Edge Function** — `webhook-handler` exists but needs `supabase functions deploy` and `AGENT_BASE_URL` env var
- **Realtime requires migration push** — `supabase_realtime` publication changes need `supabase db push` on the hosted project
- **Voice pipeline not yet deployed** — ElevenLabs client, VoicePipeline, and VoiceTransport are built but require NextGenSwitch infrastructure (Phase 3) and env vars (`ELEVENLABS_API_KEY`, `NEXTGENSWITCH_URL`) to activate
- **Feature Store indexes not yet created in production** — Indexes auto-create on first use, but production Redis needs sufficient memory for 4 new indexes
- **Agent Memory Server not deployed** — AMS Docker container needs deployment to Redis droplet; runtime falls back to RedisMemoryClient until deployed

## Technical Debt

- Supabase types file (`types.ts`) may be stale — needs `supabase gen types` refresh
- `investor-readonly.ts` tool file exists but isn't imported in the tool index
- Edge function `chat/` uses OpenAI API format, not Claude SDK
- `dataroom_interactions` table referenced in code but not in migration SQL
- Limited automated tests — 59 frontend/EA unit tests added in v2.3.1, but no agent server integration tests
- CFO agent still uses Claude Agent SDK; EA uses Anthropic Messages API directly — should standardize
- `@waas/runtime` exists but EA agent was built with direct Express setup (not using runtime package yet)
- Department agent tools have no automated tests (manual testing only)
- `runtime-ref.ts` files in all 5 department agents use module-level mutable state — works but less clean than dependency injection
- SemanticCache and FeatureStore share embedding logic but don't share a common embedding abstraction
- Voice pipeline modules are built but have no integration tests (require live NextGenSwitch + ElevenLabs)

## Roadmap

### Near-term

- [x] ~~Deploy 5 department agents to DigitalOcean App Platform~~ (v2.3.0)
- [x] ~~Set up DO env vars for PostHog + Sentry + Governance on all agent services~~ (v2.3.0)
- [x] ~~Set up Vercel env vars for PostHog + Sentry~~ (v2.1.0)
- [ ] Push Supabase migrations (Realtime publication, Vault, Database Webhooks)
- [ ] Deploy `webhook-handler` Edge Function (`supabase functions deploy`)
- [ ] Add `/webhook` route to agent servers (receive Database Webhook events)
- [x] ~~Self-hosted Redis 8.4 on DO droplet NYC1~~ (v2.3.1)
- [x] ~~MessageBus dual-mode persistence (Redis Streams + LIST fallback)~~ (v2.4.0)
- [x] ~~`message_agent` tool added to all 6 department agents via MessageBus~~ (v2.4.0)
- [x] ~~Slack integration for EA (channel monitoring, message sending)~~ (v2.3.1)
- [x] ~~SemanticCache + AgentMemoryServerClient + FeatureStore~~ (v3.0.0)
- [x] ~~Voice pipeline foundation (ElevenLabs + VoicePipeline + VoiceTransport)~~ (v3.0.0)
- [x] ~~Sales Feature Store tools (5 MCP tools)~~ (v3.0.0)
- [ ] Deploy Agent Memory Server to Redis droplet (Docker container)
- [ ] Wire MessageBus into AgentRuntime (Phase 2)
- [ ] Add `/webhook` routes to EA + COA + Compliance agents
- [ ] Add `message_agent` tool to EA agent (executive-tier cross-namespace messaging)
- [ ] Wire EA into @waas/runtime (replace direct Express setup)
- [ ] Agent server test suite (Vitest + supertest)
- [ ] Password reset flow + email verification enforcement
- [ ] Supabase type regeneration

### Medium-term

- [ ] NextGenSwitch PBX deployment (DO NYC1 droplet) — SIP trunk, AI assistants, campaigns
- [ ] Wire voice pipeline end-to-end (NextGenSwitch → VoiceTransport → ElevenLabs → Claude → TTS → caller)
- [ ] Sales voice tools (`make_call`, `get_call_transcript`, `update_pipeline_from_call`)
- [ ] IR agent (Riley) — investor relations, dual-mode (cognitive + voice)
- [ ] Redis FT.HYBRID search for enrichment pipeline
- [ ] n8n workflows (agent health monitoring, waitlist processing, call result processing)
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
