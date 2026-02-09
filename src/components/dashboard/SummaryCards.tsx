import { Card, CardContent } from "@/components/ui/card";
import { DerivedMetrics } from "@/hooks/useFinancialModel";
import { TrendingDown, Clock, DollarSign, BarChart3 } from "lucide-react";

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface SummaryCardsProps {
  metrics: DerivedMetrics;
}

const cards = [
  { key: "monthlyBurn" as const, label: "Monthly Burn", icon: TrendingDown, format: fmt },
  { key: "runway" as const, label: "Runway", icon: Clock, format: (n: number) => `${n.toFixed(1)} mo` },
  { key: "totalFunding" as const, label: "Total Funding", icon: DollarSign, format: fmt },
  { key: "mrr" as const, label: "MRR", icon: BarChart3, format: fmt },
];

export default function SummaryCards({ metrics }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ key, label, icon: Icon, format }) => (
        <Card key={key} className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Icon className="w-4 h-4" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-2xl font-semibold tracking-tight">{format(metrics[key])}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
