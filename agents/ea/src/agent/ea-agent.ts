import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { searchOrgMemories, getSessionMemories, searchCrossNamespaceMemories } from "../lib/memory-client.js";
import { resolveSkillsForConversation } from "../lib/plugin-loader.js";
import { createEaTools } from "../tools/bridge.js";
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

    if (eaMemoriesResult.status === "rejected") console.error("EA memory search failed:", eaMemoriesResult.reason);
    if (crossMemoriesResult.status === "rejected") console.error("Cross-namespace memory search failed:", crossMemoriesResult.reason);
    if (sessionResult.status === "rejected") console.error("Session memory failed:", sessionResult.reason);
    if (skillsResult.status === "rejected") console.error("Skill resolution failed:", skillsResult.reason);

    const eaIds = new Set(eaMemories.map(m => m.id));
    const uniqueCrossMemories = crossMemories.filter(m => !eaIds.has(m.id));

    if (eaMemories.length > 0) {
      const memoryLines = eaMemories.map(m => {
        const cat = m.categories?.length ? ` [${m.categories.join(", ")}]` : "";
        return `- ${m.memory}${cat}`;
      });
      enriched += `\n\n## EA Knowledge (from memory)\n${memoryLines.join("\n")}`;
    }

    if (uniqueCrossMemories.length > 0) {
      const crossLines = uniqueCrossMemories.map(m => {
        const agent = m.agent_id ? ` [via ${m.agent_id}]` : "";
        return `- ${m.memory}${agent}`;
      });
      enriched += `\n\n## Cross-Department Knowledge\n${crossLines.join("\n")}`;
    }

    if (sessionMemories.length > 0) {
      const sessionLines = sessionMemories.map(m => `- ${m.memory}`);
      enriched += `\n\n## Current Session Context\n${sessionLines.join("\n")}`;
    }

    if (matchedSkills.length > 0) {
      const skillSections = matchedSkills.map(s => `### ${s.name}\n${s.content}`);
      enriched += `\n\n## Domain Knowledge\n${skillSections.join("\n\n")}`;
    }
  } catch (e) {
    console.error("Failed to enrich system prompt:", e);
  }

  return enriched;
}

/**
 * Agentic tool use loop — calls Claude, executes tool calls, feeds results back,
 * repeats until Claude produces a final text response (up to maxTurns).
 */
export async function createAgentQuery(options: AgentCallOptions): Promise<string> {
  const { messages, organizationId, userId, conversationId } = options;
  const maxTurns = 15;

  const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content ?? "";
  const systemPrompt = await enrichSystemPrompt(organizationId, lastUserMessage, conversationId);

  // Build tools
  const { toolDefs, handlers } = createEaTools(organizationId, userId);

  // Build conversation messages
  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" as const : "user" as const,
    content: m.content,
  }));

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: apiMessages,
      tools: toolDefs,
    });

    // If stop reason is "end_turn" or no tool use — return the text
    if (response.stop_reason === "end_turn" || response.stop_reason !== "tool_use") {
      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    }

    // There are tool_use blocks — execute them
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    // Add assistant message with full content (text + tool_use blocks)
    apiMessages.push({ role: "assistant", content: response.content });

    // Execute each tool and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const handler = handlers.get(toolUse.name);
      if (!handler) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Error: Unknown tool "${toolUse.name}"`,
          is_error: true,
        });
        continue;
      }

      try {
        console.log(`Tool call: ${toolUse.name}(${JSON.stringify(toolUse.input).slice(0, 200)})`);
        const result = await handler(toolUse.input as Record<string, unknown>);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      } catch (err: any) {
        console.error(`Tool ${toolUse.name} error:`, err);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Error executing ${toolUse.name}: ${err.message}`,
          is_error: true,
        });
      }
    }

    // Add tool results as user message
    apiMessages.push({ role: "user", content: toolResults });
  }

  return "I've reached my maximum number of tool execution steps. Please try a simpler request.";
}
