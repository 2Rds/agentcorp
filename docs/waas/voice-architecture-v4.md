# Voice Architecture v4.0 — Design Document

**Status:** Design Complete — Ready for Implementation
**Date:** 2026-03-20
**Owner:** Sean Weiss
**Relates to:** [Platform Migration v4.0](./platform-migration-v4.md) (Phase 4), [Voice Integration Spec](./voice-integration-spec.md), [Voice Strategy](./voice-strategy.md)

---

## 1. Three-Layer Architecture

The voice system is built on three composable layers. Each layer does one thing exceptionally well; none of them overlap.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        THE BRAIN                                     │
│                     Claude Opus 4.6                                   │
│                                                                      │
│  Reasoning, decisions, tool orchestration, memory access,            │
│  qualification scoring, objection handling strategy                   │
│  Latency: 1-5s (acceptable — brain runs async to voice)              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ Anthropic Messages API
                               │ (via OpenAI-compat proxy)
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                        THE SENSES                                    │
│                     Gemini 3 Flash                                    │
│                                                                      │
│  Vision/OCR, search grounding, embeddings, structured generation,    │
│  prospect research, CRM data extraction                              │
│  Latency: 200-500ms                                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ Tool results feed into Brain
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                        THE VOICE                                     │
│                      ElevenLabs                                      │
│                                                                      │
│  TTS (Flash v2.5, ~75ms TTFB), STT (Scribe v2 Realtime, ~150ms),   │
│  emotional delivery, voice cloning, telephony, batch calling,        │
│  VAD, turn-taking                                                    │
│  Latency: 75-200ms                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Why three layers, not one:** ElevenLabs doesn't reason. Opus doesn't speak. Gemini doesn't emote. Trying to collapse these into a single model means sacrificing either intelligence (use a fast-but-shallow LLM) or voice quality (use Gemini Live's 30 preset voices). The three-layer split eliminates this tradeoff. See [Voice Strategy — Dual-Mode Architecture](./voice-strategy.md) for the full rationale.

---

## 2. Custom LLM Integration

ElevenLabs natively supports several LLMs (Claude Sonnet, Haiku, GPT-4o, Gemini Flash) but does NOT support Opus 4.6 directly. We use the `custom_llm` configuration to route through our own proxy that translates between ElevenLabs' OpenAI-compatible format and the Anthropic Messages API.

### 2.1 Request Flow

```
ElevenLabs Conversational AI
  │
  │  POST /v1/chat/completions (OpenAI format, SSE streaming)
  │  Authorization: Bearer <our-secret>
  │
  ▼
OpenAI-Compat Proxy (our Express server)
  │
  │  1. Translate OpenAI messages → Anthropic messages format
  │  2. Map model → "claude-opus-4-6"
  │  3. Convert tool_calls ↔ tool_use blocks
  │
  │  POST https://api.anthropic.com/v1/messages (stream: true)
  │
  ▼
Claude Opus 4.6
  │
  │  Reasoning + tool orchestration + response
  │
  ▼
Proxy streams back as OpenAI SSE chunks
  │
  │  data: {"choices": [{"delta": {"content": "..."}}]}
  │
  ▼
ElevenLabs TTS
  │
  │  Text → Flash v2.5 → G.711 u-law audio
  │
  ▼
Caller hears response
```

### 2.2 Translation Layer

The proxy handles three format translations:

**Messages:** OpenAI `messages[]` with `role: "system" | "user" | "assistant"` → Anthropic `system` string + `messages[]` with `role: "user" | "assistant"`.

**Tool calls:** OpenAI `tool_calls[].function.{name, arguments}` ↔ Anthropic `content[].{type: "tool_use", name, input}`. Tool results: OpenAI `role: "tool"` ↔ Anthropic `content[].{type: "tool_result"}`.

**Streaming:** Anthropic `message_start` / `content_block_delta` / `message_stop` events → OpenAI `data: {"choices": [{"delta": {...}}]}` SSE format.

