import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { type LinkAnalytics } from "@/hooks/useInvestorLinks";

interface EngagementChartProps {
  analytics: LinkAnalytics[];
}

export function EngagementChart({ analytics }: EngagementChartProps) {
  const data = analytics
    .filter((a) => a.totalViews > 0)
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 10)
    .map((a) => ({
      name: a.link.name.length > 15 ? a.link.name.slice(0, 15) + "…" : a.link.name,
      views: a.totalViews,
      avgTime: Math.round(a.avgDuration / 60),
      completion: Math.round(a.avgCompletion),
    }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No engagement data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="views" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Views" />
        <Bar dataKey="completion" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Completion %" />
      </BarChart>
    </ResponsiveContainer>
  );
}
