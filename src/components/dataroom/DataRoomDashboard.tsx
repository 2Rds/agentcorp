import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRoomMetrics } from "./DataRoomMetrics";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";

interface PnLRow {
  month: string;
  revenue: number;
  cogs: number;
  opex: number;
  grossProfit: number;
  ebitda: number;
}

interface CapTableEntry {
  stakeholder_name: string;
  stakeholder_type: string;
  shares: number;
  ownership_pct: number;
  investment_amount: number | null;
  round_name: string | null;
}

interface DataRoomDashboardProps {
  agentUrl: string;
  slug: string;
  authQuery: string;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function DataRoomDashboard({ agentUrl, slug, authQuery }: DataRoomDashboardProps) {
  const [pnl, setPnl] = useState<PnLRow[]>([]);
  const [capTable, setCapTable] = useState<CapTableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [finResp, capResp] = await Promise.all([
          fetch(`${agentUrl}/dataroom/${slug}/financials?${authQuery}`),
          fetch(`${agentUrl}/dataroom/${slug}/cap-table?${authQuery}`),
        ]);

        if (!finResp.ok || !capResp.ok) {
          setFetchError("Failed to load financial data. Please try again.");
          return;
        }

        const [finRes, capRes] = await Promise.all([finResp.json(), capResp.json()]);
        setPnl(finRes.pnl ?? []);
        setCapTable(capRes.entries ?? []);
      } catch (err) {
        console.error("DataRoomDashboard fetch error:", err);
        setFetchError("Unable to connect to data room server.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agentUrl, slug, authQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex items-center justify-center py-20 text-center">
        <p className="text-sm text-muted-foreground">{fetchError}</p>
      </div>
    );
  }

  const chartData = pnl.map(row => ({
    month: row.month.slice(0, 7),
    Revenue: row.revenue,
    COGS: row.cogs,
    OpEx: row.opex,
    EBITDA: row.ebitda,
  }));

  return (
    <div className="max-w-5xl mx-auto">
      <DataRoomMetrics pnl={pnl} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue & Costs Chart */}
        {chartData.length > 0 && (
          <Card className="border-border/50 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">P&L Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="Revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="COGS" stroke="hsl(var(--chart-4))" fill="hsl(var(--chart-4))" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="OpEx" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* EBITDA Trend */}
        {chartData.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">EBITDA Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="EBITDA" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Cap Table Pie */}
        {capTable.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ownership Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={capTable}
                    dataKey="ownership_pct"
                    nameKey="stakeholder_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ stakeholder_name, ownership_pct }) =>
                      `${stakeholder_name} ${ownership_pct.toFixed(1)}%`
                    }
                  >
                    {capTable.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cap Table Detail */}
      {capTable.length > 0 && (
        <Card className="border-border/50 mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cap Table</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Stakeholder</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium text-right">Shares</th>
                    <th className="pb-2 font-medium text-right">Ownership</th>
                    <th className="pb-2 font-medium text-right">Investment</th>
                    <th className="pb-2 font-medium">Round</th>
                  </tr>
                </thead>
                <tbody>
                  {capTable.map((entry, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 font-medium">{entry.stakeholder_name}</td>
                      <td className="py-2 capitalize text-muted-foreground">{entry.stakeholder_type}</td>
                      <td className="py-2 text-right">{entry.shares.toLocaleString()}</td>
                      <td className="py-2 text-right">{entry.ownership_pct.toFixed(2)}%</td>
                      <td className="py-2 text-right">{entry.investment_amount ? `$${entry.investment_amount.toLocaleString()}` : "-"}</td>
                      <td className="py-2 text-muted-foreground">{entry.round_name ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
