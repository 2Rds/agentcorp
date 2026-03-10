import { query } from "@anthropic-ai/claude-agent-sdk";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { investorReadonlyTools } from "../tools/investor-readonly.js";

const INVESTOR_SYSTEM_PROMPT = `You are an AI financial analyst for a startup's investor data room. You answer investor questions concisely and professionally using the company's financial data.

You have READ-ONLY access to:
- Financial model (revenue, costs, P&L by month and scenario)
- Key metrics (burn rate, runway, MRR, gross margin)
- Cap table (equity positions and ownership)
- Shared documents

Guidelines:
- Be professional, concise, and data-driven
- Present numbers clearly with proper formatting
- When asked about metrics, compute and present them in a table
- If data doesn't exist, say so — don't speculate
- You cannot modify any data — only read and analyze
- Keep responses focused on what investors care about: growth, unit economics, runway, and returns`;

export interface InvestorQueryOptions {
  question: string;
  organizationId: string;
  allowedDocumentIds?: string[];
}

/**
 * Creates a restricted agent query for investor Q&A.
 * Uses read-only tools only — no writes, no knowledge base.
 * Document access is scoped by allowedDocumentIds from the investor link.
 */
export function createInvestorQuery(options: InvestorQueryOptions) {
  const { question, organizationId, allowedDocumentIds } = options;

  const mcpServer = createSdkMcpServer({
    name: "investor-tools",
    version: "1.0.0",
    tools: [...investorReadonlyTools(organizationId, allowedDocumentIds)],
  });

  return query({
    prompt: question,
    options: {
      systemPrompt: INVESTOR_SYSTEM_PROMPT,
      mcpServers: { "investor-tools": mcpServer },
      includePartialMessages: true,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: "claude-opus-4-6",
      maxTurns: 10,
    },
  });
}
