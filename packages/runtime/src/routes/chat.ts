/**
 * SSE Streaming Chat Route
 *
 * The main conversation endpoint for every agent. Takes a user message,
 * enriches the system prompt with persistent memories + matched skills,
 * creates a Claude Agent SDK query with org-scoped MCP tools,
 * and streams the response as Server-Sent Events.
 *
 * POST /chat
 *   Body: { message, conversationId, organizationId, history? }
 *   Response: text/event-stream (SSE)
 */

import { Router } from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage, McpSdkServerConfigWithInstance, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { sdkMessageToSSE } from "../lib/stream-adapter.js";
import { resolveSkillsForConversation } from "../lib/plugin-loader.js";
import { Sentry, getPostHog } from "../lib/observability.js";
import type { GovernanceEngine } from "../lib/governance.js";
import type { TelemetryClient } from "../lib/telemetry.js";
import type { MemoryClient } from "../lib/redis-memory.js";
import type { ModelRouter } from "@waas/shared";
import { MODEL_REGISTRY } from "@waas/shared";
import type { RedisClientType } from "redis";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ChatRouteDeps {
  agentId: string;
  /** Base system prompt for this agent (the "personality" and instructions) */
  systemPrompt: string;
  /** Function that creates org-scoped MCP tools for the Claude SDK */
  createMcpServer: (orgId: string, userId: string) => McpSdkServerConfigWithInstance;
  /** Memory client for enrichment (RedisMemoryClient) */
  memory?: MemoryClient;
  /** Model router for embeddings (plugin matching) */
  router: ModelRouter;
  /** Redis client (for plugin vector search) */
  getRedis: () => Promise<RedisClientType | null>;
  /** Optional post-response hook (e.g., knowledge extraction) */
  onResponse?: (agentId: string, orgId: string, userMessage: string, assistantText: string, conversationId: string) => void | Promise<void>;
  /** Claude Agent SDK permission mode (default: "bypassPermissions") */
  permissionMode?: PermissionMode;
  /** Max agent turns (default: 25) */
  maxTurns?: number;
  /** Governance engine for spend tracking */
  governance?: GovernanceEngine;
  /** Telemetry client for usage event tracking */
  telemetry?: TelemetryClient;
  /** Supabase service client (legacy — use telemetry instead) */
  supabase?: SupabaseClient;
}

/** Allowed roles for history messages (whitelist to prevent injection) */
const VALID_HISTORY_ROLES = new Set(["user", "assistant"]);

// ─── Route ─────────────────────────────────────────────────────────────────

