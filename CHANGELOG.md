# Changelog

All notable changes to the WaaS platform.

## [v3.3.1] - 2026-03-20

Post-release fixes: ElevenLabs voice proxy, embedding task types, voice architecture documentation.

### Added
- OpenAI-compatible streaming proxy for ElevenLabs custom_llm integration (`agents/sales/src/voice/llm-proxy.ts`)
  - Translates OpenAI ↔ Anthropic Messages API with word buffering for TTS latency
  - Routes through CF AI Gateway, shared secret auth, max token clamp, voiceEnabled gate
  - `publicRoutes` config in `@waas/runtime` for unauthenticated voice endpoints
- Voice architecture v4.0 design document (`docs/waas/voice-architecture-v4.md`, 729 lines)

### Fixed
- Embedding task types: all storage paths now use `RETRIEVAL_DOCUMENT`, search paths use `RETRIEVAL_QUERY`
  - Fixed 13 total call sites across CFO, EA, runtime, semantic cache, memory clients, document indexer, build-registry scripts, feature store, Redis MCP server
- LLM proxy security hardening: shared secret auth, 4096 token clamp, generic error messages, per-request response IDs, voiceEnabled gate

## [v3.3.0] - 2026-03-20

Platform Migration v4.0 — CF AI Gateway BYOK, Gemini Stack Collapse, OpenRouter removal.

### Added
- Cloudflare AI Gateway BYOK routing for all 7 agents + SDR (gateway: `blockdrive-gateway`)
- Per-provider direct routing: Anthropic, Google AI Studio, xAI, Cohere via CF AI Gateway
- `cf-aig-metadata` headers with agentId on all model requests for per-agent cost tracking
- `cf-aig-max-attempts`, `cf-aig-backoff`, `cf-aig-retry-delay` headers for automatic retries
- `cf-aig-cache-ttl` / `cf-aig-skip-cache` headers for gateway-level caching
- Gemini Search Grounding replaces Perplexity Sonar Pro in all 7 agents + SDR (`google_search` tool)
- Gemini Embedding 2 (`gemini-embedding-001`, 1536-dim) replaces Cohere embed-v4.0 in all 5 embed implementations
- `webSearch()` function in CFO and EA model-routers with structured citation parsing from `groundingMetadata`
- `getGeminiAI()` lazy singleton with CF AI Gateway routing in all agents (CFO, EA, 5 dept agents, SDR)
- Re-index script (`scripts/reindex-gemini-embeddings.ts`) for migrating Redis vectors to Gemini embeddings
- `taskType` parameter on all `embed()` functions (`RETRIEVAL_QUERY` for search, `RETRIEVAL_DOCUMENT` for storage)
- `_resetGeminiAI()` test helper in CFO model-router
- `@google/genai` SDK (`gemini-client.ts`) with working File API upload, vision, document queries
- Provider Keys mode: `CF_AIG_TOKEN` enables gateway key injection at edge (no provider API keys needed in .env)

### Changed
- All Gemini calls route through `@google/genai` SDK (replaces deprecated `@google/generative-ai`)
- All Anthropic calls route through CF AI Gateway endpoint (runtime + EA + dept agents)
- CFO model-router: per-provider `chatCompletionGemini()` and `chatCompletionGrok()` functions replace single `chatCompletionOpenRouter()`
- EA model-router: Gemini chatCompletion routes through SDK, unknown models throw instead of OpenRouter fallback
- Dept agent web search tools: lazy singleton, try/catch, 30s timeout, CF AIG routing, Provider Keys fallback
- `@waas/shared` MODEL_REGISTRY: native provider model IDs (not OpenRouter format), `GEMINI_EMBED` replaces `COHERE_EMBED`
- `@waas/shared` ModelRouter.embed(): uses Gemini Embedding 2 with taskType + timeout
- All stacks updated: SONAR removed, COHERE_EMBED → GEMINI_EMBED
- Board quorum reduced to 3 members / 2 quorum (Sonar removed)

### Removed
- **OpenRouter** — all active runtime references removed. `openRouterApiKey` deprecated in configs.
- **Perplexity Sonar Pro** — replaced by Gemini Search Grounding. `PerplexityClient` deprecated in `@waas/shared`.
- **Cohere embed-v4.0** — replaced by Gemini Embedding 2. `COHERE_EMBED` alias removed. Cohere rerank-v4.0 stays.
- `OPENROUTER_API_KEY` no longer required in any .env file
- `PERPLEXITY_API_KEY` removed from all agent configs
- `chatCompletionOpenRouter()`, `getOpenRouterBaseURL()`, `getOpenRouterHeaders()` from CFO + EA model-routers

