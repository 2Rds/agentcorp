# Platform Migration v4.0 — CF AI Gateway + Gemini Stack Collapse + ElevenLabs Voice

**Status:** In Progress — CF AI Gateway BYOK configured, all .env files wired
**Priority:** P0 Critical
**Date:** 2026-03-20
**Owner:** Sean Weiss

## Executive Summary

Migrate AgentCorp from OpenRouter-proxied multi-provider routing to Cloudflare AI Gateway BYOK with direct provider endpoints. Simultaneously collapse the model stack from 6 to 4 models by replacing Perplexity Sonar Pro with Gemini Search Grounding and Cohere embed-v4.0 with Gemini Embedding 2. Finalize the three-layer voice architecture: Opus (brain) + Gemini (senses) + ElevenLabs (voice).

## Current State (v3.2.0)

```
Models: 6 active
  Opus 4.6 (Anthropic via OpenRouter)     → reasoning
  Gemini 3 Flash (Google via OpenRouter)   → vision/OCR/structured gen
  Grok 4.1 Fast (xAI via OpenRouter)      → X-Twitter/classification
  Sonar Pro (Perplexity via OpenRouter)    → web search
  Cohere embed-v4.0 (direct)              → 1536-dim embeddings
  Cohere rerank-v4.0 (direct)             → search reranking

Routing: OpenRouter (5% markup on all non-Anthropic models)
Voice: Not yet implemented (ElevenLabs planned, architecture designed)
SDK: gemini-client.ts (likely deprecated @google/generative-ai)
```

## Target State (v4.0.0)

```
Models: 4 active + 1 voice layer
  Opus 4.6 (Anthropic direct via CF AIG)  → reasoning, customer-facing
  Gemini 3 Flash (Google direct via CF AIG)→ vision, OCR, search grounding,
                                              embeddings, structured gen, code exec
  Grok 4.1 Fast (xAI direct via CF AIG)   → X-Twitter, classification
  Cohere rerank-v4.0 (direct, no change)  → search reranking
  ElevenLabs (direct)                      → TTS, STT, telephony, batch calling

Routing: CF AI Gateway BYOK (0% markup, direct provider endpoints)
Voice: ElevenLabs custom_llm → Opus brain → ElevenLabs TTS
SDK: @google/genai (npm, current)
```

## What's Dropped

| Component | Replacement | Savings |
|-----------|-------------|---------|
| OpenRouter | CF AI Gateway BYOK | 5% token markup eliminated |
| Perplexity Sonar Pro | Gemini Search Grounding | $6-14/1K requests → $0.014/query (5K free/mo) |
| Cohere embed-v4.0 | Gemini Embedding 2 | Comparable cost, higher MTEB (68.17 vs ~65), multimodal |

## What's Kept

| Component | Why |
|-----------|-----|
| Opus 4.6 | Irreplaceable reasoning quality. No Gemini model matches it |
| Grok 4.1 Fast | Exclusive X-Twitter data access |
| Cohere rerank-v4.0 | No Gemini reranker equivalent |
| Redis Memory | Purpose-built persistent memory with RediSearch. No Google equivalent |
| Supabase | Auth, DB, RLS, Edge Functions. Firebase evaluated and skipped |
| ElevenLabs | Emotional TTS, voice cloning, telephony, batch calling. Gemini Live API only for lightweight interactions |

---

## Phase 1: CF AI Gateway + SDK Migration

**Goal:** Route all model calls through CF AI Gateway with direct provider endpoints. Migrate from `@google/generative-ai` to `@google/genai`.

### 1.1 CF AI Gateway Setup (Sean — manual)
- [ ] Create `agentcorp` gateway in CF dashboard
- [ ] Enable authentication
- [ ] Store BYOK provider keys in Secrets Store:
  - Anthropic API key
  - Google AI Studio API key
  - Perplexity API key (temporary — removed in Phase 2)
  - xAI API key
