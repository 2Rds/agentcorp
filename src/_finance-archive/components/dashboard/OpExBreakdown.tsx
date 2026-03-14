import { OpExBreakdown as OpExData } from "@/hooks/useFinancialModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface OpExBreakdownProps {
  data: OpExData[];
}

export default function OpExBreakdownView({ data }: OpExBreakdownProps) {
  if (data.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">OpEx Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-8">No operating expense data yet.</p>
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(...data.map((d) => d.total));
  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">OpEx Breakdown</CardTitle>
          <span className="text-xs text-muted-foreground">Total: {fmt(total)}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((item) => (
          <div key={item.subcategory} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{item.subcategory}</span>
              <span className="font-medium tabular-nums">{fmt(item.total)}</span>
            </div>
            <Progress value={(item.total / max) * 100} className="h-1.5" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
