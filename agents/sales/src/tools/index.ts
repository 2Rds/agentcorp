/**
 * Sales Agent Tools — 12 MCP tools for pipeline & revenue
 *
 * Uses Agent SDK tool() with 4-arg signature:
 *   tool(name, description, zodRawShape, handler)
 * Handler returns: { content: [{ type: "text", text }] }
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { createClient } from "@supabase/supabase-js";
import { Client as NotionClient } from "@notionhq/client";
import type { PageObjectResponse, DatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { z } from "zod";
import { safeFetch, safeFetchText, safeJsonParse, stripHtml, type ProspectFeatures, type IndustryFeatures, type CallBriefFeatures, type FeatureStore } from "@waas/runtime";
import { config } from "../config.js";
import { getRuntime } from "../runtime-ref.js";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const err = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

type ToolResult = ReturnType<typeof text> | ReturnType<typeof err>;

/** Run a callback with the FeatureStore, handling null checks and errors */
async function withFeatureStore(fn: (fs: FeatureStore) => Promise<ToolResult>, context?: string): Promise<ToolResult> {
  const fs = getRuntime()?.featureStore;
  if (!fs) return err("Feature Store not available — requires Redis + featureStore.enabled");
  try {
    return await fn(fs);
  } catch (e) {
    return err(`Feature Store${context ? ` (${context})` : ""} operation failed: ${String(e)}`);
  }
}

