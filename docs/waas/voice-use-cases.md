# Voice Use Cases & Scenarios

Detailed scenario walkthroughs for every voice-enabled agent interaction in WaaS. Each use case includes trigger, data flow, data captured, and expected outcome.

---

## Use Case 1: EA — Inbound Call Screening

**Agent:** Alex (Executive Assistant) — Dual-Mode
**Mode:** Conversational runtime
**Channel:** Voice (Twilio inbound)

### Trigger
Phone call to EA's dedicated Twilio number (published on business cards, website contact page, email signature).

### Flow
```
1. Phone rings → Twilio routes to ElevenLabs Conversational AI agent
2. EA answers: "Hi, this is Alex from BlockDrive. How can I help you?"
3. Caller states purpose
4. EA qualifies (via custom_llm → cognitive agent, lightweight prompt):
   - "May I ask your name and which company you're with?"
   - "What's the nature of your call?"
   - "Is this regarding an existing conversation or something new?"
5. EA determines urgency + relevance:
   - Investor inquiry → high priority, warm transfer or immediate callback
   - Sales pitch → low priority, polite decline + "I'll pass along your info"
   - Partner/customer → medium priority, schedule callback
   - Spam/robocall → end call gracefully
6. EA wraps up: "Thank you, [name]. I'll make sure Sean gets your message."
7. Call ends → transcript + qualification data → Redis
8. Cognitive EA processes:
   - Slack notification to Sean with caller summary + urgency score
   - If high priority: DM with "Call [name] back at [number] — [reason]"
   - Logs call in mem0 for future reference
```

### Data Captured
| Field | Example |
|---|---|
| Caller name | "Jennifer Park" |
| Company | "Sequoia Capital" |
| Purpose | "Follow-up on seed round materials" |
| Urgency score | 5/5 (investor, active deal) |
| Recommended action | "Call back within 1 hour" |
| Transcript | Full verbatim text |
| Call duration | 2:15 |

### Outcome
Sean never answers cold calls. Every incoming call is pre-qualified, summarized, and prioritized. Investor calls get immediate attention. Spam is filtered. No opportunities missed.

---

## Use Case 2: EA — Outbound Calls on Behalf of Sean

**Agent:** Alex (Executive Assistant) — Dual-Mode
**Mode:** Conversational runtime (triggered by cognitive runtime)

### Trigger
Sean tells EA via Slack: "Call John at Sequoia to confirm our Thursday 2pm meeting and ask if they want me to bring the updated pitch deck."

### Flow
```
1. Cognitive EA receives instruction via Slack
2. Cognitive EA prepares call context:
   - Retrieves John's info from mem0 (last conversation, preferences)
   - Retrieves meeting details from calendar integration
   - Builds dynamic variables for conversational prompt
3. Cognitive EA triggers outbound call via Twilio API:
   - agentId: EA conversational agent
   - toNumber: John's phone (from contacts/CRM)
   - dynamic_variables: { caller_name: "Alex", on_behalf: "Sean Weiss",
     purpose: "confirm Thursday 2pm meeting", ask: "updated pitch deck" }
4. Conversational EA makes the call:
   "Hi John, this is Alex calling on behalf of Sean Weiss at BlockDrive.
    I'm calling to confirm your meeting with Sean this Thursday at 2pm.
    Sean also wanted to know if you'd like him to bring the updated pitch deck."
5. Handles John's response naturally:
   - If confirmed: "Great, I'll let Sean know. See you Thursday!"
   - If needs to reschedule: "Let me check Sean's availability...
     would Friday morning work instead?"
   - If has questions: Answers from context or "I'll have Sean follow up on that"
6. Call ends → transcript → Redis
7. Cognitive EA sends Slack summary to Sean:
   "Called John at Sequoia. Meeting confirmed for Thursday 2pm.
    He'd like the updated deck. Also mentioned they're bringing a partner."
8. Updates calendar with any changes
```

### Data Captured
| Field | Example |
|---|---|
| Contact | John, Sequoia Capital |
| Purpose | Confirm Thursday meeting |
| Outcome | Confirmed, wants updated deck |
| New info | Bringing a partner to the meeting |
| Follow-up | Send updated pitch deck by Wednesday |

