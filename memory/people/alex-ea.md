# Alex — Executive Assistant

**Agent ID:** blockdrive-ea
**Department:** Executive
**Reports to:** Sean Weiss (CEO)
**Status:** Deployed (port 3002)
**Mode:** Dual-Mode (cognitive + voice planned)

## What Alex Does
- Human-facing primary point of contact for Sean
- Cross-department coordinator with executive read access to all namespaces
- Request router, escalation handler, task manager
- Meeting notes, email drafts, web search

## Technical Details
- **Runtime:** Express + Anthropic Messages API (direct, NOT Claude Agent SDK)
- **Model:** Claude Opus 4.6
- **Tools:** 7-14 native tools defined in bridge.ts (7 core + 3 Slack + 4 Notion, conditional on env vars)
- **Transport:** Telegram bot (@alex_executive_assistant_bot) + Slack bot (BlockDrive Bot, Socket Mode)
- **Enrichment:** 4-stage parallel pipeline (EA memories, cross-namespace, session, skills)
- **Max tool turns:** 15 per request
- **History:** 20-message conversation window per chat

## Escalation Rules
Requires human approval for:
- Budget decisions > $500
- Legal matters
- Hiring decisions
- Investor terms
- Public statements
- Strategic pivots
- Access grants

## Tools
| Tool | Purpose |
|------|---------|
| search_knowledge | Cross-namespace memory search |
| save_knowledge | Persist facts/decisions (9 categories) |
| create_task | Create tasks in ea_tasks |
| list_tasks | List/filter tasks by status |
| save_meeting_notes | Structured notes with action items |
| draft_email | Email drafts in ea_communications_log |
| web_search | Real-time search via Gemini Search Grounding |
| search_notion | Search Notion workspace by query |
| read_notion_page | Read page content and properties |
| create_notion_page | Create in database or as child page |
| update_notion_page | Update properties and/or append content |

## Database Tables
- `ea_tasks` — Task queue
- `ea_meeting_notes` — Meeting notes with action_items JSONB
- `ea_communications_log` — Email/comms log
