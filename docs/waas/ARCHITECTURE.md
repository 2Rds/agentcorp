# WaaS Architecture

## System Overview

WaaS is a two-package orchestration platform that turns Claude Agent SDK instances into namespace-isolated, memory-enriched, inter-communicating cognitive agents.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Client (React/Mobile/CLI)                                          │
│    POST /chat { message, conversationId, organizationId, history }  │
│    Authorization: Bearer <supabase-jwt>                             │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ SSE (text/event-stream)
┌────────────────────────────▼─────────────────────────────────────────┐
│  AgentRuntime (per agent — one Express server per agent process)     │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ Auth MW   │→│ Chat Route│→│ Claude Agent │→│ MCP Tools        │  │
│  │ JWT+Org   │  │ SSE Stream│  │ SDK query() │  │ (org-scoped)     │  │
│  └──────────┘  └──────────┘  └─────────────┘  └──────────────────┘  │
│        │              │              │                                │
│  ┌─────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐  ┌──────────────────┐  │
│  │ Supabase   │ │ Memory   │ │ Redis      │  │ Telegram         │  │
│  │ Admin      │ │ Client   │ │ Client     │  │ Transport        │  │
│  │ (verify)   │ │ (enrich) │ │ (cache+vec)│  │ (inter-agent)    │  │
│  └────────────┘ └──────────┘ └────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Package Architecture

### @waas/shared

Pure TypeScript types and logic — no runtime dependencies, no side effects.

```
packages/shared/src/
├── types.ts              # Core types: AgentConfig, ModelStack, AgentScope, etc.
├── agents.ts             # Agent registry (AGENT_CONFIGS) + department scopes
├── plugins.ts            # Plugin names, skill types, registry types
├── index.ts              # Barrel exports
├── models/
│   ├── registry.ts       # MODEL_REGISTRY: 9 model definitions with pricing
│   ├── router.ts         # ModelRouter: provider routing, cost tracking, timeouts
│   ├── board.ts          # BoardSession: multi-agent deliberation + quorum voting
│   └── index.ts          # Model barrel exports
├── namespace/
│   ├── scopes.ts         # 7 AgentScope definitions (EA, CFA, CMA, COA, Legal, Sales, IR)
│   ├── enforcement.ts    # ScopedRedisClient, ScopedMemoryClient
│   └── index.ts          # Namespace barrel exports
└── messaging/
    ├── bus.ts            # MessageBus: routing, inbox, threads, escalation
    └── index.ts          # Messaging barrel exports
```

**Key design decisions:**
- Zero runtime dependencies (pure types + logic)
- All provider API calls use AbortController timeouts (60s chat, 30s embed/rerank)
- Namespace enforcement is fail-closed (unregistered agents are denied, not allowed)
- Board deliberation requires quorum validation before starting
- Cost tracking uses `Math.max(0, costUsd)` safety floor

### @waas/runtime

Express-based agent execution engine. Each agent instantiates one `AgentRuntime`.

```
packages/runtime/src/
├── agent-runtime.ts      # Main class: Express app, middleware, routes, lifecycle
├── index.ts              # Barrel exports
├── middleware/
│   └── auth.ts           # Supabase JWT verification + org membership + token cache
├── routes/
│   ├── health.ts         # GET /health (public, skips rate limiter)
│   └── chat.ts           # POST /chat (SSE streaming, Claude Agent SDK)
├── transport/
│   └── telegram.ts       # Telegram bot transport (grammy) for inter-agent messaging
└── lib/
    ├── redis-client.ts   # Redis connection, semantic cache, vector search
    ├── memory-client.ts  # Redis-backed persistent memory client with vector search
    ├── plugin-loader.ts  # Skill resolution: keyword → vector → dedup
    └── stream-adapter.ts # Claude SDK messages → SSE format conversion
```

**Key design decisions:**
- One AgentRuntime per agent process (not shared)
- Auth token cache is instance-scoped (passed via options, not module singleton)
- Rate limiter skips /health to avoid breaking monitoring probes
- Trust proxy defaults to 1 (single reverse proxy)
- SSE streaming detects client disconnects and breaks early
- Stream adapter never emits [DONE] — chat route controls termination
- Graceful shutdown with 5s timeout for hanging SSE connections
- Signal handler registered once (prevents listener leak on restart)

## Data Flow: Chat Request

```
1. Client POST /chat
   ├── Authorization: Bearer <jwt>
   └── Body: { message, conversationId, organizationId, history? }

2. Auth Middleware
   ├── Verify JWT via Supabase (cached 5min, max 500 entries)
   ├── Validate organizationId format
   └── Verify org membership via user_roles table

3. System Prompt Enrichment (parallel, Promise.allSettled)
   ├── Redis memory: org-scoped memories (top 5 by relevance)
   ├── Redis memory: session memories (last 10 from conversation)
   └── plugins: matched skills (keyword → vector → dedup)

4. Conversation Context
   ├── Sanitize history (whitelist roles: user, assistant)
   └── Build XML-escaped conversation_history block

5. Claude Agent SDK query()
   ├── System prompt: base + memories + skills
   ├── MCP tools: org-scoped server instance
   ├── Model: claude-opus-4-6
   └── Stream: includePartialMessages: true

6. SSE Response
   ├── Stream SDK messages as SSE events
   ├── Accumulate full text from deltas
   ├── Break on client disconnect
   └── Emit data: [DONE] on completion

7. Post-Response Hook (fire-and-forget)
   └── onResponse(agentId, orgId, message, fullText, conversationId)
```

## Multi-Model Routing

The ModelRouter routes requests to the optimal provider based on model configuration:

