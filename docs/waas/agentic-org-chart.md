# Agentic C-Suite — Org Chart

## Visual Hierarchy

```
Sean Weiss (CEO, Human)
│
├── Alex — Executive Assistant ════════════════ [DUAL-MODE]
│   │   Cognitive: Claude Opus 4.6, full MCP tools, Slack/Telegram/Web/Email
│   │   Voice: Flash v2.5, Twilio phone, call screening, outbound calls, Zoom
│   │
│   └── Alex Voice — EA Conversational Runtime ─── [CONVERSATIONAL ONLY]
│       Dedicated ElevenLabs agent, custom_llm → EA cognitive /chat
│       Handles real-time phone conversations, turn-taking, VAD
│
├── Jordan — Chief Operating Agent ════════════ [COGNITIVE ONLY]
│   │   Oversees all department heads. Workforce operations, process optimization,
│   │   agent performance monitoring, resource allocation.
│   │
│   ├── Morgan — Chief Financial Agent ════════ [COGNITIVE ONLY]
│   │   │   Financial modeling, burn rate tracking, revenue forecasting,
│   │   │   investor document preparation, budget management.
│   │   │   TTS-only: verbal financial briefings (no phone calls).
│   │   │
│   │   └── Riley — Investor Relations ════════ [DUAL-MODE]
│   │       Cognitive: Pipeline analysis, engagement scoring, report generation
│   │       Voice: Investor check-in calls, relationship maintenance
│   │
│   ├── Taylor — Chief Marketing Agent ════════ [COGNITIVE ONLY]
│   │       Content strategy, brand voice, social media, campaign analysis,
│   │       competitive intelligence. No voice (content is written).
│   │
│   ├── Casey — Legal & Compliance ════════════ [COGNITIVE ONLY]
│   │       Contract review, regulatory compliance, policy drafting,
│   │       risk assessment. No voice (legal work is document-based).
│   │
│   └── Sam — Sales Lead ═════════════════════ [DUAL-MODE]
│       │   Cognitive: Pipeline strategy, CRM analysis, pitch optimization,
│       │   follow-up email drafting, daily report generation.
│       │   Voice: Can make strategic calls (high-value prospects, partnerships).
│       │
│       ├── Sales Rep 01 ──────────────────── [CONVERSATIONAL ONLY]
│       ├── Sales Rep 02 ──────────────────── [CONVERSATIONAL ONLY]
│       ├── Sales Rep 03 ──────────────────── [CONVERSATIONAL ONLY]
│       ├── Sales Rep 04 ──────────────────── [CONVERSATIONAL ONLY]
│       ├── Sales Rep 05 ──────────────────── [CONVERSATIONAL ONLY]
│       ├── Sales Rep 06 ──────────────────── [CONVERSATIONAL ONLY]
│       ├── Sales Rep 07 ──────────────────── [CONVERSATIONAL ONLY]
│       ├── Sales Rep 08 ──────────────────── [CONVERSATIONAL ONLY]
│       ├── Sales Rep 09 ──────────────────── [CONVERSATIONAL ONLY]
│       └── Sales Rep 10 ──────────────────── [CONVERSATIONAL ONLY]
│           Pure calling agents. ElevenLabs-native, no cognitive runtime.
│           Each has unique voice, dedicated Twilio number.
│           Batch calling: 50 calls/day each = 500 total.
```

## Agent Detail Table

