import { MonthlyAggregate } from "@/hooks/useFinancialModel";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO } from "date-fns";

const chartConfig = {
  revenue: { label: "Revenue", color: "hsl(var(--chart-positive))" },
  cogs: { label: "COGS", color: "hsl(var(--chart-4))" },
  opex: { label: "OpEx", color: "hsl(var(--chart-negative))" },
};

interface PLChartProps {
  data: MonthlyAggregate[];
}

export default function PLChart({ data }: PLChartProps) {
  const chartData = data.map((d) => ({
    month: format(parseISO(d.month), "MMM yy"),
    revenue: d.revenue,
    cogs: d.cogs,
    opex: d.opex,
  }));

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">P&L Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No financial data yet. Ask the CFO agent to build your model.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="revenue" fill="var(--color-revenue)" stroke="var(--color-revenue)" fillOpacity={0.3} />
              <Area type="monotone" dataKey="cogs" fill="var(--color-cogs)" stroke="var(--color-cogs)" fillOpacity={0.3} />
              <Area type="monotone" dataKey="opex" fill="var(--color-opex)" stroke="var(--color-opex)" fillOpacity={0.3} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
