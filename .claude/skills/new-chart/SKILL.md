---
name: new-chart
description: Scaffold a new Recharts dashboard chart component following project patterns
disable-model-invocation: true
---

# New Dashboard Chart

When the user invokes `/new-chart`, scaffold a new chart component in `src/components/dashboard/` that follows the project's established patterns.

## Arguments

The user should provide:
- Chart name (e.g., "RevenueGrowthChart")
- Chart type (Area, Bar, Line, ComposedChart, Pie)
- Data source (which hook/data shape it consumes)

## Component Pattern

Every dashboard chart in this project follows this structure exactly:

```tsx
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { /* chart components */ } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO } from "date-fns";

const chartConfig = {
  dataKey: { label: "Human Label", color: "hsl(var(--chart-1))" },
  // Use theme CSS variables for colors:
  // --chart-1 through --chart-5
  // --chart-positive (green, for revenue/growth)
  // --chart-negative (red, for expenses/burn)
};

interface ChartNameProps {
  data: DataType[];
}

export default function ChartName({ data }: ChartNameProps) {
  const chartData = data.map((d) => ({
    month: format(parseISO(d.month), "MMM yy"),
    // ...mapped fields
  }));

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Chart Title</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No data yet.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            {/* Recharts component here */}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

## Rules

1. **Always use `ChartContainer`** from `@/components/ui/chart` — never use `ResponsiveContainer` directly
2. **Always use `ChartTooltip` with `ChartTooltipContent`** — not Recharts' built-in Tooltip
3. **Card wrapper**: Use `Card` with `className="border-border/50"`, `CardHeader` with `pb-2`, `CardTitle` with `text-sm font-medium`
4. **Chart height**: Use `h-[260px] w-full` on ChartContainer for consistency
5. **Empty state**: Always handle empty data with a centered muted message
6. **Colors**: Use CSS variables via `chartConfig` — reference `var(--color-<dataKey>)` in chart elements
7. **Axis formatting**: Use `tick={{ fontSize: 11 }}` and `className="fill-muted-foreground"` on axes. Format currency with `tickFormatter={(v) => \`$${(v / 1000).toFixed(0)}k\`}`
8. **Grid**: Use `<CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />`
9. **Date formatting**: Parse with `parseISO`, format with `format(date, "MMM yy")`
10. **Export**: Use `export default function` (default export)
11. **Types**: Import data types from the relevant hook in `@/hooks/`

## Available Chart Color Variables

| Variable | Use for |
|----------|---------|
| `--chart-1` through `--chart-5` | General purpose series colors |
| `--chart-positive` | Revenue, growth, positive metrics |
| `--chart-negative` | Expenses, burn, negative metrics |

## Data Sources

Charts typically consume data from these hooks:
- `useFinancialModel` — exports `MonthlyAggregate[]`, `OpExBreakdown[]`, `DerivedMetrics`
- `useCapTable` — exports cap table entries with ownership data

After creating the component, remind the user to import it in `src/pages/Dashboard.tsx`.
