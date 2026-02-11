import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { config } from "../config.js";
import { searchMemories, addMemory } from "../lib/mem0-client.js";

export function knowledgeBaseTools(orgId: string) {
  const search_knowledge_base = tool(
    "search_knowledge_base",
    "Search the company knowledge base by semantic relevance. Returns matching entries ordered by relevance.",
    {
      query: z.string().describe("Search text to match against knowledge"),
      limit: z.number().default(10).describe("Max results to return"),
    },
    async (args) => {
      if (config.useMem0) {
        // Use Mem0 semantic search
        try {
          const results = await searchMemories(args.query, orgId, args.limit);
          if (results.length > 0) {
            const formatted = results.map(r => ({
              id: r.id,
              content: r.memory,
              score: r.score,
              metadata: r.metadata,
            }));
            return { content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }] };
          }
          // Fall through to Supabase if Mem0 returns empty
        } catch (e) {
          console.error("Mem0 search failed, falling back to Supabase:", e);
        }
      }

      // Fallback: ilike search on Supabase
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
      // Dual-write: Mem0 + Supabase
      const [mem0Result, supabaseResult] = await Promise.allSettled([
        config.useMem0
          ? addMemory(`${args.title}: ${args.content}`, orgId, { source: args.source, title: args.title })
          : Promise.resolve(null),
        supabaseAdmin
          .from("knowledge_base")
          .insert({
            organization_id: orgId,
            title: args.title,
            content: args.content,
            source: args.source,
          })
          .select()
          .single(),
      ]);

      const mem0Ok = mem0Result.status === "fulfilled" && mem0Result.value;
      const sbResult = supabaseResult.status === "fulfilled" ? supabaseResult.value : null;
      const sbOk = sbResult && !sbResult.error;

      if (!sbOk && !mem0Ok) {
        const err = sbResult?.error?.message ?? "Storage failed";
        return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
      }

      const id = sbOk ? sbResult.data?.id : mem0Result.status === "fulfilled" && mem0Result.value?.[0]?.id;
      return { content: [{ type: "text" as const, text: `Knowledge entry saved: "${args.title}" (id: ${id})` }] };
    }
  );

  return [search_knowledge_base, add_knowledge_entry];
}
