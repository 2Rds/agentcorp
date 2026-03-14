/**
 * SDK Message → SSE Stream Adapter
 *
 * Converts Claude Agent SDK streaming messages into OpenAI-compatible
 * Server-Sent Events format. The frontend expects:
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 *
 * The adapter does NOT emit [DONE] — the chat route controls stream
 * termination to prevent duplicate [DONE] signals.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Convert a single SDK message to an SSE data line.
 * Returns null for messages that don't produce output (tool calls, etc.).
 */
export function sdkMessageToSSE(message: SDKMessage): string | null {
  // Streaming partial messages (token-by-token)
  if (message.type === "stream_event") {
    const event = message.event as unknown as Record<string, unknown>;
    if (event.type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        return `data: ${JSON.stringify({ choices: [{ delta: { content: delta.text } }] })}\n\n`;
      }
    }
    return null;
  }

  // Complete assistant messages (fallback when not streaming partials)
  if (message.type === "assistant") {
    const content = message.message?.content;
    if (!content) return null;

    let text = "";
    for (const block of content) {
      if ("text" in block && typeof block.text === "string") {
        text += block.text;
      }
    }
    if (!text) return null;

    return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
  }

  // SDK result messages — surface errors to the client
  if (message.type === "result") {
    const result = message as Record<string, unknown>;
    // Check for error in the result
    if (result.error || result.is_error) {
      const errorMsg = typeof result.error === "string"
        ? result.error
        : (result.error as Record<string, unknown>)?.message ?? "Agent query error";
      return `data: ${JSON.stringify({ error: String(errorMsg) })}\n\n`;
    }
    // Don't emit [DONE] here — chat route handles stream termination
    return null;
  }

  return null;
}

/**
 * Extract complete assistant text from a stream of SDK messages.
 * Used for post-processing (knowledge extraction, memory persistence).
 */
export function extractAssistantText(messages: SDKMessage[]): string {
  let text = "";
  for (const msg of messages) {
    if (msg.type === "assistant") {
      const content = msg.message?.content;
      if (!content) continue;
      for (const block of content) {
        if ("text" in block && typeof block.text === "string") {
          text += block.text;
        }
      }
    }
  }
  return text;
}
