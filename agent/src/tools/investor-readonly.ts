import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

/**
 * Read-only tools for the investor data room agent.
 * No writes, no knowledge base access — only financial data viewing.
 */
export function investorReadonlyTools(orgId: string, allowedDocumentIds?: string[]) {
  const get_company_financials = tool(
    "get_company_financials",
    "Get the company's financial model data. Returns revenue, costs, and P&L line items by month.",
    {
      scenario: z.enum(["base", "best", "worst"]).default("base").describe("Scenario to view"),
      category: z.enum(["revenue", "cogs", "opex", "headcount", "funding"]).optional().describe("Filter by category"),
    },
    async (args) => {
      let query = supabaseAdmin
        .from("financial_model")
        .select("category, subcategory, month, amount, scenario")
        .eq("organization_id", orgId)
        .eq("scenario", args.scenario)
        .order("month", { ascending: true });

      if (args.category) query = query.eq("category", args.category);

      const { data, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  const get_company_metrics = tool(
    "get_company_metrics",
    "Get the company's key financial metrics: burn rate, runway, MRR, gross margin, and monthly P&L summaries.",
    {
      scenario: z.enum(["base", "best", "worst"]).default("base"),
    },
    async (args) => {
      const { data, error } = await supabaseAdmin
        .from("financial_model")
        .select("category, subcategory, month, amount")
        .eq("organization_id", orgId)
        .eq("scenario", args.scenario)
        .order("month", { ascending: true });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      if (!data || data.length === 0) {
        return { content: [{ type: "text" as const, text: "No financial model data available." }] };
      }

      // Compute derived metrics
      const monthlyData: Record<string, { revenue: number; cogs: number; opex: number; funding: number }> = {};
      for (const row of data) {
        if (!monthlyData[row.month]) monthlyData[row.month] = { revenue: 0, cogs: 0, opex: 0, funding: 0 };
        const m = monthlyData[row.month];
        if (row.category === "revenue") m.revenue += row.amount;
        else if (row.category === "cogs") m.cogs += row.amount;
        else if (row.category === "opex" || row.category === "headcount") m.opex += row.amount;
        else if (row.category === "funding") m.funding += row.amount;
      }

      const months = Object.keys(monthlyData).sort();
      const latest = months[months.length - 1];
      const latestData = monthlyData[latest];

      const grossProfit = latestData.revenue - latestData.cogs;
      const ebitda = grossProfit - latestData.opex;
      const monthlyBurn = Math.abs(Math.min(0, ebitda));
      const totalCash = Object.values(monthlyData).reduce((s, m) => s + m.funding, 0) + Object.values(monthlyData).reduce((s, m) => s + (m.revenue - m.cogs - m.opex), 0);
      const runway = monthlyBurn > 0 ? Math.round(totalCash / monthlyBurn) : Infinity;

      const metrics = {
        latestMonth: latest,
        mrr: latestData.revenue,
        monthlyBurn,
        runwayMonths: runway === Infinity ? "Profitable" : runway,
        grossMarginPct: latestData.revenue > 0 ? ((grossProfit / latestData.revenue) * 100).toFixed(1) + "%" : "N/A",
        ebitda,
        monthlyPnL: months.slice(-12).map(m => ({
          month: m,
          revenue: monthlyData[m].revenue,
          cogs: monthlyData[m].cogs,
          opex: monthlyData[m].opex,
          ebitda: monthlyData[m].revenue - monthlyData[m].cogs - monthlyData[m].opex,
        })),
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(metrics, null, 2) }] };
    }
  );

  const get_cap_table = tool(
    "get_cap_table",
    "Get the company's cap table showing equity positions and ownership breakdown.",
    {},
    async () => {
      const { data, error } = await supabaseAdmin
        .from("cap_table_entries")
        .select("stakeholder_name, stakeholder_type, shares, ownership_pct, investment_amount, share_price, round_name, date")
        .eq("organization_id", orgId)
        .order("ownership_pct", { ascending: false });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  const query_shared_documents = tool(
    "query_shared_documents",
    "List documents that have been shared via this investor link.",
    {
      document_ids: z.array(z.string()).optional().describe("Specific document IDs to query (from link's allowed_document_ids)"),
    },
    async (args) => {
      let query = supabaseAdmin
        .from("documents")
        .select("id, name, mime_type, size_bytes, created_at")
        .eq("organization_id", orgId);

      // Enforce link-level document restrictions, then apply user filter
      const effectiveIds = allowedDocumentIds ?? args.document_ids;
      if (effectiveIds && effectiveIds.length > 0) {
        query = query.in("id", effectiveIds);
      }

      const { data, error } = await query.order("created_at", { ascending: false }).limit(20);
      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  return [get_company_financials, get_company_metrics, get_cap_table, query_shared_documents];
}