### Fixed
- CFO `memory-client.ts` was still using Cohere embeddings (vector incompatibility with shared idx:memories)
- EA `GoogleGenAI` was bypassing CF AI Gateway (no observability/cost tracking)
- EA Anthropic SDK crashed with empty API key in Provider Keys mode
- `xaiApiKey` was `required()` causing startup crash without `XAI_API_KEY` env var
- `embed()` functions missing 30s timeout (hung on Gemini API issues)
- `cf-aig-metadata` used CF account ID as `orgId` (semantically wrong)
- CMA Grok auth guard allowed unauthenticated requests when gateway not configured
- Dead-code OpenRouter fallback paths in `gemini-client.ts`
- Wrong feature gate in `document-rag.ts` (checked `openRouterApiKey` instead of `googleAiApiKey`)
- File API upload not polling for PROCESSING state completion
- Re-index script: wrong key prefix comment, missing idx:documents, fragile indexOf pattern

### Documentation
- CLAUDE.md: model stack, env vars, tool descriptions updated for CF AI Gateway + Gemini
- ARCHITECTURE.md: provider routing, model assignments, env vars updated
- SECURITY.md: API key table updated (OpenRouter/Perplexity → Google AI/xAI)
- README.md: env var examples updated
- memory/: glossary, deployment, company, people files updated
- .claude/commands/release.md: model audit table updated
- Strategy doc: `docs/waas/platform-migration-v4.md` — full migration plan with voice architecture, NextGenSwitch audit, CF Zero Trust

## [v3.2.0] - 2026-03-17

Voice pipeline wiring, SemanticCache upgrades (exact-match fast-path + adaptive TTL), and cache extension to EA/SDR/CFO agents. 5 concurrent voice sales agents now operational within Sam's unified server.

### Added

- **Voice pipeline wired into AgentRuntime** — `voice?` config block in `AgentRuntimeConfig`, dynamic ElevenLabs + VoiceTransport initialization in `start()`, `voiceTransport` public getter, graceful shutdown
- **VoicePipeline agentic tool loop** — Max 2 tool turns per utterance during live calls. Claude processes caller speech, optionally calls read-only tools (Feature Store, memory, pipeline), then speaks response via TTS. Falls back to simple no-tool path when tools not configured.
- **Per-call context injection** — `customParams` from NextGenSwitch start event (prospect name, company, call purpose) injected into per-call system prompt as `## Call Context` section
- **Voice system prompt** (`agents/sales/src/voice/system-prompt.ts`) — BANT qualification flow, objection handling scripts, 2-3 sentence max responses, spoken cadence optimization
- **3 read-only voice tools** (`agents/sales/src/voice/tools.ts`) — `get_prospect_intelligence` (Feature Store), `search_knowledge` (memory), `check_pipeline` (Supabase) — all org-scoped
- **SemanticCache exact-match fast-path** — SHA-256 hash of `orgId + agentId + prompt + model` for O(1) Redis GET before vector search. Eliminates embedding cost on identical repeated prompts.
- **SemanticCache adaptive TTL** — Cache hits extend TTL by 50% (capped at 2x original). Frequently-accessed entries live longer.
- **EA agent semantic cache** (`agents/ea/src/lib/semantic-cache.ts`) — Standalone cache (no @waas/runtime import) wired into EA chat route. Skips multi-turn conversations. Uses shared `idx:llm_cache_v2` index.
- **SDR Sonar research caching** — `sonarQuery()` checks SemanticCache before Sonar API call (0.95 threshold, 1hr TTL). Fire-and-forget writes.
- **CFO structured generation caching** — `extractStructured()` wrapped with `withCache()` for repeated financial model/SQL patterns
- **Voice fallback speech on error** — Caller hears "I apologize, having a technical issue" instead of dead air on any pipeline error
- **Sentry on voice errors** — WebSocket errors, TTS failures, call state persistence, voice transport init all report to Sentry

### Changed

- **`make_call` tool** — Replaced unsafe `(runtime as unknown as { voiceTransport? })` cast with clean `runtime.voiceTransport` getter
- **`callClaudeWithTools` max_tokens** — Increased from 300 to 1024 (tool_use blocks need more room than plain text)
- **`voiceEnabled` guard** — Now checks `ELEVENLABS_VOICE_ID` in addition to API key and NextGenSwitch URL
- **Voice cache scoping** — Cache only checked on simple (no-tools) path. Tool-dependent responses skip cache (depend on real-time data).
- **All `.catch(() => {})` replaced** — Voice pipeline, SDR, EA cache writes now log warnings instead of silently swallowing errors
- **CFO cache migrated to v2** — Index `idx:llm_cache` → `idx:llm_cache_v2`, prefix `cache:` → `llmcache:`, `ttl` field → `expires_at` for cross-agent compatibility

### Fixed

- **CFO cache score default** — Changed `parseFloat(fields.score ?? "0")` to `?? "1"` (was producing false cache hits with similarity 1.0)
- **CFO cache RETURN clause** — Added `expires_at` to FT.SEARCH RETURN (was missing, making TTL check dead code)
- **Voice tools org_id filter** — Added `.eq("org_id", orgId)` to `check_pipeline` query (was leaking cross-tenant data)
- **Exact-match cache key scoping** — Added `orgId + agentId` to SHA-256 hash (was allowing cross-tenant cache poisoning)
- **Voice agentic loop stop condition** — Changed `stop_reason === "end_turn"` to `stop_reason !== "tool_use"` (was dropping tool calls)
- **Dead `sttModel` config field** — Removed from `AgentRuntimeConfig.voice` (accepted but never forwarded)
- **`onCallComplete` typed as `any`** — Changed to `CallResult` import type