- [ ] Note CF_ACCOUNT_ID, CF_GATEWAY_ID, CF_AIG_TOKEN
- [ ] Update all `.env` files with CF vars

### 1.2 SDK Migration: @google/genai
- [ ] Install `@google/genai` in agent/ package
- [ ] Rewrite `agent/src/lib/gemini-client.ts` to use new SDK
- [ ] Update `agent/src/lib/model-router.ts`:
  - Add per-provider base URL functions (not just OpenRouter)
  - `getGoogleBaseURL()` → `gateway.ai.cloudflare.com/.../google-ai-studio`
  - `getPerplexityBaseURL()` → `gateway.ai.cloudflare.com/.../perplexity`
  - `getGrokBaseURL()` → `gateway.ai.cloudflare.com/.../grok`
  - Keep `getAnthropicBaseURL()` (already exists)
  - Keep `getOpenRouterBaseURL()` as fallback
- [ ] Update `agent/src/config.ts`:
  - Add `googleAiApiKey`, `perplexityApiKey`, `xaiApiKey` (optional, BYOK injects)
  - Keep `openRouterApiKey` as fallback
- [ ] Update `chatCompletion()` to route each model alias to its native provider endpoint
- [ ] Add `cf-aig-metadata` header with `{orgId, agentId}` to all requests
- [ ] Add `cf-aig-cache-ttl` header for structured extraction (Gemini JSON responses)
- [ ] Test: all 3 model aliases (gemini, sonar, grok-fast) route through CF AIG

### 1.3 EA Agent SDK Migration
- [ ] EA uses Anthropic Messages API directly — update base URL to CF AIG Anthropic endpoint
- [ ] Add `cf-aig-metadata` header to EA's `createAgentQuery()`
- [ ] Update `agents/ea/src/config.ts` with CF vars

### 1.4 Department Agent Updates
- [ ] All 5 dept agents (COA, CMA, Compliance, Legal, Sales) use Agent SDK
- [ ] Update `@waas/runtime` to support CF AIG base URLs
- [ ] Add CF vars to runtime config

### 1.5 Observability
- [ ] Enable OTEL export in CF AI Gateway → Sentry
- [ ] Add `cf-aig-metadata` with agentId to all requests for per-agent cost tracking
- [ ] Evaluate replacing fire-and-forget `agent_usage_events` with CF analytics

---

## Phase 2: Gemini Search Grounding (Replace Perplexity)

**Goal:** Replace all Sonar Pro calls with Gemini Search Grounding. Drop Perplexity provider.

### 2.1 CFO Agent
- [ ] Update `chatCompletion()` — when model is "sonar", instead route to Gemini with `google_search` tool
- [ ] Or: create new `webSearch()` function that calls Gemini + google_search tool
- [ ] Parse `groundingMetadata` from response (webSearchQueries, groundingChunks, groundingSupports)
- [ ] Return structured citations to caller
- [ ] Update `web-fetch` MCP tool to use search grounding instead of Sonar

### 2.2 EA Agent
- [ ] Update `web_search` tool in `bridge.ts` — replace Sonar call with Gemini + google_search
- [ ] Parse grounding metadata into citation format EA already uses
- [ ] Test: "what's happening in crypto today" returns grounded response with sources

### 2.3 Department Agents
- [ ] Any agent using Sonar via `@waas/runtime` model-router gets the update automatically
- [ ] Verify no direct Sonar imports exist in dept agent code

### 2.4 Cleanup
- [ ] Remove Perplexity API key from CF AI Gateway Secrets Store
- [ ] Remove `sonar` alias from MODEL_IDS (replace with search grounding function)
- [ ] Remove PERPLEXITY_API_KEY from all .env files
- [ ] Update CLAUDE.md model stack documentation

---

## Phase 3: Gemini Embedding Migration (Replace Cohere embed)

**Goal:** Replace Cohere embed-v4.0 with Gemini Embedding 2 at 1536 dimensions. Re-index all Redis vectors.