### 2.3 Buffer Words Pattern

ElevenLabs TTS needs text to start generating audio. If Opus takes 2-3 seconds to think, the caller hears dead silence. The proxy injects buffer words (`"... "`) as the first SSE chunk before Opus responds, giving ElevenLabs something to vocalize while the brain reasons. This bridges the latency gap between Opus thinking time and the caller's patience threshold.

### 2.4 ElevenLabs Agent Configuration (custom_llm)

```json
{
  "conversation_config": {
    "agent": {
      "prompt": {
        "custom_llm": {
          "url": "https://agentcorp-ghgvq.ondigitalocean.app/<agent>/v1/chat/completions",
          "model_id": "claude-opus-4-6",
          "api_key": { "secret_id": "<elevenlabs-secret-ref>" }
        }
      }
    }
  }
}
```

The proxy endpoint lives on each agent's Express server alongside the existing `/chat` SSE route. ElevenLabs authenticates with a shared secret stored in ElevenLabs' secret manager — our API key never leaves our server.

### 2.5 Backup LLM Cascading

ElevenLabs supports automatic failover. If our custom_llm endpoint is unreachable (deploy, crash, timeout), it falls back to a configured backup:

```json
{
  "custom_llm": { "url": "...", "model_id": "claude-opus-4-6" },
  "backup_llm": {
    "provider": "anthropic",
    "model_id": "claude-sonnet-4-6"
  }
}
```

Sonnet 4.6 as backup preserves Claude-quality responses during brief outages, at lower cost and faster latency. The tradeoff is reduced reasoning depth, acceptable for a fallback.

---

## 3. Agent Voice Configurations

Three agent types get voice capabilities in v4. Each has different requirements for model selection, voice design, and behavioral tuning.

### 3.1 Sam — Sales Manager (blockdrive-sales, port 3007)

Sam is the primary sales voice. Handles scheduled calls, warm transfers from SDR reps, and high-value prospect conversations.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| TTS Model | `eleven_flash_v2_5` | 75ms TTFB, real-time conversational |
| Voice | Professional voice clone (PVC) | Confident, energetic male voice. Production quality required — this voice represents the company |
| Stability | 0.3–0.5 | Lower stability = more expressive range. Sales calls need energy and emotional modulation |
| Similarity Boost | 0.8 | High fidelity to the cloned voice |
| Style | 0.7 | Amplifies personality — Sam should sound engaged, not robotic |
| Speed | 1.0 | Natural pace. Faster sounds pushy, slower sounds uncertain |
| Turn Timeout | 7s | Sales calls have natural pauses while prospects think |
| Turn Eagerness | `normal` | Don't interrupt prospects mid-thought |
| Max Duration | 900s (15 min) | Strategic calls can run longer than SDR qualification |
| First Message | Dynamic (from pre-call brief) | Personalized opening per prospect |
| Tools | `search_knowledge`, `lookup_contact`, `check_calendar`, `transfer_call` | CRM lookup, memory search, warm transfer to Sean |

**Pronunciation Dictionary:**
```json
{
  "BlockDrive": { "phoneme": "blɑːk draɪv", "alphabet": "ipa" },
  "WaaS": { "phoneme": "wɑːz", "alphabet": "ipa" },
  "AgentCorp": { "phoneme": "eɪdʒənt kɔːrp", "alphabet": "ipa" },
  "Supabase": { "phoneme": "suːpəbeɪs", "alphabet": "ipa" },
  "SaaS": { "phoneme": "sæs", "alphabet": "ipa" }
}
```

### 3.2 Alex — Executive Assistant (blockdrive-ea, port 3002)

