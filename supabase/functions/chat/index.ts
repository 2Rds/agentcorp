import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

Format your responses with clear markdown: use headers, bullet points, tables, and code blocks for formulas when appropriate.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build OpenAI-compatible messages with system prompt
    const openaiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
        .filter((m: any) => m.role !== "system")
        .map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        max_tokens: 4096,
        messages: openaiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream is already in OpenAI SSE format, pass through directly
    return new Response(response.body, {
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
