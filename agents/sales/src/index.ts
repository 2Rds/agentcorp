/**
 * Sales Agent — Sam (Chief Sales Agent)
 *
 * Pipeline management, prospect research, call prep, and outreach.
 * Energetic, relationship-focused, data-driven.
 *
 * Port: 3007 | Namespace: sales | Tier: department-head
 */

import { AgentRuntime } from "@waas/runtime";
import { SALES_CONFIG } from "@waas/shared";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./agent/system-prompt.js";
import { createMcpServer } from "./tools/index.js";
import { setRuntime } from "./runtime-ref.js";

const runtime = new AgentRuntime({
  config: SALES_CONFIG,
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
    perplexityApiKey: config.perplexityApiKey || undefined,
    pluginsDir: new URL("../plugins", import.meta.url).pathname,
  },
  corsOrigins: config.corsOrigins,
  telegram: config.telegramEnabled ? {
    agents: {
      "blockdrive-sales": {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
    },
  } : undefined,
});

setRuntime(runtime);

runtime.start().catch((err) => {
  console.error("Sales Agent failed to start:", err);
  process.exit(1);
});
