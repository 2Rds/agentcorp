import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export function financialModelTools(orgId: string) {
  const get_financial_model = tool(
    "get_financial_model",
    "Read financial model rows. Filter by scenario, category, or month range. Returns all matching line items with their amounts, formulas, and metadata.",
    {
      scenario: z.enum(["base", "best", "worst"]).optional().describe("Filter by scenario (default: all)"),
      category: z.enum(["revenue", "cogs", "opex", "headcount", "funding"]).optional().describe("Filter by category"),
      month_start: z.string().optional().describe("Start month filter (YYYY-MM-DD)"),
      month_end: z.string().optional().describe("End month filter (YYYY-MM-DD)"),
    },
    async (args) => {
      let query = supabaseAdmin
        .from("financial_model")
        .select("*")
        .eq("organization_id", orgId)
        .order("month", { ascending: true });

      if (args.scenario) query = query.eq("scenario", args.scenario);
      if (args.category) query = query.eq("category", args.category);
      if (args.month_start) query = query.gte("month", args.month_start);
      if (args.month_end) query = query.lte("month", args.month_end);

      const { data, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  const upsert_financial_model_rows = tool(
    "upsert_financial_model_rows",
    "Batch create or update financial model rows. Each row needs category, subcategory, month, amount. Provide an id to update existing rows; omit id to create new ones.",
    {
      rows: z.array(z.object({
        id: z.string().optional().describe("Existing row ID to update. Omit for new rows."),
        category: z.enum(["revenue", "cogs", "opex", "headcount", "funding"]),
        subcategory: z.string().describe("e.g. 'SaaS Stream 1', 'Salaries & Benefits'"),
        month: z.string().describe("YYYY-MM-DD (first of month, e.g. 2025-01-01)"),
        amount: z.number().describe("Dollar amount for this line item this month"),
        formula: z.string().optional().describe("Description of how this amount was calculated"),
        scenario: z.enum(["base", "best", "worst"]).default("base"),
      })).describe("Array of financial model rows to upsert"),
    },
    async (args) => {
      const rows = args.rows.map(r => ({
        ...r,
        organization_id: orgId,
      }));

      const { data, error } = await supabaseAdmin
        .from("financial_model")
        .upsert(rows, { onConflict: "id" })
        .select();

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: `Successfully upserted ${data.length} rows.\n${JSON.stringify(data, null, 2)}` }] };
    }
  );

  const delete_financial_model_rows = tool(
    "delete_financial_model_rows",
    "Delete financial model rows by IDs, or by matching category + subcategory + scenario.",
    {
      ids: z.array(z.string()).optional().describe("Specific row IDs to delete"),
      category: z.enum(["revenue", "cogs", "opex", "headcount", "funding"]).optional(),
      subcategory: z.string().optional(),
      scenario: z.enum(["base", "best", "worst"]).optional(),
    },
    async (args) => {
      if (args.ids && args.ids.length > 0) {
        const { error } = await supabaseAdmin
          .from("financial_model")
          .delete()
          .eq("organization_id", orgId)
          .in("id", args.ids);
        if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text" as const, text: `Deleted ${args.ids.length} rows.` }] };
      }

      if (args.category && args.subcategory && args.scenario) {
        const { error, count } = await supabaseAdmin
          .from("financial_model")
          .delete({ count: "exact" })
          .eq("organization_id", orgId)
          .eq("category", args.category)
          .eq("subcategory", args.subcategory)
          .eq("scenario", args.scenario);
        if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text" as const, text: `Deleted ${count ?? 0} rows matching filter.` }] };
      }

      return { content: [{ type: "text" as const, text: "Error: Provide either ids[] or all of category + subcategory + scenario." }], isError: true };
    }
  );

  return [get_financial_model, upsert_financial_model_rows, delete_financial_model_rows];
}
