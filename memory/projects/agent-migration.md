# Agent Migration

**Status:** In Progress
**Also called:** "the migration"

## What It Is
Moving the CFO agent from the original standalone `agent/` structure to the WaaS runtime (`@waas/runtime` AgentRuntime). EA agent already deployed at `agents/ea/` as reference implementation.

## Tasks
- [ ] Move CFO agent to WaaS runtime
- [ ] Extract CFO system prompt + MCP tools
- [ ] Replace old agent server with @waas/runtime AgentRuntime

## Context
The CFO agent was built first as a standalone. WaaS packages (@waas/shared, @waas/runtime) were built to generalize the pattern. Migration means converting from bespoke Express to standardized AgentRuntime.
