import { MonthlyAggregate } from "@/hooks/useFinancialModel";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO } from "date-fns";

const chartConfig = {
  revenue: { label: "Revenue", color: "hsl(var(--chart-positive))" },
  expenses: { label: "Expenses", color: "hsl(var(--chart-negative))" },
};

interface PLChartProps {
  data: MonthlyAggregate[];
}

export default function PLChart({ data }: PLChartProps) {
  const chartData = data.map((d) => ({
    month: format(parseISO(d.month), "MMM yy"),
    revenue: d.revenue,
    expenses: d.cogs + d.opex + d.headcount,
  }));

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">P&L Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No financial data yet. Build your model through the chat.</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="revenue" stackId="1" fill="var(--color-revenue)" stroke="var(--color-revenue)" fillOpacity={0.3} />
              <Area type="monotone" dataKey="expenses" stackId="2" fill="var(--color-expenses)" stroke="var(--color-expenses)" fillOpacity={0.3} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
