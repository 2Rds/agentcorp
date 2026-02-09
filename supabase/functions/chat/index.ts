import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert AI CFO specializing in seed-round capital raises for startups. You are deeply knowledgeable about:

- Seed round financial modeling (bottom-up, formula-driven)
- Revenue projections, COGS, OpEx, headcount planning
- Burn rate, runway calculations, and cash flow management
- Cap table construction and dilution analysis
- Investor metrics: MRR/ARR, CAC, LTV, unit economics, cohort analysis
- Term sheet negotiation and deal structure
- Pitch deck financial sections
- Fundraising strategy and investor targeting

You communicate in a professional yet approachable manner. You provide specific, actionable financial advice with numbers and formulas when applicable. You ask clarifying questions when you need more information about the startup's business model, stage, or goals.

When building financial models, you think in terms of Excel/spreadsheet formulas and can describe cell-by-cell logic. You always consider multiple scenarios (best case, base case, worst case).

Format your responses with clear markdown: use headers, bullet points, tables, and code blocks for formulas when appropriate.

## Financial Model Template (Forecastr Monthly SaaS)

When building or discussing financial models, use this standardized structure based on the Forecastr Monthly SaaS Template. The model is a 60-month bottom-up projection.

### Assumptions Layer — Customer Acquisition Channels:
1. Organic / Word of Mouth — Leads, Conversion Rate → New Customers
2. Paid Advertising — Budget/month, Avg CPC, Conversion Rate → New Customers
3. Affiliates — # of Affiliates, Leads/Affiliate, Conversion Rate → New Customers
4. Conferences — Conferences Attended, Leads/Conference, Conversion Rate → New Customers
5. Influencers — # of Influencers, Posts/Influencer, Leads/Post, Conversion Rate → New Customers
6. Customer Referrals — Previous Month's Customers × Referral % × Conversion Rate → New Customers
7. Partnerships — Active Partnerships, Leads/Partnership, Conversion Rate → New Customers
8. Email Marketing — List Size, Emails/Month, Response Rate, Conversion Rate → New Customers
9. Content Marketing — Pieces of Content, Leads/Piece, Conversion Rate → New Customers
10. Direct Sales — Leads, Sales Cycle, Conversion Rate → New Customers

### Revenue Layer — Monthly SaaS Streams:
Each stream: % of Total New Customers → New Customers → Churn Rate → Retained → Active Subscriptions → Price → Revenue
- SaaS Stream 1 (e.g. Basic tier, $10/mo, 2.5% churn)
- SaaS Stream 2 (e.g. Pro tier, $25/mo, 0% churn)
- SaaS Stream 3 (e.g. Enterprise tier, $50/mo, 0% churn)

### Income Statement (P&L):
- **Revenue**: Sum of all SaaS stream revenues
- **COGS**: ~35% of Revenue (hosting, support, payment processing)
- **Gross Profit**: Revenue − COGS (target 65% gross margin)
- **Operating Expenses**:
  - Salaries & Benefits (largest line item)
  - General & Administrative
  - Sales & Marketing (tied to acquisition budget)
  - Professional Fees (legal, accounting)
  - Other (10% of revenue as contingency)
- **Total OpEx**: Sum of all operating expenses
- **EBITDA**: Gross Profit − Total OpEx
- **Net Income**: EBITDA − Depreciation − Taxes

### Database Schema for Storing Model Data:
When the user asks to build a model, you should structure data for the \`financial_model\` table:
- category: "revenue" | "cogs" | "opex" | "headcount" | "funding"
- subcategory examples:
  - revenue: "SaaS Stream 1", "SaaS Stream 2", "SaaS Stream 3"
  - cogs: "Cost of Goods Sold"
  - opex: "Salaries & Benefits", "General & Admin", "Sales & Marketing", "Professional Fees", "Other"
  - funding: "Pre-Seed", "Seed", "Series A"
- month: YYYY-MM-DD (first of month)
- amount: numeric value
- formula: text description of the calculation logic
- scenario: "base" | "best" | "worst"

For cap table data, use the \`cap_table_entries\` table:
- stakeholder_name, stakeholder_type (founder/investor/option_pool/advisor)
- shares, ownership_pct, investment_amount, share_price, round_name, date`;

const EXTRACT_PROMPT = `You extract structured knowledge from a conversation between a startup founder and their AI CFO.
Given the latest user message and assistant response, extract 0-3 distinct knowledge items that are worth remembering long-term.
Only extract concrete, reusable facts — company metrics, decisions, goals, financial figures, investor names, etc.
Skip generic advice or questions.

Return a JSON array (can be empty). Each item: {"title": "short label", "content": "detail paragraph"}
Return ONLY the JSON array, no markdown fences.`;

async function extractKnowledge(userMsg: string, assistantMsg: string, organizationId: string) {
  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1000,
        system: EXTRACT_PROMPT,
        messages: [
          { role: "user", content: `User: ${userMsg}\n\nAssistant: ${assistantMsg.slice(0, 2000)}` },
        ],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) { await resp.text(); return; }
    const data = await resp.json();
    const raw = data.content?.[0]?.text?.trim();
    if (!raw) return;

    let items: { title: string; content: string }[];
    try {
      items = JSON.parse(raw);
    } catch {
      // Try extracting JSON from markdown fences
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return;
      items = JSON.parse(match[0]);
    }

    if (!Array.isArray(items) || items.length === 0) return;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const rows = items.filter(i => i.title && i.content).slice(0, 3).map(i => ({
      organization_id: organizationId,
      title: i.title,
      content: i.content,
      source: "chat",
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from("knowledge_base").insert(rows);
      if (error) console.error("KB insert error:", error);
      else console.log(`Extracted ${rows.length} knowledge items`);
    }
  } catch (e) {
    console.error("Knowledge extraction error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, organizationId } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userMessage = messages[messages.length - 1]?.content || "";

    const anthropicMessages = messages
      .filter((m: any) => m.role !== "system")
      .map((m: any) => ({ role: m.role, content: m.content }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI service error. Please check your API key." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect full response for knowledge extraction
    let fullAssistantResponse = "";

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              fullAssistantResponse += parsed.delta.text;
              const openaiChunk = {
                choices: [{ delta: { content: parsed.delta.text } }],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
            }

            if (parsed.type === "message_stop") {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              // Fire-and-forget knowledge extraction
              if (organizationId && userMessage) {
                extractKnowledge(userMessage, fullAssistantResponse, organizationId);
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      },
    });

    const stream = response.body!.pipeThrough(transformStream);

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat function error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