Alex screens inbound calls, makes outbound calls on Sean's behalf, and attends delegated meetings. Professional, warm, gender-neutral.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| TTS Model | `eleven_flash_v2_5` | Real-time conversational requirement |
| Voice | Designed voice (text description) | Warm, professional, gender-neutral. "A calm, professional executive assistant in their 30s with a neutral American accent and warm, measured delivery" |
| Stability | 0.5 | Balanced — professional consistency with enough warmth |
| Similarity Boost | 0.75 | Moderate — designed voices don't need clone fidelity |
| Style | 0.5 | Moderate personality — professional, not theatrical |
| Speed | 1.0 | Natural pace |
| Turn Timeout | 5s | Call screening is faster-paced than sales |
| Turn Eagerness | `normal` | Professional, doesn't interrupt |
| Max Duration | 600s (10 min) | Call screening should be brief |
| First Message | `"Hi, this is Alex from BlockDrive. How can I help you?"` | Consistent greeting for inbound |
| Tools | `search_knowledge`, `lookup_contact`, `check_calendar`, `save_knowledge`, `transfer_call` | Calendar, contacts, memory, warm transfer |

### 3.3 Sales Swarm Reps (SDR Worker, internal to port 3007)

Batch calling agents for outbound prospecting. 5–10 concurrent reps per pod, each with a distinct voice for natural diversity.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| TTS Model | `eleven_flash_v2_5` | Concurrency matters — Flash supports 30 concurrent vs 15 for Multilingual |
| Voice | Designed voices (varied) | 5–10 distinct voices per pod. Mix of ages, genders, accents. Generated from text descriptions |
| Stability | 0.4 | Slightly expressive — SDR calls need to sound human, not scripted |
| Similarity Boost | 0.7 | Moderate |
| Style | 0.6 | Enough personality to engage, not enough to distract |
| Speed | 1.05 | Slightly faster — SDR calls should be efficient |
| Turn Timeout | 5s | Qualification calls are structured |
| Turn Eagerness | `balanced` | Can interject when prospect goes off-track |
| Max Duration | 300s (5 min) | Hard cap. SDR qualification shouldn't exceed 5 minutes |
| First Message | Dynamic (from Feature Store) | Per-recipient personalization via `dynamic_variables` |
| Tools | `lookup_contact`, `end_call` | Minimal tooling — SDR reps qualify, they don't research |

**Why Flash v2.5, not v3:** v3 has richer emotional delivery but higher latency and lower concurrency (15 vs 30 simultaneous). For batch calling at scale (500 calls/day), Flash v2.5's throughput advantage outweighs v3's expressiveness. Sam (strategic calls) could upgrade to v3 later if the latency is acceptable.

**Voice Diversity Strategy:** Generate 10 voice profiles via ElevenLabs Voice Design API. Vary age (25–45), gender (mixed), accent (Standard American, Midwest, West Coast, Mid-Atlantic). Each SDR rep in a pod gets a fixed voice — prospects who receive callbacks hear the same voice.

---

## 4. Batch Calling

The SDR Worker orchestrates batch outbound campaigns via the ElevenLabs batch calling API. This is the operational backbone of the [AI Sales Swarm](./ai-sales-swarm.md).

### 4.1 Flow

```
Morning Prep (Cognitive Runtime — Sam):
  1. Ingest CRM export (500 prospects)
  2. Generate per-prospect context via Gemini Flash (company research, pain points)
  3. Build batch payload with dynamic_variables per recipient
  4. Submit batch via POST /v1/convai/batch-calling/submit

Campaign Execution (ElevenLabs manages):
  5. ElevenLabs dials each recipient via SIP trunk / Twilio
  6. Per call: ElevenLabs STT → custom_llm (Opus brain) → ElevenLabs TTS
  7. Voicemail detection → leave personalized message or hang up
  8. Call completes → post-call webhook fires

Post-Call Processing (Cognitive Runtime — Sam):
  9. Webhook receives transcript + metadata
  10. Score qualification (1-10) + extract objections + classify outcome
  11. Hot leads (8-10) → immediate Slack alert to Sean
  12. Update CRM pipeline + Redis memory
  13. Generate daily report → Slack #workforce-sales
```

