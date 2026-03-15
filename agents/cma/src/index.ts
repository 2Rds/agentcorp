/**
 * CMA Agent — Taylor (Chief Marketing Agent)
 *
 * Leads marketing, brand, and content operations for BlockDrive.
 * Creative, data-informed, brand-obsessed.
 *
 * Port: 3004 | Namespace: cma | Tier: department-head
 */

import { AgentRuntime } from "@waas/runtime";
import { CMA_CONFIG } from "@waas/shared";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./agent/system-prompt.js";
import { createMcpServer } from "./tools/index.js";
import { setRuntime } from "./runtime-ref.js";

const runtime = new AgentRuntime({
  config: CMA_CONFIG,
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
      "blockdrive-cma": {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
    },
  } : undefined,
});

setRuntime(runtime);

runtime.start().catch((err) => {
  console.error("CMA Agent failed to start:", err);
  process.exit(1);
});
