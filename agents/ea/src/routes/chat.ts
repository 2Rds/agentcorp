import { Router, Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { createAgentQuery } from "../agent/ea-agent.js";
import { sdkMessageToSSE } from "../lib/stream-adapter.js";
import { extractKnowledge } from "../agent/knowledge-extractor.js";

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

        if (message.type === "stream_event") {
          const event = message.event as any;
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            fullAssistantResponse += event.delta.text;
          }
        }
      }

      if (message.type === "result") {
        if (organizationId && lastUserMessage && fullAssistantResponse) {
          extractKnowledge(lastUserMessage, fullAssistantResponse, organizationId, conversationId);
        }
      }
    }
  } catch (err: any) {
    console.error("Agent error:", err);

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