### 3.1 Embedding Function
- [ ] Update `model-router.ts` `embed()` function:
  - Replace Cohere API call with `@google/genai` `ai.models.embedContent()`
  - Model: `gemini-embedding-001` (stable) or `gemini-embedding-2-preview` (multimodal)
  - Set `output_dimensionality: 1536` (matches current indexes, highest MTEB score)
  - Task type: `RETRIEVAL_QUERY` for queries, `RETRIEVAL_DOCUMENT` for indexing
- [ ] Keep Cohere rerank (separate from embeddings, no change)
- [ ] Update `agent/src/config.ts` — cohereApiKey stays (for rerank), add note

### 3.2 Redis MCP Server
- [ ] Update `~/.claude/mcp-servers/redis-memory/index.js`:
  - Replace Cohere embed call with Gemini Embedding
  - Keep 1536-dim (DIM stays same in FT.CREATE)
  - Update the embedding function
- [ ] Test: `add-memory` and `search-memories` work with new embeddings

### 3.3 Re-Index All Redis Vectors
- [ ] Write re-index script that:
  1. Lists all memories from `idx:memories` (189 docs)
  2. Re-embeds each with Gemini Embedding at 1536-dim
  3. Updates the vector field in-place (HSET)
  4. Verifies search quality with test queries
- [ ] Re-index `idx:llm_cache` (semantic cache vectors)
- [ ] Re-index `idx:plugins` (skill/plugin vectors)
- [ ] Batch API available at 50% discount for bulk re-embedding

### 3.4 Agent Updates
- [ ] CFO agent `model-router.ts` — already updated in 3.1
- [ ] EA agent — if it has its own embed function, update it
- [ ] `@waas/runtime` — update any shared embedding utilities
- [ ] `semantic-cache.ts` — update cache key embedding

### 3.5 Validation
- [ ] Search quality test: run 20 representative queries, compare results pre/post migration
- [ ] Verify all 3 indexes return results: memories, cache, plugins
- [ ] Monitor for empty embeddings / NOOP vectors

### 3.6 Documentation
- [ ] Update CLAUDE.md: "Cohere embed-v4.0" → "Gemini Embedding 2 (1536-dim)"
- [ ] Update memory/ files
- [ ] Update Redis memory references in all agent system prompts

---

## Phase 4: Voice Architecture Finalization

**Goal:** Finalize the three-layer voice architecture. Not building it yet — preparing the design for implementation.

### 4.1 Architecture Document
- [ ] Document the three-layer pattern:
  - ElevenLabs (voice I/O) → custom_llm endpoint → Opus (brain) → tools → response → ElevenLabs (TTS)
- [ ] Document the custom LLM proxy:
  - OpenAI-compatible streaming endpoint wrapping Anthropic Messages API
  - Buffer words pattern for TTS latency optimization
  - Tool calling flow through the proxy
- [ ] Document batch calling integration:
  - SDR Worker submits batches via `POST /v1/convai/batch-calling/submit`
  - Per-recipient personalization from Feature Store
  - Post-call webhooks → Redis memory + Supabase agent_usage_events

### 4.2 ElevenLabs Agent Configuration
- [ ] Design agent configs for each voice-enabled agent:
  - Sam (Sales Manager): Flash v2.5, professional cloned voice, stability 0.3-0.5
  - Alex (EA): Flash v2.5, designed voice (warm/professional), stability 0.5
  - Sales Swarm Reps: Flash v2.5, varied designed voices, stability 0.4
- [ ] Pronunciation dictionary for domain terms:
  - BlockDrive, WaaS, AgentCorp, Supabase, etc.
- [ ] Configure knowledge base per agent (product info, pricing, objection handling)

### 4.3 Telephony Design
- [ ] SIP trunk config for NextGenSwitch (146.190.66.228):
  - Termination URI, transport (TLS), media encryption
  - Codecs: G.711 u-law (ulaw_8000)
