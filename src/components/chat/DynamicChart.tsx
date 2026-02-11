import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChartConfig {
  type: "line" | "bar" | "area" | "pie" | "kpi";
  title: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
  colors?: string[];
}

const DEFAULT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function DynamicChart({ config }: { config: ChartConfig }) {
  const { type, title, data, xKey, yKeys = [], colors = DEFAULT_COLORS } = config;

  if (!data || data.length === 0) {
    return (
      <Card className="border-border/50 my-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No data to display</p>
        </CardContent>
      </Card>
    );
  }

  // KPI card
  if (type === "kpi") {
    const row = data[0];
    const entries = Object.entries(row).filter(([, v]) => v != null);
    return (
      <Card className="border-border/50 my-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {entries.map(([key, value]) => (
              <div key={key}>
                <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                <p className="text-2xl font-bold">
                  {typeof value === "number" ? value.toLocaleString() : String(value)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 my-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          {type === "area" ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip />
              <Legend />
              {yKeys.map((key, i) => (
                <Area key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2} />
              ))}
            </AreaChart>
          ) : type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip />
              <Legend />
              {yKeys.map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          ) : type === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={yKeys[0]}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip />
              <Legend />
              {yKeys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
