# n8n Automation Hub

**Status:** Planning (In Progress on Linear)
**Priority:** P1 High
**Linear project:** n8n Automation Hub — Full Stack Integration
**Notion page:** BlockDrive HQ > Project Hub > n8n Automation Hub
**Host:** DO droplet 134.209.67.70, n8n.blockdrive.co

## Active Workflows (6 of 8 planned)

| Workflow | Trigger | Destination | Status |
|----------|---------|-------------|--------|
| **WF2:** Daily follow-up reminder | Cron 9AM ET | Notion Pipeline DB → Slack | Active |
| **WF3:** Term Sheet alert | Notion DB stage change | Slack urgent notification | Active |
| **WF5:** Linear → Slack sprint updates | Linear webhook | Slack #engineering | Active |
| **WF6:** Intercom → Slack + Notion | Webhook `/webhook/intercom` | Slack #support + Notion leads | Active |
| **WF7:** Voice call completion → Slack + Notion | Webhook `/webhook/voice-call-completed` | Slack + Notion | Active |
| **WF8:** Service health monitor | Cron every 5 min | HTTP checks → Slack alerts | Active |

## Discontinued
| Workflow | Reason |
|----------|--------|
| **WF1:** DocSend → Notion | DocSend has no API |
| **WF4:** Supabase → Slack | Redundant — database webhooks already wired |

## Linear Issues: WAAS-22 to WAAS-37

## Health Check Targets (WF8)
- n8n: self-check
- CFO Agent: `agentcorp-ghgvq.ondigitalocean.app/health`
- EA Agent: `agentcorp-ghgvq.ondigitalocean.app/ea/health`
- Frontend: `corp.blockdrive.co`
