import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export interface CapTableEntry {
  id: string;
  organization_id: string;
  stakeholder_name: string;
  stakeholder_type: string;
  shares: number;
  ownership_pct: number;
  investment_amount: number;
  share_price: number;
  round_name: string | null;
  date: string | null;
}

export interface CapTableSummary {
  entries: CapTableEntry[];
  totalShares: number;
  totalInvestment: number;
  byType: { type: string; pct: number; count: number }[];
}

export function useCapTable(orgId: string | null) {
  const query = useQuery({
    queryKey: ["cap_table", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("cap_table_entries")
        .select("*")
        .eq("organization_id", orgId)
        .order("ownership_pct", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CapTableEntry[];
    },
    enabled: !!orgId,
  });

  const summary = useMemo<CapTableSummary>(() => {
    const entries = query.data ?? [];
    const totalShares = entries.reduce((s, e) => s + Number(e.shares), 0);
    const totalInvestment = entries.reduce((s, e) => s + Number(e.investment_amount), 0);

    const typeMap = new Map<string, { pct: number; count: number }>();
    entries.forEach((e) => {
      const existing = typeMap.get(e.stakeholder_type) ?? { pct: 0, count: 0 };
      existing.pct += Number(e.ownership_pct);
      existing.count += 1;
      typeMap.set(e.stakeholder_type, existing);
    });
    const byType = Array.from(typeMap.entries()).map(([type, v]) => ({ type, ...v }));

    return { entries, totalShares, totalInvestment, byType };
  }, [query.data]);

  return { ...query, summary };
}