- [ ] Alternative: Twilio numbers for caller ID rotation
- [ ] Call transfer design: SDR → Sean (warm transfer for whale deals)
- [ ] Voicemail detection + personalized message templates

### 4.4 Gemini Live API (Lightweight)
- [ ] Design use cases: internal agent status checks, quick Q&A
- [ ] Interactions API for session continuity (previous_interaction_id)
- [ ] NOT for sales calls — ElevenLabs handles those

---

## Phase 5: New Gemini Features Adoption

**Goal:** Leverage Gemini platform features that simplify the stack.

### 5.1 Context Caching
- [ ] Cache agent system prompts (7 agents × ~2K-5K tokens each)
- [ ] Min 1,024 tokens for Flash, $1/hr storage, 90% input discount
- [ ] Implement in model-router: create cache on startup, reference in calls
- [ ] ROI: system prompts sent every request → cached = massive input token savings

### 5.2 Structured Output (Schema-Enforced)
- [ ] Update `extractStructured<T>()` in model-router:
  - Replace `responseFormat: { type: "json_object" }` with `responseJsonSchema`
  - Pass actual JSON schema for type-safe guaranteed output
  - Eliminates JSON parse failures

### 5.3 Code Execution
- [ ] Evaluate for CFO agent: financial calculations in Gemini's Python sandbox
  - Pre-installed: pandas, numpy, matplotlib, scikit-learn
  - Free (no additional charge), 30s timeout
  - Could replace some derived-metrics computation

### 5.4 File API
- [ ] Evaluate for document processing:
  - Free uploads, 2GB per file, 48hr retention
  - PDF: up to 1000 pages at ~258 tokens/page
  - Could simplify document-upload tool in CFO agent

---

## Implementation Order

```
Phase 1 (Week 1):   CF AI Gateway + SDK migration
Phase 2 (Week 1-2): Gemini Search Grounding (drop Perplexity)
Phase 3 (Week 2):   Gemini Embedding migration (drop Cohere embed)
Phase 4 (Week 3):   Voice architecture design document
Phase 5 (Week 3-4): Gemini feature adoption (caching, structured output)
Phase 6 (Week 4+):  Cloudflare Zero Trust + infrastructure hardening
Release:            v4.0.0
```

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| CF AI Gateway outage | Keep OpenRouter as fallback (config switch, not code change) |
| Gemini Search quality vs Sonar | A/B test on 20 representative queries before cutover |
| Embedding migration breaks search | Run side-by-side quality comparison before re-indexing |
| SDK breaking changes (v1beta) | Pin to stable v1 API, use preview features behind feature flags |
| ElevenLabs custom LLM latency | Buffer words pattern, test E2E latency before production |

---

## CF AI Gateway Configuration (COMPLETED)

```
CF_ACCOUNT_ID=0804701ffff5f5a40649e79e868ea832
CF_GATEWAY_ID=blockdrive-gateway
CF_AIG_TOKEN=cfut_X35Venh... (Provider Keys mode — all provider API keys injected at edge)
```

**Provider Keys BYOK configured in CF Secrets Store:**
- Anthropic (Opus 4.6)
- Google AI Studio (Gemini 3 Flash + Embedding 2)
- xAI (Grok 4.1 Fast)

**Provider Keys mode active:** `CF_AIG_TOKEN` is set → `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` become optional in config.ts. Gateway injects provider keys at edge via `cf-aig-authorization` header.

**All 7 agent .env files wired:** agent/, agents/ea/, agents/coa/, agents/cma/, agents/compliance/, agents/legal/, agents/sales/

**Gateway base URLs (post-migration):**
- Anthropic: `gateway.ai.cloudflare.com/v1/0804701.../blockdrive-gateway/anthropic`
- Google AI Studio: `gateway.ai.cloudflare.com/v1/0804701.../blockdrive-gateway/google-ai-studio`
- xAI: `gateway.ai.cloudflare.com/v1/0804701.../blockdrive-gateway/grok`
- OpenRouter (fallback): `gateway.ai.cloudflare.com/v1/0804701.../blockdrive-gateway/openrouter`

