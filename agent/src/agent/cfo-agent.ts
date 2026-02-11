import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createCfoMcpServer } from "../tools/index.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

export interface AgentCallOptions {
  messages: { role: string; content: string }[];
  organizationId: string;
  userId: string;
}

/**
 * Creates the CFO agent query with org-scoped MCP tools.
 * Returns an async generator of SDKMessages.
 */
export function createAgentQuery(options: AgentCallOptions) {
  const { messages, organizationId, userId } = options;

  const mcpServer = createCfoMcpServer(organizationId, userId);

  const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content ?? "";

  // Build a prompt that includes conversation context
  let prompt: string;
  if (messages.length <= 1) {
    prompt = lastUserMessage;
  } else {
    // Include prior messages as context in the prompt
    const priorMessages = messages.slice(0, -1);
    const context = priorMessages
      .map(m => `<${m.role}>${m.content}</${m.role}>`)
      .join("\n");
    prompt = `<conversation_history>\n${context}\n</conversation_history>\n\n${lastUserMessage}`;
  }

  return query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: { "cfo-tools": mcpServer },
      includePartialMessages: true,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: "claude-opus-4-6",
      maxTurns: 25,
    },
  });
}
