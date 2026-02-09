import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export interface FinancialModelRow {
  id: string;
  organization_id: string;
  category: string;
  subcategory: string;
  month: string;
  amount: number;
  formula: string | null;
  scenario: string;
}

export interface DerivedMetrics {
  monthlyBurn: number;
  runway: number;
  totalFunding: number;
  mrr: number;
  monthlyData: MonthlyAggregate[];
  revenueBreakdown: { subcategory: string; total: number }[];
}

export interface MonthlyAggregate {
  month: string;
  revenue: number;
  cogs: number;
  opex: number;
  headcount: number;
  netBurn: number;
}

export function useFinancialModel(orgId: string | null, scenario: string = "base") {
  const query = useQuery({
    queryKey: ["financial_model", orgId, scenario],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("financial_model")
        .select("*")
        .eq("organization_id", orgId)
        .eq("scenario", scenario)
        .order("month", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FinancialModelRow[];
    },
    enabled: !!orgId,
  });

  const derived = useMemo<DerivedMetrics>(() => {
    const rows = query.data ?? [];
    if (rows.length === 0) {
      return { monthlyBurn: 0, runway: 0, totalFunding: 0, mrr: 0, monthlyData: [], revenueBreakdown: [] };
    }

    // Group by month
    const byMonth = new Map<string, FinancialModelRow[]>();
    rows.forEach((r) => {
      const existing = byMonth.get(r.month) ?? [];
      existing.push(r);
      byMonth.set(r.month, existing);
    });

    const monthlyData: MonthlyAggregate[] = [];
    const sortedMonths = Array.from(byMonth.keys()).sort();

    sortedMonths.forEach((month) => {
      const items = byMonth.get(month)!;
      const sum = (cat: string) => items.filter((i) => i.category === cat).reduce((s, i) => s + Number(i.amount), 0);
      const revenue = sum("revenue");
      const cogs = sum("cogs");
      const opex = sum("opex");
      const headcount = sum("headcount");
      monthlyData.push({ month, revenue, cogs, opex, headcount, netBurn: revenue - cogs - opex - headcount });
    });

    // Latest month metrics
    const latest = monthlyData[monthlyData.length - 1];
    const monthlyBurn = latest ? Math.abs(Math.min(0, latest.netBurn)) : 0;

    // Total funding
    const totalFunding = rows.filter((r) => r.category === "funding").reduce((s, r) => s + Number(r.amount), 0);

    // Runway = total cash / monthly burn
    const totalCash = monthlyData.reduce((s, m) => s + m.netBurn, 0) + totalFunding;
    const runway = monthlyBurn > 0 ? Math.max(0, totalCash / monthlyBurn) : 0;

    // MRR = latest month revenue
    const mrr = latest?.revenue ?? 0;

    // Revenue breakdown by subcategory
    const revMap = new Map<string, number>();
    rows.filter((r) => r.category === "revenue").forEach((r) => {
      revMap.set(r.subcategory, (revMap.get(r.subcategory) ?? 0) + Number(r.amount));
    });
    const revenueBreakdown = Array.from(revMap.entries()).map(([subcategory, total]) => ({ subcategory, total }));

    return { monthlyBurn, runway, totalFunding, mrr, monthlyData, revenueBreakdown };
  }, [query.data]);

  return { ...query, derived };
}
