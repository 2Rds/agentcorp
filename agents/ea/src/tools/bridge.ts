/**
 * Tool Bridge — Converts Agent SDK tool() definitions to Anthropic Messages API format.
 *
 * The Agent SDK's tool() function creates MCP-formatted tools. This bridge extracts
 * the name, description, JSON schema, and handler from each tool so they can be used
 * with anthropic.messages.create({ tools: [...] }).
 */

import type Anthropic from "@anthropic-ai/sdk";
import { knowledgeBaseTools } from "./knowledge-base.js";
import { taskTools, meetingNotesTools, communicationsTools, interAgentTools, webTools } from "./ea-tools.js";

interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

/**
 * Extract tool definitions from Agent SDK tool() objects.
 * The SDK's tool() returns objects with .name, .description, .schema, and the handler.
 */
function extractToolDefs(sdkTools: any[]): ToolDef[] {
  return sdkTools.map((t) => {
    // Agent SDK tool objects have: name, description, inputSchema (Zod-derived JSON Schema), call/handler
    const name = t.name || t.toolName || "";
    const description = t.description || "";

    // The input schema from the SDK tool — extract JSON schema from Zod
    let input_schema: Record<string, unknown> = { type: "object", properties: {} };
    if (t.inputSchema) {
      input_schema = t.inputSchema;
    } else if (t.schema) {
      input_schema = t.schema;
    } else if (t.parameters) {
      input_schema = t.parameters;
    }

    // The handler function
    const handler = t.call || t.handler || t.execute || (async () => ({ content: [{ type: "text", text: "Tool not implemented" }] }));

    return { name, description, input_schema, handler };
  });
}

/**
 * Creates all EA tools in Anthropic Messages API format + a handler map.
 */
export function createEaTools(orgId: string, userId: string): {
  toolDefs: Anthropic.Tool[];
  handlers: Map<string, ToolDef["handler"]>;
} {
  // Collect all SDK tools
  const allSdkTools = [
    ...knowledgeBaseTools(orgId),
    ...taskTools(orgId),
    ...meetingNotesTools(orgId),
    ...communicationsTools(orgId),
    ...interAgentTools(orgId),
    ...webTools(orgId),
  ];

  const defs = extractToolDefs(allSdkTools);
  const handlers = new Map<string, ToolDef["handler"]>();
  const toolDefs: Anthropic.Tool[] = [];

  for (const def of defs) {
    if (!def.name) continue;
    handlers.set(def.name, def.handler);
    toolDefs.push({
      name: def.name,
      description: def.description,
      input_schema: def.input_schema as Anthropic.Tool["input_schema"],
    });
  }

  return { toolDefs, handlers };
}