## [v3.1.2] - 2026-03-17

Model stack collapse: 10 models → 4 LLMs + 2 utilities. Role-based routing replaces uniform orchestration. Pre-release model audit gate added to `/release` skill.

### Changed

- **Model stack collapsed** — Removed 6 LLMs (Gemini 3 Pro, Sonar Deep Research, Command A, Granite 4.0, Grok Fast Reasoning, Kimi K2.5, DeepSeek V3.2, Sonnet 4.6). Kept: Opus 4.6 (reasoning), Gemini 3 Flash (vision/orchestration), Grok 4.1 Fast (X-Twitter/classification), Sonar Pro (web search), Cohere Embed + Rerank (utilities).
- **GEMINI registry updated** — `google/gemini-3.1-pro` → `google/gemini-3-flash-preview` across shared registry, CFO agent, and EA agent. All three locations now consistent.
- **Opus registry updated** — Dated snapshot `claude-opus-4-6-20250929` → `claude-opus-4-6` (auto-updating alias).
- **All 12 agent stacks simplified** — Each stack uses only kept models. COA, CFA, Compliance, Legal stacks reduced to Opus + Gemini.
- **Board of Directors models** — Grok member changed from Reasoning to Fast; governance advisor changed from Granite to Gemini.
- **Compliance `scan_compliance`** — Replaced Granite 4.0 8B (OpenRouter) with Opus (Anthropic direct). Customer-facing regulatory analysis now uses the best reasoning model.
- **Legal `analyze_contract`** — Replaced Grok Reasoning (OpenRouter) with Opus (Anthropic direct). Customer-facing contract analysis now uses the best reasoning model.
- **CFO `extractStructured()` and `batchProcess()`** — Default model changed from Kimi K2.5 to Gemini 3 Flash.
- **CFO document vision** — `parseDocumentWithVision` changed from Gemini Pro to Gemini Flash (both have multimodal).
- **CFO knowledge extraction** — Changed from Kimi K2.5 to Gemini 3 Flash.
- **CFO semantic cache** — `CACHEABLE_MODELS` updated to only contain Gemini Flash and Grok Fast.
- **Pre-release model audit** — Added Step 4 to `/release` skill: automated audit of all model calls against approved stack before every release.

### Added

- **`grok-fast` alias** in CFO model-router — Routes to `x-ai/grok-4-1-fast-non-reasoning`.
- **`AbortSignal.timeout(30s)`** on voice pipeline Anthropic API call — Prevents indefinite hangs during live calls.

### Removed

- **`kimi-builder.ts`** → Renamed to `structured-builder.ts`. All Kimi K2.5 references replaced with Gemini 3 Flash.
- **`moonshot-client.ts`** — Deleted. Dead Moonshot/Kimi direct API client.
- **`dual-verify.ts`** — Deleted. Dead Opus + DeepSeek dual-verification module.
- **7 dead model aliases** from CFO model-router: `kimi`, `gemini-pro`, `gemini-lite`, `deepseek`, `deepseek-speciale`, `granite`, `sonnet`.
- **`granite` alias** from EA model-router.
- **`MOONSHOT_API_KEY`** and `useKimi` config removed from CFO agent.
- **4 model definitions** removed from `@waas/shared` registry: SONAR_DEEP, COMMAND_A, GRANITE, GROK_FAST_REASONING.

## [v3.1.1] - 2026-03-17

Sales department restructuring: Sam repositioned from confused CSA/SDR/Head-of-Sales to Sales Manager. New internal SDR Worker (agentic loop) handles prospect research, Feature Store writes, CRM ops, and call briefs. Sean is Head of Sales.

### Added

- **SDR Worker module** (`agents/sales/src/sdr/`) — Internal agentic loop using Anthropic Messages API (EA bridge pattern). 14 tools: 3 Feature Store writes, 2 reads, 3 research (Sonar Pro), 3 CRM, 2 knowledge, 1 messaging. Max 10 tool turns per task. Invoked by Sam via `delegate_to_sdr` tool.
- **SDR system prompt** (`agents/sales/src/sdr/system-prompt.ts`) — Methodical, research-obsessed SDR persona reporting to Sam. Enforces closed_won/closed_lost escalation to Sam.
- **`delegate_to_sdr` tool** — Sam delegates structured tasks (research_prospect, prepare_brief, draft_outreach, process_post_call, update_pipeline, general) to internal SDR worker, gets results back as tool response.
- **`review_team_performance` tool** — Sam reads AgentPerformanceFeatures from Feature Store leaderboard.
- **`SDR_CONFIG`** in `@waas/shared` — Agent ID `blockdrive-sdr`, junior tier, reports to `blockdrive-sales`, sales namespace.
- **`SDR_STACK`** — Opus + Sonar Pro + Gemini 3 Flash Preview + Cohere (embed + rerank).
- **`SDR_SCOPE`** — readwrite `blockdrive:sales:sdr:*`, read parent `blockdrive:sales:*` + global, canMessage Sam only.
- **`BLOCKDRIVE_ORG_ID`** env var for sales agent config.

