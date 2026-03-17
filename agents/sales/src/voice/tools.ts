/**
 * Voice call tools — native Anthropic API Tool format (EA bridge pattern).
 *
 * These are lightweight tools for use during live phone calls via VoicePipeline.
 * They provide sub-ms reads from Feature Store, memory search, and pipeline lookup.
 *
 * Pattern: createVoiceTools() returns { toolDefs, handlers } — passed to runtime voice config.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { getRuntime } from "../runtime-ref.js";

type ToolHandler = (args: Record<string, any>) => Promise<string>;

export function createVoiceTools(orgId: string): {
  toolDefs: Anthropic.Tool[];
  handlers: Map<string, ToolHandler>;
} {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const entries = [
    // 1. get_prospect_intelligence — Feature Store combined read
    {
      def: {
        name: "get_prospect_intelligence",
        description: "Get pre-computed intelligence about the current prospect — company details, pain points, industry benchmarks, and call talking points.",
        input_schema: {
          type: "object" as const,
          properties: {
            prospect_id: { type: "string", description: "Prospect identifier (company name or ID)" },
          },
          required: ["prospect_id"],
        },
      },
      handler: async (args: Record<string, any>) => {
        const fs = getRuntime()?.featureStore;
        if (!fs) return "Prospect intelligence not available right now.";
        try {
          const intel = await fs.getCallIntelligence(args.prospect_id, undefined, orgId);
          if (!intel) return "No intelligence found for this prospect.";
          return JSON.stringify(intel, null, 2);
        } catch (e) { console.error("[Voice] get_prospect_intelligence failed:", e); return "Could not retrieve prospect intelligence."; }
      },
    },
    // 2. search_knowledge — Memory search
    {
      def: {
        name: "search_knowledge",
        description: "Search sales team memory for deal history, competitive intel, or past interactions with this prospect.",
        input_schema: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "What to search for" },
          },
          required: ["query"],
        },
      },
      handler: async (args: Record<string, any>) => {
        const memory = getRuntime()?.memory;
        if (!memory) return "Knowledge base not available right now.";
        try {
          const results = await memory.searchAgentMemories("blockdrive-sales", orgId, args.query, 5);
          if (!results.length) return "No relevant knowledge found.";
          return results.map((r: any) => r.memory).join("\n");
        } catch (e) { console.error("[Voice] search_knowledge failed:", e); return "Could not search knowledge base."; }
      },
    },
    // 3. check_pipeline — Quick Supabase lookup
    {
      def: {
        name: "check_pipeline",
        description: "Check the current deal stage and details for a company in the sales pipeline.",
        input_schema: {
          type: "object" as const,
          properties: {
            company: { type: "string", description: "Company name to look up" },
          },
          required: ["company"],
        },
      },
      handler: async (args: Record<string, any>) => {
        try {
          const { data, error } = await supabase
            .from("sales_pipeline")
            .select("company, contact, stage, value, probability, notes")
            .eq("org_id", orgId)
            .ilike("company", `%${args.company}%`)
            .limit(3);
          if (error || !data?.length) return "No pipeline entries found for this company.";
          return data.map(d => `${d.company} (${d.stage}): $${d.value || 'TBD'} — ${d.notes || 'No notes'}`).join("\n");
        } catch (e) { console.error("[Voice] check_pipeline failed:", e); return "Could not check pipeline."; }
      },
    },
  ];

  const toolDefs = entries.map(e => e.def as Anthropic.Tool);
  const handlers = new Map<string, ToolHandler>(entries.map(e => [e.def.name, e.handler]));
  return { toolDefs, handlers };
}
