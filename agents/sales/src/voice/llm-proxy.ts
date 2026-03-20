/**
 * OpenAI-compatible streaming proxy for ElevenLabs custom_llm integration.
 *
 * Accepts POST /voice/llm/chat/completions in OpenAI chat completions format,
 * translates to Anthropic Messages API, streams the response back as SSE in
 * OpenAI format. Buffers ~3 words before flushing so ElevenLabs TTS can start
 * speaking while the LLM continues generating.
 *
 * Tool calling: Anthropic tool_use blocks are translated to OpenAI
 * function_call/tool_calls format in the streamed response.
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

/** Max output tokens for voice responses (prevents cost amplification) */
const MAX_VOICE_TOKENS = 4096;

// ─── Anthropic client (reuses EA pattern for CF AI Gateway routing) ─────────

function useGateway(): boolean {
  return !!(config.cfAccountId && config.cfGatewayId);
}

function useProviderKeys(): boolean {
  return useGateway() && !!config.cfAigToken;
}

function getAnthropicBaseURL(): string {
  if (useGateway()) {
    return `https://gateway.ai.cloudflare.com/v1/${config.cfAccountId}/${config.cfGatewayId}/anthropic`;
  }
  return "https://api.anthropic.com";
}

function getAnthropicSdkHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (useProviderKeys()) {
    headers["cf-aig-authorization"] = `Bearer ${config.cfAigToken}`;
  }
  if (useGateway()) {
    headers["cf-aig-metadata"] = JSON.stringify({ agentId: "blockdrive-sales-voice" });
    headers["cf-aig-skip-cache"] = "true";
  }
  return headers;
}

const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey || "provider-keys",
  baseURL: getAnthropicBaseURL(),
  defaultHeaders: getAnthropicSdkHeaders(),
});

// ─── Format translation helpers ─────────────────────────────────────────────

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

function translateMessages(
  openaiMessages: OpenAIMessage[],
): { system: string; messages: Anthropic.MessageCreateParams["messages"] } {
  let system = "";
  const messages: Anthropic.MessageCreateParams["messages"] = [];

  for (const msg of openaiMessages) {
    if (msg.role === "system") {
      system += (system ? "\n\n" : "") + (msg.content ?? "");
      continue;
    }

    if (msg.role === "tool") {
      // OpenAI tool result → Anthropic tool_result content block
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id ?? "",
            content: msg.content ?? "",
          },
        ],
      });
      continue;
    }

    if (msg.role === "assistant" && msg.tool_calls?.length) {
      // Assistant message with tool_calls → Anthropic tool_use content blocks
      const content: Anthropic.ContentBlockParam[] = [];
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
      messages.push({ role: "assistant", content });
      continue;
    }

    // Simple user or assistant text message
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content ?? "",
    });
  }

  return { system, messages };
}

function translateTools(openaiTools?: OpenAITool[]): Anthropic.Tool[] | undefined {
  if (!openaiTools?.length) return undefined;
  return openaiTools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as Anthropic.Tool.InputSchema,
  }));
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseChunk(res: Response, responseId: string, delta: Record<string, unknown>, finishReason?: string | null): void {
  const chunk = {
    id: responseId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "claude-opus-4-6",
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason ?? null,
      },
    ],
  };
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

// ─── Word buffer (accumulate ~3 words then flush for TTS latency) ───────────

class WordBuffer {
  private buffer = "";
  private wordCount = 0;
  private readonly threshold: number;

  constructor(threshold = 3) {
    this.threshold = threshold;
  }

  /** Add text. Returns flushed content (or empty string if still buffering). */
  add(text: string): string {
    this.buffer += text;

    // Count words by spaces
    const spaces = text.split(" ").length - 1;
    this.wordCount += spaces;

    // Flush when we have enough words ending with a space
    if (this.wordCount >= this.threshold && this.buffer.endsWith(" ")) {
      return this.flush();
    }
    return "";
  }

  /** Force flush any remaining content. */
  flush(): string {
    const out = this.buffer;
    this.buffer = "";
    this.wordCount = 0;
    return out;
  }
}

// ─── Route ──────────────────────────────────────────────────────────────────

