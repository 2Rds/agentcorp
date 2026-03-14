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
import { z } from "zod";
import { config } from "../config.js";

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
        query: z.string().describe("Search query"),
        limit: z.number().default(10).describe("Max results"),
      },
      async (args) => {
        try {
          const res = await fetch("https://api.mem0.ai/v2/memories/search/", {
            method: "POST",
            headers: { "Authorization": `Token ${config.mem0ApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: args.query, top_k: args.limit, rerank: true, agent_id: "blockdrive-cma" }),
          });
          const data = await res.json() as { results?: Array<{ memory: string; score: number }> };
          return text(JSON.stringify(data.results?.slice(0, args.limit) ?? []));
        } catch (e) {
          return err(`Memory search failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "save_knowledge",
      "Persist marketing knowledge — content decisions, campaign results, brand guidelines, SEO findings, audience research.",
      {
        content: z.string().describe("The knowledge to save"),
        category: z.enum(["content_strategy", "campaigns", "brand_guidelines", "seo_analytics", "audience_research"]),
      },
      async (args) => {
        try {
          const res = await fetch("https://api.mem0.ai/v2/memories/", {
            method: "POST",
            headers: { "Authorization": `Token ${config.mem0ApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: args.content }],
              agent_id: "blockdrive-cma",
              metadata: { category: args.category, org_id: orgId },
            }),
          });
          const data = await res.json();
          return text(`Saved to ${args.category}: ${JSON.stringify(data)}`);
        } catch (e) {
          return err(`Memory save failed: ${String(e)}`);
        }
      },
    ),

    // ── Notion Tools (conditional) ──
    ...(notion ? [
      tool(
        "search_notion",
        "Search the Notion workspace for content calendar, campaigns, and project pages.",
        { query: z.string().describe("Search query") },
        async (args) => {
          try {
            const res = await notion.search({ query: args.query, page_size: 10 });
            const results = res.results.map((r: any) => ({
              id: r.id,
              type: r.object,
              title: r.object === "page"
                ? (r.properties?.title?.title?.[0]?.plain_text || r.properties?.Name?.title?.[0]?.plain_text || "Untitled")
                : (r.title?.[0]?.plain_text || "Untitled"),
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
        { page_id: z.string().describe("Notion page ID") },
        async (args) => {
          try {
            const [page, blocks] = await Promise.all([
              notion.pages.retrieve({ page_id: args.page_id }),
              notion.blocks.children.list({ block_id: args.page_id, page_size: 100 }),
            ]);
            return text(JSON.stringify({ properties: (page as any).properties, blocks: blocks.results.slice(0, 50) }));
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
      { query: z.string().describe("Search query") },
      async (args) => {
        try {
          const apiUrl = config.perplexityApiKey
            ? "https://api.perplexity.ai/chat/completions"
            : "https://openrouter.ai/api/v1/chat/completions";
          const apiKey = config.perplexityApiKey || config.openRouterApiKey;
          const model = config.perplexityApiKey ? "sonar-pro" : "perplexity/sonar-pro";
          const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: [{ role: "user", content: args.query }] }),
          });
          const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
          return text(data.choices?.[0]?.message?.content || "No results");
        } catch (e) {
          return err(`Web search failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "fetch_url",
      "Fetch and read a web page URL for content research or competitive analysis.",
      { url: z.string().url().describe("URL to fetch") },
      async (args) => {
        try {
          const res = await fetch(args.url, {
            headers: { "User-Agent": "BlockDrive-CMA/1.0" },
            signal: AbortSignal.timeout(15000),
          });
          const body = await res.text();
          return text(body.slice(0, 8000));
        } catch (e) {
          return err(`Fetch failed: ${String(e)}`);
        }
      },
    ),

    // ── Content & Campaign Tools ──
    tool(
      "draft_content",
      "Create a structured content draft (blog post, social media, email, or landing page).",
      {
        title: z.string().describe("Content title"),
        type: z.enum(["blog", "social", "email", "landing_page"]).describe("Content type"),
        brief: z.string().describe("Content brief / key points to cover"),
        target_audience: z.string().optional().describe("Target audience or persona"),
        seo_keywords: z.string().optional().describe("Comma-separated SEO keywords"),
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
        name: z.string().optional().describe("Campaign name (required for create)"),
        campaign_id: z.string().optional().describe("Campaign ID (required for update)"),
        status: z.enum(["planning", "active", "paused", "completed"]).optional(),
        channels: z.string().optional().describe("Comma-separated channels (e.g., twitter,linkedin,email)"),
        start_date: z.string().optional().describe("Start date (ISO 8601)"),
        end_date: z.string().optional().describe("End date (ISO 8601)"),
        budget: z.number().optional().describe("Campaign budget"),
        metrics: z.string().optional().describe("JSON string of campaign metrics"),
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
                metrics: args.metrics ? JSON.parse(args.metrics) : {},
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
          if (args.metrics) updates.metrics = JSON.parse(args.metrics);
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
        topic: z.string().describe("Topic or keyword to analyze"),
        url: z.string().url().optional().describe("Optional URL to analyze for on-page SEO"),
      },
      async (args) => {
        try {
          const apiUrl = config.perplexityApiKey
            ? "https://api.perplexity.ai/chat/completions"
            : "https://openrouter.ai/api/v1/chat/completions";
          const apiKey = config.perplexityApiKey || config.openRouterApiKey;
          const model = config.perplexityApiKey ? "sonar-pro" : "perplexity/sonar-pro";
          const prompt = args.url
            ? `Analyze the SEO potential for the topic "${args.topic}" and provide: 1) Related keywords with estimated search volume, 2) Content gaps in top-ranking pages, 3) Recommended content structure. Also analyze this URL for on-page SEO: ${args.url}`
            : `Analyze the SEO potential for the topic "${args.topic}" and provide: 1) Related keywords with estimated search volume, 2) Top-ranking content analysis, 3) Content gaps and opportunities, 4) Recommended content structure and word count.`;
          const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
          });
          const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
          return text(data.choices?.[0]?.message?.content || "No SEO analysis available");
        } catch (e) {
          return err(`SEO analysis failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "draft_email",
      "Draft a marketing email — newsletter, announcement, or campaign email.",
      {
        to: z.string().describe("Recipient or audience segment"),
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email body content"),
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
        query: z.string().describe("Search query for X/Twitter"),
        type: z.enum(["trends", "mentions", "hashtags", "competitor"]).default("trends").describe("Type of search"),
      },
      async (args) => {
        try {
          const prompt = args.type === "trends"
            ? `What are the latest trending topics and conversations on X/Twitter related to: ${args.query}? Include engagement metrics where available.`
            : args.type === "mentions"
            ? `Search X/Twitter for recent mentions and discussions about: ${args.query}. Summarize sentiment and key themes.`
            : args.type === "hashtags"
            ? `Analyze trending hashtags on X/Twitter related to: ${args.query}. Include usage volume and related conversations.`
            : `Analyze competitor activity on X/Twitter for: ${args.query}. Include their recent posts, engagement rates, and content strategy patterns.`;
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${config.openRouterApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "x-ai/grok-4-1-fast",
              messages: [{ role: "user", content: prompt }],
            }),
          });
          const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
          return text(data.choices?.[0]?.message?.content || "No X/Twitter data available");
        } catch (e) {
          return err(`X/Twitter search failed: ${String(e)}`);
        }
      },
    ),
  ];

  return createSdkMcpServer({ name: "cma-tools", version: "1.0.0", tools });
}