### Changed

- **Sam → Sales Manager** — Title, system prompt, and tool set restructured. Sam now focuses on pipeline oversight, deal governance, team orchestration, strategic calls, and SDR delegation.
- **Tool redistribution** — 5 tools moved from Sam to SDR (compute_prospect_features, compute_industry_features, prepare_call_brief, research_prospect, draft_email). Sam keeps 16 tools + 2 conditional Notion.
- **`SALES_STACK` → `SALES_MANAGER_STACK`** — Renamed with backwards-compatible alias.
- **Plugin split** — Sam gets strategic plugins (sales, enterprise-search, product-management). SDR gets prospecting plugins (apollo, common-room, marketing).
- **`SALES_SCOPE.canMessage`** — Added `blockdrive-sdr` for scope validation.
- **EA/COA system prompts** — Updated Sam's title from "Chief Sales Agent" to "Sales Manager".
- **EA tools map** — Updated `blockdrive-sales` label from "Chief Sales Agent" to "Sales Manager".
- **Frontend** — Sam's title updated to "Sales Manager" with manager-oriented description and suggested prompts.

### Fixed

- **SdrWorker race condition** — Worker initialized before `runtime.start()` (constructor only needs orgId + API key; tools access runtime lazily).
- **Missing barrel exports** — SDR_CONFIG, SALES_MANAGER_STACK, SDR_STACK, SDR_SCOPE added to shared package index files.
- **SDR memory silo** — SDR search_knowledge queries shared `blockdrive-sales` namespace (not isolated `blockdrive-sdr`).
- **sonarQuery timeout** — Added `AbortSignal.timeout(30_000)` to prevent indefinite hangs.
- **message_agent SDR reference** — Updated description to direct SDR tasks to `delegate_to_sdr` tool.

## [v3.1.0] - 2026-03-17

Cohere embed-v4.0 1536-dim migration across all agents and indexes, dark-only UI with design system cleanup, Redis MCP integration for Claude Code persistent memory, and critical audit fixes.

### Changed

- **Vector dimensions 768→1536** — All RediSearch indexes (`idx:memories`, `idx:plugins`, `idx:documents`, `idx:llm_cache_v2`, `idx:prospect_features`) migrated to 1536-dim for Cohere embed-v4.0. Affects CFO agent (`memory-client.ts`, `redis-client.ts`), EA agent (`memory-client.ts`, `redis-client.ts`), and `@waas/runtime` (`redis-memory.ts`, `semantic-cache.ts`, `feature-store.ts`)
- **CFO `embed()` migrated to Cohere** — `model-router.ts` embed function replaced Cloudflare bge-base-en-v1.5 (768-dim) + Google text-embedding-004 fallback with Cohere embed-v4.0 (1536-dim) direct call. Affects semantic cache and plugin loader consumers
- **EA `embed()` migrated to Cohere** — Same migration in EA's `model-router.ts`, replacing Cloudflare + Google with Cohere embed-v4.0
- **Dark-only UI** — Removed `next-themes` dependency, `ThemeProvider`, `ThemeToggle` component, and light-mode CSS variables. Hardcoded `theme="dark"` on Sonner toaster. Kept only dark theme CSS custom properties
- **Agent registry cleanup** — Removed `color`/`colorClass` fields from `AgentInfo` type (all consumers use `getDeptTheme()` instead). Updated agent titles: Legal → "Legal Counsel", Sales → "Head of Sales"
- **Design system cleanup** — Removed unused CSS classes (`glass`, `glass-intense`, `hover-lift`, `glow-halo`, `text-gradient-subtle`) and unused Tailwind animations (`pulse-subtle`, `fade-in-up`, `slide-in-left`, `reveal`, `spin-slow`, `glow-pulse`, `float`)
- **Redis IP updated** — CLAUDE.md deployment table updated to new NVMe droplet (159.223.179.119, Redis 8.6.1 + RediSearch + RedisJSON)

### Fixed

- **EA agent 768→1536 vector mismatch** (CRITICAL) — EA agent was missed in dimension migration; would have corrupted shared `idx:memories` index when writing 768-dim vectors into 1536-dim schema
- **CFO embed() dimension mismatch** (CRITICAL) — `model-router.ts` embed function produced 768-dim vectors while all CFO indexes expected 1536-dim, breaking semantic cache and plugin loader
- **DataRoom route removed** (CRITICAL) — `/dataroom/:slug` public route was accidentally dropped during frontend merge while `LinkCard` and `LinkDetailPanel` still generate URLs to it. Restored as public route
- **Parker/CCA name regression** — Frontend `agents.ts` reverted compliance agent name from "Parker" to "CCO" (stale clone data). Fixed back to "Parker" / "Chief Compliance Agent"
- **Version regression** — `package.json` version regressed from 3.0.1 to 2.1.0 during frontend merge. Fixed
- **Stale memory files** — Updated old DO App ID, old n8n IP, and old health check URLs in `memory/` directory files
- **Stale JSDoc comments** — `semantic-cache.ts` file-level comments still referenced 768-dim; updated to 1536-dim