export function createChatRouter(deps: ChatRouteDeps): Router {
  const router = Router();

  router.post("/chat", async (req, res) => {
    const { userId, organizationId } = req as AuthenticatedRequest;
    const { message, conversationId, history } = req.body as {
      message: string;
      conversationId?: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing message in request body" });
      return;
    }

    // Governance: check spend limit before processing
    if (deps.governance) {
      try {
        const spendCheck = await deps.governance.checkSpendLimit(organizationId);
        if (!spendCheck.approved) {
          res.status(429).json({
            error: "spend_limit_exceeded",
            message: spendCheck.message,
          });
          return;
        }
      } catch (spendErr) {
        console.error(`[${deps.agentId}] Spend limit check failed:`, spendErr);
        Sentry.captureException(spendErr);
        // Fail-open: allow the request if spend check fails
      }
    }

    const convId = conversationId ?? `conv-${Date.now().toString(36)}`;
    const startTime = Date.now();

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Track client disconnect to abort agent query early
    let clientDisconnected = false;
    req.on("close", () => { clientDisconnected = true; });

    try {
      // Enrich system prompt with memories + skills
      const enrichedPrompt = await enrichSystemPrompt(
        deps, organizationId, message, convId,
      );

      // Build conversation context with sanitized history
      let prompt = message;
      if (history && Array.isArray(history) && history.length > 0) {
        const sanitized = history.filter(
          (m) => typeof m.role === "string" && typeof m.content === "string" && VALID_HISTORY_ROLES.has(m.role),
        );
        if (sanitized.length > 0) {
          const historyXml = sanitized
            .map((m) => `<message role="${m.role}">${escapeXml(m.content)}</message>`)
            .join("\n");
          prompt = `<conversation_history>\n${historyXml}\n</conversation_history>\n\n${message}`;
        }
      }

      // Create MCP server with org-scoped tools
      const mcpServer = deps.createMcpServer(organizationId, userId);

      // Run the agent
      const agentQuery = query({
        prompt,
        options: {
          systemPrompt: enrichedPrompt,
          mcpServers: { [`${deps.agentId}-tools`]: mcpServer },
          includePartialMessages: true,
          permissionMode: deps.permissionMode ?? "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          model: "claude-opus-4-6",
          maxTurns: deps.maxTurns ?? 25,
        },
      });

      // Stream response — accumulate text directly from deltas
      let fullText = "";
      for await (const sdkMessage of agentQuery) {
        if (clientDisconnected) break;

        const sse = sdkMessageToSSE(sdkMessage as SDKMessage);
        if (sse) {
          res.write(sse);
          // Accumulate text from the SSE payload
          if (sse.startsWith("data: {")) {
            try {
              const parsed = JSON.parse(sse.slice(6));
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === "string") fullText += delta;
            } catch (parseErr) {
              // SSE chunk may be split across writes — expected for partial chunks.
              // Log at debug level so persistent parse failures are diagnosable.
              console.debug(`[${deps.agentId}] SSE JSON parse skipped (partial chunk):`, (parseErr as Error).message);
            }
          }
        }
      }

      // End stream (single [DONE] — adapter no longer emits one)
      if (!clientDisconnected) {
        res.write("data: [DONE]\n\n");
        res.end();
      }

      // Fire-and-forget post-response hook (handles both sync and async)
      if (deps.onResponse && fullText.length > 0) {
        Promise.resolve()
          .then(() => deps.onResponse!(deps.agentId, organizationId, message, fullText, convId))
          .catch((err) => console.error("Post-response hook failed:", err));
      }

      // Governance: record spend (fire-and-forget — response already sent)
      if (deps.governance && fullText.length > 0) {
        const governance = deps.governance; // capture for closure (TS narrowing)
        const spendOrgId = organizationId;
        const spendStartTime = startTime;
        const spendPromptLen = enrichedPrompt.length + prompt.length;
        const spendResponseLen = fullText.length;
        void (async () => {
          try {
            // Estimate token counts from character lengths (rough: 1 token ≈ 4 chars)
            // 3x multiplier on INPUT only — accounts for tool schemas, tool results,
            // and intermediate turns not captured in the prompt text.
            // Output is fully captured in fullText — no multiplier needed.
            const INPUT_TOKEN_MULTIPLIER = 3;
            const rawInputTokens = Math.ceil(spendPromptLen / 4);
            const rawOutputTokens = Math.ceil(spendResponseLen / 4);
            const inputTokens = rawInputTokens * INPUT_TOKEN_MULTIPLIER;
            const outputTokens = rawOutputTokens;
            const model = MODEL_REGISTRY["opus"];
            const estimatedCostUsd = model
              ? (inputTokens / 1_000_000) * model.pricing.inputPerMillion +
                (outputTokens / 1_000_000) * model.pricing.outputPerMillion
              : 0;

            const spendResult = await governance.recordSpend({
              agentId: deps.agentId,
              orgId: spendOrgId,
              model: "claude-opus-4-6",
              inputTokens,
              outputTokens,
              estimatedCostUsd,
              timestamp: new Date().toISOString(),
            });

            if (spendResult.limitBreached) {
              console.warn(
                `[${deps.agentId}] Daily spend limit breached: $${spendResult.totalToday.toFixed(2)}`,
              );
            }

            // Record usage event via telemetry (CF Analytics Engine → Supabase fallback)
            if (deps.telemetry) {
              await deps.telemetry.record({
                orgId: spendOrgId,
                agentId: deps.agentId,
                model: "claude-opus-4-6",
                inputTokens,
                outputTokens,
                costUsd: estimatedCostUsd,
                latencyMs: Date.now() - spendStartTime,
              });
            }
          } catch (spendErr) {
            console.error(`[${deps.agentId}] Spend tracking failed (non-fatal):`, spendErr);
            Sentry.captureException(spendErr);
          }
        })();
      }

      // PostHog event (non-fatal — never affect user response)
      try { getPostHog()?.capture({ distinctId: userId, event: "agent_query", properties: { agent: deps.agentId, org_id: organizationId } }); }
      catch (analyticsErr) { console.error("[PostHog] capture failed (non-fatal):", analyticsErr); }
    } catch (err) {
      console.error(`Chat error (agent=${deps.agentId}):`, err);
      Sentry.captureException(err);
      if (!clientDisconnected) {
        res.write(`data: ${JSON.stringify({ error: "Agent query failed" })}\n\n`);
        res.end();
      }
    }
  });

  return router;
}

