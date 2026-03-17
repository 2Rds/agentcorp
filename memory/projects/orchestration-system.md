# Orchestration System

**Status:** Active (25% progress)
**Priority:** P0 Critical
**Notion page:** BlockDrive HQ > Project Hub > Orchestration System
**Started:** 2026-03-03

## What It Is
The agentic workforce orchestration layer: cognitive agent employees, shared memory, n8n automation hub, Notion as knowledge store, Slack as communication layer.

## Key Results
1. @blockdrive-cfa and @blockdrive-ea deployed and communicating via shared memory
2. n8n routing DocSend events to agents
3. Investor Pipeline DB auto-populated from agent intelligence

## Component Projects
| Project | Status | Priority | Progress |
|---------|--------|----------|----------|
| Notion Workspace Setup | Active | P1 High | 75% |
| n8n Automation Hub | Planning | P1 High | Not Started |
| Seed Round Data Room (DocSend) | Active | P0 Critical | 25% |
| v4.0.0 On-Chain Delegate Authority | Paused (Phase 1 done) | — | Phase 1 complete |

## Stack
- **Task management:** Linear (developer UX + API)
- **Communication:** Slack (investors, partners, internal)
- **Knowledge:** Notion (CRM, decision log, project hub)
- **Investor analytics:** DocSend Advanced ($215/yr via Mercury)
- **Persistent memory:** Redis (cross-agent, vector search)
- **Automation:** n8n (webhooks, cron jobs, routing)

## Why It's P0
Orchestration directly accelerates fundraising. v4.0.0 was paused because orchestration has higher ROI than backend refactoring for on-chain features.