### Added

- **Claude Code auto-memory files** — `memory/` directory with people profiles, project context, decisions log, glossary, and deployment context for persistent cross-session knowledge
- **Redis MCP tool permissions** — `.claude/settings.local.json` updated with `redis-memory` MCP server tool allow entries
- **.gitignore exclusions** — Added `agent/output/`, `agent/service-account.json`, `supabase/.temp/`
- **Vercel build fix** — `.npmrc` with `legacy-peer-deps=true` for dependency resolution

## [v3.0.1] - 2026-03-16

Finance workspace migration + UI overhaul. Replaced placeholder tabs with real implementations, added dedicated Cap Table tab with full CRUD, wired Realtime subscriptions for live data updates.

### Added

- **CapTableTab** (`src/components/finance/CapTableTab.tsx`) — Dedicated cap table tab with summary stats (stakeholders, total shares, total investment, type breakdown), ownership pie chart, sortable/searchable DataTable, add entry dialog, and delete entry support
- **Finance Realtime subscriptions** — `useRealtimeSubscription` for `financial_model`, `cap_table_entries`, `knowledge_base`, `documents` tables in FinanceWorkspace (matches pattern from all other workspace pages)

### Changed

- **FinanceWorkspace tabs** — Replaced `PlaceholderTab` stubs ("Will be migrated from existing Finance app.") with real tab components: Overview, Financial Model, Cap Table, Investors, Knowledge Base
- **UI overhaul** — Decluttered dashboard, muted color palette, added design system with glass-card components, framer-motion animations, and agent fleet grid

### Fixed

- **Finance workspace placeholders** — All 4 finance tabs were showing "Will be migrated" placeholder text instead of real UI components (FinancialOverviewTab, FinancialModelTab, InvestorsTab, KnowledgeBaseTab)

## [v3.0.0] - 2026-03-15

Redis AI infrastructure: three new runtime modules (SemanticCache, AgentMemoryServerClient, FeatureStore), voice pipeline foundation (ElevenLabs + VoiceTransport), Sales agent Feature Store tools, and 9 critical/high review fixes across all new modules.

### Added

- **SemanticCache** (`packages/runtime/src/lib/semantic-cache.ts`) — LLM response caching via Redis vector search (Cohere embed-v4.0, 768-dim HNSW COSINE). Cross-agent sharing via `idx:llm_cache_v2` index. 95% similarity threshold, configurable TTL, per-model skip list. Promise lock on `ensureIndex()` prevents duplicate concurrent index creation.
- **AgentMemoryServerClient** (`packages/runtime/src/lib/agent-memory-server.ts`) — TypeScript HTTP client for Redis Agent Memory Server (two-tier cognitive memory: working memory + long-term semantic search). Implements `MemoryClient` interface for drop-in compatibility. Namespace isolation via `org:agentId:userId` key scheme.
- **FeatureStore** (`packages/runtime/src/lib/feature-store.ts`) — Sub-millisecond Redis HASH-based feature retrieval for Sales agent. 4 feature types: ProspectFeatures (with vector embedding for similarity), IndustryFeatures, AgentPerformanceFeatures, CallBriefFeatures. 4 RediSearch indexes (`idx:prospect_features`, `idx:industry_features`, `idx:agent_performance`, `idx:call_brief`). Per-method `orgId` override for multi-tenant safety.
- **ElevenLabsClient** (`packages/runtime/src/lib/elevenlabs-client.ts`) — WebSocket-based TTS/STT client for voice pipeline. Flash v2.5 model for sub-75ms latency, u-law 8kHz passthrough format.
- **VoicePipeline** (`packages/runtime/src/voice/voice-pipeline.ts`) — WebSocket bridge: NextGenSwitch ↔ ElevenLabs STT → Claude → ElevenLabs TTS. Call state management via Redis HASH with 1hr TTL.
- **VoiceTransport** (`packages/runtime/src/voice/voice-transport.ts`) — WebSocket server for NextGenSwitch connections + outbound call initiation via REST API.
- **Sales Feature Store tools** (5 tools in `agents/sales/src/tools/index.ts`) — `update_prospect_features`, `get_call_intelligence`, `get_hottest_prospects`, `update_industry_features`, `create_call_brief`. All pass `orgId` from closure for multi-tenant isolation.
- **Runtime-ref pattern** — `runtime-ref.ts` files added to all 5 department agents (COA, CMA, Compliance, Legal, Sales) for lazy runtime access in tool factories.
- **Redis shared helpers** — `createIndex()`, `vectorSearch()`, `escapeTag()`, `nowSecs()` exported from `redis-client.ts` for FeatureStore and SemanticCache consumption.
- **Chat route cache integration** — `POST /chat` checks SemanticCache before Claude API call; caches responses on completion (fire-and-forget).
- **Runtime exports** — All new modules (SemanticCache, FeatureStore, AgentMemoryServerClient, ElevenLabsClient, VoicePipeline, VoiceTransport) exported from `@waas/runtime` index.