### Outcome
Sean delegates a 5-minute task by typing one Slack message. EA handles the call, confirms the meeting, captures new intel, and reports back — all in 3 minutes.

---

## Use Case 3: EA — Low-Urgency Zoom Meetings

**Agent:** Alex (Executive Assistant) — Dual-Mode
**Mode:** Conversational runtime (via Zoom audio integration)

### Trigger
Calendar event tagged `delegate-to-ea` or Sean explicitly tells EA "Take my 3pm vendor sync."

### Flow
```
1. Cognitive EA reviews meeting agenda, attendee list, prior meeting notes (mem0)
2. At meeting time, EA joins Zoom via audio dial-in (no video)
3. EA introduces itself:
   "Hi everyone, I'm Alex, Sean's AI executive assistant. Sean asked me
    to attend today's sync on his behalf. I'll be taking notes and can
    answer questions about our current status."
4. During meeting:
   - Real-time STT captures all speech
   - EA responds to direct questions using context from mem0 + agenda
   - Takes structured notes (decisions, action items, questions)
   - Flags items that need Sean's direct input: "I'll need to check with
     Sean on that and get back to you."
5. Meeting ends:
   - Cognitive EA generates structured summary
   - Extracts action items with owners and deadlines
   - Identifies items needing Sean's attention
6. Sends to Sean via Slack:
   - Meeting summary (3-5 bullet points)
   - Action items (with owner assignments)
   - "Items needing your input" section
   - Full transcript available on request
```

### Constraints
- Audio-only (no video, no screen share)
- Clear disclosure at start: "I'm an AI assistant"
- Cannot make commitments on Sean's behalf beyond pre-authorized scope
- Flags anything outside its authority for Sean's review

### Outcome
Sean reclaims 2-3 hours/week of low-value meetings. Status updates, vendor syncs, and routine check-ins happen without him. He gets structured summaries instead.

---

## Use Case 4: Sales Swarm — Outbound Prospecting Campaign

**Agent:** Sam (Sales Lead, cognitive) + Sales Reps 01-10 (conversational only)
**Mode:** Cognitive orchestration → batch conversational execution

### Trigger
Daily 8am cron job or manual trigger: "Run today's outbound campaign."

### Flow
```
Morning Prep (Cognitive Sales Lead):
1. Ingests CRM export: 500 prospects with fields:
   - Name, company, title, phone, industry, last contact, lead score
2. Generates personalized pitch context per prospect:
   - Industry-specific value prop
   - Company-specific pain points (from web research)
   - Tailored opening line
3. Distributes 50 prospects to each of 10 Sales Reps
4. Sets dynamic_variables per call:
   { prospect_name, company, industry, value_prop, opening_line }

Campaign Execution (10 Sales Reps, concurrent):
5. Batch calling API schedules all 500 calls
6. Each call (3-5 minutes):
   - Rep: "Hi [name], this is [rep_name] from BlockDrive. [opening_line]"
   - Qualification questions:
     a. "How is your team currently handling [pain_point]?"
     b. "What's your biggest challenge with [current_solution]?"
     c. "Are you evaluating alternatives this quarter?"
     d. "Who else would be involved in a decision like this?"
   - If interested: "Great, I'll send you a calendar link for a deeper dive."
   - If not interested: "I appreciate your time. Mind if I check back in Q3?"
   - If voicemail: Leave 30-second value prop message
7. Each call result → Redis:
   { transcript, qualification_score, interest_level, objections,
     decision_maker, next_action, duration }

Evening Processing (Cognitive Sales Lead):
8. Processes all 500 call results:
   - Hot leads (score 8-10): Immediate Slack alert to Sean
   - Warm leads (score 5-7): Draft follow-up email, schedule callback
   - Cold leads (score 1-4): Log, check back next quarter
9. Generates daily report:
   - Total calls: 500 (answered: 340, voicemail: 120, no answer: 40)
   - Hot leads: 12 (2.4% conversion)
   - Average call duration: 3:42
   - Top objections: [list]
   - Top industries responding: [list]
10. Updates CRM pipeline
11. Sends report to Slack + stores in mem0 for trend analysis
```

