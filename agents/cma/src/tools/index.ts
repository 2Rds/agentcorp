/**
 * CMA Agent Tools — 11 MCP tools for marketing & content
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
import { GoogleGenAI } from "@google/genai";
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
      "Search CMA namespace memory for past campaigns, brand guidelines, content strategy, and audience insights.",
      {
        query: z.string().max(500).describe("Search query"),
        limit: z.number().default(10).describe("Max results"),
      },
      async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return err("Memory system not available");
        try {
          const results = await memory.searchAgentMemories("blockdrive-cma", orgId, args.query, args.limit);
          return text(JSON.stringify(results.map(m => ({ memory: m.memory, metadata: m.metadata }))));
        } catch (e) { return err(`Memory search failed: ${e}`); }
      },
    ),

    tool(
      "save_knowledge",
      "Persist marketing knowledge — content decisions, campaign results, brand guidelines, SEO findings, audience research.",
      {
        content: z.string().max(5000).describe("The knowledge to save"),
        category: z.enum(["content_strategy", "campaigns", "brand_guidelines", "seo_analytics", "audience_research"]),
      },
      async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return err("Memory system not available");
        try {
          const events = await memory.addAgentMemory("blockdrive-cma", orgId, args.content, "operational", { category: args.category });
          return text(`Saved to ${args.category}: ${JSON.stringify(events)}`);
        } catch (e) { return err(`Memory save failed: ${e}`); }
      },
    ),

    // ── Notion Tools (conditional) ──
    ...(notion ? [
      tool(
        "search_notion",
        "Search the Notion workspace for content calendar, campaigns, and project pages.",
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
        "Read the content and properties of a Notion page by ID.",
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
      "Search the web for marketing trends, competitor analysis, industry benchmarks, and content ideas.",
      { query: z.string().max(500).describe("Search query") },
      async (args) => {
        if (!config.googleAiApiKey) return err("GOOGLE_AI_API_KEY required for web search");
        const ai = new GoogleGenAI({ apiKey: config.googleAiApiKey });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: args.query,
          config: { maxOutputTokens: 2000, temperature: 0.1, tools: [{ googleSearch: {} }] },
        });
        return text(response.text || "No results found for this query.");
      },
    ),

    tool(
      "fetch_url",
      "Fetch and read a web page URL for content research or competitive analysis. Strips HTML for clean output. Blocked for internal/private URLs.",
      { url: z.string().url().max(2000).describe("URL to fetch") },
      async (args) => {
        const result = await safeFetchText(
          args.url,
          { headers: { "User-Agent": "BlockDrive-CMA/1.0" }, signal: AbortSignal.timeout(15000) },
          "Fetch URL",
        );
        if (!result.ok) return err(result.error);
        return text(stripHtml(result.data).slice(0, 8000));
      },
    ),

    // ── Content & Campaign Tools ──
    tool(
      "draft_content",
      "Create a structured content draft (blog post, social media, email, or landing page).",
      {
        title: z.string().max(300).describe("Content title"),
        type: z.enum(["blog", "social", "email", "landing_page"]).describe("Content type"),
        brief: z.string().max(10000).describe("Content brief / key points to cover"),
        target_audience: z.string().max(200).optional().describe("Target audience or persona"),
        seo_keywords: z.string().max(500).optional().describe("Comma-separated SEO keywords"),
        tone: z.enum(["professional", "casual", "technical", "inspirational"]).default("professional"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("cma_content_drafts")
            .insert({
              org_id: orgId,
              title: args.title,
              type: args.type,
              content: args.brief,
              target_audience: args.target_audience || null,
              seo_keywords: args.seo_keywords?.split(",").map(k => k.trim()) || [],
              tone: args.tone,
              status: "draft",
            })
            .select("id, title, type, status")
            .single();
          if (dbError) return err(`Draft creation failed: ${dbError.message}`);
          return text(JSON.stringify({ ...data, message: "Draft created. Ready for review and refinement." }));
        } catch (e) {
          return err(`Draft creation failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "manage_campaign",
      "Create or update a marketing campaign with objectives, channels, and tracking.",
      {
        action: z.enum(["create", "update", "list"]).describe("Action to perform"),
        name: z.string().max(200).optional().describe("Campaign name (required for create)"),
        campaign_id: z.string().max(100).optional().describe("Campaign ID (required for update)"),
        status: z.enum(["planning", "active", "paused", "completed"]).optional(),
        channels: z.string().max(500).optional().describe("Comma-separated channels (e.g., twitter,linkedin,email)"),
        start_date: z.string().max(30).optional().describe("Start date (ISO 8601)"),
        end_date: z.string().max(30).optional().describe("End date (ISO 8601)"),
        budget: z.number().optional().describe("Campaign budget"),
        metrics: z.string().max(5000).optional().describe("JSON string of campaign metrics"),
      },
      async (args) => {
        try {
          if (args.action === "list") {
            const { data, error: dbError } = await supabase
              .from("cma_campaigns")
              .select("id, name, status, channels, start_date, end_date")
              .eq("org_id", orgId)
              .order("created_at", { ascending: false })
              .limit(20);
            if (dbError) return err(`List failed: ${dbError.message}`);
            return text(JSON.stringify(data));
          }
          if (args.action === "create") {
            if (!args.name) return err("Campaign name is required for create action");
            let parsedMetrics = {};
            if (args.metrics) {
              const parsed = safeJsonParse(args.metrics, "metrics");
              if (!parsed.ok) return err(parsed.error);
              parsedMetrics = parsed.data as Record<string, unknown>;
            }
            const { data, error: dbError } = await supabase
              .from("cma_campaigns")
              .insert({
                org_id: orgId,
                name: args.name,
                status: args.status || "planning",
                channels: args.channels?.split(",").map(c => c.trim()) || [],
                start_date: args.start_date || null,
                end_date: args.end_date || null,
                budget: args.budget || null,
                metrics: parsedMetrics,
              })
              .select("id, name, status")
              .single();
            if (dbError) return err(`Create failed: ${dbError.message}`);
            return text(JSON.stringify(data));
          }
          // update
          if (!args.campaign_id) return err("campaign_id is required for update action");
          const updates: Record<string, unknown> = {};
          if (args.name) updates.name = args.name;
          if (args.status) updates.status = args.status;
          if (args.channels) updates.channels = args.channels.split(",").map(c => c.trim());
          if (args.start_date) updates.start_date = args.start_date;
          if (args.end_date) updates.end_date = args.end_date;
          if (args.budget !== undefined) updates.budget = args.budget;
          if (args.metrics) {
            const parsed = safeJsonParse(args.metrics, "metrics");
            if (!parsed.ok) return err(parsed.error);
            updates.metrics = parsed.data;
          }
          updates.updated_at = new Date().toISOString();
          const { data, error: dbError } = await supabase
            .from("cma_campaigns")
            .update(updates)
            .eq("id", args.campaign_id)
            .eq("org_id", orgId)
            .select("id, name, status")
            .single();
          if (dbError) return err(`Update failed: ${dbError.message}`);
          return text(JSON.stringify(data));
        } catch (e) {
          return err(`Campaign operation failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "analyze_seo",
      "Analyze SEO potential for a topic or keyword. Combines web search with competitive analysis.",
      {
        topic: z.string().max(300).describe("Topic or keyword to analyze"),
        url: z.string().url().max(2000).optional().describe("Optional URL to analyze for on-page SEO"),
      },
      async (args) => {
        const prompt = args.url
          ? `Analyze the SEO potential for the topic "${args.topic}" and provide: 1) Related keywords with estimated search volume, 2) Content gaps in top-ranking pages, 3) Recommended content structure. Also analyze this URL for on-page SEO: ${args.url}`
          : `Analyze the SEO potential for the topic "${args.topic}" and provide: 1) Related keywords with estimated search volume, 2) Top-ranking content analysis, 3) Content gaps and opportunities, 4) Recommended content structure and word count.`;
        if (!config.googleAiApiKey) return err("GOOGLE_AI_API_KEY required for SEO analysis");
        const ai = new GoogleGenAI({ apiKey: config.googleAiApiKey });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { maxOutputTokens: 4000, temperature: 0.1, tools: [{ googleSearch: {} }] },
        });
        return text(response.text || "No SEO analysis available");
      },
    ),

    tool(
      "draft_email",
      "Draft a marketing email — newsletter, announcement, or campaign email. Saved to content drafts for review.",
      {
        to: z.string().max(200).describe("Recipient or audience segment"),
        subject: z.string().max(200).describe("Email subject line"),
        body: z.string().max(10000).describe("Email body content"),
        type: z.enum(["newsletter", "announcement", "campaign", "internal"]).default("campaign"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("cma_content_drafts")
            .insert({
              org_id: orgId,
              title: args.subject,
              type: "email",
              content: JSON.stringify({ to: args.to, subject: args.subject, body: args.body, email_type: args.type }),
              status: "draft",
            })
            .select("id, title, status")
            .single();
          if (dbError) return err(`Draft failed: ${dbError.message}`);
          return text(JSON.stringify({ ...data, message: "Email draft saved. Requires review before sending." }));
        } catch (e) {
          return err(`Draft failed: ${String(e)}`);
        }
      },
    ),

    // ── X/Twitter via Grok ──
    tool(
      "search_x",
      "Search X/Twitter for trends, mentions, and engagement data using Grok. Use for social listening, competitor monitoring, and trend analysis.",
      {
        query: z.string().max(500).describe("Search query for X/Twitter"),
        type: z.enum(["trends", "mentions", "hashtags", "competitor"]).default("trends").describe("Type of search"),
      },
      async (args) => {
        const prompt = args.type === "trends"
          ? `What are the latest trending topics and conversations on X/Twitter related to: ${args.query}? Include engagement metrics where available.`
          : args.type === "mentions"
          ? `Search X/Twitter for recent mentions and discussions about: ${args.query}. Summarize sentiment and key themes.`
          : args.type === "hashtags"
          ? `Analyze trending hashtags on X/Twitter related to: ${args.query}. Include usage volume and related conversations.`
          : `Analyze competitor activity on X/Twitter for: ${args.query}. Include their recent posts, engagement rates, and content strategy patterns.`;
        const result = await safeFetch<{ choices?: Array<{ message: { content: string } }> }>(
          "https://openrouter.ai/api/v1/chat/completions",
          { method: "POST", headers: { "Authorization": `Bearer ${config.openRouterApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "x-ai/grok-4-1-fast", messages: [{ role: "user", content: prompt }] }) },
          "X/Twitter search",
        );
        if (!result.ok) return err(result.error);
        return text(result.data.choices?.[0]?.message?.content || "No X/Twitter data available");
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
            from: "blockdrive-cma",
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

  return createSdkMcpServer({ name: "cma-tools", version: "1.0.0", tools });
}
