import { Router, Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { createAgentQuery } from "../agent/ea-agent.js";
import { extractKnowledge } from "../agent/knowledge-extractor.js";
import { Sentry, getPostHog } from "../lib/observability.js";

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

    // Fire-and-forget knowledge extraction
    if (organizationId && lastUserMessage && fullResponse) {
      extractKnowledge(lastUserMessage, fullResponse, organizationId, conversationId);
    }

    // PostHog event
    getPostHog()?.capture({ distinctId: userId, event: "agent_query", properties: { agent: "ea", org_id: organizationId } });
  } catch (err: any) {
    console.error("Agent error:", err);
    Sentry.captureException(err);

    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Agent execution failed" });
      return;
    }

    const errorChunk = {
      choices: [{ delta: { content: `\n\nError: ${err.message || "Something went wrong"}` } }],
    };
    res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
    res.write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
});

export default router;
