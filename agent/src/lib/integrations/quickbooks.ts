import { config } from "../../config.js";
import { supabaseAdmin } from "../supabase.js";
import type { OAuthProvider, TokenSet, Credentials, SyncResult, FinancialModelRow } from "./types.js";

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API_BASE = "https://quickbooks.api.intuit.com";

export const quickbooksProvider: OAuthProvider = {
  name: "quickbooks",
  authType: "oauth2",

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: config.quickbooksClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "com.intuit.quickbooks.accounting",
      state,
    });
    return `${AUTH_URL}?${params}`;
  },

  async exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
    const basic = Buffer.from(
      `${config.quickbooksClientId}:${config.quickbooksClientSecret}`
    ).toString("base64");

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`QuickBooks token exchange failed: ${text}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      metadata: { realmId: data.realmId || new URL(res.url).searchParams.get("realmId") },
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const basic = Buffer.from(
      `${config.quickbooksClientId}:${config.quickbooksClientSecret}`
    ).toString("base64");

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      throw new Error(`QuickBooks token refresh failed: ${res.status}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async syncFinancials(credentials: Credentials, organizationId: string): Promise<SyncResult> {
    if (credentials.type !== "oauth2") throw new Error("QuickBooks requires OAuth credentials");
    const realmId = credentials.metadata?.realmId as string;
    if (!realmId) throw new Error("Missing realmId in QuickBooks metadata");

    // Pull P&L report for last 12 months
    const now = new Date();
    const startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const params = new URLSearchParams({
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      summarize_column_by: "Month",
    });

    const res = await fetch(
      `${API_BASE}/v3/company/${realmId}/reports/ProfitAndLoss?${params}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`QuickBooks P&L fetch failed: ${res.status}`);
    }

    const report = await res.json();
    const rows = mapQBReportToRows(report, organizationId);

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

function mapQBReportToRows(report: any, orgId: string): FinancialModelRow[] {
  const rows: FinancialModelRow[] = [];
  const columns = report?.Columns?.Column;
  if (!columns) return rows;

  // Extract month headers from columns (skip first "Account" column)
  const months: string[] = columns
    .slice(1)
    .filter((c: any) => c.ColType === "Money")
    .map((c: any) => {
      // ColTitle is like "Jan 2025" — convert to YYYY-MM
      const parts = c.ColTitle?.split(" ");
      if (!parts || parts.length < 2) return null;
      const monthNames: Record<string, string> = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      };
      const m = monthNames[parts[0]];
      return m ? `${parts[1]}-${m}` : null;
    })
    .filter(Boolean);

  function processSection(section: any, category: string) {
    if (!section?.Rows?.Row) return;
    for (const row of section.Rows.Row) {
      if (row.type === "Data" && row.ColData) {
        const name = row.ColData[0]?.value;
        if (!name) continue;
        const values = row.ColData.slice(1).filter((_: any, i: number) => i < months.length);
        for (let i = 0; i < values.length; i++) {
          const amount = parseFloat(values[i]?.value);
          if (!isNaN(amount) && amount !== 0 && months[i]) {
            rows.push({
              organization_id: orgId,
              category,
              subcategory: name,
              month: months[i],
              amount,
              scenario: "base",
            });
          }
        }
      }
      // Recurse into subsections
      if (row.Rows) processSection(row, category);
    }
  }

  // Map QBO report sections to our categories
  const sectionMap: Record<string, string> = {
    Income: "revenue",
    CostOfGoodsSold: "cogs",
    Expenses: "opex",
  };

  for (const section of report?.Rows?.Row || []) {
    const group = section.group;
    if (group && sectionMap[group]) {
      processSection(section, sectionMap[group]);
    }
  }

  return rows;
}
