# Voice Integration Technical Spec

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Dual-Mode Agent (e.g., blockdrive-ea)                              │
│                                                                      │
│  ┌────────────────────────┐       ┌─────────────────────────────┐  │
│  │   Cognitive Runtime     │       │  Conversational Runtime      │  │
│  │   (AgentRuntime)        │       │  (ElevenLabs Agent)          │  │
│  │                         │       │                              │  │
│  │   Claude Opus 4.6       │       │  ElevenLabs Flash v2.5      │  │
│  │   20+ MCP tools         │       │  Scribe v2 Realtime (STT)   │  │
│  │   Full reasoning chain  │       │  Twilio/SIP (phone bridge)  │  │
│  │   SSE streaming         │       │  WebSocket/WebRTC           │  │
│  │                         │       │  Turn-taking + VAD           │  │
│  │   POST /chat            │◄──────│  custom_llm → POST /chat    │  │
│  │        │                │       │                    │         │  │
│  └────────┼────────────────┘       └────────────────────┼─────────┘  │
│           │                                             │            │
│           └──────────────┬──────────────────────────────┘            │
│                          │                                           │
│                 ┌────────▼────────┐                                  │
│                 │  Shared State   │                                  │
│                 │  (Upstash Redis)│                                  │
│                 │                 │                                  │
│                 │  • active calls │                                  │
│                 │  • transcripts  │                                  │
│                 │  • action items │                                  │
│                 │  • call log     │                                  │
│                 └────────┬────────┘                                  │
│                          │                                           │
│                 ┌────────▼────────┐                                  │
│                 │  Redis Memory   │                                  │
│                 │  (org-scoped)   │                                  │
│                 └─────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## ElevenLabs API Surface

All API calls go to `https://api.elevenlabs.io`. Auth via `xi-api-key` header.

### Agent Management

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/convai/agents` | POST | Create conversational agent with custom_llm config |
| `/v1/convai/agents/{agent_id}` | PATCH | Update agent config (prompt, tools, voice) |
| `/v1/convai/agents/{agent_id}` | GET | Get agent config |
| `/v1/convai/agents/{agent_id}` | DELETE | Delete agent |

### Conversations

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/convai/conversation/get-signed-url` | POST | Generate signed WebSocket URL (15-min expiry) |
| `/v1/convai/conversations` | GET | List conversations (with filtering) |
| `/v1/convai/conversations/{id}` | GET | Get conversation details + transcript |
| `/v1/convai/conversations/{id}` | DELETE | Delete conversation |

### Phone Calls

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/convai/twilio/outbound-call` | POST | Single outbound call via Twilio |
| `/v1/convai/sip_trunk/outbound_call` | POST | Outbound call via SIP trunk |
| `/v1/convai/batch-calls` | POST | Schedule batch calls to multiple recipients |

### Text-to-Speech

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/text-to-speech/{voice_id}` | POST | Convert text to audio (returns file) |
| `/v1/text-to-speech/{voice_id}/stream` | POST | Stream audio as it generates |

### Speech-to-Text

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/speech-to-text/convert` | POST | Transcribe audio/video file (async) |
| `wss://api.elevenlabs.io/v1/speech-to-text/realtime` | WebSocket | Real-time streaming transcription |

### Voice Cloning

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/voices/add` (IVC) | POST | Instant voice clone from audio samples |
| `/v1/voices/pvc/create` | POST | Professional voice clone (higher quality, training period) |
| `/v1/voices` | GET | List available voices |

## Custom LLM Contract

When creating an ElevenLabs conversational agent, we configure `custom_llm` to point to our agent's `/chat` endpoint. ElevenLabs handles voice I/O and turn-taking; our agent provides the intelligence.

### Agent Creation Request

```json
{
  "name": "BlockDrive EA - Conversational",
  "conversation_config": {
    "asr": {
      "quality": "high",
      "provider": "elevenlabs"
    },
    "tts": {
      "voice_id": "<agent_voice_id>",
      "model_id": "eleven_flash_v2_5",
      "stability": 0.7,
      "speed": 1.0,
      "similarity_boost": 0.8
    },
    "turn": {
      "turn_timeout": 7,
      "turn_eagerness": "normal"
    },
    "conversation": {
      "max_duration_seconds": 600
    },
    "agent": {
      "first_message": "Hi, this is Alex from BlockDrive. How can I help you?",
      "language": "en",
      "prompt": {
        "prompt": "<lightweight_system_prompt>",
        "custom_llm": {
          "url": "https://<our-agent-host>/chat",
          "model_id": "claude-opus-4-6",
          "api_key": { "secret_id": "<elevenlabs_secret_ref>" }
        },
        "tools": [
          {
            "type": "webhook",
            "name": "check_calendar",
            "description": "Check Sean's calendar availability",
            "api_schema": {
              "url": "https://<our-api>/calendar/availability",
              "method": "GET"
            }
          },
          {
            "type": "webhook",
            "name": "lookup_contact",
            "description": "Look up a contact in the CRM",
            "api_schema": {
              "url": "https://<our-api>/contacts/{name}",
              "method": "GET"
            }
          }
        ]
      }
    }
  }
}
```

### Lightweight System Prompt (Conversational Runtime)

The conversational runtime gets a trimmed prompt optimized for speed:

```
You are Alex, the executive assistant for Sean Weiss, CEO of BlockDrive.
You are on a phone call. Be professional, warm, and concise.

