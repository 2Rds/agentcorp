/**
 * SDR Worker — Agentic loop for Sales Development Representative tasks
 *
 * An internal worker (NOT a separate Express server) that Sam invokes via
 * the delegate_to_sdr tool. Wraps an agentic loop exactly like EA's
 * createAgentQuery: calls Claude, executes tool_use blocks, feeds results
 * back until end_turn or max turns.
 *
 * Max 10 tool turns per task. Uses Opus 4.6 for all reasoning.
 */

import Anthropic from "@anthropic-ai/sdk";
import { SDR_SYSTEM_PROMPT } from "./system-prompt.js";
import { createSdrTools } from "./tools.js";
import { config } from "../config.js";

export interface SdrTask {
  type: "research_prospect" | "prepare_brief" | "draft_outreach" | "process_post_call" | "update_pipeline" | "general";
  instruction: string;
  context?: string;  // Additional context from Sam
}

export interface SdrResult {
  success: boolean;
  output: string;
  toolsUsed: string[];
}

export class SdrWorker {
  private anthropic: Anthropic;
  private orgId: string;

  constructor(orgId: string) {
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.orgId = orgId;
  }

  async execute(task: SdrTask): Promise<SdrResult> {
    const maxTurns = 10;
    const toolsUsed: string[] = [];

    const { toolDefs, handlers } = createSdrTools(this.orgId);

    const taskPrompt = task.context
      ? `## Task from Sales Manager\nType: ${task.type}\nInstruction: ${task.instruction}\n\nAdditional Context:\n${task.context}`
      : `## Task from Sales Manager\nType: ${task.type}\nInstruction: ${task.instruction}`;

    const apiMessages: Anthropic.MessageParam[] = [
      { role: "user", content: taskPrompt },
    ];

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await this.anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 8192,
        system: SDR_SYSTEM_PROMPT,
        messages: apiMessages,
        tools: toolDefs,
      });

      // If the model is done (end_turn or no tool_use), extract text and return
      if (response.stop_reason === "end_turn" || response.stop_reason !== "tool_use") {
        const output = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n");
        return { success: true, output, toolsUsed };
      }

      // Extract tool_use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      // Add assistant message with all content blocks
      apiMessages.push({ role: "assistant", content: response.content });

      // Execute each tool and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        toolsUsed.push(toolUse.name);
        const handler = handlers.get(toolUse.name);
        if (!handler) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Unknown tool: ${toolUse.name}`,
            is_error: true,
          });
          continue;
        }
        try {
          console.log(`[SDR] Tool: ${toolUse.name}(${JSON.stringify(toolUse.input).slice(0, 200)})`);
          const result = await handler(toolUse.input as Record<string, any>);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        } catch (err: any) {
          console.error(`[SDR] Tool ${toolUse.name} error:`, err);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error: ${err.message}`,
            is_error: true,
          });
        }
      }

      // Feed tool results back to the model
      apiMessages.push({ role: "user", content: toolResults });
    }

    // Exhausted all turns without completing
    return {
      success: false,
      output: "SDR reached maximum tool turns without completing the task.",
      toolsUsed,
    };
  }
}