### Changed

- **AgentRuntime `start()`** — Initializes SemanticCache, FeatureStore, and AgentMemoryServerClient (with health-check fallback to RedisMemoryClient) during startup lifecycle.
- **`hasMemory` in health route** — Changed from static boolean to getter (`get hasMemory() { return !!runtime._memory; }`) so health endpoint reflects runtime memory state, not construction-time snapshot.
- **SemanticCache skip models** — Removed `claude-opus-4-6` from `DEFAULT_SKIP_MODELS` (was making cache dead code for primary model).

### Fixed

- **FeatureStore orgId=""** (CRITICAL) — All 14 public methods now accept optional `orgId` parameter with `resolveOrgId()` helper that warns on empty orgId. Sales tools pass orgId from closure.
- **KEYS command in getCallBriefForProspect** (CRITICAL) — Replaced O(N) blocking `KEYS` scan with O(log N) `FT.SEARCH` using new `idx:call_brief` RediSearch index.
- **AMS healthy:false doesn't fallback** (CRITICAL) — Added `if (healthy)` condition before setting `_memory = amsClient`. Unhealthy AMS now falls through to RedisMemoryClient.
- **Zero Sentry in catch blocks** (HIGH) — Added `Sentry.captureException()` to all catch blocks across AgentMemoryServerClient (10), SemanticCache (3), FeatureStore (6), and AgentRuntime AMS init.
- **ensureIndex race condition** (HIGH) — Added promise lock pattern in both SemanticCache (`indexPromise` field) and FeatureStore (`indexPromises` Map) to prevent concurrent duplicate index creation.
- **Embedding failures silently return null** (HIGH) — Added `console.warn` in SemanticCache `get()` and `set()` when embedding generation returns empty vector.
- **setProspectFeatures bare catch** (HIGH) — Added `console.warn` with error message for embedding failures in prospect feature storage.
- **AMS addMemory fake NOOP** — Changed failure return from fake `[{ id, event: "NOOP" }]` to empty array `[]`.
- **AMS isHealthy bare catch** — Added `console.warn` with error message for health check failures.

## [v2.4.1] - 2026-03-15

Full Mem0 cloud API removal — migrated all persistent memory to Redis-backed storage with RediSearch vector search + Cohere embeddings. Zero Mem0 references remain in any `.ts` source file.

### Added

- **Standalone Redis memory clients** — `memory-client.ts` for CFO (`agent/`) and EA (`agents/ea/`) agents; same `idx:memories` schema as `@waas/runtime`'s `RedisMemoryClient` so all agents share one memory pool
- **`RedisClientType` re-export** — Both CFO and EA `redis-client.ts` now export the type for `memory-client.ts` imports

### Changed

- **Memory imports migrated** — All 15+ consumer files across CFO, EA, and runtime changed from `mem0-client.js` to `memory-client.js`
- **`mem0Namespaces` → `memoryNamespaces`** — Renamed in `@waas/shared` types, scopes, and enforcement
- **`ScopedMem0Client` → `ScopedMemoryClient`** — All enforcement method names and references updated across shared/runtime packages
- **AgentRuntime memory lifecycle** — Removed `Mem0Client` fallback constructor; only creates `RedisMemoryClient` after Redis connects
- **Knowledge graph routes** — Removed graph relation handling (Mem0-specific); returns flat memory entities with empty relationships
- **Documentation purge** — Mem0 references replaced with Redis-based descriptions across 25+ files (CLAUDE.md, README.md, SECURITY.md, ARCHITECTURE.md, docs/waas/, memory/)

### Fixed

- **`graphEntities` → `knowledgeEntries` stat key mismatch** — Backend knowledge routes (CFO + EA) now return `knowledgeEntries` matching the frontend `KnowledgeBaseTab` interface
- **Dead `metadata` Zod param** — Removed unused `metadata` parameter from CFO `update_knowledge_entry` tool (Redis `updateMemory` only accepts 2 args)
- **EA `.env.example`** — Removed stale `MEM0_API_KEY` and `MEM0_WEBHOOK_SECRET` entries
- **LLM-facing vendor leaks** — Compliance system prompt "mem0 and Redis" → "the memory system"; tool descriptions scrubbed of Mem0 branding

### Removed

- **`mem0-client.ts`** — Deleted from CFO agent (354 lines), EA agent (349 lines), and `@waas/runtime` (272 lines)
- **`mem0-setup.ts`** — Deleted from CFO agent (95 lines) and EA agent (95 lines); auto-discovery of Mem0 org/project no longer needed
- **`Mem0Client` class** — Removed from `@waas/runtime` exports; `AgentRuntimeConfig.env` no longer accepts `mem0ApiKey`, `mem0OrgId`, `mem0ProjectId`
- **`/api/webhooks/mem0` route** — Removed from both CFO and EA webhook routers
- **`MEM0_API_KEY` env var** — Removed from all 7 agent configs (CFO, EA, COA, CMA, Compliance, Legal, Sales)
- **`MEM0_WEBHOOK_SECRET` env var** — Removed from CFO and EA configs

