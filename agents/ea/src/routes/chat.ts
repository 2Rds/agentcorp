import { Router, Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { createAgentQuery } from "../agent/ea-agent.js";
import { extractKnowledge } from "../agent/knowledge-extractor.js";
import { Sentry, getPostHog } from "../lib/observability.js";
import { getCached, setCached } from "../lib/semantic-cache.js";

const router = Router();

router.post("/api/chat", authMiddleware, async (req: Request, res: Response) => {
  const { userId, organizationId } = req as AuthenticatedRequest;
  const { messages, conversationId } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const lastUserMessage = messages.filter((m: any) => m.role === "user").pop()?.content ?? "";

  try {
    // ── Semantic cache check ──────────────────────────────────────────────
    // Only check cache for single-turn queries (no conversation history)
    const isFirstTurn = messages.filter((m: any) => m.role === "user").length === 1;
    if (isFirstTurn && lastUserMessage) {
      try {
        const cached = await getCached(lastUserMessage, "claude-opus-4-6");
        if (cached) {
          const cacheChunk = {
            choices: [{ delta: { content: cached.response } }],
          };
          res.write(`data: ${JSON.stringify(cacheChunk)}\n\n`);
          res.write("data: [DONE]\n\n");

          try { getPostHog()?.capture({ distinctId: userId, event: "agent_query", properties: { agent: "ea", org_id: organizationId, cache_hit: true } }); }
          catch (e) { console.error("[PostHog] capture failed (non-fatal):", e); }
          return;
        }
      } catch (cacheErr) {
        // Cache errors never block the request — fall through to agent
        console.error("[SemanticCache/EA] Pre-flight check failed (non-fatal):", cacheErr);
      }
    }

    // ── Agent execution ───────────────────────────────────────────────────
    const fullResponse = await createAgentQuery({
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
      organizationId,
      userId,
      conversationId,
    });

    // Stream the response as SSE chunks (OpenAI-compatible format)
    const chunk = {
      choices: [{ delta: { content: fullResponse } }],
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.write("data: [DONE]\n\n");

    // Fire-and-forget: cache the response for future similar queries
    if (isFirstTurn && lastUserMessage && fullResponse) {
      setCached(lastUserMessage, fullResponse, "claude-opus-4-6", 3600, organizationId).catch((err) => console.warn("[EA] Cache write failed:", err));
    }

    // Fire-and-forget knowledge extraction
    if (organizationId && lastUserMessage && fullResponse) {
      extractKnowledge(lastUserMessage, fullResponse, organizationId, conversationId);
    }

    // PostHog event (non-fatal — never affect user response)
    try { getPostHog()?.capture({ distinctId: userId, event: "agent_query", properties: { agent: "ea", org_id: organizationId } }); }
    catch (analyticsErr) { console.error("[PostHog] capture failed (non-fatal):", analyticsErr); }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent execution failed";
    console.error("Agent error:", err);
    Sentry.captureException(err);

    if (!res.headersSent) {
      res.status(500).json({ error: message });
      return;
    }

    const errorChunk = {
      choices: [{ delta: { content: `\n\nError: ${message}` } }],
    };
    res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
    res.write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
});

export default router;
