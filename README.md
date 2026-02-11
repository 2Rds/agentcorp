# CFO

AI-powered CFO platform for seed-stage startups. Natural language financial modeling, cap table management, investor data rooms, and document intelligence.

**Live:** [cfo.blockdrive.co](https://cfo.blockdrive.co)

## Architecture

Two-tier system: a React frontend deployed to Vercel, and an Express agent server powered by the Claude Agent SDK.

### Frontend

React 18 + TypeScript + Vite. Supabase for auth, database (PostgreSQL), storage, and realtime subscriptions.

- **Chat** — Streaming AI CFO conversations with tool-use rendering
- **Dashboard** — P&L, burn/runway, cap table, and OpEx charts (Recharts)
- **Knowledge** — Document uploads with AI extraction and knowledge graph
- **Investors** — DocSend-style shareable links with engagement analytics
- **Data Room** — Public investor portal with password/email gating

### Agent Server (`agent/`)

Express server with the Claude Agent SDK. Multi-model orchestration:

| Model | Role |
|-------|------|
| Claude Opus 4.6 | Primary reasoning, tool orchestration, chat |
| Kimi K2 (Moonshot) | Structured data generation (financial rows, cap table entries, SQL) |
| Gemini Flash | Document vision, file processing, embeddings, RAG |
| Mem0 | Org-scoped intelligent memory with Supabase fallback |

**20 MCP tools** across 7 domains: financial model (3), derived metrics (1), cap table (3), knowledge base (2), investor links (4), documents (2), document RAG (1), analytics (1), web fetch (1), headless browser (1), excel export (1).

**4 route groups:** `/api/chat`, `/api/knowledge/graph`, `/dataroom/:slug/*`, `/health`.

Features auto-enable based on which API keys are set (Moonshot, Gemini, Mem0). Set `USE_X=false` to explicitly disable.

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
npm run dev          # Starts on port 3001
```

### Environment Variables

**Required:**
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Optional (enable multi-model features):**
```
MOONSHOT_API_KEY=...     # Kimi K2 structured generation
GEMINI_API_KEY=...       # Document vision, embeddings, RAG
MEM0_API_KEY=...         # Intelligent memory
VITE_AGENT_URL=...       # Agent server URL (falls back to edge functions)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Charts | Recharts |
| State | TanStack Query (server), React Context (auth) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| Agent | Express, Claude Agent SDK, Zod |
| Multi-model | OpenAI SDK (Kimi K2), @google/genai (Gemini), Mem0 SDK |
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
