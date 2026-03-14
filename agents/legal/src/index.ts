/**
 * Legal Agent — Casey (Chief Legal Agent)
 *
 * Contract review, regulatory guidance, IP portfolio management.
 * Routes long-form contract analysis to Grok 4.1 Reasoning (2M context).
 *
 * Port: 3006 | Namespace: legal | Tier: department-head
 */

import { AgentRuntime } from "@waas/runtime";
import { LEGAL_CONFIG } from "@waas/shared";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./agent/system-prompt.js";
import { createMcpServer } from "./tools/index.js";

const runtime = new AgentRuntime({
  config: LEGAL_CONFIG,
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
      "blockdrive-legal": {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
    },
  } : undefined,
});

runtime.start().catch((err) => {
  console.error("Legal Agent failed to start:", err);
  process.exit(1);
});
