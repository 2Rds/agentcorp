# Voice Strategy & Business Case

## Executive Summary

ElevenLabs integration transforms WaaS from a text-only agent orchestration platform into the first cognitive workforce system with native voice capabilities. By splitting agents into cognitive runtimes (Claude Opus 4.6, deep reasoning) and conversational runtimes (ElevenLabs Flash v2.5, sub-second voice), we avoid the fundamental tradeoff between intelligence and latency. The result: agents that can make phone calls, screen prospects, attend meetings, and respond to voice commands — while retaining full cognitive power for analysis, strategy, and multi-tool execution.

## Mercury Startup Perk

BlockDrive qualifies for the ElevenLabs Startup Grants program through Mercury banking perks.

| Detail | Value |
|---|---|
| **Grant** | 33 million characters (680+ hours Conversational AI) |
| **Duration** | 12 months from activation |
| **Tier** | Scale-level benefits (high concurrency, improved support) |
| **Post-grant** | Auto-converts to Free plan unless upgraded |
| **Estimated value** | ~$3,960/year (Scale tier at $330/mo) |
| **Eligibility** | <25 employees, no prior ElevenLabs grant |
| **Status** | Application pending (free tier API key active for development) |

**Free tier (current):** 10,000 characters/month TTS, ~15 minutes Conversational AI. Sufficient for development and testing.

## Dual-Mode Architecture — Why It Works

The core insight: voice conversations and deep cognitive work have fundamentally incompatible requirements.

| Requirement | Cognitive Mode | Conversational Mode |
|---|---|---|
| **Response latency** | 10-30 seconds acceptable | <1 second mandatory |
| **Model** | Claude Opus 4.6 (max intelligence) | Flash v2.5 (max speed) |
| **Tool access** | 20+ MCP tools, multi-step chains | 3-5 webhook tools (calendar, CRM) |
| **Context window** | Full history + persistent memory + documents | Lightweight prompt + last few turns |
| **Output format** | Structured analysis, reports, JSON | Short conversational sentences |
| **Error tolerance** | Can retry, ask clarification | Must respond instantly, gracefully |

Trying to serve both from a single runtime means either making voice unbearably slow or making analysis superficially fast. The dual-mode split eliminates this tradeoff entirely.

**Key principle:** Same agent identity, same memory, same namespace. Two runtimes. Like a person who answers the phone differently than they write a report — same knowledge, different mode.

## Sales Swarm — The Killer Feature

This is the feature with the most immediate revenue potential and highest pricing power.

### The Math

```
10 conversational agents × 50 calls/day = 500 outbound touches/day
500 touches × 20 business days = 10,000 prospects/month
Average call: 3-5 minutes = ~750 characters TTS per call
500 calls × 750 chars = 375,000 chars/day
Monthly: 375,000 × 20 = 7.5M chars (well within Mercury grant)
```

### The Flow

1. **Morning:** Cognitive sales agent ingests CRM export (500 prospects with context)
2. **9am-5pm:** 10 conversational agents make calls concurrently via batch calling API
3. **Per call:** Greet → qualify (3-5 questions) → score → handle objections → capture interest level
4. **Real-time:** Each call transcript + qualification score → Redis
5. **Evening:** Cognitive sales agent processes all 500 results:
   - Updates CRM pipeline (hot/warm/cold scoring)
   - Drafts personalized follow-up emails for hot leads
   - Generates daily sales report → Slack to Sean
   - Learns from successful calls → updates pitch strategy in persistent memory

### Why This Has Pricing Power

- **Manual SDR cost:** $50-80K/year salary + benefits per rep. 10 reps = $500K-800K/year
- **WaaS Sales Swarm:** Infrastructure cost ~$500/month (ElevenLabs + compute + Twilio). Zero salary.
- **Output:** 500 qualified calls/day vs ~50 calls/day per human SDR
- **Consistency:** Every call follows the script. No bad days. No turnover.
- **Sell price:** $2,000-5,000/month per customer (10-seat swarm). 95%+ margins.

