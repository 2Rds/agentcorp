import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  searchOrgMemories,
  addOrgMemory,
  updateMemory,
  deleteMemory,
  feedbackMemory,
  searchCrossNamespaceMemories,
} from "../lib/mem0-client.js";

export function knowledgeBaseTools(orgId: string) {
  const search_knowledge = tool(
    "search_knowledge",
    "Search the knowledge base by semantic relevance. Has executive-tier cross-namespace read access to all department memories. Uses AI-powered reranking and keyword expansion for high-quality results.",
    {
      query: z.string().describe("Natural language search query"),
      limit: z.number().default(10).describe("Max results to return"),
      categories: z.array(z.string()).optional().describe(
        "Filter by categories: scheduling, communications, cross_department, executive_decisions, meeting_notes, contacts, project_tracking, investor_relations, hiring"
      ),
      cross_namespace: z.boolean().default(true).describe("Search across all department namespaces (executive privilege). Set false to search only EA memories."),
      session_id: z.string().optional().describe("Filter to a specific conversation thread"),
    },
    async (args) => {
      try {
        let results;
        if (args.cross_namespace) {
          results = await searchCrossNamespaceMemories(args.query, orgId, { limit: args.limit });
        } else {
          results = await searchOrgMemories(args.query, orgId, {
            agentId: "blockdrive-ea",
            limit: args.limit,
            categories: args.categories,
            runId: args.session_id,
            rerank: true,
            keywordSearch: true,
          });
        }

        if (results.length === 0) {
          return { content: [{ type: "text" as const, text: "No matching knowledge found." }] };
        }

        const formatted = results.map(r => ({
          id: r.id,
          content: r.memory,
          score: r.score,
          categories: r.categories,
          agent: r.agent_id,
          metadata: r.metadata,
          updated_at: r.updated_at,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error searching knowledge: ${e.message}` }], isError: true };
      }
    }
  );

  const save_knowledge = tool(
    "save_knowledge",
    "Store a fact or insight in the knowledge base. Mem0 auto-deduplicates and merges with existing knowledge. Use for contacts, decisions, preferences, schedules, and any reusable facts.",
    {
      title: z.string().describe("Short label for this knowledge item"),
      content: z.string().describe("Detailed content of the knowledge item"),
      category: z.enum([
        "scheduling", "communications", "cross_department",
        "executive_decisions", "meeting_notes", "contacts",
        "project_tracking", "investor_relations", "hiring",
      ]).optional().describe("Category for this knowledge item"),
      source: z.string().default("chat").describe("Where this knowledge came from (chat, meeting, email, etc.)"),
    },
    async (args) => {
      try {
        const events = await addOrgMemory(
          `${args.title}: ${args.content}`,
          orgId,
          {
            agentId: "blockdrive-ea",
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

  const update_knowledge = tool(
    "update_knowledge",
    "Update an existing knowledge entry when information has changed.",
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

  const delete_knowledge = tool(
    "delete_knowledge",
    "Delete a knowledge entry that is no longer relevant.",
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

  const rate_knowledge = tool(
    "rate_knowledge",
    "Rate the quality of a retrieved memory to improve future search results.",
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

  return [search_knowledge, save_knowledge, update_knowledge, delete_knowledge, rate_knowledge];
}
