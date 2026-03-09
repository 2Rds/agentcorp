import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { knowledgeBaseTools } from "./knowledge-base.js";
import { taskTools, meetingNotesTools, communicationsTools, interAgentTools, webTools } from "./ea-tools.js";

export function createEaMcpServer(orgId: string, userId: string) {
  return createSdkMcpServer({
    name: "ea-tools",
    version: "1.0.0",
    tools: [
      ...knowledgeBaseTools(orgId),
      ...taskTools(orgId),
      ...meetingNotesTools(orgId),
      ...communicationsTools(orgId),
      ...interAgentTools(orgId),
      ...webTools(orgId),
    ],
  });
}
