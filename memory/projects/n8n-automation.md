# n8n Automation Hub

**Status:** Planning (In Progress on Linear)
**Priority:** P1 High
**Linear project:** n8n Automation Hub — Full Stack Integration
**Notion page:** BlockDrive HQ > Project Hub > n8n Automation Hub
**Host:** DO droplet 167.172.24.255, n8n.blockdrive.co

## Milestones
- **M1:** Infrastructure — Domain, SSL, Firewall
- **M2:** Credentials + API Access
- **M3:** Investor Pipeline Workflows
- **M4:** Product + Engineering Workflows

## Linear Issues (WAAS-22 to WAAS-37)

### Infrastructure (WAAS-22 to WAAS-28)
| Issue | Title | Priority |
|-------|-------|----------|
| WAAS-22 | SSH to droplet — inspect n8n install type | P1 Urgent |
| WAAS-23 | Configure domain + SSL (Let's Encrypt) | P1 Urgent |
| WAAS-25 | Create n8n API key | P2 High |
| WAAS-26 | Configure Slack credential | P2 High |
| WAAS-27 | Configure Notion credential | P2 High |
| WAAS-28 | Configure Supabase, Linear, ElevenLabs, Intercom credentials | P3 Medium |

### Workflows (WAAS-29 to WAAS-37)
| Issue | Workflow | Trigger | Destination | Priority |
|-------|----------|---------|-------------|----------|
| WAAS-29 | **WF1:** DocSend → Notion Investor Pipeline | Webhook `/webhook/docsend` | Notion Pipeline DB + Slack | P2 |
| WAAS-30 | **WF2:** Daily follow-up reminder | Cron 9AM ET | Notion Pipeline DB → Slack | P2 |
| WAAS-31 | **WF3:** Term Sheet alert | Notion DB stage change | Slack urgent notification | P2 |
| WAAS-32 | **WF4:** Supabase → Slack notifications | DB webhooks/polling | Slack #product | P3 |
| WAAS-33 | **WF5:** Linear → Slack sprint updates | Linear webhook | Slack #engineering | P3 |
| WAAS-34 | **WF6:** Intercom → Slack + Notion | Webhook `/webhook/intercom` | Slack #support + Notion leads | P3 |
| WAAS-35 | **WF7:** Voice call completion → Slack + Notion | Webhook `/webhook/voice-call-completed` | Slack + Notion | P3 |
| WAAS-36 | **WF8:** Service health monitor | Cron every 5 min | HTTP checks → Slack alerts | P3 |
| WAAS-37 | End-to-end testing of all 8 workflows | After all WFs created | All endpoints | P2 |

## Health Check Targets (WF8)
- Signing Service: `blockdrive-signing.fly.dev/health`
- n8n: self-check
- CFO Agent: `cfo-agent-9glt5.ondigitalocean.app/health`
- EA Agent: `cfo-agent-9glt5.ondigitalocean.app/ea/health`
- Frontend: `corp.blockdrive.co`
