# Sam — Sales Lead

**Agent ID:** blockdrive-sales
**Department:** Sales
**Reports to:** Jordan (COA)
**Status:** Built (port 3007, 16-18 tools)
**Mode:** Dual-Mode (cognitive + voice)

## What Sam Does
- **Sales Manager** — repositioned from CSA/SDR in v3.1.1
- Pipeline strategy and CRM analysis
- Pitch optimization and follow-up email drafting
- Daily report generation
- Strategic calls for high-value prospects and partnerships
- Delegates to SDR Worker via `delegate_to_sdr` tool
- Sean is Head of Sales (whale deals / rainmaker)

## SDR Worker
- **Agent ID:** blockdrive-sdr (internal, shares port 3007)
- Agentic loop (Anthropic Messages API, 14 tools)
- Handles prospect research, Feature Store writes, CRM ops, call briefs
- Shares sales namespace, searches shared memory

## Sales Swarm
- 10 conversational-only sales reps (blockdrive-sales-01 through -10)
- Each has unique voice, dedicated Twilio number
- Batch calling: 50 calls/day each = 500 total
- Sam processes all results cognitively — reps just call

## Rationale for Dual-Mode
Strategic sales calls require full context. Sam makes high-value calls while the swarm handles volume.