---

## Phase 6: Cloudflare Zero Trust + Infrastructure Hardening

### 6.1 Tunnel Redis (HIGHEST PRIORITY)
- [ ] Install `cloudflared` on Redis droplet (159.223.179.119)
- [ ] Expose `tcp://localhost:6379` through tunnel
- [ ] Create Access service tokens for agent servers
- [ ] Eliminate public IP exposure
- [ ] Update all REDIS_URL env vars to tunnel endpoint

### 6.2 Tunnel n8n
- [ ] Install `cloudflared` on n8n droplet (134.209.67.70)
- [ ] Expose `http://localhost:5678` through tunnel
- [ ] Access policy: IdP auth for dashboard, service tokens for webhook callers
- [ ] Eliminate public IP exposure

### 6.3 Access on Agent APIs
- [ ] Add Access as perimeter layer in front of DO App Platform
- [ ] Keep Supabase JWT middleware as inner layer (defense in depth)
- [ ] Service tokens for agent-to-agent calls (replace AGENT_MESSAGE_SECRET)

### 6.4 DLP on AI Gateway
- [ ] Enable DLP with Flag mode on blockdrive-gateway
- [ ] Configure financial data + SSN detection profiles (free tier)
- [ ] Parse `cf-aig-dlp` response header in chat routes for alerting

### 6.5 Access on Investor Data Room
- [ ] Add Access policies to `/dataroom/:slug` (currently fully public)
- [ ] Email-based allow list per investor slug

### 6.6 NextGenSwitch Security
- [ ] SIP signaling over TCP/TLS can tunnel (port 5061)
- [ ] RTP media (UDP) CANNOT tunnel — DO firewall stays for media plane
- [ ] Open UDP 10000-60000 for ElevenLabs RTP compatibility

---

## Cloudflare Platform Audit Summary

### ADOPT NOW
| Service | Use Case | Cost |
|---------|----------|------|
| AI Gateway BYOK | Direct provider routing, 0% markup | Free |
| Dynamic Routing | Per-agent budget limits, fallback chains, A/B testing | Free |
| Custom Metadata | Per-agent cost tracking via cf-aig-metadata | Free |
| Retries/Timeouts | Automatic retry with exponential backoff | Free |
| DLP | PII scanning on AI prompts/responses | Paid plan |
| Caching | Edge exact-match cache (coexists with SemanticCache) | Free |
| OTEL Export | Traces to Sentry with model/latency/cost | Free |
| Tunnel | Eliminate public IPs for Redis + n8n | Free (50 users) |
| Access | Zero Trust perimeter for APIs + data room | Free (50 users) |
| Hyperdrive | Free Supabase connection pooling from edge | Free |

### EVALUATE (HIGH VALUE, WAIT FOR MATURITY)
| Service | Potential | Blocker |
|---------|-----------|---------|
| Containers (beta) | Scale-to-zero for 5 idle agents (~$48/mo savings) | Beta stability |
| Workflows | Durable governance approval flows | Integration effort |
| Queues | Reliable inter-agent messaging | Wire into @waas/runtime |
| R2 | Zero-egress file storage for data room | Migration from Supabase Storage |
| Browser Rendering | Replace Playwright in Docker images | API simplicity |

### SKIP
| Service | Reason |
|---------|--------|
| CF Agents SDK | 128MB memory, no Claude Agent SDK, no shared Postgres |
| CF Slack Agent | Our @slack/bolt is vastly superior |
| D1 | Not a Postgres replacement |
| Vectorize | Lacks RediSearch hybrid search |
| Workers AI | Open-source models only |
| Replace Vercel | Vercel DX is worth keeping |
| Replace Supabase | Nothing in CF comes close |

## Cost Impact

