import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export function knowledgeBaseTools(orgId: string) {
  const search_knowledge_base = tool(
    "search_knowledge_base",
    "Search the company knowledge base by title or content. Returns matching entries ordered by relevance (most recent first).",
    {
      query: z.string().describe("Search text to match against title and content"),
      limit: z.number().default(10).describe("Max results to return"),
    },
    async (args) => {
      // Use ilike for simple text search across title and content
      const { data, error } = await supabaseAdmin
        .from("knowledge_base")
        .select("*")
        .eq("organization_id", orgId)
        .or(`title.ilike.%${args.query}%,content.ilike.%${args.query}%`)
        .order("created_at", { ascending: false })
        .limit(args.limit);

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  const add_knowledge_entry = tool(
    "add_knowledge_entry",
    "Store a fact or insight in the knowledge base for future reference. Use this to save important company metrics, decisions, goals, or context.",
    {
      title: z.string().describe("Short label for this knowledge item"),
      content: z.string().describe("Detailed content of the knowledge item"),
      source: z.string().default("chat").describe("Where this knowledge came from"),
    },
    async (args) => {
      const { data, error } = await supabaseAdmin
        .from("knowledge_base")
        .insert({
          organization_id: orgId,
          title: args.title,
          content: args.content,
          source: args.source,
        })
        .select()
        .single();

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: `Knowledge entry saved: "${data.title}" (id: ${data.id})` }] };
    }
  );

  return [search_knowledge_base, add_knowledge_entry];
}
