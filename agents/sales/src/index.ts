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
import { setRuntime, getRuntime } from "./runtime-ref.js";
import { SdrWorker } from "./sdr/worker.js";
import { VOICE_SYSTEM_PROMPT } from "./voice/system-prompt.js";
import { createVoiceTools } from "./voice/tools.js";
import { createLlmProxyRouter } from "./voice/llm-proxy.js";

const orgId = config.blockdriveOrgId || "";
const voiceTools = config.voiceEnabled && orgId ? createVoiceTools(orgId) : undefined;

const runtime = new AgentRuntime({
  config: SALES_CONFIG,
  systemPrompt: SYSTEM_PROMPT,
  createMcpServer: (orgId, userId) => createMcpServer(orgId, userId),
  env: {
    port: config.port,
    supabaseUrl: config.supabaseUrl,
    supabaseServiceRoleKey: config.supabaseServiceRoleKey,
    anthropicApiKey: config.anthropicApiKey,
    redisUrl: config.redisUrl || undefined,
    cohereApiKey: config.cohereApiKey || undefined,
    googleAiApiKey: config.googleAiApiKey || undefined,
    cfGatewayAccountId: config.cfAccountId || undefined,
    cfGatewayId: config.cfGatewayId || undefined,
    cfAigToken: config.cfAigToken || undefined,
    pluginsDir: new URL("../plugins", import.meta.url).pathname,
  },
  featureStore: { enabled: true },
  semanticCache: {
    // SDR researches the same companies/prospects repeatedly — Gemini Search
    // Grounding results are semi-fresh and benefit from caching (1hr TTL).
    // Override the default skip list to allow caching for the sales department.
    skipModels: new Set<string>(),
  },
  publicRoutes: config.voiceEnabled
    ? [{ path: "/voice/llm", router: createLlmProxyRouter() }]
    : undefined,
  corsOrigins: config.corsOrigins,
  telegram: config.telegramEnabled ? {
    agents: {
      "blockdrive-sales": {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
    },
  } : undefined,
  voice: config.voiceEnabled ? {
    elevenlabsApiKey: config.elevenlabsApiKey,
    elevenlabsVoiceId: config.elevenlabsVoiceId,
    nextgenSwitchUrl: config.nextgenSwitchUrl || undefined,
    nextgenSwitchApiKey: config.nextgenSwitchApiKey || undefined,
    voiceSystemPrompt: VOICE_SYSTEM_PROMPT,
    tools: voiceTools?.toolDefs,
    toolHandlers: voiceTools?.handlers,
    firstMessage: "Hi, this is a representative from BlockDrive. Am I catching you at a good time?",
    maxCallDurationSecs: 600,
    onCallComplete: (result: any) => {
      const sdr = (getRuntime() as any)?.sdrWorker as SdrWorker | undefined;
      if (!sdr) { console.warn("[Sales] Post-call processing skipped — SDR not available"); return; }
      sdr.execute({
        type: "process_post_call",
        instruction: "Process completed voice call. Extract key points, update pipeline, compute new prospect features, draft follow-up.",
        context: JSON.stringify(result),
      }).catch((err: any) => console.error("[Sales] Post-call SDR failed:", err));
    },
  } : undefined,
});

setRuntime(runtime);

// Initialize SDR worker before start() — constructor only needs orgId + API key.
// Tools access runtime services lazily via getRuntime() at execution time.
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
