# WaaS — Workforce-as-a-Service

Cognitive agent orchestration platform for enterprise operations. Namespace-isolated, memory-enriched AI agents that communicate, delegate, and execute across departments.

**Live:**
- CFO Dashboard: [cfo.blockdrive.co](https://cfo.blockdrive.co)
- EA Agent (Alex): DigitalOcean App Platform (Telegram: @alex_executive_assistant_bot)

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for Redis, optional)
- Supabase project (`eisiohgjfviwxgdyfnsd.supabase.co`)

### Frontend

```bash
npm install
npm run dev          # http://localhost:8080
```

### CFO Agent

```bash
cd agent
cp .env.example .env   # Fill in API keys
npm install
docker compose up -d   # Start Redis (optional)
npm run dev            # http://localhost:3001
```

### EA Agent

```bash
cd agents/ea
cp .env.example .env   # Fill in API keys
npm install
npm run dev            # http://localhost:3002
```

### Environment Variables

**Frontend (`.env`):**
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_AGENT_URL=http://localhost:3001
```

**CFO Agent (`agent/.env`):**
```
ANTHROPIC_API_KEY=...              # Claude Opus 4.6
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...             # Non-Claude models
MEM0_API_KEY=...                   # Persistent memory
# Optional: PORT, CORS_ORIGINS, COHERE_API_KEY, REDIS_URL, CF_*, GOOGLE_SERVICE_ACCOUNT_KEY_FILE, NOTION_API_KEY
```

**EA Agent (`agents/ea/.env`):**
```
ANTHROPIC_API_KEY=...              # Claude Opus 4.6
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...
MEM0_API_KEY=...
# Optional: PORT (3002), TELEGRAM_BOT_TOKEN, SLACK_BOT_TOKEN, AGENT_MESSAGE_SECRET, NOTION_API_KEY
```

## Architecture

```
waas/
├── src/                    # React 18 frontend (Vercel)
├── agent/                  # CFO Agent — Claude Agent SDK, 31 MCP tools (port 3001)
├── agents/ea/              # EA Agent "Alex" — Anthropic Messages API, 11 tools (port 3002)
├── packages/shared/        # @waas/shared — types, model registry, namespace, messaging
├── packages/runtime/       # @waas/runtime — Express agent execution engine
├── docs/waas/              # Platform architecture docs
└── supabase/               # Migrations + edge functions
```

## Agents

| Agent | Role | Runtime | Status |
|-------|------|---------|--------|
| **Alex** (EA) | Executive Assistant — scheduling, comms, cross-dept coordination | Anthropic Messages API + tool loop | **Deployed** (DO) |
| **CFO** | Financial modeling, cap table, investor data rooms, analytics | Claude Agent SDK + 26 MCP tools | **Deployed** (DO) |
| COA, CMA, IR, Legal, Sales | Planned department agents | @waas/runtime | Planned |

## Features

- **AI CFO Chat** — Streaming Claude Opus 4.6 with org memories and 31 knowledge plugins
- **Executive Assistant** — Autonomous task management, meeting notes, cross-department queries, Telegram interface, 84 knowledge plugins
- **Financial Model** — SaaS-template with scenario toggling, derived metrics (burn, runway, MRR)
- **Cap Table** — Equity tracking across funding rounds
- **Investor Portal** — DocSend-style links with password gating and analytics
- **Knowledge Base** — Document uploads with Gemini vision, semantic search, graph memory
- **Notion Integration** — Read/write access to Notion databases (Decision Log, Project Hub, Investor Pipeline) with scope enforcement
- **PDF Generation** — Branded investor documents (exec summaries, metrics one-pagers) via Playwright HTML→PDF
- **Google Sheets** — Model sync via service account with domain-wide delegation
- **Multi-Model Orchestration** — 9 models via OpenRouter with semantic caching
- **Inter-Agent Messaging** — Redis inbox + Telegram bot-to-bot transport
- **Namespace Isolation** — Scoped Redis + mem0 per department, fail-closed enforcement

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Supabase (Postgres, Auth, RLS, Edge Functions) |
| CFO Agent | Express, Claude Agent SDK, 31 MCP tools (incl. Notion + PDF) |
| EA Agent | Express, Anthropic Messages API, 11 native tools, grammy (Telegram) |
| Platform | @waas/shared (types), @waas/runtime (execution engine) |
| Models | Claude Opus 4.6, Kimi K2.5, Gemini 3 Flash/Pro, DeepSeek V3.2, Sonar Pro |
| Search | Redis 8.4 (vector search, semantic cache) |
| Memory | Mem0 (graph memory, org-scoped, cross-namespace read for EA) |
| Deployment | Vercel (frontend), DigitalOcean App Platform (agents), n8n (automation) |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design and data flows
- [docs/waas/](docs/waas/) — WaaS platform architecture (packages, namespace, messaging)
- [SECURITY.md](SECURITY.md) — Auth, RLS, and security controls
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Roadmap and known limitations
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [CLAUDE.md](CLAUDE.md) — Claude Code project instructions

## Scripts

```bash
# Frontend
npm run dev              # Dev server (port 8080)
npm run build            # Production build
npm run lint             # ESLint
npm run test             # Vitest

# CFO Agent
cd agent && npm run dev  # Hot reload (port 3001)

# EA Agent
cd agents/ea && npm run dev  # Hot reload (port 3002)

# WaaS packages
npm run build:packages   # Build @waas/shared + @waas/runtime
```

## License

Private. Copyright BlockDrive Inc.