| Item | Before | After | Delta |
|------|--------|-------|-------|
| OpenRouter markup | 5% on ~$50-100/mo | 0% | -$2.50-5/mo |
| Perplexity Sonar Pro | ~$20-50/mo | $0 (5K free queries) | -$20-50/mo |
| Cohere embed | ~$5-10/mo | ~$5-10/mo (Gemini comparable) | ~$0 |
| CF AI Gateway | N/A | Free (core features) | $0 |
| Context caching | N/A | ~$1-5/mo storage | +$1-5/mo |
| Net | | | **-$20-50/mo** |

---

## Voice Ecosystem Deep Dive

### Three-Layer Architecture (Finalized)

```
Opus 4.6         → THE BRAIN  (reasoning, decisions, tool orchestration)
Gemini 3 Flash   → THE SENSES (vision, search, embeddings, structured data)
ElevenLabs       → THE VOICE  (TTS, STT, emotional delivery, telephony)
```

These are composable layers, not competing alternatives. ElevenLabs doesn't reason, Opus doesn't speak, Gemini doesn't emote.

### ElevenLabs Capabilities (Full Audit)

**TTS Models:**
| Model | Latency | Languages | Strength |
|-------|---------|-----------|----------|
| Eleven v3 | Standard | 70+ | Most emotionally rich, dramatic delivery, expressive tags |
| Flash v2.5 | ~75ms TTFB | 32 | Real-time agents, 50% cheaper, multi-context WebSocket |
| Multilingual v2 | Standard | 29 | Most stable long-form |

**STT:** Scribe v2 Realtime (~150ms latency, 90+ languages, VAD, speaker diarization up to 32 speakers)

**Emotional Intelligence:**
- v3 detects emotional context from text and modulates delivery automatically
- Expressive tags: `[whispers]`, `[sarcastic]`, `[excited]`, `[crying]`, `[slow]`
- Stability slider: lower = more expressive range, higher = consistent
- Style parameter: amplifies voice personality
- No SSML tags — emotion emerges from text cues + voice settings

**Voice Customization:**
- 5,000+ voice library
- Instant voice cloning (1-2 min audio)
- Professional voice cloning (30 min+ audio, production-ready)
- Voice design from text description (age, gender, accent, tone, emotion, pacing)

**Custom LLM Support:**
- Natively supports: Claude Sonnet 4/4.5, Haiku 4.5, GPT-4o/5, Gemini 3 Flash
- Custom LLM endpoint: OpenAI-compatible streaming (`/v1/chat/completions`)
- Opus 4.6 via custom endpoint wrapping Anthropic API
- Buffer words pattern (`"... "`) for TTS latency optimization
- Backup LLM cascading (automatic failover)

**Telephony:**
- Outbound via SIP trunk (`POST /v1/convai/sip-trunk/outbound-call`)
- Outbound via Twilio (`POST /v1/convai/twilio/outbound-call`)
- Batch calling (`POST /v1/convai/batch-calling/submit`) with per-recipient personalization
- Voicemail detection + personalized message leaving
- Call transfer: blind, conference (warm), SIP REFER
- DTMF support (RFC 4733 out-of-band)
- Max call duration: default 10 min, configurable via `max_conversation_duration`
- Call recording via Twilio integration

**Agent Features:**
- Server tools (webhooks with OAuth2/Bearer auth for CRM lookup)
- Client tools (browser SDK)
- MCP tools (SSE/HTTP transport)
- System tools: end_call, language_detection, transfer_to_agent, transfer_to_number, skip_turn, voicemail_detection
- Knowledge base RAG (20MB/300K chars, PDF/TXT/DOCX/HTML)
- Multi-agent transfer (orchestrator → specialist → sub-specialist)
- Post-call webhooks (transcript + audio + failure notifications)
- A/B testing and automated testing frameworks
- Conversation search (text + semantic)

**Concurrency (Scale tier):** 15 Multilingual / 30 Flash / 60 STT / 45 Realtime STT