| Provider | Models | Timeout | Use Case |
|----------|--------|---------|----------|
| Anthropic (direct) | Claude Opus 4.6 | 60s | Primary brain, complex reasoning |
| OpenRouter | Kimi K2.5, Gemini 3 Pro/Flash, DeepSeek V3.2, Granite 4.0, Grok 4.1 | 60s | Specialized tasks via router |
| Perplexity | Sonar Pro, Sonar Deep Research | 60s | Real-time web search |
| Cohere | Embed English v4, Rerank v3.5 | 30s | Embeddings + reranking |

Cost tracking is per-request with cache adjustment (cached tokens at 10% of input cost).

## Namespace Isolation

Each agent department gets a `ScopedRedisClient` and `ScopedMemoryClient` that automatically prefix all keys/queries with the agent's namespace:

```
Agent: blockdrive-cfa (department: finance)
├── Redis keys:  finance:blockdrive-cfa:*
├── memory scope: agent_id=blockdrive-cfa, org_id=<org>
├── canMessage:  [blockdrive-ea, blockdrive-coa, blockdrive-ir]
├── canRead:     [finance:*, shared:*]
└── canWrite:    [finance:blockdrive-cfa:*]
```

Cross-department access is denied by default. Escalation messages bypass canMessage restrictions (by design — they go to the EA for routing).

## Inter-Agent Messaging

```
Agent A (CFA)                     Agent B (EA)
    │                                  │
    ├── MessageBus.send(draft)         │
    │   ├── Scope check (canMessage)   │
    │   ├── Assign metadata (id, ts)   │
    │   ├── Store in Redis inbox       │
    │   │   (RPUSH + LTRIM atomic)     │
    │   └── Transport.send(message)    │
    │       └── Telegram sendMessage ──┤
    │                                  ├── bot.on("message:text")
    │                                  ├── JSON.parse → AgentMessage
    │                                  ├── handler(message) → reply
    │                                  └── ctx.reply(JSON.stringify)
    │◄─────────────────────────────────┘
```

Thread tracking uses Redis LISTs (not pattern scans). Inbox is bounded at 100 messages with LRU eviction via LTRIM.

## Deployment Model

Each agent runs as an independent process (Docker container, Fly.io machine, or bare Node.js):

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ EA Agent    │  │ CFA Agent   │  │ COA Agent   │
│ :3001       │  │ :3002       │  │ :3003       │
│ telegram:A  │  │ telegram:B  │  │ telegram:C  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────┬───────┘────────┬───────┘
                │                │
    ┌───────────▼───────────┐
    │  Upstash Redis (TLS)  │
    │  semantic cache       │
    │  vector search        │
    │  persistent memory    │
    │  message inbox/threads│
    └───────────────────────┘
```

Agents share Upstash Redis (via TLS) for caching, vector search, and persistent memory, but are namespace-isolated. Each agent has its own Telegram bot for human-to-agent messaging. Supabase is shared for auth verification.

### Infrastructure Services

| Service | Provider | Purpose |
|---------|----------|---------|
| Redis | Upstash (serverless) | Semantic cache, vector search, MessageBus inbox, thread tracking |
| Memory | Redis (RediSearch + Cohere embeddings) | Org-scoped + session-scoped persistent memory |
| Auth | Supabase | JWT verification, org membership |
| Voice | ElevenLabs | TTS, STT, Conversational AI, phone calls (Twilio/SIP) |
| Automation | n8n (self-hosted, DO droplet) | Webhook routing, cron workflows |
| AI Gateway | Cloudflare | Caching, analytics, retries for direct provider calls |
| Inter-agent (current) | Telegram bots | Bot-to-bot DMs, transitioning to CF Queues |
| Inter-agent (planned) | CF Queues | Server-side, guaranteed delivery, no external dependency |

## Dual-Mode Agents (Cognitive + Conversational)

Agents with a `voice` config operate in two modes that share identity, memory, and namespace:

```
┌─────────────────────────────────────────────────────────┐
│  Agent: blockdrive-ea  (dual-mode)                       │
│  Shared: memory scope, Redis namespace, agent identity    │
│                                                          │
│  ┌─────────────────────┐   ┌──────────────────────────┐ │
│  │  Cognitive Runtime   │   │  Conversational Runtime   │ │
│  │  (AgentRuntime)      │   │  (ElevenLabs Agent)       │ │
│  │                      │   │                           │ │
│  │  Claude Opus 4.6     │   │  Flash v2.5 TTS/STT      │ │
│  │  20+ MCP tools       │   │  custom_llm → /chat      │ │
│  │  Full reasoning      │   │  Twilio phone bridge      │ │
│  │  Slack/Telegram/Web  │   │  Sub-second latency       │ │
│  │  SSE streaming       │   │  Turn-taking + VAD        │ │
│  └──────────┬───────────┘   └────────────┬──────────────┘ │
│             └──────────┬─────────────────┘               │
│                        │                                  │
│               Shared State (Redis)                        │
│               call transcripts, task queue                │
└─────────────────────────────────────────────────────────┘
```

**Handoff flow:** Call ends → conversational runtime writes transcript + action items to Redis → cognitive runtime picks up and executes (schedule meetings, send emails, update CRM).

**Sales swarm:** Multiple conversational agents make batch outbound calls simultaneously. One cognitive agent processes all results, prioritizes pipeline, drafts follow-ups.

### Voice Integration Strategies

| Strategy | When | How |
|----------|------|-----|
| **Custom LLM** | Phone calls, Zoom | ElevenLabs manages voice I/O + turn-taking, our agent is the brain via `custom_llm` endpoint |
| **TTS/STT pipes** | Web dashboard, Telegram/Slack voice messages | We control UX, ElevenLabs is just speech synthesis/recognition |
| **Batch calling** | Sales outreach | ElevenLabs batch API schedules N calls to N recipients simultaneously |
