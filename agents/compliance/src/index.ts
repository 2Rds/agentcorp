/**
 * Compliance Agent — CCO (Chief Compliance Officer)
 *
 * Governance engine for BlockDrive. Audit-read access to all namespaces.
 * Routes regulatory analysis to IBM Granite 4.0.
 *
 * Port: 3005 | Namespace: compliance | Tier: department-head
 */

import { AgentRuntime } from "@waas/runtime";
import { COMPLIANCE_CONFIG } from "@waas/shared";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./agent/system-prompt.js";
import { createMcpServer } from "./tools/index.js";

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
    mem0ApiKey: config.mem0ApiKey,
    redisUrl: config.redisUrl || undefined,
    cohereApiKey: config.cohereApiKey || undefined,
    perplexityApiKey: config.perplexityApiKey || undefined,
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

runtime.start().catch((err) => {
  console.error("Compliance Agent failed to start:", err);
  process.exit(1);
});
