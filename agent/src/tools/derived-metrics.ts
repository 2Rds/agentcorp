import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

interface FinancialModelRow {
  id: string;
  category: string;
  subcategory: string;
  month: string;
  amount: number;
  formula: string | null;
  scenario: string;
}

interface MonthlyAggregate {
  month: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  netBurn: number;
}

export function derivedMetricsTools(orgId: string) {
  const get_derived_metrics = tool(
    "get_derived_metrics",
    "Compute derived financial metrics from the current financial model: monthly burn rate, runway (months), total funding, MRR, gross margin %, monthly P&L aggregates, and breakdowns by subcategory.",
    {
      scenario: z.enum(["base", "best", "worst"]).default("base").describe("Which scenario to compute metrics for"),
    },
    async (args) => {
      const { data: rows, error } = await supabaseAdmin
        .from("financial_model")
        .select("*")
        .eq("organization_id", orgId)
        .eq("scenario", args.scenario)
        .order("month", { ascending: true });

      if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };

      const typedRows = (rows ?? []) as FinancialModelRow[];
      if (typedRows.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({
          monthlyBurn: 0, runway: 0, totalFunding: 0, mrr: 0, grossMargin: 0,
          monthlyData: [], revenueBreakdown: [], opexBreakdown: [],
        }, null, 2) }] };
      }

      // Group by month
      const byMonth = new Map<string, FinancialModelRow[]>();
      typedRows.forEach((r) => {
        const existing = byMonth.get(r.month) ?? [];
        existing.push(r);
        byMonth.set(r.month, existing);
      });

      const monthlyData: MonthlyAggregate[] = [];
      const sortedMonths = Array.from(byMonth.keys()).sort();

      sortedMonths.forEach((month) => {
        const items = byMonth.get(month)!;
        const sum = (cat: string) =>
          items.filter((i) => i.category === cat).reduce((s, i) => s + Number(i.amount), 0);
        const revenue = sum("revenue");
        const cogs = sum("cogs");
        const grossProfit = revenue - cogs;
        const opex = sum("opex") + sum("headcount");
        const ebitda = grossProfit - opex;
        monthlyData.push({ month, revenue, cogs, grossProfit, opex, ebitda, netBurn: ebitda });
      });

      // Latest month metrics
      const latest = monthlyData[monthlyData.length - 1];
      const monthlyBurn = latest ? Math.abs(Math.min(0, latest.ebitda)) : 0;
      const mrr = latest?.revenue ?? 0;
      const grossMargin = latest && latest.revenue > 0 ? (latest.grossProfit / latest.revenue) * 100 : 0;

      // Total funding
      const totalFunding = typedRows
        .filter((r) => r.category === "funding")
        .reduce((s, r) => s + Number(r.amount), 0);

      // Runway
      const totalCash = monthlyData.reduce((s, m) => s + m.ebitda, 0) + totalFunding;
      const runway = monthlyBurn > 0 ? Math.max(0, totalCash / monthlyBurn) : 0;

      // Revenue breakdown by subcategory
      const revMap = new Map<string, number>();
      typedRows.filter((r) => r.category === "revenue").forEach((r) => {
        revMap.set(r.subcategory, (revMap.get(r.subcategory) ?? 0) + Number(r.amount));
      });
      const revenueBreakdown = Array.from(revMap.entries()).map(([subcategory, total]) => ({ subcategory, total }));

      // OpEx breakdown by subcategory
      const opexMap = new Map<string, number>();
      typedRows.filter((r) => r.category === "opex" || r.category === "headcount").forEach((r) => {
        opexMap.set(r.subcategory, (opexMap.get(r.subcategory) ?? 0) + Number(r.amount));
      });
      const opexBreakdown = Array.from(opexMap.entries())
        .map(([subcategory, total]) => ({ subcategory, total }))
        .sort((a, b) => b.total - a.total);

      const metrics = { monthlyBurn, runway: Math.round(runway * 10) / 10, totalFunding, mrr, grossMargin: Math.round(grossMargin * 10) / 10, monthlyData, revenueBreakdown, opexBreakdown };
      return { content: [{ type: "text" as const, text: JSON.stringify(metrics, null, 2) }] };
    }
  );

  return [get_derived_metrics];
}