Key context:
- BlockDrive is an encrypted file storage platform on Solana blockchain
- You screen calls, schedule meetings, and relay messages for Sean
- You CANNOT make financial commitments or share confidential information
- If unsure, say "I'll check with Sean and get back to you"

Current date: {date}
Caller context: {dynamic_variables}
```

This is much shorter than the full cognitive system prompt (which includes MCP tool descriptions, persistent memories, plugin skills, etc.).

## Signed URL Auth Flow

```
┌──────────┐     ┌──────────────┐     ┌───────────────┐
│  Client   │     │  Our Server  │     │  ElevenLabs   │
│  (Browser)│     │  (Express)   │     │  API          │
└─────┬─────┘     └──────┬───────┘     └───────┬───────┘
      │                  │                     │
      │ GET /signed-url  │                     │
      │ (with auth JWT)  │                     │
      │─────────────────►│                     │
      │                  │                     │
      │                  │ POST get-signed-url  │
      │                  │ xi-api-key: sk_...   │
      │                  │─────────────────────►│
      │                  │                     │
      │                  │◄────────────────────│
      │                  │ { signed_url }      │
      │                  │                     │
      │◄─────────────────│                     │
      │ signed_url       │                     │
      │                  │                     │
      │ WebSocket connect (signed_url)         │
      │────────────────────────────────────────►│
      │                  │                     │
      │◄───────────────────────────────────────│
      │ Conversation stream (audio in/out)     │
      └──────────────────────────────────────── │
                                                │
      URL expires after 15 minutes              │
```

**Security properties:**
- API key never leaves the server
- Signed URL is single-use and time-limited (15 min)
- Client authenticates to our server via JWT (standard Supabase auth)
- Our server validates JWT before generating signed URL

## Shared State Schema (Redis)

All voice state is namespaced under `voice:{agentId}:`.

### Active Call

**Key:** `voice:{agentId}:active-call:{callId}`
**Type:** HASH
**TTL:** 1 hour (auto-cleanup for abandoned calls)

```json
{
  "callId": "conv_abc123",
  "direction": "inbound",
  "callerNumber": "+15551234567",
  "callerName": "Jennifer Park",
  "startedAt": "2026-03-04T14:30:00Z",
  "status": "in_progress",
  "agentPhoneNumberId": "phone_xyz",
  "qualificationScore": null
}
```

### Call Transcript

**Key:** `voice:{agentId}:transcript:{callId}`
**Type:** LIST (append-only)
**TTL:** 7 days

Each entry is a JSON string:
```json
{
  "speaker": "caller",
  "text": "Hi, I'm calling about the seed round materials.",
  "timestamp": "2026-03-04T14:30:15Z"
}
```

### Action Items

**Key:** `voice:{agentId}:action-items:{callId}`
**Type:** LIST
**TTL:** 30 days

```json
{
  "action": "Send updated pitch deck to Jennifer Park",
  "priority": "high",
  "dueBy": "2026-03-05T00:00:00Z",
  "assignee": "sean",
  "status": "pending",
  "extractedAt": "2026-03-04T14:35:00Z"
}
```

### Call Log

**Key:** `voice:{agentId}:call-log`
**Type:** LIST (bounded at 100 entries via LTRIM)

```json
{
  "callId": "conv_abc123",
  "direction": "inbound",
  "callerName": "Jennifer Park",
  "callerCompany": "Sequoia Capital",
  "duration": 135,
  "qualificationScore": 9,
  "outcome": "qualified_callback",
  "timestamp": "2026-03-04T14:30:00Z"
}
```

## Runtime Files

### `lib/elevenlabs-client.ts`

```
ElevenLabsClient
├── constructor(apiKey: string)
├── createAgent(config: ConversationalAgentConfig): Promise<{ agentId: string }>
├── updateAgent(agentId: string, config: Partial<ConversationalAgentConfig>): Promise<void>
├── getSignedUrl(agentId: string): Promise<{ signedUrl: string; conversationId?: string }>
├── outboundCall(params: OutboundCallParams): Promise<{ callId: string }>
├── batchCall(params: BatchCallParams): Promise<{ batchCallId: string }>
├── textToSpeech(voiceId: string, text: string, model?: VoiceModel): Promise<ReadableStream>
├── textToSpeechStream(voiceId: string, text: string): Promise<ReadableStream>
├── transcribeFile(audio: Buffer, model?: TranscriptionModel): Promise<{ text: string }>
├── connectRealtime(config: RealtimeSTTConfig): Promise<WebSocketConnection>
├── cloneVoice(name: string, audioFiles: Buffer[]): Promise<{ voiceId: string }>
└── listVoices(): Promise<Voice[]>

