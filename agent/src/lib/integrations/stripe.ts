import { config } from "../../config.js";
import { supabaseAdmin } from "../supabase.js";
import type { OAuthProvider, TokenSet, Credentials, SyncResult, FinancialModelRow } from "./types.js";

// NOTE: Stripe Connect OAuth is deprecated in favor of embedded onboarding.
// https://docs.stripe.com/connect/oauth-deprecation
// This implementation uses the legacy OAuth flow which Stripe still supports
// for existing integrations. New apps should use OAuth 2.0 with PKCE or
// Stripe's embedded components. Consider migrating when Stripe sets a sunset date.
const AUTH_URL = "https://connect.stripe.com/oauth/authorize";
const TOKEN_URL = "https://connect.stripe.com/oauth/token";
const API_BASE = "https://api.stripe.com/v1";

export const stripeProvider: OAuthProvider = {
  name: "stripe",
  authType: "oauth2",

  getAuthorizationUrl(state: string, _redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: config.stripeClientId,
      response_type: "code",
      scope: "read_only",
      state,
    });
    return `${AUTH_URL}?${params}`;
  },

  async exchangeCode(code: string): Promise<TokenSet> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_secret: config.stripeClientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Stripe token exchange failed: ${text}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      metadata: { stripeUserId: data.stripe_user_id, livemode: data.livemode },
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_secret: config.stripeClientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      throw new Error(`Stripe token refresh failed: ${res.status}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  },

  async syncFinancials(credentials: Credentials, organizationId: string): Promise<SyncResult> {
    if (credentials.type !== "oauth2") throw new Error("Stripe requires OAuth credentials");
    const token = credentials.accessToken;

    const now = new Date();
    const startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Pull balance transactions
    const transactions = await fetchAllStripe(
      `${API_BASE}/balance_transactions`,
      token,
      { created: { gte: startTs }, limit: 100 }
    );

    // Pull active subscriptions for MRR
    const subscriptions = await fetchAllStripe(
      `${API_BASE}/subscriptions`,
      token,
      { status: "active", limit: 100 }
    );

    // Group balance transactions by month
    const monthlyRevenue: Record<string, number> = {};
    const monthlyFees: Record<string, number> = {};

    for (const tx of transactions) {
      const date = new Date(tx.created * 1000);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (tx.type === "charge" || tx.type === "payment") {
        monthlyRevenue[month] = (monthlyRevenue[month] || 0) + tx.amount / 100;
      }
      if (tx.fee) {
        monthlyFees[month] = (monthlyFees[month] || 0) + tx.fee / 100;
      }
    }

    // Calculate MRR from active subscriptions
    let mrr = 0;
    for (const sub of subscriptions) {
      const plan = sub.plan || sub.items?.data?.[0]?.plan;
      if (!plan) continue;
      const amount = plan.amount / 100;
      if (plan.interval === "month") mrr += amount;
      else if (plan.interval === "year") mrr += amount / 12;
    }

    // Build rows
    const rows: FinancialModelRow[] = [];
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    for (const [month, amount] of Object.entries(monthlyRevenue)) {
      rows.push({
        organization_id: organizationId,
        category: "revenue",
        subcategory: "Stripe Revenue",
        month,
        amount,
        scenario: "base",
      });
    }

    for (const [month, amount] of Object.entries(monthlyFees)) {
      rows.push({
        organization_id: organizationId,
        category: "cogs",
        subcategory: "Stripe Processing Fees",
        month,
        amount,
        scenario: "base",
      });
    }

    if (mrr > 0) {
      rows.push({
        organization_id: organizationId,
        category: "revenue",
        subcategory: "Stripe MRR (Subscriptions)",
        month: currentMonth,
        amount: mrr,
        scenario: "base",
      });
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

async function fetchAllStripe(url: string, token: string, params: Record<string, any>): Promise<any[]> {
  const items: any[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  const MAX_PAGES = 50; // Cap at 5,000 items to prevent runaway pagination
  let page = 0;

  while (hasMore && page < MAX_PAGES) {
    page++;
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "object") {
        for (const [subKey, subVal] of Object.entries(value as Record<string, any>)) {
          searchParams.set(`${key}[${subKey}]`, String(subVal));
        }
      } else {
        searchParams.set(key, String(value));
      }
    }
    if (startingAfter) searchParams.set("starting_after", startingAfter);

    const res = await fetch(`${url}?${searchParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Stripe API request failed: ${res.status} ${res.statusText} — ${body}`);
    }

    const data = await res.json();
    items.push(...(data.data || []));
    hasMore = data.has_more === true;
    if (data.data?.length > 0) {
      startingAfter = data.data[data.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return items;
}