## [v2.4.0] - 2026-03-15

Infrastructure hardening: MessageBus dual-mode (Redis Streams + LIST fallback), scoped stream operations, governance spend fallback, 25 review issue fixes across all agents and packages, EA org-scoping for Slack/Telegram transports.

### Added

- **MessageBus dual-mode persistence** — Redis Streams (XADD/XRANGE with MAXLEN auto-trimming) with automatic LIST fallback when Streams unavailable; runtime logging of active persistence mode
- **ScopedRedisClient stream operations** — `xadd`, `xrange`, `xlen`, `xtrim` with namespace enforcement (access-checked, fail-closed)
- **Agent-runtime stream adapters** — Maps `redis` npm PascalCase API (`xAdd`, `xRange`, `xLen`, `xTrim`) to `@waas/shared` lowercase interface
- **RedisMemoryClient circuit breaker** — `ensureIndex()` stops retrying after 3 failures (prevents hot loop of failing Redis commands)
- **In-memory governance spend fallback** — GovernanceEngine tracks spend in memory when Redis is unavailable (resets on restart, prevents unlimited spend)
- **Safe JSON parsing in MessageBus** — `safeParseMessage()` and `safeParseMessages()` helpers prevent corrupt messages from crashing the bus
- **EA `BLOCKDRIVE_ORG_ID` config** — Org UUID sourced from env var for Slack/Telegram transports (replaces hardcoded strings)
- **`message_agent` tool** — Added to CMA, Compliance, Legal, Sales agents via MessageBus (COA already had it)
- **`StreamEntry` type export** — Exported from `@waas/shared/namespace` for consumers

### Changed

- **MessageBus** updated module docstring documenting dual Streams/LIST mode, persistence mode logging, `getInbox()` returns chronological (oldest-first) order
- **Governance spend limits** — `spendLimitPerAgentPerDay` $10→$5, `spendLimitGlobalPerDay` $100→$50 (tighter control during initial deploy)
- **Chat route token estimation** — 3x multiplier applied only to input tokens (output tokens fully captured, no multiplier needed)
- **DataRoom auth** — Credentials sent via POST body + `x-viewer-*` headers instead of GET query params (prevents leaking in logs/URL history)
- **useModelSheet** — Replaced `supabase.auth.getSession()` with `useAuth()` context hook (Supabase warns against direct `getSession()` usage)
- **COA `message_agent`** — Removed Supabase INSERT fallback (no consumer reads queued messages); aligned with other 5 agents that require MessageBus
- **GovernanceEngine callback handler** — Calls `next()` for non-governance callbacks (was swallowing unrelated `callback_query:data` events)

### Fixed

