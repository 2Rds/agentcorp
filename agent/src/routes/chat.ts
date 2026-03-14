import { Router, Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { createAgentQuery } from "../agent/cfo-agent.js";
import { sdkMessageToSSE } from "../lib/stream-adapter.js";
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

  let fullAssistantResponse = "";
  const lastUserMessage = messages.filter((m: any) => m.role === "user").pop()?.content ?? "";

  try {
    const agentQuery = await createAgentQuery({
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
      organizationId,
      userId,
      conversationId,
    });

    for await (const message of agentQuery) {
      const sse = sdkMessageToSSE(message);
      if (sse) {
        res.write(sse);

        // Accumulate assistant text from streaming deltas only
        if (message.type === "stream_event") {
          const event = message.event as any;
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            fullAssistantResponse += event.delta.text;
          }
        }
      }

      // End of stream — sdkMessageToSSE already sends [DONE] for result messages
      if (message.type === "result") {
        // Fire-and-forget knowledge extraction
        if (organizationId && lastUserMessage && fullAssistantResponse) {
          extractKnowledge(lastUserMessage, fullAssistantResponse, organizationId, conversationId);
        }

        // PostHog event (non-fatal — never affect user response)
        try { getPostHog()?.capture({ distinctId: userId, event: "agent_query", properties: { agent: "cfa", org_id: organizationId } }); }
        catch (analyticsErr) { console.error("[PostHog] capture failed (non-fatal):", analyticsErr); }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent execution failed";
    console.error("Agent error:", err);
    Sentry.captureException(err);

    // If we haven't sent any data yet, send an error response
    if (!res.headersSent) {
      res.status(500).json({ error: message });
      return;
    }

    // If already streaming, send error as SSE
    const errorChunk = {
      choices: [{ delta: { content: `\n\n⚠️ Error: ${message}` } }],
    };
    res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
    res.write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
});

export default router;