### 4.2 Batch API Request

```json
POST /v1/convai/batch-calling/submit
{
  "agent_id": "agent_sdr_rep_01",
  "calls": [
    {
      "phone_number": "+15551234567",
      "dynamic_variables": {
        "prospect_name": "Lisa Chen",
        "company": "Dropbox",
        "title": "VP Engineering",
        "industry": "cloud_storage",
        "value_prop": "encrypted file storage on Solana with zero-knowledge proofs",
        "opening_line": "I noticed Dropbox recently expanded its enterprise security offering",
        "pain_point": "enterprise customers demanding on-prem-level encryption in the cloud"
      },
      "agent_config_override": {
        "conversation_config": {
          "agent": {
            "first_message": "Hi Lisa, this is Jordan from BlockDrive. I noticed Dropbox recently expanded its enterprise security offering — I'd love to share how we're solving the encryption challenge differently."
          }
        }
      }
    }
  ],
  "webhook_url": "https://agentcorp-ghgvq.ondigitalocean.app/sales/webhook/batch-call",
  "max_concurrent_calls": 10,
  "call_window": {
    "start_time": "09:00",
    "end_time": "17:00",
    "timezone": "America/New_York"
  }
}
```

### 4.3 Feature Store Integration

The `dynamic_variables` and `agent_config_override` for each recipient are populated from the Sales agent's Feature Store (sub-ms Redis HASH lookups). The Feature Store holds 4 feature types across 4 indexes:

| Feature Type | Key Pattern | Data |
|-------------|-------------|------|
| `prospect` | `fs:prospect:{id}` | Company intel, ICP score, pain points |
| `interaction` | `fs:interaction:{id}` | Last contact, outcome, objections |
| `campaign` | `fs:campaign:{id}` | Active campaign context, A/B variant |
| `script` | `fs:script:{id}` | Opening lines, qualification questions, objection rebuttals |

At batch submission time, Sam's cognitive runtime reads each prospect's features, merges them with campaign-level script features, and builds the per-recipient payload. This ensures every call is personalized without hitting any external API during the batch loop.

### 4.4 Post-Call Webhooks

ElevenLabs fires webhooks on call completion:

```json
POST /sales/webhook/batch-call
{
  "conversation_id": "conv_abc123",
  "agent_id": "agent_sdr_rep_01",
  "phone_number": "+15551234567",
  "status": "completed",
  "duration_seconds": 187,
  "transcript": [...],
  "recording_url": "https://...",
  "dynamic_variables": { ... }
}
```

The webhook handler in the Sales agent processes each completed call:
1. Extracts transcript → feeds to Opus for qualification scoring
2. Writes structured result to Redis (`voice:blockdrive-sdr:calls` list)
3. Updates Feature Store interaction features for the prospect
4. If qualification score >= 8: sends Slack alert to `#workforce-sales`
5. Logs to `agent_usage_events` for cost tracking

---

## 5. Telephony Options

Three integration architectures connect phone calls to our voice pipeline. Each trades off control vs. simplicity. See [Platform Migration v4.0 — NextGenSwitch Admin Audit](./platform-migration-v4.md) for the full evaluation.

### 5.1 Architecture A — Custom WebSocket (VoicePipeline)

**Already built:** `packages/runtime/src/voice/voice-pipeline.ts` and `voice-transport.ts`.

```
PSTN → Carrier Trunk → NextGenSwitch
  → <Stream> WebSocket → VoicePipeline (our code)
    → ElevenLabs STT (u-law 8kHz passthrough)
    → Claude Opus 4.6 (agentic tool loop, up to 2 turns/utterance)
    → ElevenLabs TTS (u-law 8kHz output)
    → WebSocket media events back → NextGenSwitch → PSTN
```