- **Telemetry Worker fail-closed auth** — Rejects all requests when API key is unset (was fail-open, accepting unauthenticated telemetry)
- **Telemetry Worker error responses** — Split try-catch: JSON parse → 400, writeDataPoint → 500 (was 500 for all)
- **Zero-vector embedding guard** — When embedding generation fails, skip embedding field entirely and return NOOP event (was storing zero-vector producing meaningless KNN results)
- **RedisMemoryClient `updateMemory`** — Keeps existing embedding on re-embed failure (was overwriting with zero-vector)
- **RedisMemoryClient `hashToMemory`** — Empty catch replaced with `console.warn` including key for debuggability
- **Supabase audit log error checking** — `agent_messages` INSERT now checks `{ error }` field (Supabase JS v2 doesn't throw)
- **Webhook handler logging** — Includes `fetchErr` in error log and response; warns when `AGENT_BASE_URL` not configured
- **Track-view Worker** — Type-safe input validation for all body fields (was trusting `body as any`)
- **Sales `prep_call` bare catch** — Now logs error with agent prefix instead of silently swallowing
- **EA Slack transport org ID** — `"slack-workspace"` → `config.blockdriveOrgId` (was causing all DB-scoped tools to return empty results via Slack)
- **EA Telegram transport org ID** — `"telegram-direct"` → `config.blockdriveOrgId` (same fix for Telegram transport)
- **`RedisMemoryClient` class declaration** — Now declares `implements MemoryClient` for compile-time interface enforcement

## [v2.3.1] - 2026-03-15

PR review fixes (21 issues), pure function extraction for testability, 59 unit tests, Slack channel classification, infrastructure consolidation to NYC1.

### Added

- **59 unit tests** across 4 test files — `channel-config.test.ts` (16 tests), `useFinancialModel.test.ts` (9 tests), `useCapTable.test.ts` (5 tests), `useInvestorLinks.test.ts` (11 tests)
- **`channel-config.ts`** — Pure channel classification extracted from `slack.ts` (zero runtime deps, testable): `classifyChannel()`, `buildSlackContext()`, `WORKFORCE_CHANNELS`, `PURPOSE_CHANNELS`, `FEED_CHANNELS`
- **`computeDerivedMetrics()`** — Pure function extracted from `useFinancialModel` hook (burn rate, runway, MRR, gross margin, monthly aggregates, breakdowns)
- **`computeCapTableSummary()`** — Pure function extracted from `useCapTable` hook (totals, by-type grouping)
- **`computeLinkAnalytics()`** — Pure function extracted from `useInvestorLinks` hook (views, unique viewers, avg duration, completion)
- **`generateSlug()`** — Crypto-secure slug generation exported from `useInvestorLinks`
- **DM channel detection** — `/^D[A-Z0-9]+$/` regex in `classifyChannel()` for Slack DM channel IDs
- **`workforce-compliance`** added to `WORKFORCE_CHANNELS` (was missing)
- **`#waitlist-signups`** and **`#general`** added to `PURPOSE_CHANNELS`
- **Slack thread history cap** — `MAX_THREADS = 500` with FIFO eviction (`evictOldThreads()`)

### Fixed

- **Broken imports** in `KnowledgeGraph.tsx` and `KnowledgeDocuments.tsx` — imported from non-existent `@/pages/Knowledge`, now import from `@/components/finance/KnowledgeBaseTab`
- **`enable_data_room` silently dropped** in `useInvestorLinks` `createLink` mutation — now included in insert call
- **`Math.random()` slug generation** replaced with `crypto.getRandomValues()` (cryptographically secure)
- **`sendSlackMessage`/`readSlackChannel`** now throw when bot not initialized (was silent no-op / empty return)
- **`useInvestorLinks` realtime** uses unique `useRef` channel ID (prevents HMR collisions)
- **`KnowledgeBaseTab`** — `fetchDocuments` checks Supabase error, `handleUpload` surfaces failures via toast notification
- **`DataRoom`** validates `agentUrl` and `slug` early with error states, removes non-null assertions

### Changed

- **`CapTableTab` renamed to `FinancialOverviewTab`** — file, component, and imports updated to match actual purpose
- **CLAUDE.md** — EA tool count "14" → "7-14" (conditional Slack + Notion tools)
- **Infrastructure consolidated to NYC1** — All droplets (Redis, n8n) migrated from NYC3 to NYC1 VPC; n8n runs Docker + Caddy with auto-TLS at `n8n.blockdrive.co`

## [v2.3.0] - 2026-03-14

DO App Platform migration (ATL → NYC3), Google Sheets cloud deployment fix, governance engine hardening from 21-issue PR review, and webhook security improvements.

### Added

- **Google Sheets JSON env var** — `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` support for cloud platforms that can't mount files (DO App Platform); preserves `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` for local dev
- **PostHog proxy rewrite** — `/ingest/*` rewrite in Vercel config for ad-blocker bypass
- **Runtime validation** — `isPendingApproval()` type guard for Redis deserialization safety
- **Governance config validation** — `validateGovernanceConfig()` for fail-fast startup checks
- **`AgentConfigBase`** exported from `@waas/shared` for TypeScript declaration emit compatibility

### Changed

- **DO App Platform migrated from ATL to NYC3** — All 7 agent services co-located with Redis droplet and n8n; EA + Sales on dedicated instances ($29/mo), other 5 on shared ($12/mo); Sales auto-scales 1→3 at 75% CPU; total $118/mo (was $203/mo)
- `AGENT_REGISTRY` typed with `satisfies Record<AgentId, AgentConfig>` for compile-time key safety
- `requireApproval` config keyed on `ApprovalCategory` type (was manual switch statement)
- `GovernanceDecision` refactored to discriminated union (`{ approved: true } | { approved: false, reason }`)
- `SpendEvent.agentId` typed as `AgentId | (string & {})` for type safety
- `PendingApproval.telegramMessageId` uses `null` instead of sentinel `0`
- Spend recording in chat routes is fire-and-forget (no longer blocks event loop after `res.end()`)
- Webhook handler uses timing-safe string comparison for auth token validation
- Webhook handler uses `WEBHOOK_SECRET` env var with `SUPABASE_SERVICE_ROLE_KEY` fallback
- Database webhook migration reads `app.webhook_secret` with service role key fallback
- HMR-safe channel IDs in `useRealtimeSubscription` (timestamp+random instead of module-level counter)

### Fixed

- EA `package-lock.json` out of sync (missing `@sentry/node`, `posthog-node`)
- EA `observability.ts` inlined — standalone Docker build can't access `@waas/runtime`
- Redis TOCTOU race in `resolveApproval` fixed with Lua atomic check-and-set script
- Silent failures in `getDailySpend`, `resolveApproval`, `updateApprovalInRedis`, `getBot()` now log + alert via Sentry
- Empty catch blocks replaced with error logging + Sentry alerts
- SSE JSON parse catch now logs at debug level (diagnosable persistent parse failures)
- Webhook handler logs non-2xx agent responses as warnings with response body
- Webhook handler includes fetch error message in logs (was "Agent unreachable" only)

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
