import { supabaseAdmin } from "../supabase.js";
import type { ApiKeyProvider, Credentials, SyncResult, FinancialModelRow } from "./types.js";

const API_BASE = "https://api.mercury.com/api/v1";
const PAGE_LIMIT = 500;
const MAX_TRANSACTIONS = 10_000; // Safety cap to prevent runaway pagination

export const mercuryProvider: ApiKeyProvider = {
  name: "mercury",
  authType: "api_key",

  async validateApiKey(apiKey: string) {
    const res = await fetch(`${API_BASE}/accounts`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });

    if (!res.ok) {
      return { valid: false };
    }

    const data = await res.json();
    const accounts = data.accounts || [];
    return {
      valid: true,
      metadata: {
        accountCount: accounts.length,
        accountIds: accounts.map((a: any) => a.id),
      },
    };
  },

  async syncFinancials(credentials: Credentials, organizationId: string): Promise<SyncResult> {
    if (credentials.type !== "api_key") throw new Error("Mercury requires API key credentials");
    const apiKey = credentials.apiKey;

    // Get accounts
    const accountsRes = await fetch(`${API_BASE}/accounts`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!accountsRes.ok) throw new Error(`Mercury accounts fetch failed: ${accountsRes.status}`);
    const { accounts } = await accountsRes.json();

    const now = new Date();
    const startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Pull transactions from all accounts with pagination
    const allTransactions: any[] = [];
    for (const account of accounts) {
      let offset = 0;
      let hasMore = true;

      while (hasMore && allTransactions.length < MAX_TRANSACTIONS) {
        const params = new URLSearchParams({
          start: startDate.toISOString().slice(0, 10),
          end: endDate.toISOString().slice(0, 10),
          limit: String(PAGE_LIMIT),
          offset: String(offset),
        });

        const txRes = await fetch(`${API_BASE}/account/${account.id}/transactions?${params}`, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        });

        if (!txRes.ok) {
          const body = await txRes.text().catch(() => "");
          throw new Error(`Mercury transaction fetch failed for account ${account.id}: ${txRes.status} — ${body}`);
        }

        const data = await txRes.json();
        const txns = data.transactions || [];
        allTransactions.push(...txns);
        hasMore = txns.length === PAGE_LIMIT;
        offset += txns.length;
      }
    }

    // Group transactions by month and categorize
    const monthlyData: Record<string, Record<string, number>> = {};

    for (const tx of allTransactions) {
      if (tx.status === "cancelled" || tx.status === "failed") continue;

      const date = new Date(tx.postedDate || tx.createdAt);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthlyData[month]) monthlyData[month] = {};

      const category = categorizeMercuryTx(tx);
      const subcategory = tx.bankDescription || tx.externalMemo || category;
      const key = `${category}\0${subcategory}`;
      monthlyData[month][key] = (monthlyData[month][key] || 0) + Math.abs(tx.amount);
    }

    // Build financial_model rows
    const rows: FinancialModelRow[] = [];
    for (const [month, entries] of Object.entries(monthlyData)) {
      for (const [key, amount] of Object.entries(entries)) {
        const [category, subcategory] = key.split("\0");
        rows.push({
          organization_id: organizationId,
          category,
          subcategory,
          month,
          amount,
          scenario: "base",
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from("financial_model")
        .upsert(rows, { onConflict: "organization_id,category,subcategory,month,scenario" });
      if (error) throw new Error(`DB upsert failed: ${error.message}`);
    }

    const categories: Record<string, number> = {};
    for (const r of rows) {
      categories[r.category] = (categories[r.category] || 0) + 1;
    }

    return {
      rowsImported: rows.length,
      categories,
      period: {
        start: startDate.toISOString().slice(0, 10),
        end: endDate.toISOString().slice(0, 10),
      },
    };
  },
};

function categorizeMercuryTx(tx: any): string {
  const kind = (tx.kind || "").toLowerCase();
  const description = (tx.bankDescription || "").toLowerCase();
  const memo = (tx.externalMemo || "").toLowerCase();
  const combined = `${description} ${memo}`;

  // Payroll & HR platforms
  if (
    kind === "payroll" ||
    combined.includes("payroll") ||
    combined.includes("gusto") ||
    combined.includes("rippling") ||
    combined.includes("deel") ||
    combined.includes("justworks") ||
    combined.includes("adp")
  ) {
    return "headcount";
  }

  // Benefits & insurance
  if (
    combined.includes("health insurance") ||
    combined.includes("dental") ||
    combined.includes("401k") ||
    combined.includes("benefits") ||
    combined.includes("cobra")
  ) {
    return "headcount";
  }

  // Revenue (inbound transactions)
  if (tx.amount > 0) {
    return "revenue";
  }

  // Infrastructure / COGS — cloud, hosting, data services
  if (
    combined.includes("aws") ||
    combined.includes("amazon web services") ||
    combined.includes("google cloud") ||
    combined.includes("gcp") ||
    combined.includes("azure") ||
    combined.includes("heroku") ||
    combined.includes("vercel") ||
    combined.includes("netlify") ||
    combined.includes("datadog") ||
    combined.includes("mongodb") ||
    combined.includes("snowflake") ||
    combined.includes("twilio") ||
    combined.includes("sendgrid") ||
    combined.includes("cloudflare")
  ) {
    return "cogs";
  }

  return "opex";
}