All methods:
- Use AbortController with 60s timeout (30s for TTS/STT)
- Throw typed errors (ElevenLabsError with status code)
- Log usage for cost tracking
```

### `transport/voice.ts`

```
VoiceTransport
├── constructor(client: ElevenLabsClient, redis: ScopedRedisClient)
├── handleInboundCall(callData: InboundCallEvent): Promise<void>
├── initiateOutboundCall(agentId: string, toNumber: string, context: CallContext): Promise<string>
├── initiateBatchCalls(agentId: string, recipients: BatchCallRecipient[]): Promise<string>
├── getActiveCall(agentId: string): Promise<ActiveCall | null>
├── getCallTranscript(callId: string): Promise<TranscriptEntry[]>
├── getCallLog(agentId: string, limit?: number): Promise<CallLogEntry[]>
├── processCallEnd(callId: string): Promise<ConversationResult>
│   └── Extracts action items, calculates qualification score
│       Writes to Redis, triggers cognitive runtime handoff
├── textToVoiceMessage(voiceId: string, text: string): Promise<Buffer>
│   └── For Slack/Telegram voice replies
└── transcribeVoiceMessage(audio: Buffer): Promise<string>
    └── For incoming Slack/Telegram voice messages
```

## Twilio Integration

### Phone Number Provisioning
1. Create Twilio account (or use existing)
2. Buy phone number(s) — one per voice-enabled agent
3. Configure webhook: incoming calls → ElevenLabs agent URL
4. Store `agentPhoneNumberId` in agent's env vars

### Inbound Call Flow
```
Caller → Twilio number → ElevenLabs Conversational AI agent
  → STT → custom_llm (our /chat) → TTS → caller hears response
```

### Outbound Call Flow
```
Our server → POST /v1/convai/twilio/outbound-call
  → ElevenLabs connects to Twilio → Twilio dials recipient
  → Conversation proceeds via custom_llm
```

### Cost
- Phone number: ~$1/month
- Inbound: ~$0.0085/min
- Outbound: ~$0.013/min (US domestic)
- Estimated per-call cost (3 min average): $0.04

## Voice Cloning

### Instant Voice Clone (IVC) — Development/Prototyping
- Upload 1+ audio samples (30s minimum recommended)
- Clone ready in seconds
- Good enough for testing, not production quality
- API: `POST /v1/voices/add` with multipart audio files

### Professional Voice Clone (PVC) — Production
- Upload high-quality recordings (5+ minutes recommended)
- Training period (hours to days)
- Higher quality, more natural
- API: `POST /v1/voices/pvc/create`

### Per-Agent Voice Strategy
| Agent | Voice Style | Clone Type | Notes |
|---|---|---|---|
| EA (Alex) | Professional, warm, neutral | PVC | Primary voice, must sound great |
| Sales Lead (Sam) | Confident, energetic | PVC | Lead calls, represents company |
| Sales Reps 01-10 | Varied (diverse voices) | IVC | Different voices for natural feel |
| IR (Riley) | Calm, authoritative | PVC | Investor-facing, trust matters |

## Security Considerations

### API Key Protection
- `ELEVENLABS_API_KEY` stored in `.env` (gitignored), never in client code
- All client connections use signed URLs (server generates, client connects)
- Signed URLs expire after 15 minutes

### Call Recording & Compliance
- ElevenLabs stores conversation data per their retention policy
- Transcripts stored in Redis with configurable TTL (default 7 days)
- Call recording disclosure: agents must identify as AI at start of call
- Consider state-by-state recording consent laws (one-party vs two-party)

### Phone Number Validation
- All phone numbers validated as E.164 format before API calls
- Reject invalid formats, log attempts

### WebSocket Security
- All connections over `wss://` (TLS encrypted)
- Signed URLs are single-use tokens
- Connection drops trigger cleanup (active call status → ended)

### PII in Transcripts
- Call transcripts may contain PII (names, phone numbers, business details)
- Redis TTL ensures automatic cleanup (7 days for transcripts, 30 days for action items)
- No transcript data sent to third parties beyond ElevenLabs (processing) and Redis (storage)
- Persistent memories extracted from calls should be anonymized where possible

### Voice Cloning Ethics
- Only clone voices with explicit consent
- Never clone real people's voices without authorization
- All agent voices should be clearly synthetic (not impersonating real individuals)
- Agents must disclose AI nature at start of every call
