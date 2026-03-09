import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { searchOrgMemories, getSessionMemories, searchCrossNamespaceMemories } from "../lib/mem0-client.js";
import { resolveSkillsForConversation } from "../lib/plugin-loader.js";
import { config } from "../config.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

export interface AgentCallOptions {
  messages: { role: string; content: string }[];
  organizationId: string;
  userId: string;
  conversationId?: string;
}

/**
 * Pre-load relevant org memories and inject them into the system prompt.
 * EA has cross-namespace read access -- searches across all agent memories.
 */
async function enrichSystemPrompt(
  organizationId: string,
  lastUserMessage: string,
  conversationId?: string,
): Promise<string> {
  let enriched = SYSTEM_PROMPT;

  try {
    // Search EA-specific memories, cross-namespace memories, session memories,
    // and resolve skills -- all in parallel
    const [eaMemoriesResult, crossMemoriesResult, sessionResult, skillsResult] = await Promise.allSettled([
      searchOrgMemories(lastUserMessage, organizationId, {
        agentId: "blockdrive-ea",
        limit: 10,
        rerank: true,
        keywordSearch: true,
      }),
      searchCrossNamespaceMemories(lastUserMessage, organizationId, { limit: 10 }),
      conversationId
        ? getSessionMemories(organizationId, conversationId, { limit: 10 })
        : Promise.resolve([]),
      conversationId
        ? resolveSkillsForConversation(lastUserMessage, conversationId, { maxTokens: 4000, maxSkills: 3 })
        : Promise.resolve([]),
    ]);

    const eaMemories = eaMemoriesResult.status === "fulfilled" ? eaMemoriesResult.value : [];
    const crossMemories = crossMemoriesResult.status === "fulfilled" ? crossMemoriesResult.value : [];
    const sessionMemories = sessionResult.status === "fulfilled" ? sessionResult.value : [];
    const matchedSkills = skillsResult.status === "fulfilled" ? skillsResult.value : [];

    // Log failures for debugging
    if (eaMemoriesResult.status === "rejected") console.error("EA memory search failed:", eaMemoriesResult.reason);
    if (crossMemoriesResult.status === "rejected") console.error("Cross-namespace memory search failed:", crossMemoriesResult.reason);
    if (sessionResult.status === "rejected") console.error("Session memory failed:", sessionResult.reason);
    if (skillsResult.status === "rejected") console.error("Skill resolution failed:", skillsResult.reason);

    // Deduplicate cross-namespace results (EA's own memories may overlap)
    const eaIds = new Set(eaMemories.map(m => m.id));
    const uniqueCrossMemories = crossMemories.filter(m => !eaIds.has(m.id));

    if (eaMemories.length > 0) {
      const memoryLines = eaMemories.map(m => {
        const cat = m.categories?.length ? ` [${m.categories.join(", ")}]` : "";
        return `- ${m.memory}${cat}`;
      });
      enriched += `\n\n## EA Knowledge (from memory)\nThe following facts are known from your previous conversations:\n${memoryLines.join("\n")}`;
    }

    if (uniqueCrossMemories.length > 0) {
      const crossLines = uniqueCrossMemories.map(m => {
        const agent = m.agent_id ? ` [via ${m.agent_id}]` : "";
        const cat = m.categories?.length ? ` [${m.categories.join(", ")}]` : "";
        return `- ${m.memory}${agent}${cat}`;
      });
      enriched += `\n\n## Cross-Department Knowledge\nRelevant information from other departments:\n${crossLines.join("\n")}`;
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
 * Creates the EA agent query using the Anthropic Messages API directly.
 * Returns the assistant's text response.
 */
export async function createAgentQuery(options: AgentCallOptions): Promise<string> {
  const { messages, organizationId, userId, conversationId } = options;

  const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content ?? "";
  const systemPrompt = await enrichSystemPrompt(organizationId, lastUserMessage, conversationId);

  // Format messages for Anthropic API
  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: systemPrompt,
    messages: apiMessages,
  });

  // Extract text from response
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
