import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { addOrgMemory } from "../lib/memory-client.js";

export function capTableTools(orgId: string) {
  const get_cap_table = tool(
    "get_cap_table",
    "Read the cap table. Optionally filter by stakeholder type or round name. Returns all entries with shares, ownership %, investment amounts, and a summary of totals.",
    {
      stakeholder_type: z.enum(["founder", "investor", "option_pool", "advisor"]).optional(),
      round_name: z.string().optional().describe("Filter by funding round, e.g. 'Seed'"),
    },
    async (args) => {
      let query = supabaseAdmin
        .from("cap_table_entries")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true });

      if (args.stakeholder_type) query = query.eq("stakeholder_type", args.stakeholder_type);
      if (args.round_name) query = query.eq("round_name", args.round_name);

      const { data, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };

      const entries = data ?? [];
      const totalShares = entries.reduce((s, e) => s + Number(e.shares), 0);
      const totalOwnership = entries.reduce((s, e) => s + Number(e.ownership_pct), 0);
      const totalInvestment = entries.reduce((s, e) => s + Number(e.investment_amount ?? 0), 0);

      const result = {
        entries,
        summary: { totalShares, totalOwnership: Math.round(totalOwnership * 100) / 100, totalInvestment, entryCount: entries.length },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  const upsert_cap_table_entries = tool(
    "upsert_cap_table_entries",
    "Batch create or update cap table entries. Provide id to update existing; omit to create new.",
    {
      entries: z.array(z.object({
        id: z.string().optional().describe("Existing entry ID to update"),
        stakeholder_name: z.string(),
        stakeholder_type: z.enum(["founder", "investor", "option_pool", "advisor"]),
        shares: z.number().default(0),
        ownership_pct: z.number().default(0).describe("Ownership percentage (0-100)"),
        investment_amount: z.number().optional().describe("Total investment in dollars"),
        share_price: z.number().optional().describe("Price per share"),
        round_name: z.string().optional().describe("e.g. 'Seed', 'Series A'"),
        date: z.string().optional().describe("Date of the transaction (YYYY-MM-DD)"),
      })),
    },
    async (args) => {
      const rows = args.entries.map(e => ({
        ...e,
        organization_id: orgId,
      }));

      const { data, error } = await supabaseAdmin
        .from("cap_table_entries")
        .upsert(rows, { onConflict: "id" })
        .select();

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };

      // Store cap table changes in memory with graph enabled (relationships matter here)
      const stakeholders = [...new Set(args.entries.map(e => e.stakeholder_name))];
      const rounds = [...new Set(args.entries.filter(e => e.round_name).map(e => e.round_name))];
      addOrgMemory(
        `Cap table updated: ${stakeholders.join(", ")}${rounds.length ? ` in rounds ${rounds.join(", ")}` : ""}. ${data.length} entries.`,
        orgId,
        {
          agentId: "opus-brain",
          category: "fundraising",
          enableGraph: true,
          metadata: { tool: "upsert_cap_table_entries", entry_count: data.length },
          timestamp: Math.floor(Date.now() / 1000),
        },
      ).catch(e => console.error("Memory store failed (cap table):", e));

      return { content: [{ type: "text" as const, text: `Successfully upserted ${data.length} entries.\n${JSON.stringify(data, null, 2)}` }] };
    }
  );

  const delete_cap_table_entries = tool(
    "delete_cap_table_entries",
    "Delete cap table entries by their IDs.",
    {
      ids: z.array(z.string()).describe("Entry IDs to delete"),
    },
    async (args) => {
      const { error } = await supabaseAdmin
        .from("cap_table_entries")
        .delete()
        .eq("organization_id", orgId)
        .in("id", args.ids);

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: `Deleted ${args.ids.length} cap table entries.` }] };
    }
  );

  return [get_cap_table, upsert_cap_table_entries, delete_cap_table_entries];
}