| Agent | ID | Tier | Department | Reports To | Mode | Channels | Voice Model | Status |
|---|---|---|---|---|---|---|---|---|
| Alex — Executive Assistant | blockdrive-ea | Executive | Executive | Sean | Dual-Mode | Web, Slack, Telegram, Email, Voice, Phone | Flash v2.5 | In Development |
| Alex Voice — EA Conversational | blockdrive-ea-voice | Executive | Executive | EA (cognitive) | Conversational Only | Phone | Flash v2.5 | Planned |
| Jordan — Chief Operating Agent | blockdrive-coa | Executive | Operations | Sean | Cognitive Only | Web, Slack, Telegram | N/A | Planned |
| Morgan — Chief Financial Agent | blockdrive-cfa | Dept Head | Finance | COA | Cognitive Only | Web, Slack, Telegram | Turbo v2 (TTS only) | Planned |
| Riley — Investor Relations | blockdrive-ir | Junior | Finance | CFA | Dual-Mode | Web, Slack, Telegram, Phone | Flash v2.5 | Planned |
| Taylor — Chief Marketing Agent | blockdrive-cma | Dept Head | Marketing | COA | Cognitive Only | Web, Slack, Telegram | N/A | Planned |
| Casey — Legal & Compliance | blockdrive-legal | Dept Head | Legal | COA | Cognitive Only | Web, Slack | N/A | Planned |
| Sam — Sales Lead | blockdrive-sales | Dept Head | Sales | COA | Dual-Mode | Web, Slack, Telegram, Phone | Flash v2.5 | Planned |
| Sales Rep 01 | blockdrive-sales-01 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |
| Sales Rep 02 | blockdrive-sales-02 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |
| Sales Rep 03 | blockdrive-sales-03 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |
| Sales Rep 04 | blockdrive-sales-04 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |
| Sales Rep 05 | blockdrive-sales-05 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |
| Sales Rep 06 | blockdrive-sales-06 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |
| Sales Rep 07 | blockdrive-sales-07 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |
| Sales Rep 08 | blockdrive-sales-08 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |
| Sales Rep 09 | blockdrive-sales-09 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |
| Sales Rep 10 | blockdrive-sales-10 | Junior | Sales | Sales Lead | Conversational Only | Phone | Flash v2.5 | Planned |

## Mode Assignment Rationale

### Why Each Agent Gets Its Mode

**Dual-Mode (cognitive + conversational):**

| Agent | Why Dual-Mode |
|---|---|
| **EA (Alex)** | The primary human-facing agent. Screens calls, makes calls on Sean's behalf, attends meetings. Needs full cognitive power for complex tasks AND real-time voice for phone interactions. |
| **IR (Riley)** | Investor relationships require personal touch. Weekly check-in calls maintain engagement. Cognitive side processes pipeline data and generates reports. |
| **Sales Lead (Sam)** | Strategic sales calls (partnerships, enterprise deals) require the sales lead's full context. Also orchestrates the sales swarm cognitively. |

**Cognitive Only:**

| Agent | Why Cognitive Only |
|---|---|
| **COA (Jordan)** | Internal operations role. Manages other agents, monitors performance, allocates resources. No external-facing phone calls needed. |
| **CFA (Morgan)** | Financial analysis is document-based. Spreadsheets, models, reports. Gets TTS for verbal briefings but doesn't need conversational ability. |
| **CMA (Taylor)** | Marketing content is written (blog posts, social media, campaigns). No phone-based marketing activities. |
| **Legal (Casey)** | Legal work is document review, contract analysis, policy drafting. Voice would add no value. |

**Conversational Only:**

| Agent | Why Conversational Only |
|---|---|
| **Sales Reps 01-10** | Pure calling machines. They follow a script, qualify prospects, and capture data. No need for deep reasoning — the Sales Lead does the thinking. These are ElevenLabs-native agents with a webhook back to our cognitive layer for context. |
| **EA Voice** | The dedicated voice runtime for the EA. Exists as a separate ElevenLabs agent that routes to the EA's cognitive /chat endpoint via custom_llm. |

## Scaling Notes

### Adding Sales Reps
The swarm scales horizontally. To add more reps:
1. Create new ElevenLabs conversational agent (clone config from existing rep)
2. Assign unique voice (IVC clone from audio sample)
3. Provision new Twilio phone number
4. Add to batch calling pool
5. No changes to cognitive Sales Lead — it processes all results regardless of rep count

### Adding New Departments
New departments follow the same pattern:
1. Create cognitive agent with `AgentConfig` (model stack, scope, channels, plugins)
2. If voice needed: add `VoiceConfig` to agent config
3. If dedicated callers needed: create conversational-only junior agents
4. Register in `AGENT_REGISTRY`

### Cost Scaling

| Scale | Agents | Monthly ElevenLabs | Monthly Twilio | Notes |
|---|---|---|---|---|
| Pilot | 2 dual-mode | Free tier | ~$5 | EA + IR only |
| Growth | 5 dual + 10 calling | Mercury grant ($0) | ~$200 | Full sales swarm |
| Enterprise | 10 dual + 50 calling | Scale ($330) | ~$1,000 | Multi-team, high volume |

## Future Agents (Roadmap)

| Agent | Department | Projected Mode | Rationale |
|---|---|---|---|
| Customer Success Lead | Support | Dual-Mode | Customer check-in calls, onboarding walkthroughs |
| Support Reps 01-05 | Support | Conversational Only | Handle inbound support calls |
| Recruiter | HR | Dual-Mode | Phone screen candidates |
| PR Agent | Marketing | Dual-Mode | Media interviews, podcast guest coordination |
