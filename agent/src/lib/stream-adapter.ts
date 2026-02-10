import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Transforms SDK messages into OpenAI-compatible SSE format.
 * The frontend expects: data: {"choices":[{"delta":{"content":"..."}}]}
 */
export function sdkMessageToSSE(message: SDKMessage): string | null {
  // Handle streaming partial messages (token-by-token)
  if (message.type === "stream_event") {
    const event = message.event as any;
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      const chunk = {
        choices: [{ delta: { content: event.delta.text } }],
      };
      return `data: ${JSON.stringify(chunk)}\n\n`;
    }
    return null;
  }

  // Handle complete assistant messages (fallback when not using partial messages)
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

    const chunk = {
      choices: [{ delta: { content: text } }],
    };
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  // Handle result (end of stream)
  if (message.type === "result") {
    return "data: [DONE]\n\n";
  }

  return null;
}

/**
 * Extracts the full assistant text from a stream of SDK messages.
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
