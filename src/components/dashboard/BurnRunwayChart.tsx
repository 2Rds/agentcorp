import { MonthlyAggregate } from "@/hooks/useFinancialModel";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO } from "date-fns";

const chartConfig = {
  ebitda: { label: "EBITDA", color: "hsl(var(--chart-1))" },
  grossProfit: { label: "Gross Profit", color: "hsl(var(--chart-2))" },
};

interface BurnRunwayChartProps {
  data: MonthlyAggregate[];
}

export default function BurnRunwayChart({ data }: BurnRunwayChartProps) {
  const chartData = data.map((d) => ({
    month: format(parseISO(d.month), "MMM yy"),
    ebitda: d.ebitda,
    grossProfit: d.grossProfit,
  }));

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">EBITDA & Gross Profit</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No data yet.</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Bar dataKey="grossProfit" fill="var(--color-grossProfit)" opacity={0.4} radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="ebitda" stroke="var(--color-ebitda)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