export function createMcpServer(orgId: string, _userId: string) {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const notion = config.notionEnabled ? new NotionClient({ auth: config.notionApiKey }) : null;

  const tools = [
    // ── Knowledge Tools ──
    tool(
      "search_knowledge",
      "Search sales namespace memory for deal history, prospect research, call transcripts, objections, and competitive intel.",
      {
        query: z.string().max(500).describe("Search query"),
        limit: z.number().default(10).describe("Max results"),
      },
      async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return err("Memory system not available");
        try {
          const results = await memory.searchAgentMemories("blockdrive-sales", orgId, args.query, args.limit);
          return text(JSON.stringify(results.map(m => ({ memory: m.memory, metadata: m.metadata }))));
        } catch (e) { return err(`Memory search failed: ${e}`); }
      },
    ),

    tool(
      "save_knowledge",
      "Persist sales knowledge — deal updates, prospect insights, call learnings, objection handling, competitive intel.",
      {
        content: z.string().max(5000).describe("The knowledge to save"),
        category: z.enum(["deal_pipeline", "prospect_research", "call_transcripts", "objections", "competitive_intel"]),
      },
      async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return err("Memory system not available");
        try {
          const events = await memory.addAgentMemory("blockdrive-sales", orgId, args.content, "operational", { category: args.category });
          return text(`Saved to ${args.category}: ${JSON.stringify(events)}`);
        } catch (e) { return err(`Memory save failed: ${e}`); }
      },
    ),

    // ── Notion Tools (conditional) ──
    ...(notion ? [
      tool(
        "search_notion",
        "Search the Notion workspace for prospect databases, pipeline views, and deal notes.",
        { query: z.string().max(200).describe("Search query") },
        async (args) => {
          try {
            const res = await notion.search({ query: args.query, page_size: 10 });
            const results = res.results.map((r) => ({
              id: r.id,
              type: r.object,
              title: r.object === "page"
                ? ((r as PageObjectResponse).properties?.title as { title?: Array<{ plain_text: string }> })?.title?.[0]?.plain_text
                  || ((r as PageObjectResponse).properties?.Name as { title?: Array<{ plain_text: string }> })?.title?.[0]?.plain_text
                  || "Untitled"
                : ((r as DatabaseObjectResponse).title?.[0]?.plain_text || "Untitled"),
            }));
            return text(JSON.stringify(results));
          } catch (e) {
            return err(`Notion search failed: ${String(e)}`);
          }
        },
      ),

      tool(
        "read_notion_page",
        "Read the content and properties of a Notion page (prospect profile, deal brief, etc.).",
        { page_id: z.string().max(100).describe("Notion page ID") },
        async (args) => {
          try {
            const [page, blocks] = await Promise.all([
              notion.pages.retrieve({ page_id: args.page_id }),
              notion.blocks.children.list({ block_id: args.page_id, page_size: 100 }),
            ]);
            return text(JSON.stringify({ properties: (page as PageObjectResponse).properties, blocks: blocks.results.slice(0, 50) }));
          } catch (e) {
            return err(`Notion read failed: ${String(e)}`);
          }
        },
      ),
    ] : []),

    // ── Web Research ──
    tool(
      "web_search",
      "Search the web for prospect research, industry trends, competitive intelligence, and market data.",
      { query: z.string().max(500).describe("Search query") },
      async (args) => {
        const apiUrl = config.perplexityApiKey
          ? "https://api.perplexity.ai/chat/completions"
          : "https://openrouter.ai/api/v1/chat/completions";
        const apiKey = config.perplexityApiKey || config.openRouterApiKey;
        const model = config.perplexityApiKey ? "sonar-pro" : "perplexity/sonar-pro";
        const result = await safeFetch<{ choices?: Array<{ message: { content: string } }> }>(
          apiUrl,
          { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: [{ role: "user", content: args.query }] }) },
          "Web search",
        );
        if (!result.ok) return err(result.error);
        return text(result.data.choices?.[0]?.message?.content || "No results found for this query.");
      },
    ),

    tool(
      "fetch_url",
      "Fetch and read a web page for prospect research or competitive analysis. Strips HTML for clean output. Blocked for internal/private URLs.",
      { url: z.string().url().max(2000).describe("URL to fetch") },
      async (args) => {
        const result = await safeFetchText(
          args.url,
          { headers: { "User-Agent": "BlockDrive-Sales/1.0" }, signal: AbortSignal.timeout(15000) },
          "Fetch URL",
        );
        if (!result.ok) return err(result.error);
        return text(stripHtml(result.data).slice(0, 8000));
      },
    ),

    // ── Sales-Specific Tools ──
    tool(
      "manage_pipeline",
      "Create, update, or list deals in the sales pipeline.",
      {
        action: z.enum(["create", "update", "list"]).describe("Action to perform"),
        company: z.string().max(200).optional().describe("Company name (required for create)"),
        deal_id: z.string().max(100).optional().describe("Deal ID (required for update)"),
        contact: z.string().max(200).optional().describe("Primary contact name"),
        stage: z.enum(["prospect", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]).optional(),
        value: z.number().optional().describe("Deal value in USD"),
        probability: z.number().optional().describe("Close probability (0-100)"),
        expected_close: z.string().max(30).optional().describe("Expected close date (ISO 8601)"),
        source: z.string().max(200).optional().describe("Lead source"),
        tags: z.string().max(500).optional().describe("Comma-separated tags"),
        notes: z.string().max(5000).optional().describe("Deal notes"),
      },
      async (args) => {
        try {
          if (args.action === "list") {
            const { data, error: dbError } = await supabase
              .from("sales_pipeline")
              .select("id, company, contact, stage, value, probability, expected_close, source, tags")
              .eq("org_id", orgId)
              .not("stage", "in", '("closed_won","closed_lost")')
              .order("value", { ascending: false })
              .limit(25);
            if (dbError) return err(`Pipeline list failed: ${dbError.message}`);
            return text(JSON.stringify(data));
          }
          if (args.action === "create") {
            if (!args.company) return err("company is required for create action");
            const { data, error: dbError } = await supabase
              .from("sales_pipeline")
              .insert({
                org_id: orgId,
                company: args.company,
                contact: args.contact || null,
                stage: args.stage || "prospect",
                value: args.value || 0,
                probability: args.probability || 10,
                expected_close: args.expected_close || null,
                source: args.source || null,
                tags: args.tags?.split(",").map(t => t.trim()) || [],
                notes: args.notes || null,
              })
              .select("id, company, stage, value, probability")
              .single();
            if (dbError) return err(`Pipeline create failed: ${dbError.message}`);
            return text(JSON.stringify(data));
          }
          // update
          if (!args.deal_id) return err("deal_id is required for update action");
          const updates: Record<string, unknown> = {};
          if (args.company) updates.company = args.company;
          if (args.contact) updates.contact = args.contact;
          if (args.stage) updates.stage = args.stage;
          if (args.value !== undefined) updates.value = args.value;
          if (args.probability !== undefined) updates.probability = args.probability;
          if (args.expected_close) updates.expected_close = args.expected_close;
          if (args.source) updates.source = args.source;
          if (args.tags) updates.tags = args.tags.split(",").map(t => t.trim());
          if (args.notes) updates.notes = args.notes;
          updates.updated_at = new Date().toISOString();
          const { data, error: dbError } = await supabase
            .from("sales_pipeline")
            .update(updates)
            .eq("id", args.deal_id)
            .eq("org_id", orgId)
            .select("id, company, stage, value, probability")
            .single();
          if (dbError) return err(`Pipeline update failed: ${dbError.message}`);
          return text(JSON.stringify(data));
        } catch (e) {
          return err(`Pipeline operation failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "research_prospect",
      "Conduct structured prospect research using web search. Returns company profile, key contacts, pain points, and approach recommendations.",
      {
        company: z.string().max(200).describe("Company name to research"),
        contact: z.string().max(200).optional().describe("Specific contact to research"),
        focus: z.string().max(500).optional().describe("Specific aspects to focus on (e.g., recent funding, tech stack, pain points)"),
      },
      async (args) => {
        const prompt = args.contact
          ? `Research ${args.contact} at ${args.company}. Provide: 1) Their role and responsibilities, 2) Professional background, 3) Recent activity (posts, talks, articles), 4) Connection points for outreach.${args.focus ? ` Focus on: ${args.focus}` : ""}`
          : `Research ${args.company} for a B2B sales approach. Provide: 1) Company overview (size, industry, revenue), 2) Key decision makers, 3) Recent news and events, 4) Potential pain points, 5) Technology stack, 6) Recommended approach angle.${args.focus ? ` Focus on: ${args.focus}` : ""}`;
        const apiUrl = config.perplexityApiKey
          ? "https://api.perplexity.ai/chat/completions"
          : "https://openrouter.ai/api/v1/chat/completions";
        const apiKey = config.perplexityApiKey || config.openRouterApiKey;
        const model = config.perplexityApiKey ? "sonar-pro" : "perplexity/sonar-pro";
        const result = await safeFetch<{ choices?: Array<{ message: { content: string } }> }>(
          apiUrl,
          { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }) },
          "Prospect research",
        );
        if (!result.ok) return err(result.error);
        return text(result.data.choices?.[0]?.message?.content || "No research results available");
      },
    ),

    tool(
      "prep_call",
      "Generate a structured call preparation brief for an upcoming sales call.",
      {
        company: z.string().max(200).describe("Company name"),
        contact: z.string().max(200).describe("Contact name and title"),
        call_type: z.enum(["discovery", "demo", "follow_up", "negotiation", "close"]).describe("Type of call"),
        context: z.string().max(5000).optional().describe("Additional context (previous interactions, deal stage, etc.)"),
      },
      async (args) => {
        // Search for existing knowledge about this prospect
        const memory = getRuntime()?.memory;
        let pastContext = "Memory system not available.";
        if (memory) {
          try {
            const results = await memory.searchAgentMemories("blockdrive-sales", orgId, `${args.company} ${args.contact}`, 5);
            pastContext = results.length > 0
              ? results.map(r => r.memory).join("\n")
              : "No prior interactions found.";
          } catch (memErr) {
            console.error(`[blockdrive-sales] prep_call memory lookup failed:`, memErr);
            pastContext = "Could not retrieve prior interactions (memory service error).";
          }
        }

        return text(JSON.stringify({
          call_brief: {
            company: args.company,
            contact: args.contact,
            call_type: args.call_type,
            prior_context: pastContext,
            additional_context: args.context || "None provided",
            prepared_at: new Date().toISOString(),
          },
          message: "Call brief prepared. Review prior context and prepare talking points.",
        }));
      },
    ),

    tool(
      "draft_proposal",
      "Generate a proposal outline for a prospect. Returns a structured proposal for review and expansion.",
      {
        company: z.string().max(200).describe("Company name"),
        contact: z.string().max(200).describe("Decision maker name"),
        problem: z.string().max(5000).describe("The problem or need being addressed"),
        solution: z.string().max(5000).describe("Proposed solution overview"),
        value: z.number().optional().describe("Proposed deal value"),
        timeline: z.string().max(500).optional().describe("Implementation timeline"),
      },
      async (args) => {
        return text(JSON.stringify({
          proposal: {
            company: args.company,
            contact: args.contact,
            problem: args.problem,
            solution: args.solution,
            value: args.value ?? null,
            timeline: args.timeline ?? null,
            status: "draft",
          },
          message: "Proposal outline generated. Expand with detailed content and review before sending.",
        }));
      },
    ),

    tool(
      "draft_email",
      "Draft a sales outreach or follow-up email. Saved to communications log for tracking.",
      {
        to: z.string().max(200).describe("Recipient name and/or email"),
        subject: z.string().max(200).describe("Email subject line"),
        body: z.string().max(10000).describe("Email body content"),
        type: z.enum(["cold_outreach", "follow_up", "proposal", "thank_you", "re_engagement"]).default("cold_outreach"),
        pipeline_id: z.string().max(100).optional().describe("Pipeline deal ID to associate this email with"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("sales_call_logs")
            .insert({
              org_id: orgId,
              pipeline_id: args.pipeline_id || null,
              type: "email",
              summary: JSON.stringify({ to: args.to, subject: args.subject, body: args.body, email_type: args.type }),
              action_items: [{ action: "Review and send email", status: "pending" }],
              sentiment: "neutral",
              next_steps: "Review draft, personalize if needed, send",
            })
            .select("id")
            .single();
          if (dbError) return err(`Draft failed: ${dbError.message}`);
          return text(JSON.stringify({ id: data?.id, subject: args.subject, type: args.type, status: "draft", message: "Email draft saved. Review and personalize before sending." }));
        } catch (e) {
          return err(`Draft failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "log_call",
      "Record a call summary with action items and next steps. Always use after every sales interaction.",
      {
        pipeline_id: z.string().max(100).optional().describe("Pipeline deal ID to link this call to"),
        company: z.string().max(200).describe("Company name"),
        contact: z.string().max(200).describe("Contact spoken with"),
        type: z.enum(["discovery", "demo", "follow_up", "negotiation", "close", "check_in"]).describe("Call type"),
        summary: z.string().max(10000).describe("Call summary — key points discussed"),
        action_items: z.string().max(5000).describe("JSON array of action items"),
        sentiment: z.enum(["very_positive", "positive", "neutral", "negative", "very_negative"]).describe("Overall sentiment"),
        next_steps: z.string().max(5000).describe("Agreed next steps and timeline"),
      },
      async (args) => {
        try {
          const parsed = safeJsonParse(args.action_items, "action_items");
          if (!parsed.ok) return err(parsed.error);
          const { data, error: dbError } = await supabase
            .from("sales_call_logs")
            .insert({
              org_id: orgId,
              pipeline_id: args.pipeline_id || null,
              type: args.type,
              summary: `[${args.company} - ${args.contact}] ${args.summary}`,
              action_items: parsed.data,
              sentiment: args.sentiment,
              next_steps: args.next_steps,
            })
            .select("id, type, sentiment")
            .single();
          if (dbError) return err(`Call log failed: ${dbError.message}`);
          return text(JSON.stringify({ ...data, company: args.company, contact: args.contact, message: "Call logged successfully." }));
        } catch (e) {
          return err(`Call log failed: ${String(e)}`);
        }
      },
    ),

    // ── Feature Store Tools ──
    tool(
      "compute_prospect_features",
      "Store prospect intelligence in the Feature Store for sub-ms retrieval during voice calls. Call after researching a prospect or updating deal info. This is how you make voice agents smarter — they read what you write.",
      {
        prospect_id: z.string().max(100).describe("Prospect ID (email, phone, or CRM ID)"),
        company: z.string().max(200).describe("Company name"),
        industry: z.string().max(100).describe("Industry slug (e.g., 'fintech', 'healthcare', 'saas')"),
        heat_score: z.number().min(0).max(100).describe("Heat score 0-100 (0=cold, 100=ready to buy)"),
        stage: z.enum(["prospect", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]),
        deal_size: z.number().default(0).describe("Estimated deal size in USD"),
        pain_points: z.array(z.string()).default([]).describe("Known pain points"),
        objections: z.array(z.string()).default([]).describe("Known objections encountered"),
        buying_signals: z.array(z.string()).default([]).describe("Buying signals observed"),
        competitors: z.array(z.string()).default([]).describe("Competitors mentioned"),
        decision_maker: z.string().max(200).default("").describe("Decision maker name"),
        decision_maker_title: z.string().max(200).default("").describe("Decision maker title"),
        comm_style: z.string().max(50).default("direct").describe("Communication style preference"),
        next_action: z.string().max(500).default("").describe("Recommended next action"),
      },
      async (args) => withFeatureStore(async (fs) => {
        const now = Math.floor(Date.now() / 1000);
        const features: ProspectFeatures = {
          prospectId: args.prospect_id,
          company: args.company,
          industry: args.industry,
          heatScore: args.heat_score,
          stage: args.stage,
          dealSize: args.deal_size,
          totalTouches: 0,
          daysSinceLastTouch: 0,
          painPoints: args.pain_points,
          objections: args.objections,
          buyingSignals: args.buying_signals,
          competitors: args.competitors,
          decisionMaker: args.decision_maker,
          decisionMakerTitle: args.decision_maker_title,
          bestCallHour: 10,
          commStyle: args.comm_style,
          lastCallSummary: "",
          nextAction: args.next_action,
          computedAt: now,
          expiresAt: now + 86400,
        };
        await fs.setProspectFeatures(features, undefined, orgId);
        return text(`Prospect features stored for ${args.company} (${args.prospect_id}), heat: ${args.heat_score}, stage: ${args.stage}`);
      }),
    ),

    tool(
      "get_prospect_intelligence",
      "Get the full intelligence package for a prospect — features, industry data, and call brief combined. Sub-millisecond reads from the Feature Store. Use before or during a call.",
      {
        prospect_id: z.string().max(100).describe("Prospect ID to look up"),
        call_id: z.string().max(100).optional().describe("Call ID for a specific call brief"),
      },
      async (args) => withFeatureStore(async (fs) => {
        const intel = await fs.getCallIntelligence(args.prospect_id, args.call_id, orgId);
        if (!intel.prospect) return text(JSON.stringify({ found: false, message: `No features found for ${args.prospect_id}. Use compute_prospect_features first.` }));
        return text(JSON.stringify({
          found: true,
          prospect: intel.prospect,
          industry: intel.industry,
          brief: intel.brief,
        }));
      }),
    ),

    tool(
      "get_hottest_prospects",
      "Get the highest-scoring prospects from the Feature Store, sorted by heat score. Use to prioritize your call queue.",
      {
        limit: z.number().default(10).describe("Max number of prospects to return"),
      },
      async (args) => withFeatureStore(async (fs) => {
        const prospects = await fs.getHottestProspects(args.limit, orgId);
        if (prospects.length === 0) return text("No prospects in Feature Store. Use compute_prospect_features to add them.");
        return text(JSON.stringify(prospects.map(p => ({
          id: p.prospectId,
          company: p.company,
          heat: p.heatScore,
          stage: p.stage,
          dealSize: p.dealSize,
          nextAction: p.nextAction,
        }))));
      }),
    ),

    tool(
      "compute_industry_features",
      "Store industry-level intelligence in the Feature Store. Objection maps, value props, competitors, win rates — shared across all prospects in this industry.",
      {
        industry_slug: z.string().max(100).describe("Industry slug (e.g., 'fintech', 'healthcare')"),
        name: z.string().max(200).describe("Human-readable industry name"),
        objection_map: z.array(z.object({
          objection: z.string(),
          response: z.string(),
          win_rate: z.number().min(0).max(1),
        })).default([]).describe("Objection → response mappings with win rates"),
        value_props: z.array(z.string()).default([]).describe("Key value propositions for this industry"),
        competitors: z.array(z.string()).default([]).describe("Common competitors in this industry"),
        avg_deal_cycle_days: z.number().default(60).describe("Average deal cycle in days"),
        avg_deal_size: z.number().default(0).describe("Average deal size in USD"),
        win_rate: z.number().min(0).max(1).default(0).describe("Overall win rate (0-1)"),
        talking_points: z.array(z.string()).default([]).describe("Effective talking points"),
        opening_lines: z.array(z.object({
          line: z.string(),
          response_rate: z.number().min(0).max(1),
        })).default([]).describe("Best opening lines with response rates"),
      },
      async (args) => withFeatureStore(async (fs) => {
        const now = Math.floor(Date.now() / 1000);
        const features: IndustryFeatures = {
          industrySlug: args.industry_slug,
          name: args.name,
          objectionMap: args.objection_map.map(o => ({ objection: o.objection, response: o.response, winRate: o.win_rate })),
          valueProps: args.value_props,
          competitors: args.competitors,
          avgDealCycleDays: args.avg_deal_cycle_days,
          avgDealSize: args.avg_deal_size,
          winRate: args.win_rate,
          talkingPoints: args.talking_points,
          regulations: [],
          openingLines: args.opening_lines.map(l => ({ line: l.line, responseRate: l.response_rate })),
          computedAt: now,
          expiresAt: now + 604800,
        };
        await fs.setIndustryFeatures(features, undefined, orgId);
        return text(`Industry features stored for ${args.name} (${args.industry_slug}), win rate: ${(args.win_rate * 100).toFixed(0)}%`);
      }),
    ),

    tool(
      "prepare_call_brief",
      "Write a pre-computed call brief to the Feature Store. Voice agents read this at call start for instant context. Prepare briefs before scheduled calls.",
      {
        call_id: z.string().max(100).describe("Unique call identifier"),
        prospect_id: z.string().max(100).describe("Prospect ID this brief is for"),
        company: z.string().max(200).describe("Company name"),
        purpose: z.enum(["cold_call", "follow_up", "demo", "closing"]).describe("Call purpose"),
        opening_script: z.string().max(2000).describe("The opening script to use"),
        talking_points: z.array(z.string()).default([]).describe("Key talking points"),
        predicted_objections: z.array(z.string()).default([]).describe("Objections likely to come up"),
        objection_responses: z.record(z.string()).default({}).describe("Prepared responses to each objection"),
        competitive_notes: z.string().max(2000).default("").describe("Competitive positioning notes"),
        meeting_booking_info: z.string().max(500).default("").describe("How to book a meeting"),
        sdr_notes: z.string().max(5000).default("").describe("SDR research and notes"),
      },
      async (args) => withFeatureStore(async (fs) => {
        const now = Math.floor(Date.now() / 1000);
        const brief: CallBriefFeatures = {
          callId: args.call_id,
          prospectId: args.prospect_id,
          company: args.company,
          purpose: args.purpose,
          openingScript: args.opening_script,
          talkingPoints: args.talking_points,
          predictedObjections: args.predicted_objections,
          objectionResponses: args.objection_responses,
          competitiveNotes: args.competitive_notes,
          meetingBookingInfo: args.meeting_booking_info,
          sdrNotes: args.sdr_notes,
          computedAt: now,
          expiresAt: now + 14400,
        };
        await fs.setCallBrief(brief, undefined, orgId);
        return text(`Call brief prepared for ${args.company} (${args.prospect_id}), purpose: ${args.purpose}, call: ${args.call_id}`);
      }),
    ),

    // ── Voice Tools ──
    tool(
      "make_call",
      "Initiate an outbound voice call to a prospect via NextGenSwitch. The voice pipeline handles STT → Claude → TTS automatically.",
      {
        phone_number: z.string().max(20).describe("Phone number in E.164 format (e.g., +15551234567)"),
        name: z.string().max(200).optional().describe("Prospect name for call context"),
        company: z.string().max(200).optional().describe("Company name for call context"),
        purpose: z.string().max(500).optional().describe("Call purpose (discovery, follow-up, demo, close)"),
        pipeline_id: z.string().max(100).optional().describe("Pipeline deal ID to associate this call with"),
      },
      async (args) => {
        try {
          const { getRuntime } = await import("../runtime-ref.js");
          const runtime = getRuntime();
          if (!runtime) return err("Voice transport not available — runtime not initialized");
          const voiceTransport = (runtime as unknown as { voiceTransport?: { initiateCall: (params: { phoneNumber: string; params?: Record<string, string> }) => Promise<{ callId: string }> } }).voiceTransport;
          if (!voiceTransport) return err("Voice transport not configured — requires NEXTGENSWITCH_URL and ELEVENLABS_API_KEY");
          const result = await voiceTransport.initiateCall({
            phoneNumber: args.phone_number,
            params: {
              ...(args.name && { prospect_name: args.name }),
              ...(args.company && { company: args.company }),
              ...(args.purpose && { call_purpose: args.purpose }),
              ...(args.pipeline_id && { pipeline_id: args.pipeline_id }),
            },
          });
          return text(`Call initiated: ${result.callId} → ${args.phone_number}${args.name ? ` (${args.name})` : ""}`);
        } catch (e) {
          return err(`Call initiation failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "get_call_transcript",
      "Retrieve the transcript of a completed or active voice call from Redis.",
      {
        call_id: z.string().max(100).describe("Call ID to retrieve transcript for"),
      },
      async (args) => {
        try {
          const { getRuntime } = await import("../runtime-ref.js");
          const runtime = getRuntime();
          if (!runtime) return err("Runtime not initialized");
          const bus = runtime.getMessageBus();
          // Access Redis via the runtime's Redis connection
          const { getRedis } = await import("@waas/runtime");
          const redis = await getRedis(process.env.REDIS_URL);
          if (!redis) return err("Redis not available — call transcripts stored in Redis");
          const key = `voice:blockdrive-sales:call:${args.call_id}`;
          const data = await redis.get(key);
          if (!data) return err(`No call data found for ${args.call_id} — may have expired (1hr TTL)`);
          const callState = JSON.parse(data);
          return text(JSON.stringify({
            callId: callState.callId,
            from: callState.from,
            to: callState.to,
            status: callState.status,
            startTime: callState.startTime,
            transcript: callState.transcript,
            turnCount: callState.transcript?.length ?? 0,
          }));
        } catch (e) {
          return err(`Transcript retrieval failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "update_pipeline_from_call",
      "Update a sales pipeline deal based on a completed call outcome. Logs the call and advances the deal stage.",
      {
        pipeline_id: z.string().max(100).describe("Pipeline deal ID to update"),
        call_id: z.string().max(100).optional().describe("Call ID to link"),
        outcome: z.enum(["qualified", "demo_scheduled", "proposal_requested", "negotiating", "closed_won", "closed_lost", "no_answer", "follow_up"]).describe("Call outcome"),
        summary: z.string().max(5000).describe("Call summary — key points discussed"),
        next_steps: z.string().max(2000).describe("Agreed next steps"),
        sentiment: z.enum(["very_positive", "positive", "neutral", "negative", "very_negative"]).default("neutral"),
      },
      async (args) => {
        try {
          // Map outcome to pipeline stage
          const stageMap: Record<string, string> = {
            qualified: "qualified",
            demo_scheduled: "qualified",
            proposal_requested: "proposal",
            negotiating: "negotiation",
            closed_won: "closed_won",
            closed_lost: "closed_lost",
            no_answer: "", // Don't change stage
            follow_up: "", // Don't change stage
          };
          const newStage = stageMap[args.outcome];

          // Update pipeline stage if applicable
          if (newStage) {
            const { error: pipeError } = await supabase
              .from("sales_pipeline")
              .update({ stage: newStage, updated_at: new Date().toISOString() })
              .eq("id", args.pipeline_id)
              .eq("org_id", orgId);
            if (pipeError) return err(`Pipeline update failed: ${pipeError.message}`);
          }

          // Log the call
          const { data: logData, error: logError } = await supabase
            .from("sales_call_logs")
            .insert({
              org_id: orgId,
              pipeline_id: args.pipeline_id,
              type: "voice_call",
              summary: args.summary,
              action_items: [{ outcome: args.outcome, call_id: args.call_id }],
              sentiment: args.sentiment,
              next_steps: args.next_steps,
            })
            .select("id")
            .single();
          if (logError) return err(`Call log failed: ${logError.message}`);

          return text(JSON.stringify({
            pipeline_id: args.pipeline_id,
            outcome: args.outcome,
            stage_updated: !!newStage,
            new_stage: newStage || "unchanged",
            call_log_id: logData?.id,
            message: `Pipeline updated: ${args.outcome}${newStage ? ` → stage: ${newStage}` : ""}`,
          }));
        } catch (e) {
          return err(`Pipeline update from call failed: ${String(e)}`);
        }
      },
    ),

    // ── Inter-Agent Messaging ──
    tool(
      "message_agent",
      "Send a message to another agent via the inter-agent MessageBus. Scope-enforced: can message EA, COA.",
      {
        target_agent_id: z.string().max(50).describe("Agent ID to message"),
        subject: z.string().max(200).describe("Message subject"),
        message: z.string().max(4000).describe("Message content"),
        priority: z.enum(["normal", "urgent"]).default("normal"),
        requires_response: z.boolean().default(false).describe("Whether you need a reply"),
      },
      async (args) => {
        try {
          const { getRuntime } = await import("../runtime-ref.js");
          const bus = getRuntime()?.getMessageBus();
          if (!bus) return err("MessageBus not available — agent messaging requires Redis + Telegram transport");
          const receipt = await bus.send({
            from: "blockdrive-sales",
            to: args.target_agent_id,
            type: args.requires_response ? "request" : "notification",
            priority: args.priority,
            subject: args.subject,
            body: args.message,
          });
          return text(`Message ${receipt.messageId} sent to ${args.target_agent_id}`);
        } catch (e) {
          return err(`Message send failed: ${String(e)}`);
        }
      },
    ),
  ];

  return createSdkMcpServer({ name: "sales-tools", version: "1.0.0", tools });
}
