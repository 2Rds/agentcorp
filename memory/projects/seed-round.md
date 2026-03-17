# Seed Round Data Room

**Status:** Active (25% progress)
**Priority:** P0 Critical
**Platform:** DocSend Advanced
**Cost:** $215/yr (90% off via Mercury banking perk)
**Notion page:** BlockDrive HQ > Project Hub > Seed Round Data Room (DocSend)

## What It Is
Professional investor data room for seed round fundraising with per-investor link tracking, engagement analytics, and NDA watermarking.

## Key Results
1. Data room built and populated with pitch deck, financials, cap table
2. Per-investor links created with tracking
3. Engagement data flowing to Notion Investor Pipeline DB

## Integration Points
- **DocSend → n8n → Notion:** WF1 receives view events, updates Investor Pipeline DB
- **Notion → Slack:** WF3 alerts on Term Sheet stage change
- **Notion → Slack:** WF2 daily follow-up reminders for due investor actions
- **@blockdrive-ir agent:** Consumes DocSend analytics for automated follow-up decisions

## Notion Databases
- **Investor Pipeline DB:** Track every investor touchpoint and engagement
- **Decision Log DB:** Record investment decisions and terms

## Mercury Banking Perks (Active)
| Perk | Value | Duration |
|------|-------|----------|
| DocSend Advanced | 90% off ($215/yr) | Annual |
| ElevenLabs Scale | NOT approved | Denied |
| Notion Business | 6 months free | 6 months |
| DigitalOcean | $5K credits | 12+ months |
