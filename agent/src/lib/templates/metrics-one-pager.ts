/**
 * Metrics One-Pager Template
 *
 * Takes structured financial data and returns formatted HTML
 * for the PDF generator. Agent calls get_derived_metrics first,
 * then passes the data to this template.
 */

export interface MetricsData {
  companyName?: string;
  period?: string;
  mrr?: number;
  arr?: number;
  monthlyBurn?: number;
  runway?: number;
  grossMargin?: number;
  revenue?: number;
  cogs?: number;
  opex?: number;
  headcount?: number;
  cashOnHand?: number;
  customMetrics?: Array<{ label: string; value: string }>;
}

function fmt(n: number | undefined, prefix = "$"): string {
  if (n === undefined || n === null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n.toLocaleString()}`;
}

function pct(n: number | undefined): string {
  if (n === undefined || n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function metricCard(label: string, value: string): string {
  return `<div class="metric-card">
  <div class="label">${label}</div>
  <div class="value">${value}</div>
</div>`;
}

export function renderMetricsOnePager(data: MetricsData): string {
  const cards: string[] = [];

  if (data.mrr !== undefined) cards.push(metricCard("Monthly Recurring Revenue", fmt(data.mrr)));
  if (data.arr !== undefined) cards.push(metricCard("Annual Run Rate", fmt(data.arr)));
  if (data.monthlyBurn !== undefined) cards.push(metricCard("Monthly Burn", fmt(data.monthlyBurn)));
  if (data.runway !== undefined) cards.push(metricCard("Runway", `${data.runway.toFixed(1)} months`));
  if (data.grossMargin !== undefined) cards.push(metricCard("Gross Margin", pct(data.grossMargin)));
  if (data.cashOnHand !== undefined) cards.push(metricCard("Cash on Hand", fmt(data.cashOnHand)));

  if (data.customMetrics) {
    for (const m of data.customMetrics) {
      cards.push(metricCard(m.label, m.value));
    }
  }

  const sections: string[] = [];

  // Key Metrics grid
  if (cards.length > 0) {
    sections.push(`<h2>Key Metrics${data.period ? ` — ${data.period}` : ""}</h2>\n<div>${cards.join("\n")}</div>`);
  }

  // Financial breakdown table
  if (data.revenue !== undefined || data.cogs !== undefined || data.opex !== undefined) {
    const rows: string[] = [];
    if (data.revenue !== undefined) rows.push(`<tr><td>Revenue</td><td>${fmt(data.revenue)}</td></tr>`);
    if (data.cogs !== undefined) rows.push(`<tr><td>COGS</td><td>${fmt(data.cogs)}</td></tr>`);
    if (data.revenue !== undefined && data.cogs !== undefined) {
      const gp = data.revenue - data.cogs;
      rows.push(`<tr><td><strong>Gross Profit</strong></td><td><strong>${fmt(gp)}</strong></td></tr>`);
    }
    if (data.opex !== undefined) rows.push(`<tr><td>Operating Expenses</td><td>${fmt(data.opex)}</td></tr>`);
    if (data.revenue !== undefined && data.cogs !== undefined && data.opex !== undefined) {
      const ebitda = data.revenue - data.cogs - data.opex;
      rows.push(`<tr><td><strong>EBITDA</strong></td><td><strong>${fmt(ebitda)}</strong></td></tr>`);
    }
    if (data.headcount !== undefined) rows.push(`<tr><td>Headcount</td><td>${data.headcount}</td></tr>`);

    sections.push(`<h2>Financial Summary</h2>
<table>
  <thead><tr><th>Line Item</th><th>Amount</th></tr></thead>
  <tbody>${rows.join("\n")}</tbody>
</table>`);
  }

  return sections.join("\n\n");
}