**How it works:** NextGenSwitch's `<Stream>` action opens a WebSocket to our `VoiceTransport` (listening on `/voice/ws`). The transport creates a `VoicePipeline` instance per call. Raw G.711 u-law audio flows bidirectionally with zero codec conversion — both NextGenSwitch and ElevenLabs use u-law 8kHz natively.

**Pros:** Full control over the STT → LLM → TTS loop. Native Anthropic tool calling with agentic loop (2 tool turns per utterance). SemanticCache integration for repeated queries. Per-call system prompt customization via `customParams`.

**Cons:** We manage VAD and turn-taking ourselves. More code to maintain. Must handle WebSocket lifecycle, reconnection, and cleanup.

**Best for:** Maximum control scenarios where we need custom tool orchestration during calls.

### 5.2 Architecture B — ElevenLabs SIP Trunk (Recommended)

```
PSTN → Carrier Trunk → NextGenSwitch
  → SIP trunk to ElevenLabs (sip.rtc.elevenlabs.io)
    → ElevenLabs manages: STT, VAD, turn-taking, TTS
    → custom_llm webhook → Our /v1/chat/completions proxy → Opus 4.6
    → Response back through ElevenLabs → SIP → NextGenSwitch → PSTN
```

**How it works:** NextGenSwitch forwards calls via SIP trunk to ElevenLabs' SIP endpoint. ElevenLabs handles all voice I/O (STT, TTS, VAD, turn-taking, interruption handling). When the agent needs to "think," ElevenLabs calls our custom_llm endpoint. We return Opus responses in OpenAI streaming format.

**Pros:** ElevenLabs handles all voice complexity (VAD, turn-taking, interruption, silence detection). Battle-tested at scale. Batch calling API available. Voicemail detection built-in. Multi-agent transfer support.

**Cons:** Webhook latency adds ~100-200ms round-trip vs. direct WebSocket. Less control over the voice pipeline. Dependent on ElevenLabs' infrastructure.

**Best for:** Sales Swarm, EA call screening, any scenario where ElevenLabs' managed voice quality matters more than custom pipeline control. **This is the recommended architecture for production.**

### 5.3 Architecture C — NextGenSwitch Built-in AI Assistant

```
PSTN → Carrier Trunk → NextGenSwitch
  → Built-in AI Assistant module (ElevenLabs configured as AI Provider)
  → NextGenSwitch handles: routing, recording, failover, IVR
```

**How it works:** NextGenSwitch has a built-in AI Assistant that can use ElevenLabs as a configured AI Provider. Inbound routes destination directly to the AI Assistant module. All configuration is via admin panel — zero custom code.

**Pros:** Zero code required. Admin panel configuration only. Built-in call recording, routing, and failover. IVR with LLM-powered intent analysis.

