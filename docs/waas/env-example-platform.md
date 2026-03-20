# WaaS Platform Environment Variables

Reference template for agent deployments. Includes voice integration variables for Phase 2.

```bash
# ─── WaaS Agent Environment Variables ─────────────────────────────────────────
# Copy to .env and fill in values for each agent deployment.

# ─── Required ─────────────────────────────────────────────────────────────────

# Claude Opus 4.6 (primary brain — direct Anthropic API)
ANTHROPIC_API_KEY=sk-ant-...

# Supabase (auth + org membership verification)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ─── Redis (Upstash) ─────────────────────────────────────────────────────────
# TCP connection (for Node.js agents — standard redis protocol over TLS)
REDIS_URL=rediss://default:YOUR_PASSWORD@us1-XXXX-XXXX.upstash.io:6379

# REST API (for Cloudflare Workers — HTTP-based, no TCP needed)
UPSTASH_REDIS_REST_URL=https://us1-XXXX-XXXX.upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...

# ─── Model Routing (optional — falls back to Claude-only) ────────────────────

# Google AI Studio (Gemini 3 Flash — vision, search grounding, structured gen)
GOOGLE_AI_API_KEY=AIza...

# xAI (Grok 4.1 Fast — X/Twitter, classification)
XAI_API_KEY=xai-...

# Cohere (embed + rerank for plugin matching)
COHERE_API_KEY=...

# ─── Persistent Memory ──────────────────────────────────────────────────────
# Redis-backed persistent memory uses REDIS_URL above + Cohere embeddings.
# COHERE_API_KEY is required for embedding generation (see Model Routing above).

# ─── Inter-Agent Messaging (optional) ────────────────────────────────────────

# Per-agent Telegram bot (for human-to-agent + legacy inter-agent)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# ─── Cloudflare AI Gateway (optional — analytics, caching, retries) ──────────

# Route direct provider API calls through CF AI Gateway
CF_GATEWAY_ACCOUNT_ID=...
CF_GATEWAY_ID=...

# ─── ElevenLabs (voice transport — dual-mode agents) ─────────────────────────

# API key (all voice features: TTS, STT, Conversational AI, phone calls)
ELEVENLABS_API_KEY=sk_...

# Per-agent voice agent ID (created via ElevenLabs dashboard or API)
ELEVENLABS_AGENT_ID=agent_...

# Per-agent voice ID (from ElevenLabs voice library or custom clone)
ELEVENLABS_VOICE_ID=...

# Twilio phone number ID (for agents that make/receive calls)
ELEVENLABS_PHONE_NUMBER_ID=...

# ─── Agent Config ────────────────────────────────────────────────────────────

# Port for this agent's Express server (each agent needs a unique port)
PORT=3001

# Knowledge-work plugins directory (relative or absolute)
PLUGINS_DIR=./plugins
```
