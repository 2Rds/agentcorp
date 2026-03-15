# WaaS — Workforce-as-a-Service

Cognitive agent orchestration platform for enterprise operations. Namespace-isolated, memory-enriched AI agents that communicate, delegate, and execute across departments.

**Live:**
- AgentCorp Dashboard: [corp.blockdrive.co](https://corp.blockdrive.co)
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
# Optional: VITE_SENTRY_DSN, VITE_POSTHOG_KEY, VITE_POSTHOG_HOST
```

**CFO Agent (`agent/.env`):**
```
ANTHROPIC_API_KEY=...              # Claude Opus 4.6
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...             # Non-Claude models
REDIS_URL=...                      # Persistent memory + vector search
COHERE_API_KEY=...                 # Embeddings + reranking
# Optional: PORT, CORS_ORIGINS, CF_*, GOOGLE_SERVICE_ACCOUNT_KEY_FILE, GOOGLE_SERVICE_ACCOUNT_KEY_JSON, NOTION_API_KEY, SENTRY_DSN, POSTHOG_API_KEY, POSTHOG_HOST
```

**EA Agent (`agents/ea/.env`):**
```
ANTHROPIC_API_KEY=...              # Claude Opus 4.6
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...
REDIS_URL=...                      # Persistent memory + vector search
COHERE_API_KEY=...                 # Embeddings + reranking
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
├── agents/compliance/      # CCA Agent "Parker" — Agent SDK, 10 tools (port 3005)
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
| **Alex** (EA) | Executive Assistant — scheduling, comms, cross-dept coordination | Anthropic Messages API + tool loop | 7-14 | **Deployed** |
| **Morgan** (CFA) | Financial modeling, cap table, investor data rooms, analytics | Claude Agent SDK + MCP | 31 | **Deployed** |
| **Jordan** (COA) | Operations — workforce management, cross-dept coordination | Agent SDK + @waas/runtime | 13 | **Built** |
| **Taylor** (CMA) | Marketing — content, campaigns, SEO, X/Twitter | Agent SDK + @waas/runtime | 11 | **Built** |
| **Parker** (CCA) | Governance — regulatory audit, risk, policy (Granite 4.0) | Agent SDK + @waas/runtime | 10 | **Built** |
| **Casey** (Legal) | Contracts, IP portfolio, legal review (Grok 2M context) | Agent SDK + @waas/runtime | 11 | **Built** |
| **Sam** (Sales) | Pipeline, prospecting, proposals, call prep | Agent SDK + @waas/runtime | 12 | **Built** |

## Features

- **AgentCorp Workspace UI** — 7 department workspaces with agent chat, task management, and department-specific dashboards
- **AI Agent Chat** — Streaming SSE chat with Markdown rendering, conversation persistence, per-agent URL routing
- **Agent Health Monitoring** — Real-time agent status dashboard with online/offline/unknown tracking
- **Financial Model** — SaaS-template with scenario toggling, derived metrics (burn, runway, MRR)
- **Cap Table** — Equity tracking across funding rounds
- **Investor Portal** — DocSend-style links with password gating and analytics
- **Knowledge Base** — Document uploads with Gemini vision, semantic search, vector search via Redis
- **Notion Integration** — Read/write access to Notion databases (Decision Log, Project Hub, Investor Pipeline) with scope enforcement
- **PDF Generation** — Branded investor documents (exec summaries, metrics one-pagers) via Playwright HTML→PDF
- **Google Sheets** — Model sync via service account with domain-wide delegation
- **Multi-Model Orchestration** — 9 models via OpenRouter with semantic caching
- **7-Agent Network** — EA, CFA, COA, CMA, Compliance, Legal, Sales with specialized model stacks
- **Governance System** — Dual-mode (startup/enterprise) with daily spend tracking, C-Suite Telegram approval flow, and per-agent budget enforcement
- **Supabase Realtime** — Live frontend updates via postgres_changes subscriptions on 17 department tables with TanStack Query cache invalidation
- **Database Webhooks** — pg_net triggers → Edge Function → agent server notifications on high-value table events
- **Supabase Vault** — pgsodium encrypted secret storage + pg_net for database-level HTTP calls
- **Inter-Agent Messaging** — MessageBus with dual-mode persistence (Redis Streams + LIST fallback) + Telegram transport
- **Namespace Isolation** — Scoped Redis per department, fail-closed enforcement
- **SSRF Protection** — URL validation blocking private IPs, cloud metadata, internal hosts
- **Observability** — Sentry error tracking + PostHog product analytics across frontend and all 7 agent servers (zero-config when env vars unset)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Supabase (Postgres, Auth, RLS, Edge Functions) |
| CFO Agent | Express, Claude Agent SDK, 31 MCP tools (incl. Notion + PDF) |
| EA Agent | Express, Anthropic Messages API, 7-14 native tools, grammy (Telegram), Slack (Socket Mode) |
| Dept Agents | Express, Agent SDK + @waas/runtime, org-scoped MCP tools |
| Platform | @waas/shared (types), @waas/runtime (execution engine + tool-helpers) |
| Models | Claude Opus 4.6, Gemini 3.1 Pro, Sonar Pro, Grok 4.1 Fast, Granite 4.0, Command A |
| Search | Redis 8.4 (vector search, semantic cache) |
| Memory | Redis (persistent memory with vector search, org-scoped) |
| Observability | Sentry (@sentry/react + @sentry/node), PostHog (posthog-js + posthog-node) |
| Deployment | Vercel (frontend), DigitalOcean App Platform NYC1 (agents), n8n NYC1 (automation) |

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
