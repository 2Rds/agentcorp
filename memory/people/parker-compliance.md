# Parker — Chief Compliance Agent

**Agent ID:** blockdrive-compliance
**Department:** Compliance
**Reports to:** Jordan (COA)
**Status:** Built (port 3005, 10 tools)
**Mode:** Cognitive Only
**Renamed:** CCO → CCA (Parker) in v2.2.0

## What Parker Does
- Cross-department governance and compliance monitoring
- Policy register management and risk assessments
- Governance log tracking (approval flow via Telegram C-Suite chat)
- Spend tracking per agent ($5/agent/day, $50 global/day limits)

## Technical Details
- **Runtime:** @waas/runtime AgentRuntime + Agent SDK
- **Tools:** 10 (Agent SDK `tool()` 4-arg signature)
- **Governance:** GovernanceEngine with Redis spend tracking, Telegram approval flow
- **Tables:** compliance_policy_register, compliance_risk_assessments, compliance_governance_log
