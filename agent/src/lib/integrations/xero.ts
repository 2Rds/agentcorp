import { config } from "../../config.js";
import { supabaseAdmin } from "../supabase.js";
import type { OAuthProvider, TokenSet, Credentials, SyncResult, FinancialModelRow } from "./types.js";

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const API_BASE = "https://api.xero.com/api.xro/2.0";

export const xeroProvider: OAuthProvider = {
  name: "xero",
  authType: "oauth2",

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: config.xeroClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid profile email accounting.reports.read accounting.transactions.read offline_access",
      state,
    });
    return `${AUTH_URL}?${params}`;
  },

  async exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
    const basic = Buffer.from(
      `${config.xeroClientId}:${config.xeroClientSecret}`
    ).toString("base64");

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Xero token exchange failed: ${text}`);
    }

    const data = await res.json();

    // Get tenant ID from connections endpoint
    const connectionsRes = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    if (!connectionsRes.ok) {
      const errText = await connectionsRes.text().catch(() => "");
      throw new Error(`Xero connections fetch failed: ${connectionsRes.status} — ${errText}`);
    }

    const connections = await connectionsRes.json();
    if (!connections.length || !connections[0]?.tenantId) {
      throw new Error("No Xero tenants found. Ensure your Xero organization is connected.");
    }

    const tenantId = connections[0].tenantId;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      metadata: { tenantId },
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const basic = Buffer.from(
      `${config.xeroClientId}:${config.xeroClientSecret}`
    ).toString("base64");

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      throw new Error(`Xero token refresh failed: ${res.status}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async syncFinancials(credentials: Credentials, organizationId: string): Promise<SyncResult> {
    if (credentials.type !== "oauth2") throw new Error("Xero requires OAuth credentials");
    const tenantId = credentials.metadata?.tenantId as string;
    if (!tenantId) throw new Error("Missing tenantId in Xero metadata");

    const now = new Date();
    const startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const params = new URLSearchParams({
      fromDate: startDate.toISOString().slice(0, 10),
      toDate: endDate.toISOString().slice(0, 10),
      periods: "12",
      timeframe: "MONTH",
    });

    const res = await fetch(`${API_BASE}/Reports/ProfitAndLoss?${params}`, {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Xero-tenant-id": tenantId,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Xero P&L fetch failed: ${res.status}`);
    }

    const data = await res.json();
    const rows = mapXeroReportToRows(data, organizationId, startDate);

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

function mapXeroReportToRows(data: any, orgId: string, startDate: Date): FinancialModelRow[] {
  const rows: FinancialModelRow[] = [];
  const report = data?.Reports?.[0];
  if (!report?.Rows) return rows;

  // Map Xero section titles to our categories
  const sectionMap: Record<string, string> = {
    Income: "revenue",
    Revenue: "revenue",
    "Less Cost of Sales": "cogs",
    "Cost of Sales": "cogs",
    "Less Operating Expenses": "opex",
    "Operating Expenses": "opex",
    Expenses: "opex",
  };

  let currentCategory: string | null = null;

  for (const section of report.Rows) {
    if (section.RowType === "Section" && section.Title) {
      // Match section title to category
      for (const [key, cat] of Object.entries(sectionMap)) {
        if (section.Title.includes(key)) {
          currentCategory = cat;
          break;
        }
      }
    }

    if (!currentCategory || !section.Rows) continue;

    for (const row of section.Rows) {
      if (row.RowType !== "Row" || !row.Cells) continue;
      const name = row.Cells[0]?.Value;
      if (!name) continue;

      // Each subsequent cell is a month column
      for (let i = 1; i < row.Cells.length; i++) {
        const amount = parseFloat(row.Cells[i]?.Value);
        if (isNaN(amount) || amount === 0) continue;
        const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + (i - 1), 1);
        const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
        rows.push({
          organization_id: orgId,
          category: currentCategory,
          subcategory: name,
          month,
          amount: Math.abs(amount),
          scenario: "base",
        });
      }
    }
  }

  return rows;
}