export function createLlmProxyRouter(): Router {
  const router = Router();

  router.post("/chat/completions", async (req: Request, res: Response) => {
    // ── Auth: shared secret guard ──
    const secret = config.llmProxySecret;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: { message: "Unauthorized", type: "auth_error" } });
      return;
    }

    const { messages, stream: shouldStream, tools, max_tokens, temperature } = req.body as {
      messages?: OpenAIMessage[];
      stream?: boolean;
      tools?: OpenAITool[];
      max_tokens?: number;
      temperature?: number;
      model?: string;
    };

    if (!messages?.length) {
      res.status(400).json({ error: { message: "messages is required", type: "invalid_request_error" } });
      return;
    }

    const responseId = `chatcmpl-${randomUUID()}`;
    const clampedMaxTokens = Math.min(max_tokens ?? 4096, MAX_VOICE_TOKENS);

    try {
      const { system, messages: anthropicMessages } = translateMessages(messages);
      const anthropicTools = translateTools(tools);

      if (shouldStream === false) {
        // Non-streaming fallback (unlikely for ElevenLabs, but support it)
        const response = await anthropic.messages.create({
          model: "claude-opus-4-6-20250627",
          max_tokens: clampedMaxTokens,
          temperature: temperature ?? 0.7,
          system: system || undefined,
          messages: anthropicMessages,
          tools: anthropicTools,
        });

        const textContent = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        const toolCalls = response.content
          .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
          .map((b) => ({
            id: b.id,
            type: "function" as const,
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          }));

        res.json({
          id: responseId,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "claude-opus-4-6",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: textContent || null,
                ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
              },
              finish_reason: response.stop_reason === "tool_use" ? "tool_calls" : "stop",
            },
          ],
          usage: {
            prompt_tokens: response.usage.input_tokens,
            completion_tokens: response.usage.output_tokens,
            total_tokens: response.usage.input_tokens + response.usage.output_tokens,
          },
        });
        return;
      }

      // ── Streaming (primary path for ElevenLabs) ──

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send initial role chunk
      sseChunk(res, responseId, { role: "assistant" });

      const messageStream = anthropic.messages.stream({
        model: "claude-opus-4-6-20250627",
        max_tokens: clampedMaxTokens,
        temperature: temperature ?? 0.7,
        system: system || undefined,
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      const wordBuffer = new WordBuffer(3);
      let hasToolUse = false;

      messageStream.on("text", (text: string) => {
        const flushed = wordBuffer.add(text);
        if (flushed) {
          sseChunk(res, responseId, { content: flushed });
        }
      });

      messageStream.on("contentBlock", (block: Anthropic.ContentBlock) => {
        if (block.type === "tool_use") {
          // Flush any buffered text before tool call
          const remaining = wordBuffer.flush();
          if (remaining) {
            sseChunk(res, responseId, { content: remaining });
          }

          hasToolUse = true;

          // Emit tool call as OpenAI function_call format
          sseChunk(res, responseId, {
            tool_calls: [
              {
                index: 0,
                id: block.id,
                type: "function",
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input),
                },
              },
            ],
          });
        }
      });

      messageStream.on("end", () => {
        // Flush any remaining buffered text
        const remaining = wordBuffer.flush();
        if (remaining) {
          sseChunk(res, responseId, { content: remaining });
        }

        const finishReason = hasToolUse ? "tool_calls" : "stop";
        sseChunk(res, responseId, {}, finishReason);

        res.write("data: [DONE]\n\n");
        res.end();
      });

      messageStream.on("error", (error: Error) => {
        console.error("[LLM Proxy] Stream error:", error.message);
        const errorChunk = {
          id: responseId,
          object: "chat.completion.chunk",
          error: { message: "An internal error occurred", type: "server_error" },
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      });

      // Handle client disconnect
      req.on("close", () => {
        messageStream.abort();
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Internal server error";
      console.error("[LLM Proxy] Request error:", detail);
      if (!res.headersSent) {
        res.status(500).json({ error: { message: "An internal error occurred", type: "server_error" } });
      } else {
        res.end();
      }
    }
  });

  return router;
}