### Data Captured Per Call
| Field | Type | Example |
|---|---|---|
| Prospect name | string | "Lisa Chen" |
| Company | string | "Dropbox" |
| Title | string | "VP Engineering" |
| Qualification score | 1-10 | 8 |
| Interest level | enum | "high" |
| Objections | string[] | ["Already have a solution", "Budget cycle is Q4"] |
| Decision maker | boolean | true |
| Next action | enum | "schedule_demo" |
| Best callback time | string | "Tuesday mornings" |
| Full transcript | string | [verbatim] |
| Call duration | seconds | 247 |
| Call outcome | enum | "qualified_interested" |

### Outcome
500 qualified outbound touches per day. 12 hot leads identified. Pipeline updated. Follow-up emails drafted. One human reviews a 2-page daily report. Cost: ~$80/day in Twilio + ElevenLabs.

---

## Use Case 5: Voice Messages in Slack/Telegram

**Agent:** Any agent with TTS capability
**Mode:** Cognitive runtime with TTS/STT pipes

### Trigger
User sends a voice message (audio file) to an agent's Slack or Telegram channel.

### Flow
```
1. Audio file received in channel
2. Agent runtime detects audio attachment
3. Audio → ElevenLabs STT (scribe_v1, file transcription):
   - Async transcription (~2-5 seconds for 30-second message)
   - Returns text with timestamps
4. Transcribed text → cognitive agent (full Claude Opus 4.6 reasoning)
5. Agent generates response text
6. Response text → ElevenLabs TTS (agent's voice, turbo_v2 model):
   - Returns audio stream
   - Converted to audio file (mp3/ogg)
7. Audio file sent as reply in same channel
8. (Optional) Text transcript also sent as thread reply
```

### Example Interaction
```
Sean [voice message, 15 sec]: "Hey, can you pull together the latest
  burn rate numbers and tell me how our runway looks?"

CFA [voice reply, 20 sec]: "Sure. Current monthly burn is $47,000.
  With $340,000 in the treasury, that gives us about 7.2 months of runway.
  Revenue is trending up at 12% month-over-month, which could extend
  that to 9 months if the trend holds. Want me to run a detailed
  scenario analysis?"
```

### Outcome
Hands-free interaction with agents while driving, walking, or multitasking. Natural voice-in, voice-out communication. Full cognitive power behind every response.

---

## Use Case 6: Web Dashboard Voice Interaction

**Agent:** Any agent with voice channel enabled
**Mode:** Real-time conversational (WebSocket)

### Trigger
User clicks microphone icon in WaaS cloud dashboard.

### Flow
```
1. User clicks mic → frontend requests signed URL from server
2. Server: GET /v1/convai/conversation/get-signed-url (keeps API key safe)
3. Server returns signed WebSocket URL (15-min expiry)
4. Frontend connects: WebSocket → ElevenLabs
5. Real-time conversation:
   - User speaks → STT (scribe_v2_realtime) → partial + committed transcripts
   - Committed text → agent runtime → Claude Opus 4.6
   - Response text → TTS (Flash v2.5, 75ms latency)
   - Audio → browser speakers
6. Conversation displayed as text bubbles + audio playback
7. User can switch between voice and text mid-conversation
8. Session ends when user clicks stop or after inactivity timeout
```

### Latency Budget
| Step | Target | Notes |
|---|---|---|
| STT (speech → text) | ~200ms | Scribe v2 realtime |
| Agent reasoning | ~500ms | Lightweight prompt, Fast response |
| TTS (text → audio) | ~75ms | Flash v2.5 |
| **Total round-trip** | **~800ms** | Feels near-instantaneous |

### Outcome
The most natural way to interact with an agent. Speaking is faster than typing for most queries. Sub-second response time makes it feel like talking to a colleague.

---

## Use Case 7: IR Agent — Investor Check-in Calls

**Agent:** Riley (Investor Relations) — Dual-Mode
**Mode:** Cognitive orchestration → conversational execution

### Trigger
Weekly cadence (Friday morning): cognitive IR reviews investor pipeline in Notion.

