/**
 * Legal Agent — Casey (Chief Legal Agent)
 *
 * Contract review, regulatory guidance, IP portfolio management.
 * Routes long-form contract analysis to Claude Opus via Anthropic direct API.
 *
 * Port: 3006 | Namespace: legal | Tier: department-head
 */

import { AgentRuntime } from "@waas/runtime";
import { LEGAL_CONFIG } from "@waas/shared";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./agent/system-prompt.js";
import { createMcpServer } from "./tools/index.js";
import { setRuntime } from "./runtime-ref.js";

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
    redisUrl: config.redisUrl || undefined,
    cohereApiKey: config.cohereApiKey || undefined,
    googleAiApiKey: config.googleAiApiKey || undefined,
    cfGatewayAccountId: config.cfAccountId || undefined,
    cfGatewayId: config.cfGatewayId || undefined,
    cfAigToken: config.cfAigToken || undefined,
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

setRuntime(runtime);

runtime.start().catch((err) => {
  console.error("Legal Agent failed to start:", err);
  process.exit(1);
});
