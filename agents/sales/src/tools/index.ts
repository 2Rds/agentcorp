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
import { safeFetch, safeFetchText, safeJsonParse, stripHtml } from "@waas/runtime";
import { config } from "../config.js";
import { getRuntime } from "../runtime-ref.js";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const err = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

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