This is not a feature — it's a standalone product.

## Cost Model

### Development Phase (now — Mercury perk pending)

| Resource | Cost | Notes |
|---|---|---|
| ElevenLabs Free tier | $0 | 10K chars/mo, 15 min Conversational AI |
| Twilio phone number | ~$1/mo per number | Pay-as-you-go |
| Twilio voice minutes | ~$0.013/min outbound | US domestic |
| Upstash Redis | $0 | Free tier (256MB, 10K cmd/day) |
| Total dev cost | ~$5/month | Negligible |

### Production Phase (Mercury perk active)

| Resource | Monthly | Notes |
|---|---|---|
| ElevenLabs | $0 (grant) | 33M chars, 680hrs voice |
| Twilio (10 numbers) | ~$10 | Phone numbers |
| Twilio voice (500 calls/day) | ~$200 | ~15K minutes at $0.013/min |
| Upstash Redis | $10 | Pro tier for production |
| Compute (DO droplet) | $24 | 4GB RAM for agent runtimes |
| Total production cost | ~$250/month | For full sales swarm |

### Post-Grant Phase

| Resource | Monthly | Notes |
|---|---|---|
| ElevenLabs Scale | $330 | 2M chars, unlimited Conversational AI |
| Other infra | ~$250 | Same as above |
| Total | ~$580/month | Still >90% margin at $2K+ sell price |

### Cost Per Call

```
ElevenLabs: ~750 chars × ($330 / 2M chars) = $0.12 per call
Twilio: ~3 min × $0.013/min = $0.04 per call
Total: ~$0.16 per outbound call

At 500 calls/day × 20 days = $1,600/month for 10,000 calls
Revenue at $3,000/month = 47% COGS, 53% gross margin
Revenue at $5,000/month = 32% COGS, 68% gross margin
```

## Competitive Positioning

| Platform | Voice | Cognitive | Orchestration | Dual-Mode |
|---|---|---|---|---|
| **WaaS** | ElevenLabs (TTS/STT/Conversational/Phone) | Claude Opus 4.6 | Full (namespace isolation, inter-agent messaging, shared memory) | Yes (cognitive + conversational split) |
| Bland AI | Built-in | GPT-4o (limited) | None | No (voice-only) |
| Vapi | Built-in | Multiple LLMs | Basic | No (voice-only) |
| Retell AI | Built-in | GPT-4 | None | No (voice-only) |
| CrewAI | None | Multiple | Multi-agent | No (text-only) |
| AutoGen | None | Multiple | Multi-agent | No (text-only) |

**WaaS moat:** No other platform combines cognitive agent orchestration (namespace isolation, shared memory, inter-agent messaging, MCP tools) with voice transport. Voice-only platforms lack intelligence. Agent frameworks lack voice. WaaS has both.

## Phased Rollout

### Phase 1: EA Voice (current focus)
- Single dual-mode agent (Executive Assistant)
- Inbound call screening + outbound calls on behalf of Sean
- Validates the cognitive ↔ conversational handoff pattern
- **Timeline:** After core WaaS infrastructure deployed

### Phase 2: Sales Swarm
- 10 conversational-only sales rep agents
- Batch calling infrastructure
- CRM integration (export prospects, import results)
- Daily report pipeline
- **Timeline:** Phase 1 validated + Mercury perk active

### Phase 3: Voice Across All Channels
- Slack voice message support (receive audio → STT → agent → TTS → reply)
- Telegram voice message support
- Web dashboard microphone/speaker integration
- IR agent investor check-in calls
- **Timeline:** After Phase 2 proven in production

### Phase 4: WaaS-as-a-Service Voice
- Customer-facing voice agents (white-label)
- Per-customer voice cloning
- Multi-tenant batch calling
- Voice analytics dashboard
- **Timeline:** Product-market fit confirmed, post-seed funding
