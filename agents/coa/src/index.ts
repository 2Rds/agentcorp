/**
 * COA Agent — Jordan (Chief Operating Agent)
 *
 * VP/General Manager of the BlockDrive agentic workforce.
 * Manages all department heads, cross-department coordination,
 * process optimization, and operational oversight.
 *
 * Port: 3003 | Namespace: coa | Tier: executive
 */

import { AgentRuntime } from "@waas/runtime";
import { COA_CONFIG } from "@waas/shared";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./agent/system-prompt.js";
import { createMcpServer } from "./tools/index.js";

const runtime = new AgentRuntime({
  config: COA_CONFIG,
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
      "blockdrive-coa": {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
    },
  } : undefined,
});

runtime.start().catch((err) => {
  console.error("COA Agent failed to start:", err);
  process.exit(1);
});