**Cons:** Unclear if custom_llm is supported through this path (may be limited to ElevenLabs' native models). Less flexibility for per-call personalization. Black box — harder to debug.

**Best for:** Simple IVR / receptionist use cases where Opus-level reasoning isn't needed.

### 5.4 Recommended Approach

**Phase 1 (EA + Sam):** Architecture B (ElevenLabs SIP trunk). ElevenLabs manages voice quality; we focus on the brain.

**Phase 2 (Sales Swarm batch calling):** Architecture B with batch calling API. Same SIP trunk, ElevenLabs manages the dialing.

**Architecture A (VoicePipeline)** stays in the codebase as a fallback and for scenarios requiring custom tool orchestration during voice calls. Architecture C is evaluated if we need a zero-code receptionist.

---

## 6. NextGenSwitch Configuration

NextGenSwitch (146.190.66.228, `sales.blockdrive.co`) is currently a clean slate. The following configuration is needed to go live with Architecture B.

### 6.1 Carrier SIP Trunk

A carrier trunk provides PSTN connectivity (phone numbers, inbound/outbound calling).

**Recommended carrier:** Telnyx (official ElevenLabs documentation uses Telnyx).

```
Trunk Name:           telnyx-primary
Type:                 SIP Registration / IP Authentication
Termination URI:      sip:XXX@sip.telnyx.com
Transport:            TLS (port 5061)
Codecs:               G.711 u-law (ulaw_8000) — primary
                      G.711 a-law (alaw_8000) — fallback
Media Encryption:     SRTP (preferred), RTP (fallback)
DTMF:                 RFC 4733 (out-of-band)
Registration:         Enabled (keep-alive 60s)
```

### 6.2 ElevenLabs SIP Trunk (Architecture B)

A second trunk connects NextGenSwitch to ElevenLabs' SIP endpoint for AI-handled calls.

```
Trunk Name:           elevenlabs-ai
Type:                 IP Authentication
Termination URI:      sip.rtc.elevenlabs.io
Transport:            TLS (port 5061)
Codecs:               G.711 u-law (ulaw_8000)
Auth:                 SIP trunk credentials from ElevenLabs dashboard
```

### 6.3 Outbound Route

```
Route Name:           outbound-default
Pattern:              ^(\+?1?\d{10,11})$   (US numbers, E.164)
Trunk Priority:       1. telnyx-primary
                      2. (failover trunk if added)
Caller ID:            From trunk (Telnyx-provided number)
```

### 6.4 Inbound Route

```
Route Name:           inbound-to-ai
DID Pattern:          <purchased phone number(s)>
Destination:          SIP trunk → elevenlabs-ai
                      (or: AI Assistant module for Architecture C)
Failover:             Voicemail
```

### 6.5 AI Provider Configuration

In NextGenSwitch admin (Settings → AI Providers):

```
Provider:             ElevenLabs
API Key:              <ELEVENLABS_API_KEY>
Default Agent:        <elevenlabs-agent-id>
```

### 6.6 API Key

Create an API key in NextGenSwitch (Applications → API) for programmatic access:

```
Key Name:             agentcorp-voice
Permissions:          Calls (read, write), Trunks (read), Routes (read)
```

Store as `NEXTGENSWITCH_API_KEY` in agent env vars.

### 6.7 Firewall

NextGenSwitch's adaptive firewall is already enabled (10 failed attempts → 600s ban). Additional rules needed:

```
# SIP signaling (already listening)
TCP/TLS 5060-5061    ← Carrier + ElevenLabs SIP

# RTP media — MUST be open for ElevenLabs compatibility
UDP 10000-60000      ← ElevenLabs RTP range (wider than NGS default 10000-20000)

# WebSocket (Architecture A only)
TCP 443              ← NextGenSwitch <Stream> to our VoiceTransport
```

**Note:** SIP signaling can go through a Cloudflare Tunnel (TCP/TLS), but RTP media (UDP) cannot. The DO firewall stays for the media plane. See [Platform Migration v4.0 — Phase 6.6](./platform-migration-v4.md).

---

## 7. Transfer Flow — SDR to Sean

When an SDR rep identifies a whale deal (qualification score >= 9, enterprise prospect, or explicit request for "the CEO"), the call transfers to Sean via warm (conference) transfer.

### 7.1 Flow

```
SDR Rep on call with prospect
  │
  │ Opus brain detects whale signal:
  │   - Qualification score >= 9
  │   - Prospect title contains "CEO", "CTO", "VP"
  │   - Prospect company is on high-value target list
  │   - Prospect explicitly asks "Can I speak to someone senior?"
  │
  ▼
SDR: "This sounds like a great fit. Let me connect you with
      Sean Weiss, our CEO, who can discuss this in more detail."
  │
  │ ElevenLabs system tool: transfer_to_number
  │   { "number": "+1XXXXXXXXXX", "message": "warm transfer" }
  │
  ▼
Conference transfer (warm):
  - Prospect is placed on brief hold (music/silence)
  - Sean's phone rings
  - SDR provides context to Sean (automated whisper or Slack DM):
    "Transferring Lisa Chen, VP Eng at Dropbox. Score 9/10.
     Interested in enterprise encryption. Asked about SOC 2."
  - Sean joins the call
  - SDR drops off
  │
  ▼
Sean continues the conversation with full context
```

### 7.2 ElevenLabs Transfer Configuration

```json
{
  "tools": [
    {
      "type": "system",
      "name": "transfer_to_number",
      "description": "Transfer the call to Sean Weiss for high-value prospects",
      "config": {
        "phone_number": "+1XXXXXXXXXX",
        "transfer_type": "conference",
        "message_before_transfer": "Please hold while I connect you with Sean."
      }
    }
  ]
}
```

**Transfer type:** `conference` (warm) not `blind`. Conference transfer keeps the SDR on the line briefly so Sean gets context before the prospect is connected. ElevenLabs supports both via SIP REFER.

### 7.3 Pre-Transfer Notification

Before initiating the transfer, the SDR's cognitive runtime fires a Slack DM to Sean in `#workforce-sales` with the prospect summary. This gives Sean 10-15 seconds of context before his phone rings. The notification includes:
- Prospect name, title, company
- Qualification score and key signals
- Objections raised and how they were handled
- What the prospect is most interested in

---

## 8. Voicemail Handling

When an SDR call reaches voicemail, the agent needs to detect it and leave a personalized message instead of trying to have a conversation with a recording.

### 8.1 Detection

ElevenLabs provides a `voicemail_detection` system tool:

```json
{
  "tools": [
    {
      "type": "system",
      "name": "voicemail_detection",
      "config": {
        "detection_mode": "auto",
        "on_voicemail": "leave_message"
      }
    }
  ]
}
```

When voicemail is detected, ElevenLabs triggers the agent to deliver a pre-configured voicemail script instead of entering conversational mode.

### 8.2 Personalized Message Templates

Voicemail messages use the same `dynamic_variables` from the batch call payload:

**Template (30 seconds max):**
```
Hi {prospect_name}, this is {rep_name} from BlockDrive.
I'm reaching out because {value_prop_short}.
I'd love to schedule a quick 15-minute call to show you how we're helping
companies like {company} {pain_point_solution}.
You can reach me at {callback_number} or I'll try you again {next_attempt_day}.
Thanks, {prospect_name}.
```

**Key constraints:**
- 30 seconds max (voicemails over 30s get deleted unheard)
- Include prospect name twice (beginning and end) for personalization signal
- Include a clear callback number
- Include a specific next-attempt timeframe
- No technical jargon — keep it simple

### 8.3 Post-Voicemail Processing

Voicemail outcomes are tracked separately in the batch results:

```json
{
  "conversation_id": "conv_xyz",
  "status": "voicemail",
  "voicemail_left": true,
  "duration_seconds": 28,
  "next_attempt": "2026-03-22T14:00:00Z"
}
```

The SDR cognitive runtime schedules a follow-up attempt 48 hours later, at a different time of day. After 3 voicemails with no callback, the prospect moves to email-only follow-up.

---

## 9. Gemini Live API — Lightweight Interactions Only

Gemini Live API provides a single-WebSocket voice pipeline (STT → reasoning → tool calling → TTS) that is useful for **internal agent interactions** where Opus-level reasoning and ElevenLabs voice quality are not needed.

### 9.1 Why Not for Sales Calls

| Capability | ElevenLabs | Gemini Live |
|-----------|-----------|-------------|
| Voices | 5,000+ library + cloning | 30 presets, no cloning |
| Emotional delivery | Expressive tags, stability/style control | Affective dialog (adapts to user emotion, not agent-controlled) |
| Voice quality | Industry-leading TTS, sub-75ms | Good, not best-in-class |
| Session duration | Configurable, up to hours | 15-minute cap (chainable) |
| Telephony | SIP trunk, Twilio, batch calling | None |
| Custom LLM | Yes (Opus via proxy) | No (Gemini only) |

Gemini Live is a strong product for general voice interactions, but it lacks the telephony integration, voice cloning, and emotional control needed for production sales calls.

### 9.2 Valid Use Cases

- **Internal agent status checks:** "Hey Gemini, what's the pipeline status?" — quick voice query against agent memory, no phone call involved.
- **Simple Q&A:** Developer or operator queries against the knowledge base via voice in the web dashboard.
- **Internal briefings:** Morning standup where Gemini reads a prepared briefing (cheaper than ElevenLabs for non-customer-facing audio).

### 9.3 Configuration

```typescript
// Gemini Live API WebSocket connection
const ws = new WebSocket(
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GOOGLE_AI_API_KEY}`
);

