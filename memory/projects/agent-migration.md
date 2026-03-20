# Agent Migration

**Status:** Partially Complete
**Also called:** "the migration"

## What It Is
Moving agents from standalone structures to the WaaS runtime (`@waas/runtime` AgentRuntime).

## Completed
- [x] EA Agent deployed at `agents/ea/` (Anthropic Messages API, standalone Docker build)
- [x] All 5 department agents built on @waas/runtime AgentRuntime (COA, CMA, Compliance, Legal, Sales)
- [x] Agent SDK `tool()` 4-arg signature with Zod schemas standardized

## Remaining
- [ ] Move CFO agent from `agent/` to @waas/runtime (still standalone Express + Agent SDK)

## Context
The CFO agent was built first as a standalone. WaaS packages (@waas/shared, @waas/runtime) were built to generalize the pattern. Department agents all use AgentRuntime now. CFO migration is lower priority since it works fine standalone.