### Flow
```
1. Cognitive IR queries Investor Pipeline DB:
   - Investors with last_contact > 14 days ago
   - Investors with pending follow-up items
   - Investors flagged for "relationship maintenance"
2. Generates 5-10 call briefs:
   - Investor name, firm, last conversation summary, portfolio update talking points
   - Any specific items to discuss (document requests, intro requests)
3. Batch calls via Twilio:
   "Hi [name], this is Jordan from BlockDrive's investor relations team.
    I'm calling with a quick portfolio update..."
4. Per call:
   - Delivers update: "Since we last spoke, we've [milestone]. Our MRR is
     now [number], and we're on track for [goal]."
   - Listens for questions/concerns
   - Notes any action items: "I'll send that over by Monday"
   - Captures sentiment: positive/neutral/cautious/negative
5. Post-call processing:
   - Updates Investor Pipeline DB in Notion (last contact, sentiment, notes)
   - Creates follow-up tasks for any commitments made
   - Sends weekly investor engagement report to Sean via Slack
```

### Data Captured
| Field | Example |
|---|---|
| Investor | "Mark, a16z" |
| Sentiment | "Positive — excited about sales swarm feature" |
| Questions | "Asked about competitive landscape, wants comparison chart" |
| Action items | "Send competitive analysis by Monday" |
| Next touchpoint | "Check in after Q2 numbers" |
| Updated engagement score | 8/10 (up from 7) |

### Outcome
Investor relationships maintained systematically. No touchpoint forgotten. Sentiment tracked over time. Sean gets a weekly engagement pulse without making a single call.

---

## Use Case 8: CFA — Verbal Financial Briefing

**Agent:** Morgan (Chief Financial Agent) — Cognitive Only
**Mode:** TTS-only output (no conversational)

### Trigger
Sean asks via Slack or web: "Give me a financial briefing" or scheduled daily morning briefing.

### Flow
```
1. Cognitive CFA pulls latest metrics:
   - Treasury balance (from Solana on-chain data)
   - Monthly burn rate (from Supabase transaction logs)
   - Revenue / MRR (from Stripe via API)
   - Runway calculation
   - Cash flow forecast
2. Generates briefing script (300-500 words, ~2 minutes audio):
   "Good morning, Sean. Here's your financial briefing for March 4th.

    Treasury balance is $340,000, down $12,000 from last week primarily
    from the DigitalOcean infrastructure expansion. Monthly burn rate
    remains steady at $47,000.

    Revenue is at $8,200 MRR, up 12% from February. At current trajectory,
    we'll cross $10K MRR by mid-April.

    Runway stands at 7.2 months. With the revenue growth trend, effective
    runway extends to approximately 9 months.

    One item to flag: Twilio costs will increase when we activate the
    sales swarm. Estimated additional $200 per month at full capacity.

    No action items today. Full report is in Notion."
3. Script → ElevenLabs TTS (Multilingual v2 for quality)
4. Audio delivered to Slack as voice message or played in web dashboard
5. Text version also posted for reference
```

### Outcome
Sean gets a verbal financial briefing every morning — like having a CFO in the room giving a status update. No dashboard needed. Listen while getting coffee.

---

## Summary Matrix

| Use Case | Agent | Mode | Channel | Frequency | Priority |
|---|---|---|---|---|---|
| Inbound call screening | EA | Conversational | Voice/Phone | Real-time | Phase 1 |
| Outbound calls for Sean | EA | Conversational | Voice/Phone | On-demand | Phase 1 |
| Zoom meeting delegation | EA | Conversational | Voice/Zoom | 2-3x/week | Phase 1 |
| Sales swarm | Sales Reps | Conversational | Phone | Daily | Phase 2 |
| Voice messages | Any | TTS/STT pipes | Slack/Telegram | On-demand | Phase 3 |
| Web dashboard voice | Any | Real-time | Web | On-demand | Phase 3 |
| Investor check-ins | IR | Conversational | Phone | Weekly | Phase 3 |
| Financial briefing | CFA | TTS-only | Slack/Web | Daily | Phase 3 |
