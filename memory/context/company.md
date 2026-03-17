# Company Context

## BlockDrive

Sean Weiss's company. Builds WaaS (cognitive agent platform) and Block Drive Vault (Web3 file storage).

## Tools & Systems

| Tool | Used For | Internal Name / Notes |
|------|----------|----------------------|
| Claude Code | Primary development tool | Opus 4.6, all agents/subagents |
| Supabase | Backend (Postgres, Auth, RLS, Edge Functions) | eisiohgjfviwxgdyfnsd.supabase.co |
| Vercel | Frontend hosting | corp.blockdrive.co |
| DigitalOcean | Agent server hosting (App Platform) | DO, doctl CLI |
| GitHub | Source control | 2Rds/agentcorp, 2rds/block-drive-vault |
| Linear | Project tracking | BlockDrive project |
| Redis Memory | Persistent memory (RediSearch + Cohere embeddings) | Vector search, org-scoped |
| Upstash | Serverless Redis (TLS) | Cache, vectors, message bus |
| n8n | Workflow automation | Self-hosted, n8n.blockdrive.co |
| Telegram | Agent messaging + EA bot | grammy framework |
| ElevenLabs | Voice AI (planned) | TTS/STT, Conversational AI |
| Twilio | Phone numbers (planned) | For voice agents |
| Cloudflare | AI Gateway, Workers, Queues | CF, provider keys mode |
| OpenRouter | Multi-model routing | 9+ models |

## Domains

| Domain | URL | Purpose |
|--------|-----|---------|
| corp.blockdrive.co | Vercel | WaaS frontend |
| n8n.blockdrive.co | DO droplet | Automation hub |
| agentcorp-ghgvq.ondigitalocean.app | DO App Platform | Agent servers |

## Key Architecture Patterns

| Pattern | Description |
|---------|-------------|
| Org-scoped tools | All DB queries scoped by orgId via closure |
| Namespace isolation | ScopedRedisClient + ScopedMemoryClient per department |
| Enrichment pipeline | Promise.allSettled for parallel Redis memory + plugin loading |
| Tool bridge | Native Anthropic API tool defs + handlers (EA pattern) |
| Agentic loop | Claude API loop up to N turns until end_turn |
| Dual-mode | Cognitive + conversational sharing identity and memory |
| Fail-closed | Unregistered agents denied, not allowed |

## Notion Workspace (BlockDrive HQ)

Notion Business plan (6mo free via Mercury perk). Agent-accessible via Notion MCP.

### Core Databases
| Database | Collection ID | Purpose |
|----------|--------------|---------|
| Decision Log | `492613a7-1ab4-43eb-a535-53f086375d0d` | Strategic decisions with rich schema |
| Project Hub | `4fa32110-ae2b-43b6-839c-1d25e84111fe` | Project tracking (status, progress, key results) |
| Investor Pipeline | `b6b30599-0a8a-438d-9218-67d1a8628f31` | Investor CRM + DocSend engagement |
| Org Chart | `14b73131-c253-4500-b52e-3597d450193a` | Agent hierarchy |

### Decision Log Schema
Categories: Strategy, Engineering, Operations, Fundraising
Properties: Decision, Category, Context, Rationale, Options Considered, Impact[], Priority, Status, Reversibility, Owner, Tags[], Date, Review Date, Outcome

### Department Workspace Pages
| Department | Notion Page |
|------------|-------------|
| Executive (Alex EA) | Alex — Executive Assistant Workspace |
| Finance (Morgan CFA) | Morgan — Chief Financial Agent Workspace |
| Investor Relations (Riley IR) | Riley — Investor Relations Workspace |
| Sales (Sam) | Sam — Sales Lead Workspace |
| Operations | Operations Department |
| Marketing | (Taylor — planned) |
| Legal | (Casey — planned) |

### Morning Briefs
Alex (EA) generates daily Morning Brief pages in Notion. Series runs from Feb 20 to present (Mar 9). Covers priorities, open items, calendar, and action items.

## Linear Projects

| Project | Issues | Priority | Status |
|---------|--------|----------|--------|
| Voice Transport — ElevenLabs | WAAS-1 to WAAS-20 | High | In Progress |
| n8n Automation Hub | WAAS-22 to WAAS-37 | High | In Progress |
| BlockDrive (core) | BLO-* | — | Active |
| Architecture Rebuild (BDV) | BLO-36+ | Urgent | In Progress |
| Enterprise Migration Strategy | BLO-79+ | High | Planned |
| v4.0.0 On-Chain Delegate Authority | BLO-62+ | Urgent | Paused after Phase 1 |

## Mercury Banking Perks

| Perk | Value | Status |
|------|-------|--------|
| DigitalOcean | $5K credits | Active |
| DocSend Advanced | 90% off ($215/yr) | Active |
| ElevenLabs Scale | NOT approved | Denied |
| Notion Business | 6 months free | Active |

## Development Conventions

- All agents/subagents MUST use model: "opus" (Opus 4.6)
- Agent servers use "type": "module" with .js import extensions
- EA uses Anthropic Messages API directly (NOT Claude Agent SDK)
- CFO uses Claude Agent SDK with MCP tools
- Promise.allSettled for all parallel operations
- Telegram messages: 4096 char limit, Markdown first then fallback
- Root package.json uses workspaces: ["packages/*"]
