# WaaS Implementation Plan

## Completed

### Infrastructure (v1.0.0)

- [x] `@waas/shared` — Core types, model router, namespace isolation, messaging bus
- [x] `@waas/runtime` — AgentRuntime, auth middleware, SSE chat, Redis memory, Redis, Telegram transport
- [x] ModelRouter with 3 providers via CF AI Gateway (Anthropic, Google AI Studio, xAI) + Cohere direct
- [x] BoardSession for multi-agent deliberation with quorum voting
- [x] MessageBus with atomic Redis inbox and thread tracking
- [x] ScopedRedisClient and ScopedMemoryClient for namespace isolation
- [x] 7 department scopes (EA, CFA, CMA, COA, Legal, Sales, IR)
- [x] Knowledge-work-plugin loader with 3-stage resolution
- [x] 13-agent security audit — 32 critical + 65 important issues resolved
- [x] Workspace structure (`packages/shared`, `packages/runtime`, `agents/blockdrive/`)

### CFO Agent (v1.0.0 — `2rds/cfo`)

- [x] Claude Agent SDK with 26 MCP tools across 9 domains
- [x] Multi-model orchestration via CF AI Gateway (3 models)
- [x] Redis-backed persistent memory with vector search
- [x] Redis 8.4 vector search (3 indexes)
- [x] Financial model, cap table, investor data rooms
- [x] Document intelligence with Gemini vision
- [x] Google Sheets integration
- [x] Supabase Auth migration (from Clerk)

## In Progress

### Agent Migration

- [ ] Move CFO agent to WaaS runtime (`agents/blockdrive/cfa/`)
- [ ] Extract CFO system prompt + MCP tools from `2rds/cfo/agent/`
- [ ] Replace `2rds/cfo` agent server with `@waas/runtime` AgentRuntime

### New Agents

- [ ] Executive Assistant (EA) — request router, escalation handler, cross-department coordinator
- [ ] Chief Operating Agent (COA) — process optimization, resource allocation, operational metrics
- [ ] Investor Relations (IR) — under CFA, DocSend pipeline, investor tracking
- [ ] Chief Marketing Agent (CMA) — brand, content, growth analytics
- [ ] Legal Agent — compliance, contract review, regulatory monitoring
- [ ] Sales Agent — pipeline management, outreach, deal tracking

## Planned

### Voice Transport (ElevenLabs)

- [ ] **M1: Foundation** — ElevenLabs client + voice transport scaffold
  - Build `lib/elevenlabs-client.ts` — API client with AbortController timeouts, signed URL generation, TTS/STT streaming
  - Build `transport/voice.ts` — Voice transport, call lifecycle management, transcript → Redis handoff
  - Define Redis key schema for voice state (active calls, transcripts, action items, call log)
  - Add voice security section to SECURITY.md
  - Verify ElevenLabs API connectivity with free tier key
- [ ] **M2: EA Voice** — First dual-mode agent (EA cognitive + conversational)
  - Create ElevenLabs conversational agent for EA via API (custom_llm → our /chat endpoint)
  - Provision Twilio phone number for EA
  - Clone or select voice for EA ("Alex")
  - Implement call screening flow (inbound → qualify → Redis → cognitive handoff → Slack notification)
  - Implement outbound call flow (cognitive EA triggers → conversational EA calls → transcript → summary)
  - Test signed URL → WebSocket → conversation → transcript pipeline end-to-end
- [ ] **M3: Sales Swarm** — Batch calling infrastructure + 10 sales rep agents
  - Design sales agent system prompt (qualification script, objection handling)
  - Create 10 conversational-only sales rep agents via ElevenLabs API (unique voices, dedicated Twilio numbers)
  - Implement batch calling pipeline (CRM export → dynamic variables → batch create → 500 calls/day)
  - Build call result aggregation (500 transcripts → cognitive processing → CRM pipeline update)
  - Implement sales daily report generation (hot leads, qualification scores, follow-ups)
- [ ] **M4: Channel Voice** — Voice I/O across Slack, Telegram, web dashboard
  - Slack voice message handler (receive audio → STT → agent → TTS → reply audio)
  - Telegram voice message handler (same pattern)
  - Web dashboard microphone integration (signed URL → WebSocket → real-time conversation)
  - IR agent voice: investor check-in call cadence (weekly batch calls to pipeline)

### Platform Infrastructure

- [ ] Cognitive agent template CLI — scaffold new agents from archetypes
- [ ] n8n automation hub — webhook routing, workflow triggers
- [ ] Agent health dashboard — real-time status across all deployed agents
- [ ] Centralized logging — structured logs with agent + org context
- [ ] CI/CD pipeline — automated build/test/deploy per agent

### Integration Layer

- [ ] Slack transport — alternative to Telegram for inter-agent messaging
- [ ] Notion MCP tools — org-scoped document/database access
- [ ] Linear MCP tools — task tracking and project management
- [ ] Email transport — agent-to-human communication
- [ ] Calendar integration — scheduling and meeting context

### Security & Compliance

- [ ] API key rotation mechanism
- [ ] Audit logging (all inter-agent messages)
- [ ] Rate limiting per org (not just per IP)
- [ ] Token refresh flow (proactive, not reactive)

### Scalability

- [ ] Agent auto-scaling (Fly.io machines API)
- [ ] Redis cluster support
- [ ] Connection pooling for Supabase
- [ ] SSE connection limits per org

## Known Limitations

1. **Module-level singletons**: Redis client and plugin registry are module-level. Auth token cache was fixed to be instance-scoped, but Redis/plugins require larger refactoring.
2. **No agent hot-reload**: Adding/removing agents requires process restart.
3. **Telegram-only transport**: Inter-agent messaging only supports Telegram bots. Slack and email transports are planned.
4. **Single-region deployment**: No multi-region failover support yet.
5. **No metrics/observability**: No Prometheus/Grafana integration. Health endpoint provides basic status only.
6. **Plugin loading is synchronous at startup**: Plugin registry is loaded once at boot. Hot-reloading skills requires restart.
7. **No agent-to-agent streaming**: MessageBus is request-response only. Real-time collaboration requires SSE between agents (not implemented).
8. **Board deliberation is sequential**: Each board member votes in order, not in parallel. Acceptable for small boards (3-5 members), would need parallelization for larger panels.

## Technical Debt

- [ ] Replace `readFileSync` in plugin registry initialization with async
- [ ] Add OpenTelemetry tracing spans to ModelRouter
- [ ] Connection pool for Supabase admin client
- [ ] Structured error types (replace string errors with typed error classes)
- [ ] Integration test suite for MessageBus + Telegram transport
- [ ] Load test for SSE streaming under concurrent connections
