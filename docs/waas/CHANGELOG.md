# Changelog

All notable changes to the WaaS platform.

## [v1.1.0] - 2026-03-04

### Added

- **Voice Integration (ElevenLabs)** — Dual-mode agent architecture
  - `VoiceConfig`, `VoiceMode`, `VoiceModel`, `TranscriptionModel` types (@waas/shared)
  - `BatchCallRecipient`, `ConversationResult` types (@waas/shared)
  - `"voice"` channel type on `AgentChannel`
  - `voice` field on `AgentConfigBase` (optional — undefined = cognitive-only)
  - `elevenlabsApiKey` on `ProviderCredentials`
  - EA agent configured as first dual-mode agent (conversational mode, Flash v2.5, Scribe v2 realtime)
  - ElevenLabs env vars in `.env.example` (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_PHONE_NUMBER_ID`)
  - Dual-Mode Agents section in ARCHITECTURE.md
  - Voice patterns and ElevenLabs infrastructure in CLAUDE.md

- **Documentation Suite**
  - `docs/voice-strategy.md` — Business case, Mercury perk, cost model, competitive positioning, phased rollout
  - `docs/voice-integration-spec.md` — Technical spec, ElevenLabs API surface, custom LLM contract, Redis schema, runtime file designs
  - `docs/voice-use-cases.md` — 8 detailed use case scenarios (EA call screening, outbound calls, Zoom delegation, sales swarm, voice messages, web voice, IR calls, CFA briefing)
  - `docs/agentic-org-chart.md` — Full agent hierarchy with mode rationale, scaling notes, future agents roadmap

- **Project Management**
  - Notion: "Agentic C-Suite — Org Chart" database under BlockDrive HQ (15 columns, 18 agent rows)
  - Notion: Decision Log entry for ElevenLabs voice transport integration
  - Linear: "Voice Transport — ElevenLabs Integration" project with 4 milestones (Foundation, EA Voice, Sales Swarm, Channel Voice) and 18 issues

- **Voice Security** section in SECURITY.md
  - API key isolation (signed URL pattern)
  - Call recording compliance (AI disclosure, consent laws)
  - Phone number validation (E.164 enforcement)
  - WebSocket security (wss://, single-use tokens)
  - Voice cloning ethics policy
  - Transcript data handling (PII, TTL, retention)

- **Voice Transport** section in IMPLEMENTATION_PLAN.md — 4 milestones matching Linear

## [v1.0.0] - 2026-03-04

First major release. Complete cognitive agent orchestration platform with two packages (`@waas/shared`, `@waas/runtime`), 13-agent security audit passed, workspace structure finalized, and docs established.

### Added

- **@waas/shared** — Core orchestration types and logic
  - `ModelRouter` with 4 providers (Anthropic, OpenRouter, Perplexity, Cohere), cost tracking, AbortController timeouts
  - `BoardSession` for multi-agent deliberation with quorum voting
  - `MessageBus` with atomic Redis inbox, thread tracking, escalation support
  - `ScopedRedisClient` and `ScopedMem0Client` for namespace isolation
  - `AgentScope` definitions for 7 departments (EA, CFA, CMA, COA, Legal, Sales, IR)
  - Plugin registry types with keyword + vector matching
  - Agent registry with per-agent `ModelStack` configurations
  - 9 model definitions with pricing (Opus 4.6, Kimi K2.5, Gemini 3, Sonar Pro, DeepSeek V3.2, Granite 4.0, Grok 4.1, Cohere Embed/Rerank)

- **@waas/runtime** — Agent execution engine
  - `AgentRuntime` class (Express server, health checks, rate limiting, graceful shutdown)
  - Supabase JWT auth middleware with instance-scoped token caching and org membership verification
  - SSE streaming chat route with Claude Agent SDK integration and client disconnect detection
  - mem0 client with org-scoped + session-scoped memory enrichment, rate limit detection
  - Redis client with semantic cache and vector search
  - Knowledge-work-plugin loader with 3-stage resolution (keyword -> vector -> dedup)
  - Telegram transport for inter-agent messaging with chat ID verification

- **Workspace structure** — npm workspaces with tsconfig project references
  - `packages/shared` — pure types, zero runtime dependencies
  - `packages/runtime` — Express-based agent engine
  - `agents/blockdrive/` — deployment-specific agent configs
  - `template/` — cognitive agent scaffolding (planned)

- **Documentation** — README, ARCHITECTURE, SECURITY, IMPLEMENTATION_PLAN, CLAUDE.md

### Security

- Fail-closed scope enforcement (unregistered agents denied)
- Path traversal protection in plugin loader (resolve + normalize + startsWith)
- Telegram chat ID verification (allowlist-based)
- Instance-scoped auth token cache (not module singleton)
- AbortController timeouts on all external API calls (60s chat, 30s embed/rerank, 15s mem0)
- organizationId format validation (type check, length bound, regex)
- Client disconnect detection in SSE streaming
- XML injection prevention in conversation history (escapeXml with 5 entities)
- Board quorum validation before deliberation
- Cost tracking safety floor (`Math.max(0, costUsd)`)
- mem0 429 rate limit detection with Retry-After header
- Signal handler dedup (prevents listener leak on restart)
- 404 catch-all handler on all agent servers

### Origin

- Extracted and generalized from `2rds/cfo` agent server (v1.0.0)
- 3-agent PR review: 24 issues resolved
- 13-agent granular security audit: 32 critical + 65 important issues resolved
- Package rename: `@blockdrive/orchestration-shared` -> `@waas/shared`, `@blockdrive/agent-runtime` -> `@waas/runtime`
