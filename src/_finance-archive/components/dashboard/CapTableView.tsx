import { CapTableSummary } from "@/hooks/useCapTable";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const chartConfig = {
  ownership: { label: "Ownership" },
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface CapTableViewProps {
  summary: CapTableSummary;
}

export default function CapTableView({ summary }: CapTableViewProps) {
  const { entries } = summary;

  if (entries.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cap Table</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-8">No cap table data yet.</p>
        </CardContent>
      </Card>
    );
  }

  const pieData = entries.map((e) => ({
    name: e.stakeholder_name,
    value: Number(e.ownership_pct),
  }));

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Cap Table</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Stakeholder</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs text-right">Ownership</TableHead>
                <TableHead className="text-xs text-right">Invested</TableHead>
                <TableHead className="text-xs">Round</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm font-medium">{e.stakeholder_name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs capitalize">{e.stakeholder_type.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-right">{Number(e.ownership_pct).toFixed(1)}%</TableCell>
                  <TableCell className="text-sm text-right">{fmt(Number(e.investment_amount))}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.round_name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
