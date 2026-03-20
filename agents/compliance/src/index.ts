/**
 * Compliance Agent — CCA (Chief Compliance Agent)
 *
 * Governance engine for BlockDrive. Audit-read access to all namespaces.
 * Routes regulatory analysis to Claude Opus via Anthropic direct API.
 *
 * Port: 3005 | Namespace: compliance | Tier: department-head
 */

import { AgentRuntime } from "@waas/runtime";
import { COMPLIANCE_CONFIG } from "@waas/shared";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./agent/system-prompt.js";
import { createMcpServer } from "./tools/index.js";
import { setRuntime } from "./runtime-ref.js";

const runtime = new AgentRuntime({
  config: COMPLIANCE_CONFIG,
  systemPrompt: SYSTEM_PROMPT,
  createMcpServer: (orgId, userId) => createMcpServer(orgId, userId),
  env: {
    port: config.port,
    supabaseUrl: config.supabaseUrl,
    supabaseServiceRoleKey: config.supabaseServiceRoleKey,
    anthropicApiKey: config.anthropicApiKey,
    openRouterApiKey: config.openRouterApiKey,
    redisUrl: config.redisUrl || undefined,
    cohereApiKey: config.cohereApiKey || undefined,
    googleAiApiKey: config.googleAiApiKey || undefined,
    perplexityApiKey: config.perplexityApiKey || undefined,
    cfGatewayAccountId: config.cfAccountId || undefined,
    cfGatewayId: config.cfGatewayId || undefined,
    cfAigToken: config.cfAigToken || undefined,
    pluginsDir: new URL("../plugins", import.meta.url).pathname,
  },
  corsOrigins: config.corsOrigins,
  telegram: config.telegramEnabled ? {
    agents: {
      "blockdrive-compliance": {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
    },
  } : undefined,
});

setRuntime(runtime);

// ── Webhook Handlers ──
runtime.onWebhook("compliance_governance_log", async (payload) => {
  const { record } = payload;
  const actionType = record.action_type as string || "unknown";
  const agentId = record.agent_id as string || "unknown";
  const status = record.status as string || "unknown";
  const details = record.details as string || "";

  console.log(`[blockdrive-compliance] Governance: ${actionType} by ${agentId} — status: ${status}`);

  // Persist governance event for audit trail
  const memory = runtime.memory;
  if (memory) {
    const orgId = record.organization_id as string || "system";
    await memory.addAgentMemory(
      "blockdrive-compliance",
      orgId,
      `Governance event: ${actionType} by agent ${agentId} — status: ${status}. ${details.slice(0, 500)}`,
      "compliance",
    ).catch((err: unknown) => console.error("[blockdrive-compliance] audit write failed:", err));
  }
});

runtime.start().catch((err) => {
  console.error("Compliance Agent failed to start:", err);
  process.exit(1);
});