// ─── System Prompt Enrichment ──────────────────────────────────────────────

/**
 * Enrich the base system prompt with:
 *   1. Organization memories from memory store
 *   2. Session memories from current conversation
 *   3. Matched domain knowledge (plugin skills)
 *
 * All three run in parallel via Promise.allSettled for resilience.
 */
async function enrichSystemPrompt(
  deps: ChatRouteDeps,
  orgId: string,
  userMessage: string,
  conversationId: string,
): Promise<string> {
  let enriched = deps.systemPrompt;

  const [memoriesResult, sessionResult, skillsResult] = await Promise.allSettled([
    // Organization memories
    deps.memory?.searchAgentMemories(deps.agentId, orgId, userMessage, 5),
    // Session memories
    deps.memory?.getSessionMemories(deps.agentId, conversationId, 10),
    // Matched skills
    (async () => {
      const redis = await deps.getRedis();
      return resolveSkillsForConversation(userMessage, conversationId, deps.router, redis);
    })(),
  ]);

  // Append organization memories
  if (memoriesResult.status === "fulfilled" && memoriesResult.value && memoriesResult.value.length > 0) {
    const memoryBlock = memoriesResult.value
      .map((m) => `- ${m.memory}`)
      .join("\n");
    enriched += `\n\n<organizational_memory>\n${memoryBlock}\n</organizational_memory>`;
  } else if (memoriesResult.status === "rejected") {
    console.error(`[${deps.agentId}] Memory enrichment failed:`, memoriesResult.reason);
  }

  // Append session memories
  if (sessionResult.status === "fulfilled" && sessionResult.value && sessionResult.value.length > 0) {
    const sessionBlock = sessionResult.value
      .map((m) => `- ${m.memory}`)
      .join("\n");
    enriched += `\n\n<session_context>\n${sessionBlock}\n</session_context>`;
  } else if (sessionResult.status === "rejected") {
    console.error(`[${deps.agentId}] Session memory enrichment failed:`, sessionResult.reason);
  }

  // Append matched skills
  if (skillsResult.status === "fulfilled" && skillsResult.value.length > 0) {
    const skillsBlock = skillsResult.value
      .map((s) => `### ${s.name}\n${s.content}`)
      .join("\n\n");
    enriched += `\n\n<domain_knowledge>\n${skillsBlock}\n</domain_knowledge>`;
  } else if (skillsResult.status === "rejected") {
    console.error(`[${deps.agentId}] Skill resolution failed:`, skillsResult.reason);
  }

  return enriched;
}

// ─── Utilities ─────────────────────────────────────────────────────────────

/** Escape XML special characters to prevent injection in history XML blocks */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
