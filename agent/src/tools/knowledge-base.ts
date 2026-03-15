import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  searchOrgMemories,
  addOrgMemory,
  updateMemory,
  deleteMemory,
  feedbackMemory,
} from "../lib/memory-client.js";

export function knowledgeBaseTools(orgId: string) {
  const search_knowledge_base = tool(
    "search_knowledge_base",
    "Search the company knowledge base by semantic relevance. Uses AI-powered reranking and keyword expansion for high-quality results. Can filter by category and scope to specific conversation sessions.",
    {
      query: z.string().describe("Natural language search query"),
      limit: z.number().default(10).describe("Max results to return"),
      categories: z.array(z.string()).optional().describe(
        "Filter by categories: financial_metrics, fundraising, company_operations, strategic_decisions, investor_relations, financial_model"
      ),
      session_id: z.string().optional().describe("Filter to a specific conversation thread"),
      precise: z.boolean().default(false).describe("Enable precision filtering to eliminate noise (slower but more accurate)"),
    },
    async (args) => {
      try {
        const results = await searchOrgMemories(args.query, orgId, {
          limit: args.limit,
          categories: args.categories,
          runId: args.session_id,
          rerank: true,
          keywordSearch: true,
          filterMemories: args.precise,
        });

        if (results.length === 0) {
          return { content: [{ type: "text" as const, text: "No matching knowledge found." }] };
        }

        const formatted = results.map(r => ({
          id: r.id,
          content: r.memory,
          score: r.score,
          categories: r.categories,
          metadata: r.metadata,
          updated_at: r.updated_at,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error searching knowledge: ${e.message}` }], isError: true };
      }
    }
  );

  const add_knowledge_entry = tool(
    "add_knowledge_entry",
    "Store a fact or insight in the knowledge base. Auto-deduplicates and merges with existing knowledge. For relationship-heavy data (investors, team, fundraising), graph connections are built automatically.",
    {
      title: z.string().describe("Short label for this knowledge item"),
      content: z.string().describe("Detailed content of the knowledge item"),
      category: z.enum([
        "financial_metrics", "fundraising", "company_operations",
        "strategic_decisions", "investor_relations", "financial_model",
      ]).optional().describe("Category for this knowledge item"),
      source: z.string().default("chat").describe("Where this knowledge came from"),
    },
    async (args) => {
      try {
        const events = await addOrgMemory(
          `${args.title}: ${args.content}`,
          orgId,
          {
            agentId: "opus-brain",
            metadata: { source: args.source, title: args.title },
            category: args.category,
            timestamp: Math.floor(Date.now() / 1000),
          },
        );

        if (!events || events.length === 0) {
          return { content: [{ type: "text" as const, text: "Error: Failed to store knowledge entry" }], isError: true };
        }

        const summary = events.map(e => `${e.event}: ${e.data.memory}`).join("; ");
        return { content: [{ type: "text" as const, text: `Knowledge stored: ${summary}` }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error adding knowledge: ${e.message}` }], isError: true };
      }
    }
  );

  const update_knowledge_entry = tool(
    "update_knowledge_entry",
    "Update an existing knowledge entry when information has changed. Use this when a previously stored fact is now outdated (e.g., burn rate changed, new hire, updated valuation).",
    {
      memory_id: z.string().describe("ID of the memory to update"),
      new_content: z.string().describe("Updated content for this memory"),
    },
    async (args) => {
      try {
        const updated = await updateMemory(args.memory_id, args.new_content);
        return { content: [{ type: "text" as const, text: `Knowledge updated: "${updated.memory ?? args.new_content}" (id: ${updated.id})` }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error updating knowledge: ${e.message}` }], isError: true };
      }
    }
  );

  const delete_knowledge_entry = tool(
    "delete_knowledge_entry",
    "Delete a knowledge entry that is no longer relevant or was stored incorrectly.",
    {
      memory_id: z.string().describe("ID of the memory to delete"),
    },
    async (args) => {
      try {
        await deleteMemory(args.memory_id);
        return { content: [{ type: "text" as const, text: `Knowledge entry ${args.memory_id} deleted.` }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error deleting knowledge: ${e.message}` }], isError: true };
      }
    }
  );

  const rate_knowledge_quality = tool(
    "rate_knowledge_quality",
    "Rate the quality of a retrieved memory to improve future search results. Use POSITIVE when a memory was helpful, NEGATIVE when it was unhelpful or misleading, VERY_NEGATIVE when completely wrong.",
    {
      memory_id: z.string().describe("ID of the memory to rate"),
      feedback: z.enum(["POSITIVE", "NEGATIVE", "VERY_NEGATIVE"]).describe("Quality rating"),
      reason: z.string().optional().describe("Why this rating was given"),
    },
    async (args) => {
      try {
        await feedbackMemory(args.memory_id, args.feedback, args.reason);
        return { content: [{ type: "text" as const, text: `Feedback recorded: ${args.feedback} for memory ${args.memory_id}` }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error submitting feedback: ${e.message}` }], isError: true };
      }
    }
  );

  return [
    search_knowledge_base,
    add_knowledge_entry,
    update_knowledge_entry,
    delete_knowledge_entry,
    rate_knowledge_quality,
  ];
}
