# WaaS Platform

**Full name:** Workforce-as-a-Service
**Codename:** waas (formerly "cfo")
**GitHub:** 2Rds/agentcorp (renamed from 2rds/waas on 2026-03-14)
**Status:** Active — EA + CFA deployed, 5 agents planned

## What It Is
Cognitive agent orchestration platform. Builds namespace-isolated, memory-enriched, inter-communicating AI agents for enterprise operations. Think: AI C-Suite.

## Architecture
- **Frontend:** React 18 + Vite + shadcn/ui + Tailwind → Vercel (corp.blockdrive.co)
- **CFO Agent:** Express + Claude Agent SDK, 31 MCP tools → DO App Platform (port 3001)
- **EA Agent:** Express + Anthropic Messages API, 11 native tools → DO App Platform (port 3002)
- **Backend:** Supabase (Postgres, Auth, RLS, Edge Functions)
- **Memory:** Redis (org-scoped persistent memory with vector search)
- **Cache:** Upstash Redis (semantic cache, vectors, message bus)
- **Automation:** n8n (self-hosted DO droplet, n8n.blockdrive.co)

## Packages
- `@waas/shared` — Pure types + logic (zero runtime deps)
- `@waas/runtime` — Express agent execution engine

## Key Milestones
- v1.0.0: Infrastructure + CFO Agent (complete)
- Current: EA Agent deployed, orchestration system active (P0)
- v4.0.0: On-Chain Delegate Authority — Phase 1 done (devnet), Phases 2-5 paused
- Next: COA agent, n8n automation hub, voice integration

## Current Priority: Orchestration System (P0)
v4.0.0 paused to prioritize orchestration (accelerates fundraising). Components:
- Notion workspace (75% complete) — Decision Log, Project Hub, Investor Pipeline DBs
- n8n Automation Hub (planning) — 8 workflows connecting DocSend/Notion/Slack/Linear
- Seed Round Data Room (25%) — DocSend Advanced with per-investor tracking
- Agent deployment order: EA (done) → COA → remaining departments

## Implementation Phases
1. Infrastructure (done) — shared/runtime packages, model router, namespace isolation
2. Agent migration (in progress) — move CFO to waas runtime
3. EA Agent (done) — deployed with Telegram bot, 7 native tools
4. Orchestration system (active, P0) — Notion + n8n + DocSend + Linear + Slack + Redis memory
5. COA Agent (next) — management layer before scaling departments
6. Voice transport (planned) — M1 foundation, M2 EA voice, M3 sales swarm, M4 channel voice
7. Platform infra (planned) — CLI scaffold, health dashboard, CI/CD