### NextGenSwitch Admin Audit (sales.blockdrive.co)

**Platform:** Programmable SIP softswitch with PBX + call center + CCaaS + CRM
**Status:** Deployed at 146.190.66.228 (DO NYC1), completely unconfigured (clean slate)
**Admin:** sean@blockdrive.co (Super Admin)

**Current Configuration:**
- SIP listeners: UDP/TCP 0.0.0.0:5060, TLS 0.0.0.0:5061
- RTP range: 10000-20000
- Adaptive firewall: enabled (10 failed attempts, 600s ban)
- 0 trunks, 0 extensions, 0 routes, 0 AI providers, 0 API keys

**AI Provider Support (built-in):**
OpenAI, Wit.ai, Microsoft Azure, Gemini, Cloudflare, Amazon, Groq, Fal AI, Deepgram, **ElevenLabs**, OpenRouter

**Key Routing Capabilities:**
- Inbound routes can destination directly to **AI ASSISTANT** module
- Outbound routes support trunk priority, pattern matching, failover to AI Assistant
- Custom Functions: URL/XML/PHP — URL function points to agent WebSocket endpoint
- IVR: DTMF + speech (LLM-powered intent analysis)

**Contact Center:**
- Contacts (import CSV, groups, WhatsApp/SMS integration)
- Campaigns (automated outbound dialing)
- Broadcasts (mass communication)
- Scripts (dynamic variables: %first_name%, %phone%, etc.)
- Custom Forms

**CRM:**
- Leads (pipeline: New → Contacted → Qualified → Working → Proposal Sent → Converted)
- Support Tickets (priority levels, assignment)

**Three Integration Architectures:**

**Architecture A — Custom `<Stream>` WebSocket (existing VoicePipeline):**
```
PSTN → Carrier Trunk → NextGenSwitch → <Stream> WebSocket → Your VoicePipeline
  → ElevenLabs STT → Opus brain + tools → ElevenLabs TTS → WebSocket back → PSTN
```
Pro: Full control, native Anthropic tool calling. Con: You manage VAD/turn-taking.

**Architecture B — ElevenLabs manages voice, NextGenSwitch as SIP trunk:**
```
PSTN → Carrier Trunk → NextGenSwitch → SIP trunk to ElevenLabs (sip.rtc.elevenlabs.io)
  → ElevenLabs STT/TTS/VAD → custom_llm webhook → Your /chat endpoint → back
```
Pro: Managed VAD/turn-taking, emotional TTS, batch calling. Con: Webhook latency.

**Architecture C — NextGenSwitch built-in AI Assistant with ElevenLabs provider:**
```
PSTN → Carrier Trunk → NextGenSwitch → Built-in AI Assistant (ElevenLabs as AI provider)
  → NextGenSwitch handles routing + recording + failover
```
Pro: Zero custom code, admin panel config only. Con: Less control, may not support custom LLM.

**What's Needed to Go Live (any architecture):**
1. Carrier SIP trunk (Telnyx recommended — official ElevenLabs docs)
2. Phone number(s) for outbound caller ID
3. Trunk + outbound route configured in NextGenSwitch
4. API key created in NextGenSwitch (Applications → API)
5. Firewall: open UDP 10000-60000 for ElevenLabs RTP compatibility

### Gemini Live API (Lightweight Interactions Only)

**Not for sales calls.** Reserved for internal agent interactions where Opus-level reasoning isn't needed.

- Single WebSocket: STT → reasoning → tool calling → TTS
- 30 preset voices (vs ElevenLabs 5,000+, no cloning)
- 15-min audio session cap (chainable via Interactions API `previous_interaction_id`)
- Tool calling during live sessions (function calling, Google Search, code execution)
- Affective dialog (adapts tone to user emotion)
- 70 languages, 128K context window

**Use cases:** Quick agent status checks, simple Q&A, internal briefings.
**Not suitable for:** Sales calls (no voice cloning, limited emotion, session caps).