// Setup message
ws.send(JSON.stringify({
  setup: {
    model: "models/gemini-3-flash",
    generation_config: {
      response_modalities: ["AUDIO"],
      speech_config: {
        voice_config: { prebuilt_voice_config: { voice_name: "Puck" } }
      }
    },
    tools: [{ google_search: {} }, { code_execution: {} }]
  }
}));
```

---

## 10. Interactions API — Session Chaining

Gemini Live sessions have a 15-minute audio cap. For interactions that span longer than 15 minutes (rare for internal use), the Interactions API provides session continuity.

### 10.1 How It Works

Each Gemini Live session creates an `interaction_id`. When starting a new session, pass `previous_interaction_id` to resume context:

```typescript
// First session
const session1 = await startGeminiLiveSession({
  model: "models/gemini-3-flash",
  // ... config
});
// session1.interaction_id = "interaction_abc123"

// Session expires after 15 min. Start a new one with context:
const session2 = await startGeminiLiveSession({
  model: "models/gemini-3-flash",
  previous_interaction_id: "interaction_abc123",
  // ... config
});
// session2 has full context from session1
```

### 10.2 When to Chain

- **Morning briefings** that run long (> 15 min of audio — unlikely but possible)
- **Extended internal Q&A sessions** where an operator is debugging with voice
- **Multi-step workflows** where the operator is walking through a procedure

For sales calls (which use ElevenLabs, not Gemini Live), session duration is handled by ElevenLabs' `max_conversation_duration` config and is not subject to the 15-minute cap.

### 10.3 Interaction Storage

Interaction IDs are stored in Redis with a 24-hour TTL for session resumption:

```
Key:    gemini:interaction:{agentId}:{userId}
Value:  interaction_abc123
TTL:    86400 (24 hours)
```

This allows an operator to resume a Gemini Live session within 24 hours of the last interaction.

---

## Implementation Priority

| Component | Phase | Dependency | Status |
|-----------|-------|-----------|--------|
| OpenAI-compat proxy (custom_llm) | Phase 1 | None | Pending (WAAS-66) |
| ElevenLabs agent creation (Alex) | Phase 1 | Proxy | Pending |
| NextGenSwitch trunk setup | Phase 1 | Carrier account (Telnyx) | Pending |
| Alex voice (EA inbound/outbound) | Phase 1 | Proxy + trunk | Pending |
| Sam voice (Sales Manager) | Phase 2 | Phase 1 complete | Pending |
| SDR batch calling | Phase 2 | Sam voice + Feature Store | Pending |
| Transfer flow (SDR → Sean) | Phase 2 | SDR batch calling | Pending |
| Gemini Live (internal) | Phase 3 | None (independent) | Pending |
| Voice messages (Slack/Telegram) | Phase 3 | ElevenLabs TTS/STT | Pending |
| Web dashboard voice | Phase 3 | Signed URL auth | Pending |

See [Voice Strategy — Phased Rollout](./voice-strategy.md) for business case and timeline. See [Voice Integration Spec](./voice-integration-spec.md) for API surface, Redis schemas, and runtime class signatures. See [Voice Use Cases](./voice-use-cases.md) for detailed scenario walkthroughs.
