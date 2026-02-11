# BlockDrive CFO v1.0.0

AI-powered CFO platform for seed-stage startups. Natural language financial modeling, cap table management, investor data rooms, document intelligence, and persistent organizational memory.

**Live:** [cfo.blockdrive.co](https://cfo.blockdrive.co)

## Architecture

Two-tier system: a React frontend deployed to Vercel, and an Express agent server powered by the Claude Agent SDK with multi-model orchestration and persistent memory.

### Multi-Model Intelligence

| Model | Provider | Role |
|-------|----------|------|
| Claude Opus 4.6 | Anthropic (direct) | Primary reasoning, tool orchestration, streaming chat |
| Kimi K2.5 | OpenRouter | Structured data generation (financial rows, cap table, SQL) |
| Gemini 3 Flash | OpenRouter | Document vision, embeddings, RAG |
| Gemini 2.5 Flash Lite | OpenRouter | Lightweight tasks at minimal cost |
| Sonar Pro | OpenRouter | Web research and intelligence gathering |
| Grok 4 | OpenRouter | Advanced reasoning |

Claude uses the Anthropic API directly (Max plan). All other models route through **OpenRouter** via a single API key — no per-provider SDKs or keys.

### Persistent Memory (Mem0)

Mem0 is the sole knowledge store — no dual-write, no Supabase fallback. The agent builds institutional memory that compounds over every conversation.

- **Graph memory** — Entity relationships auto-extracted (investors → rounds → valuations)
- **6 custom categories** — `financial_metrics`, `fundraising`, `company_operations`, `strategic_decisions`, `investor_relations`, `financial_model`
- **Multi-model attribution** — Every memory tagged with `agent_id` (opus-brain, k2-builder, gemini-docs)
- **Session memory** — Per-conversation context via `run_id`
- **System prompt enrichment** — Relevant org memories loaded before each query
- **Feedback mechanism** — Self-healing memory quality (POSITIVE/NEGATIVE/VERY_NEGATIVE)
- **Comprehensive knowledge depth** — Deep extraction from every interaction
- **Webhooks** — Real-time memory event notifications

### Frontend

React 18 + TypeScript + Vite. Supabase for auth, database (PostgreSQL), storage, and realtime subscriptions.

| Page | Purpose |
|------|---------|
| **Chat** | Streaming AI CFO conversations with tool-use rendering |
| **Knowledge** | Document uploads, AI extraction, and knowledge graph visualization |
| **Dashboard** | P&L, burn/runway, cap table, and OpEx charts (Recharts) |
| **Investors** | DocSend-style shareable links with engagement analytics |
| **Docs** | Comprehensive platform documentation |
| **Data Room** | Public investor portal with password/email gating |

### Agent Server (`agent/`)

Express server with the Claude Agent SDK. 23 MCP tools across 8 domains.

**Tools:**
- Financial model (3): get, upsert (with K2.5 plan generation + memory), delete
- Derived metrics (1): compute burn, runway, MRR, gross margin
- Cap table (3): get, upsert (with graph memory), delete
- Knowledge base (5): search, add, update, delete, rate_quality
- Investor links (4): CRUD with `enable_data_room` support
- Documents (2): upload with Gemini vision processing + memory
- Document RAG (1): `query_documents` via Gemini + pgvector
- Analytics (1): natural language → SQL → chart suggestion
- Web fetch (1), headless browser (1), excel export (1)

**Routes:**
- `POST /api/chat` — Streaming AI chat with memory enrichment
- `GET /api/knowledge/graph` — Knowledge graph via Mem0 graph API
- `GET/POST /dataroom/:slug/*` — Public investor data room
- `POST /api/webhooks/mem0` — Memory event webhooks
- `GET /health` — Health check

## Quick Start

### Frontend

```bash
npm install
npm run dev          # Starts on port 8080
```

### Agent Server

```bash
cd agent
npm install
npm run dev          # Starts on port 3001 with hot reload
```

### Environment Variables

**Frontend (`.env`):**
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_AGENT_URL=http://localhost:3001   # Falls back to edge functions
```

**Agent Server (`agent/.env`):**
```
# Required
ANTHROPIC_API_KEY=...              # Claude Max plan (direct, not via OpenRouter)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...             # All non-Claude models (K2.5, Gemini, Sonar, Grok)
MEM0_API_KEY=...                   # Persistent organizational memory

# Optional
PORT=3001
CORS_ORIGINS=http://localhost:8080
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Charts | Recharts |
| State | TanStack Query (server), React Context (auth) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| Agent | Express, Claude Agent SDK, Zod |
| Multi-model | OpenRouter (Kimi K2.5, Gemini 3 Flash, Sonar Pro, Grok 4) |
| Memory | Mem0 Platform (graph memory, custom categories, feedback) |
| Deployment | Vercel (frontend), Docker (agent) |

## Scripts

```bash
# Frontend
npm run dev          # Dev server (port 8080)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest
npm run test:watch   # Watch mode

# Agent
cd agent
npm run dev          # Dev server with hot reload (tsx watch)
npm run build        # TypeScript compile
npm run start        # Production (node dist/)
```

## License

Private. Copyright BlockDrive Inc.
