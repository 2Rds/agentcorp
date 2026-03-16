import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, TrendingUp, DollarSign, Clock } from "lucide-react";

interface PnLRow {
  month: string;
  revenue: number;
  cogs: number;
  opex: number;
  grossProfit: number;
  ebitda: number;
}

interface DataRoomMetricsProps {
  pnl: PnLRow[];
}

export function DataRoomMetrics({ pnl }: DataRoomMetricsProps) {
  if (pnl.length === 0) return null;

  const latest = pnl[pnl.length - 1];
  const prev = pnl.length > 1 ? pnl[pnl.length - 2] : null;

  const mrr = latest.revenue;
  const burn = Math.abs(Math.min(0, latest.ebitda));
  const grossMargin = latest.revenue > 0 ? ((latest.grossProfit / latest.revenue) * 100) : 0;

  // Simple runway estimate
  const totalCash = pnl.reduce((s, r) => s + r.ebitda, 0);
  const runway = burn > 0 ? Math.max(0, Math.round(totalCash / burn)) : null;

  const revenueGrowth = prev && prev.revenue > 0
    ? ((latest.revenue - prev.revenue) / prev.revenue * 100)
    : null;

  const metrics = [
    {
      label: "MRR",
      value: `$${mrr.toLocaleString()}`,
      change: revenueGrowth !== null ? `${revenueGrowth >= 0 ? "+" : ""}${revenueGrowth.toFixed(1)}%` : undefined,
      positive: revenueGrowth !== null ? revenueGrowth >= 0 : undefined,
      icon: DollarSign,
    },
    {
      label: "Monthly Burn",
      value: burn > 0 ? `$${burn.toLocaleString()}` : "Profitable",
      icon: TrendingDown,
    },
    {
      label: "Runway",
      value: runway !== null ? `${runway} months` : "N/A",
      icon: Clock,
    },
    {
      label: "Gross Margin",
      value: `${grossMargin.toFixed(1)}%`,
      positive: grossMargin >= 60,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {metrics.map(m => (
        <Card key={m.label} className="border-border/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <m.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold text-foreground">{m.value}</p>
            {m.change && (
              <p className={`text-xs mt-0.5 ${m.positive ? "text-green-500" : "text-red-500"}`}>
                {m.change} MoM
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
