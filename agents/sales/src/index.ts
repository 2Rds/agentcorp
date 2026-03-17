/**
 * Sales Department Server — Sam (Sales Manager) + SDR Worker
 *
 * Sam orchestrates the sales force: pipeline governance, strategic calls,
 * team performance monitoring, and delegation to the internal SDR worker.
 * SDR handles research, Feature Store writes, CRM ops, and call briefs.
 *
 * Port: 3007 | Namespace: sales | Tier: department-head
 */

import { AgentRuntime } from "@waas/runtime";
import { SALES_CONFIG } from "@waas/shared";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./agent/system-prompt.js";
import { createMcpServer } from "./tools/index.js";
import { setRuntime } from "./runtime-ref.js";
import { SdrWorker } from "./sdr/worker.js";

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
  featureStore: { enabled: true },
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

// Initialize SDR worker before start() — constructor only needs orgId + API key.
// Tools access runtime services lazily via getRuntime() at execution time.
const orgId = config.blockdriveOrgId || "";
if (orgId) {
  (runtime as any).sdrWorker = new SdrWorker(orgId);
  console.log("[Sales] SDR worker initialized for org:", orgId);
} else {
  console.warn("[Sales] BLOCKDRIVE_ORG_ID not set — SDR worker disabled");
}

runtime.start().catch((err) => {
  console.error("Sales Agent failed to start:", err);
  process.exit(1);
});
