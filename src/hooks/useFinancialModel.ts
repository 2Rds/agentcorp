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

export interface MonthlyAggregate {
  month: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  netBurn: number;
}

export interface OpExBreakdown {
  subcategory: string;
  total: number;
}

export interface DerivedMetrics {
  monthlyBurn: number;
  runway: number;
  totalFunding: number;
  mrr: number;
  grossMargin: number;
  monthlyData: MonthlyAggregate[];
  revenueBreakdown: { subcategory: string; total: number }[];
  opexBreakdown: OpExBreakdown[];
}

/** Pure computation — extracted for testability */
export function computeDerivedMetrics(rows: FinancialModelRow[]): DerivedMetrics {
  if (rows.length === 0) {
    return {
      monthlyBurn: 0, runway: 0, totalFunding: 0, mrr: 0, grossMargin: 0,
      monthlyData: [], revenueBreakdown: [], opexBreakdown: [],
    };
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
  const totalFunding = rows
    .filter((r) => r.category === "funding")
    .reduce((s, r) => s + Number(r.amount), 0);

  // Runway
  const totalCash = monthlyData.reduce((s, m) => s + m.ebitda, 0) + totalFunding;
  const runway = monthlyBurn > 0 ? Math.max(0, totalCash / monthlyBurn) : 0;

  // Revenue breakdown by subcategory
  const revMap = new Map<string, number>();
  rows.filter((r) => r.category === "revenue").forEach((r) => {
    revMap.set(r.subcategory, (revMap.get(r.subcategory) ?? 0) + Number(r.amount));
  });
  const revenueBreakdown = Array.from(revMap.entries()).map(([subcategory, total]) => ({ subcategory, total }));

  // OpEx breakdown by subcategory
  const opexMap = new Map<string, number>();
  rows.filter((r) => r.category === "opex" || r.category === "headcount").forEach((r) => {
    opexMap.set(r.subcategory, (opexMap.get(r.subcategory) ?? 0) + Number(r.amount));
  });
  const opexBreakdown = Array.from(opexMap.entries())
    .map(([subcategory, total]) => ({ subcategory, total }))
    .sort((a, b) => b.total - a.total);

  return { monthlyBurn, runway, totalFunding, mrr, grossMargin, monthlyData, revenueBreakdown, opexBreakdown };
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

  const derived = useMemo<DerivedMetrics>(() => computeDerivedMetrics(query.data ?? []), [query.data]);

  return { ...query, derived };
}
