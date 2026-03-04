# Chief Financial Agent v1.0.0

AI-powered CFO platform for seed-stage startups. Streaming AI chat with financial modeling, cap table management, investor data rooms, document intelligence, and persistent organizational memory.

**Live:** [cfo.blockdrive.co](https://cfo.blockdrive.co)

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for Redis)
- Supabase project with auth enabled

### Frontend

```bash
npm install
npm run dev          # http://localhost:8080
```

### Agent Server

```bash
cd agent
cp .env.example .env   # Fill in API keys
npm install
docker compose up -d   # Start Redis
npm run dev            # http://localhost:3001
```

### Environment Variables

**Frontend (`.env`):**
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_AGENT_URL=http://localhost:3001
```

**Agent Server (`agent/.env`):**
```
# Required
ANTHROPIC_API_KEY=...              # Claude Opus 4.6 (direct API)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...             # All non-Claude models
MEM0_API_KEY=...                   # Persistent organizational memory

# Optional
PORT=3001
CORS_ORIGINS=http://localhost:8080
MOONSHOT_API_KEY=...               # Kimi K2.5 direct API
COHERE_API_KEY=...                 # Rerank v3.5
REDIS_URL=redis://localhost:6379
CF_ACCOUNT_ID=...                  # Cloudflare AI Gateway
CF_GATEWAY_ID=...
GOOGLE_CLIENT_ID=...               # Google Sheets integration
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

## Features

- **AI CFO Chat** — Streaming conversation with Claude Opus 4.6, enriched with org memories and 16 knowledge plugins
- **Financial Model** — SaaS-template line items (revenue/COGS/OpEx/headcount/funding), scenario toggling (base/best/worst), derived metrics (burn, runway, MRR, gross margin)
- **Cap Table** — Equity positions with ownership tracking across funding rounds
- **Investor Portal** — DocSend-style shareable links with password gating, email capture, expiry, and view tracking
- **Knowledge Base** — Document uploads with Gemini vision processing, semantic search via Redis, and Mem0 graph memory
- **Google Sheets Integration** — Sync financial model to/from Google Sheets
- **Multi-Model Orchestration** — 9 models via OpenRouter with semantic caching and Cohere reranking
- **Analytics** — Natural language to SQL queries with chart suggestions
- **Excel Export** — Multi-tab workbook generation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Supabase (Postgres, Auth, RLS, Edge Functions, Storage) |
| Agent Server | Express, Claude Agent SDK, 26 MCP tools |
| Models | Claude Opus 4.6, Kimi K2.5, Gemini 3 Flash/Pro, DeepSeek V3.2, Sonar Pro, Granite 4.0 |
| Search | Redis 8.4 (vector search, semantic cache, hybrid search) |
| Memory | Mem0 (graph memory, entity extraction, org-scoped, 6 categories) |
| Infrastructure | Cloudflare AI Gateway (optional), Docker Compose |
| Deployment | Vercel (frontend), Docker (agent server) |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design and data flows
- [SECURITY.md](SECURITY.md) — Auth, RLS, and security controls
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Roadmap and known limitations
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [CLAUDE.md](CLAUDE.md) — Claude Code project instructions

## Scripts

```bash
# Frontend
npm run dev          # Dev server (port 8080)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest

# Agent server
cd agent
npm run dev          # Dev server with hot reload (port 3001)
npm run build        # TypeScript compile
npm run start        # Production (node dist/)
```

## License

Private. Copyright BlockDrive Inc.
