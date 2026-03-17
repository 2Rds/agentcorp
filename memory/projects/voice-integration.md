# Voice Integration (Phase 2)

**Status:** Planned
**Provider:** ElevenLabs (TTS/STT/Conversational AI) + Twilio (phone numbers)
**Also called:** "Phase 2", "voice transport"

## What It Is
Adding voice capability to agents. Three strategies:
1. **Custom LLM** — ElevenLabs manages voice I/O, our agent is the brain via custom_llm endpoint
2. **TTS/STT pipes** — We control UX, ElevenLabs is just speech synthesis/recognition
3. **Batch calling** — ElevenLabs batch API schedules N calls simultaneously

## Milestones
| Milestone | What | Key Deliverables |
|-----------|------|-----------------|
| M1: Foundation | ElevenLabs client + voice transport scaffold | lib/elevenlabs-client.ts, transport/voice.ts, Redis key schema |
| M2: EA Voice | First dual-mode agent (Alex) | ElevenLabs conversational agent, Twilio number, call screening |
| M3: Sales Swarm | 10 sales rep agents + batch calling | 10 voice agents, 500 calls/day, result aggregation |
| M4: Channel Voice | Voice across Slack/Telegram/web | STT/TTS pipes, microphone integration |

## Dual-Mode Agents
Agents with voice share identity, memory, and namespace between cognitive and conversational runtimes. Handoff: call transcript → Redis → cognitive runtime executes follow-ups.

## Cost Projections
| Scale | ElevenLabs | Twilio |
|-------|------------|--------|
| Pilot (2 agents) | Free tier | ~$5/mo |
| Growth (5+10) | Scale ($330/mo) | ~$200/mo |
| Enterprise (10+50) | Scale ($330/mo) | ~$1,000/mo |

**Note:** Mercury ElevenLabs Scale tier perk was NOT approved. Costs are real from day one beyond free tier. Decision to integrate ElevenLabs still stands — dual-mode (cognitive + conversational) architecture provides strong marginal value for agents regardless of subsidy.
