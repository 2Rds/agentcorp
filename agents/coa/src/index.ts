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
import { setRuntime } from "./runtime-ref.js";

const runtime = new AgentRuntime({
  config: COA_CONFIG,
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

setRuntime(runtime);

// ── Webhook Handlers ──
runtime.onWebhook("agent_messages", async (payload) => {
  const { record } = payload;
  const senderId = record.sender_id as string || "unknown";
  const targetId = record.target_id as string || "unknown";
  const subject = record.subject as string || "(no subject)";
  const message = record.message as string || "";

  console.log(`[blockdrive-coa] Webhook: ${payload.type} on agent_messages — ${senderId} → ${targetId}: ${subject}`);

  // If message targets COA, persist as operational context
  if (targetId === "blockdrive-coa") {
    const memory = runtime.memory;
    if (memory) {
      const orgId = record.organization_id as string || "system";
      await memory.addAgentMemory(
        "blockdrive-coa",
        orgId,
        `Inter-agent message from ${senderId}: ${subject}. ${message.slice(0, 500)}`,
        "operational",
      ).catch((err: unknown) => console.error("[blockdrive-coa] memory write failed:", err));
    }
  }
});

runtime.start().catch((err) => {
  console.error("COA Agent failed to start:", err);
  process.exit(1);
});
