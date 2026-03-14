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
├── agents/coa/             # COA Agent "Jordan" — Agent SDK, 13 tools (port 3003)
├── agents/cma/             # CMA Agent "Taylor" — Agent SDK, 11 tools (port 3004)
├── agents/compliance/      # CCO Agent — Agent SDK, 10 tools (port 3005)
├── agents/legal/           # Legal Agent "Casey" — Agent SDK, 11 tools (port 3006)
├── agents/sales/           # Sales Agent "Sam" — Agent SDK, 12 tools (port 3007)
├── packages/shared/        # @waas/shared — types, model registry, namespace, messaging
├── packages/runtime/       # @waas/runtime — Express agent execution engine + tool-helpers
├── docs/waas/              # Platform architecture docs
└── supabase/               # Migrations + edge functions
```

## Agents

| Agent | Role | Runtime | Tools | Status |
|-------|------|---------|-------|--------|
| **Alex** (EA) | Executive Assistant — scheduling, comms, cross-dept coordination | Anthropic Messages API + tool loop | 11 | **Deployed** |
| **Morgan** (CFA) | Financial modeling, cap table, investor data rooms, analytics | Claude Agent SDK + MCP | 31 | **Deployed** |
| **Jordan** (COA) | Operations — workforce management, cross-dept coordination | Agent SDK + @waas/runtime | 13 | **Built** |
| **Taylor** (CMA) | Marketing — content, campaigns, SEO, X/Twitter | Agent SDK + @waas/runtime | 11 | **Built** |
| **CCO** (Compliance) | Governance — regulatory audit, risk, policy (Granite 4.0) | Agent SDK + @waas/runtime | 10 | **Built** |
| **Casey** (Legal) | Contracts, IP portfolio, legal review (Grok 2M context) | Agent SDK + @waas/runtime | 11 | **Built** |
| **Sam** (Sales) | Pipeline, prospecting, proposals, call prep | Agent SDK + @waas/runtime | 12 | **Built** |

## Features

- **AgentCorp Workspace** — Multi-agent chat UI with department-specific workspace pages for all 7 agents
- **Agent Dashboard** — Real-time health monitoring for all deployed agents
- **Streaming AI Chat** — SSE-based chat with each agent via `AgentChat` component + conversation persistence
- **7-Agent Network** — EA, CFA, COA, CMA, Compliance, Legal, Sales with specialized model stacks
- **Executive Assistant** — Autonomous task management, meeting notes, cross-department queries, Telegram interface, 84 knowledge plugins
- **AI CFO** — Financial modeling, cap table, investor data rooms, analytics via 31 MCP tools
- **Multi-Model Orchestration** — 9 models via OpenRouter with semantic caching
- **Notion Integration** — Read/write access to Notion databases with scope enforcement
- **Inter-Agent Messaging** — Redis inbox + Telegram bot-to-bot transport
- **Namespace Isolation** — Scoped Redis + mem0 per department, fail-closed enforcement
- **SSRF Protection** — URL validation blocking private IPs, cloud metadata, internal hosts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Supabase (Postgres, Auth, RLS, Edge Functions) |
| CFO Agent | Express, Claude Agent SDK, 31 MCP tools (incl. Notion + PDF) |
| EA Agent | Express, Anthropic Messages API, 11 native tools, grammy (Telegram) |
| Dept Agents | Express, Agent SDK + @waas/runtime, org-scoped MCP tools |
| Platform | @waas/shared (types), @waas/runtime (execution engine + tool-helpers) |
| Models | Claude Opus 4.6, Gemini 3.1 Pro, Sonar Pro, Grok 4.1 Fast, Granite 4.0, Command A |
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
