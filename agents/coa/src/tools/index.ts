/**
 * COA Agent Tools — 13 MCP tools for workforce management
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
      "Search persistent memory across all department namespaces (executive read-all access). Returns relevant facts, decisions, and context.",
      {
        query: z.string().max(500).describe("Search query"),
        namespace: z.string().max(50).optional().describe("Limit to specific namespace (cfa, cma, legal, etc.) or omit for cross-namespace"),
        limit: z.number().default(10).describe("Max results"),
      },
      async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return err("Memory system not available");
        try {
          const results = args.namespace
            ? await memory.searchAgentMemories(args.namespace, orgId, args.query, args.limit)
            : await memory.searchCrossAgentMemories(orgId, args.query, args.limit);
          return text(JSON.stringify(results.map(m => ({ memory: m.memory, metadata: m.metadata }))));
        } catch (e) { return err(`Memory search failed: ${e}`); }
      },
    ),

    tool(
      "save_knowledge",
      "Persist a fact, decision, or operational insight to memory. Categories: process_management, vendor_tracking, hr_pipeline, capacity_planning, change_management.",
      {
        content: z.string().max(5000).describe("The knowledge to save"),
        category: z.enum(["process_management", "vendor_tracking", "hr_pipeline", "capacity_planning", "change_management"]),
      },
      async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return err("Memory system not available");
        try {
          const events = await memory.addAgentMemory("blockdrive-coa", orgId, args.content, "operational", { category: args.category });
          return text(`Saved to ${args.category}: ${JSON.stringify(events)}`);
        } catch (e) { return err(`Memory save failed: ${e}`); }
      },
    ),

    // ── Notion Tools (conditional) ──
    ...(notion ? [
      tool(
        "search_notion",
        "Search the Notion workspace for pages, databases, and content.",
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

      tool(
        "query_notion_database",
        "Query a Notion database (Decision Log, Project Hub, etc.) with optional filters.",
        {
          database_id: z.string().max(100).describe("Notion database ID"),
          filter: z.string().max(2000).optional().describe("JSON filter string (Notion filter format)"),
        },
        async (args) => {
          try {
            const query: Record<string, unknown> = { database_id: args.database_id, page_size: 25 };
            if (args.filter) {
              const parsed = safeJsonParse(args.filter, "filter");
              if (!parsed.ok) return err(parsed.error);
              query.filter = parsed.data;
            }
            const res = await notion.databases.query(query as Parameters<typeof notion.databases.query>[0]);
            return text(JSON.stringify(res.results.map((r) => ({ id: r.id, properties: (r as PageObjectResponse).properties }))));
          } catch (e) {
            return err(`Notion query failed: ${String(e)}`);
          }
        },
      ),

      tool(
        "create_notion_page",
        "Create a new page in a Notion database or as a child of an existing page.",
        {
          parent_id: z.string().max(100).describe("Database ID or page ID"),
          parent_type: z.enum(["database_id", "page_id"]).default("database_id"),
          title: z.string().max(500).describe("Page title"),
          content: z.string().max(10000).optional().describe("Page body content"),
        },
        async (args) => {
          try {
            const body: Record<string, unknown> = {
              parent: { [args.parent_type]: args.parent_id },
              properties: { title: { title: [{ text: { content: args.title } }] } },
            };
            if (args.content) {
              body.children = [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: args.content } }] } }];
            }
            const res = await notion.pages.create(body as Parameters<typeof notion.pages.create>[0]);
            return text(JSON.stringify({ id: res.id, url: (res as PageObjectResponse).url }));
          } catch (e) {
            return err(`Notion create failed: ${String(e)}`);
          }
        },
      ),

      tool(
        "update_notion_page",
        "Update properties of an existing Notion page.",
        {
          page_id: z.string().max(100).describe("Notion page ID"),
          properties: z.string().max(5000).describe("JSON string of properties to update"),
        },
        async (args) => {
          try {
            const parsed = safeJsonParse(args.properties, "properties");
            if (!parsed.ok) return err(parsed.error);
            const res = await notion.pages.update({ page_id: args.page_id, properties: parsed.data as Parameters<typeof notion.pages.update>[0]["properties"] });
            return text(JSON.stringify({ id: res.id, updated: true }));
          } catch (e) {
            return err(`Notion update failed: ${String(e)}`);
          }
        },
      ),
    ] : []),

    // ── Web Research ──
    tool(
      "web_search",
      "Search the web for operational research — vendor comparisons, industry benchmarks, best practices.",
      { query: z.string().max(500).describe("Search query") },
      async (args) => {
        const result = await safeFetch<{ choices?: Array<{ message: { content: string } }> }>(
          "https://openrouter.ai/api/v1/chat/completions",
          { method: "POST", headers: { "Authorization": `Bearer ${config.openRouterApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "user", content: args.query }] }) },
          "Web search",
        );
        if (!result.ok) return err(result.error);
        return text(result.data.choices?.[0]?.message?.content || "No results found for this query.");
      },
    ),

    tool(
      "fetch_url",
      "Fetch and read a web page URL. Strips HTML tags for clean text output. Blocked for internal/private URLs.",
      { url: z.string().url().max(2000).describe("URL to fetch") },
      async (args) => {
        const result = await safeFetchText(
          args.url,
          { headers: { "User-Agent": "BlockDrive-COA/1.0" }, signal: AbortSignal.timeout(15000) },
          "Fetch URL",
        );
        if (!result.ok) return err(result.error);
        return text(stripHtml(result.data).slice(0, 8000));
      },
    ),

    // ── Operations Tools ──
    tool(
      "get_agent_status",
      "Check the health status of a department agent by querying its health endpoint.",
      { agent_id: z.string().max(50).describe("Agent ID (e.g., blockdrive-cfa, blockdrive-cma)") },
      async (args) => {
        const baseUrl = config.agentBaseUrl;
        const pathMap: Record<string, string> = {
          "blockdrive-cfa": "/health",
          "blockdrive-ea": "/ea/health",
          "blockdrive-coa": "/coa/health",
          "blockdrive-cma": "/cma/health",
          "blockdrive-compliance": "/compliance/health",
          "blockdrive-legal": "/legal/health",
          "blockdrive-sales": "/sales/health",
        };
        const path = pathMap[args.agent_id];
        if (!path) return err(`Unknown agent: ${args.agent_id}`);
        const result = await safeFetch(
          `${baseUrl}${path}`,
          { signal: AbortSignal.timeout(5000) },
          `Agent ${args.agent_id} health`,
        );
        if (!result.ok) return err(`Agent ${args.agent_id} unreachable: ${result.error}`);
        return text(JSON.stringify(result.data));
      },
    ),

    tool(
      "create_task",
      "Create an operational task in the COA task queue.",
      {
        title: z.string().max(200).describe("Task title"),
        description: z.string().max(5000).describe("Task description"),
        priority: z.enum(["p0", "p1", "p2", "p3"]).default("p2"),
        assigned_to: z.string().max(50).optional().describe("Agent ID to assign"),
        due_date: z.string().max(30).optional().describe("Due date (ISO 8601)"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("coa_tasks")
            .insert({ org_id: orgId, title: args.title, description: args.description, priority: args.priority, assigned_to: args.assigned_to || null, due_date: args.due_date || null, status: "pending" })
            .select("id, title, priority, status")
            .single();
          if (dbError) return err(`Task creation failed: ${dbError.message}`);
          return text(JSON.stringify(data));
        } catch (e) {
          return err(`Task creation failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "draft_email",
      "Draft a department communication or operational email. Saved as draft for review before sending.",
      {
        to: z.string().max(200).describe("Recipient (agent name or email)"),
        subject: z.string().max(200).describe("Email subject"),
        body: z.string().max(10000).describe("Email body"),
        type: z.enum(["internal", "vendor", "report"]).default("internal"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("coa_communications")
            .insert({ org_id: orgId, recipient: args.to, subject: args.subject, body: args.body, type: args.type, status: "draft" })
            .select("id, subject, status")
            .single();
          if (dbError) return err(`Draft failed: ${dbError.message}`);
          return text(JSON.stringify({ ...data, message: "Draft saved. Requires review before sending." }));
        } catch (e) {
          return err(`Draft failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "message_agent",
      "Send a message to another agent in the network via the inter-agent MessageBus. Scope-enforced: can message EA, CFA, CMA, Compliance, Legal, Sales.",
      {
        target_agent_id: z.string().max(50).describe("Agent ID to message (e.g., blockdrive-cma, blockdrive-legal)"),
        subject: z.string().max(200).describe("Message subject"),
        message: z.string().max(4000).describe("Message content"),
        priority: z.enum(["normal", "urgent"]).default("normal"),
        requires_response: z.boolean().default(false).describe("Whether you need a reply"),
      },
      async (args) => {
        try {
          // MessageBus is injected via global runtime reference
          const { getRuntime } = await import("../runtime-ref.js");
          const bus = getRuntime()?.getMessageBus();
          if (!bus) {
            return err("MessageBus not available — agent messaging requires Redis + Telegram transport");
          }
          const receipt = await bus.send({
            from: "blockdrive-coa",
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

  return createSdkMcpServer({ name: "coa-tools", version: "1.0.0", tools });
}
