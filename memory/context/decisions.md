# Strategic Decisions

Extracted from Notion Decision Log (BlockDrive HQ > Decision Log database).
Decision Log DB: `collection://492613a7-1ab4-43eb-a535-53f086375d0d`

## Critical Decisions

### Disqualify Chinese-origin AI Models
- **Date:** 2026-03-04 | **Category:** Strategy | **Status:** Decided
- **Models removed:** Kimi K2.5, DeepSeek V3.2/Speciale
- **Rationale:** Trust non-negotiable in blockchain/fintech. K2.5 had 64% hallucination rate. DeepSeek banned by US gov agencies (data sovereignty). Domain-specific alternatives (Gemini, Sonar) fill every gap.
- **Reversibility:** Easily Reversible

### Eliminate Sonnet 4.6 — Opus 4.6 for All Agents
- **Date:** 2026-03-04 | **Category:** Engineering | **Status:** Decided
- **Rationale:** Sonnet consumes 27.6% MORE tokens than Opus for identical tasks (74M vs 58M). Per-task savings drops from 40% to ~12% with retries. Opus GPQA 91.3% vs Sonnet 74.1%. Persistent memory compounds Opus's superior reasoning. Domain models (Gemini, Sonar, Cohere, Granite) fill specialty gaps better than Sonnet.
- **Reversibility:** Easily Reversible

### Pause v4.0.0 to Prioritize Orchestration System
- **Date:** 2026-03-01 | **Category:** Strategy | **Status:** Decided
- **Context:** v4.0.0 Phase 1 (Solana program changes) complete on devnet. Phases 2-5 paused.
- **Rationale:** Orchestration directly accelerates fundraising (investor pipeline automation, CFO agent for financial modeling, IR agent for Q&A). v4.0.0 Phases 2-5 are backend/frontend work that doesn't unlock new investor capabilities. Phase 1 (on-chain program) is hardest part and already done.
- **Review date:** 2026-04-01

### Deploy EA First, Then COA
- **Date:** 2026-03-03 | **Category:** Strategy | **Status:** Decided
- **Original plan:** Deploy IR next
- **Rationale:** EA provides immediate productivity (email triage, calendar, meeting prep via Notion Mail/Calendar). COA creates management layer needed before scaling departments. Without COA, each agent reports directly to Sean — doesn't scale.

### Single Server + Namespace Isolation + Compliance Agent
- **Date:** 2026-03-03 | **Category:** Engineering | **Status:** Decided
- **Architecture:** Namespaces via agent_id scoping + Redis key prefixes per department. COA/EA get cross-namespace read. Compliance Agent (Granite-primary) handles cross-department queries as a governance service, not embedded middleware. One Docker container per customer for SaaS.
- **Rejected:** Single monolith (context pollution), fully segregated servers (loses cross-department intelligence)

### Specialized Model Stacks Per Agent
- **Date:** 2026-03-03 | **Category:** Engineering | **Status:** Decided
- **Pattern:** C-suite heads = Opus-primary + 1-2 role-specific supports. Specialized agents use domain models as primary with Opus for synthesis/judgment. Compliance = Granite-primary. Research = Sonar + Gemini. Opus 4.6 is the constant across all agents.
- **Rejected:** Uniform model stack (wastes tokens), single model (misses specialization)

## High Priority Decisions

### Orchestration Stack: Linear + Slack + Notion + DocSend + Redis Memory
- **Date:** 2026-03-01 | **Category:** Operations | **Status:** Decided
- **Rationale:** Linear = best dev UX + API for agents. Slack = investor/partner comms. Notion = structured DBs for CRM + decision log + project hub. DocSend = industry-standard fundraising analytics. Redis = cross-agent persistent memory with vector search.

### Adopt Agentic C-Suite Naming
- **Date:** 2026-03-03 | **Category:** Strategy | **Status:** Decided
- **Pattern:** Chief X Agent (CFA, COA, CMA) with junior agents underneath. Maps to cognitive-agent-template: `new-employee` = department head, `add-team-member` = junior. COA as VP/General Manager for cross-department coordination.
- **Future:** "Agentic C-Suite Agents as a Service" productization

### Use cognitive-agent-template for All Agents
- **Date:** 2026-03-02 | **Category:** Engineering | **Status:** Decided
- **Rationale:** Battle-tested scaffolding with three-channel stack (web, Slack, Telegram), proper TypeScript patterns, consistent architecture.

### Cowork Knowledge Plugins as Agent OS Blueprint
- **Date:** 2026-03-03 | **Category:** Engineering | **Status:** Decided
- **Pattern:** CLAUDE.md = agent working memory. memory/ = deep knowledge. Productivity plugin = task lifecycle. cognitive-agent-template = scaffolding. Each deployed agent ships with these patterns.

### Deploy on DigitalOcean ($5K Credits)
- **Date:** 2026-03-02 | **Category:** Engineering | **Status:** Decided
- **Rationale:** $5K startup credits = free for 12+ months. App Platform supports Docker containers.

### Adopt DocSend Advanced for Seed Round
- **Date:** 2026-03-01 | **Category:** Fundraising | **Status:** Decided
- **Cost:** $215/yr (90% off via Mercury perk)
- **Features:** Per-investor link tracking, page-by-page engagement analytics, NDA enforcement. Analytics feed into @blockdrive-ir agent for automated follow-up.

### Integrate ElevenLabs for Voice Transport
- **Date:** 2026-03-04 | **Category:** Engineering | **Status:** Decided
- **Mercury perk:** NOT approved — costs are real from day one beyond free tier. Decision still stands: dual-mode (cognitive + conversational) architecture has strong marginal value regardless of subsidy.
- **Architecture:** Dual-mode agents — cognitive (Opus 4.6, 10-30s) + conversational (Flash v2.5, <1s). Same identity + memory.
- **Sales Swarm:** 10 agents x 50 calls/day = 500 touches. Cost ~$0.16/call. Sellable $2K-5K/mo per customer, 50-68% margins.
- **Phases:** (1) EA Voice → (2) Sales Swarm → (3) All channels → (4) White-label

### Replace Clerk Auth with Native Supabase Auth
- **Date:** 2026-03-03 | **Category:** Engineering | **Status:** Completed
- **Outcome:** Replaced Clerk with native Supabase email+password auth. Uses `auth.uid()` UUID-based RLS. Auth middleware verifies Supabase `getUser()` token with 5-min TTL cache + org membership check. Eliminates Clerk dependency + cost entirely.
