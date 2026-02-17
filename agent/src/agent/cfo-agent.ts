import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createCfoMcpServer } from "../tools/index.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { searchOrgMemories, getSessionMemories } from "../lib/mem0-client.js";
import { resolveSkillsForConversation, loadPluginRegistry } from "../lib/plugin-loader.js";

export interface AgentCallOptions {
  messages: { role: string; content: string }[];
  organizationId: string;
  userId: string;
  conversationId?: string;
}

/**
 * Pre-load relevant org memories and inject them into the system prompt.
 * Gives the agent situational awareness of the company before it starts reasoning.
 */
async function enrichSystemPrompt(
  organizationId: string,
  lastUserMessage: string,
  conversationId?: string,
): Promise<string> {
  let enriched = SYSTEM_PROMPT;

  try {
    // Search for memories and resolve skills in parallel (allSettled to prevent one failure from blocking all)
    const [memoriesResult, sessionResult, skillsResult] = await Promise.allSettled([
      searchOrgMemories(lastUserMessage, organizationId, {
        limit: 15,
        rerank: true,
        keywordSearch: true,
      }),
      conversationId
        ? getSessionMemories(organizationId, conversationId, { limit: 10 })
        : Promise.resolve([]),
      conversationId
        ? resolveSkillsForConversation(lastUserMessage, conversationId, { maxTokens: 4000, maxSkills: 3 })
        : Promise.resolve([]),
    ]);

    const relevantMemories = memoriesResult.status === "fulfilled" ? memoriesResult.value : [];
    const sessionMemories = sessionResult.status === "fulfilled" ? sessionResult.value : [];
    const matchedSkills = skillsResult.status === "fulfilled" ? skillsResult.value : [];

    // Log any failures for debugging
    if (memoriesResult.status === "rejected") console.error("Memory search failed:", memoriesResult.reason);
    if (sessionResult.status === "rejected") console.error("Session memory failed:", sessionResult.reason);
    if (skillsResult.status === "rejected") console.error("Skill resolution failed:", skillsResult.reason);

    if (relevantMemories.length > 0) {
      const memoryLines = relevantMemories.map(m => {
        const cat = m.categories?.length ? ` [${m.categories.join(", ")}]` : "";
        return `- ${m.memory}${cat}`;
      });
      enriched += `\n\n## Organization Knowledge (from memory)\nThe following facts are known about this company from previous conversations:\n${memoryLines.join("\n")}`;
    }

    if (sessionMemories.length > 0) {
      const sessionLines = sessionMemories.map(m => `- ${m.memory}`);
      enriched += `\n\n## Current Session Context\nFrom earlier in this conversation:\n${sessionLines.join("\n")}`;
    }

    if (matchedSkills.length > 0) {
      const skillSections = matchedSkills.map(s =>
        `### ${s.name}\n${s.content}`
      );
      enriched += `\n\n## Domain Knowledge\nThe following specialized knowledge is relevant to this query:\n\n${skillSections.join("\n\n")}`;
    }
  } catch (e) {
    console.error("Failed to enrich system prompt with memories/skills:", e);
  }

  return enriched;
}

/**
 * Creates the CFO agent query with org-scoped MCP tools and memory-enriched context.
 * Returns an async generator of SDKMessages.
 */
export async function createAgentQuery(options: AgentCallOptions) {
  const { messages, organizationId, userId, conversationId } = options;

  const mcpServer = createCfoMcpServer(organizationId, userId);
  const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content ?? "";

  const systemPrompt = await enrichSystemPrompt(organizationId, lastUserMessage, conversationId);

  // Build a prompt that includes conversation context
  let prompt: string;
  if (messages.length <= 1) {
    prompt = lastUserMessage;
  } else {
    const priorMessages = messages.slice(0, -1);
    const context = priorMessages
      .map(m => `<${m.role}>${m.content}</${m.role}>`)
      .join("\n");
    prompt = `<conversation_history>\n${context}\n</conversation_history>\n\n${lastUserMessage}`;
  }

  return query({
    prompt,
    options: {
      systemPrompt,
      mcpServers: { "cfo-tools": mcpServer },
      includePartialMessages: true,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: "claude-opus-4-6",
      maxTurns: 25,
    },
  });
}
