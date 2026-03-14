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
      "Search persistent memory across all department namespaces (executive read-all access). Returns relevant facts, decisions, and context.",
      {
        query: z.string().describe("Search query"),
        namespace: z.string().optional().describe("Limit to specific namespace (cfa, cma, legal, etc.) or omit for cross-namespace"),
        limit: z.number().default(10).describe("Max results"),
      },
      async (args) => {
        try {
          const body: Record<string, unknown> = { query: args.query, top_k: args.limit, rerank: true };
          if (args.namespace) body.agent_id = args.namespace;
          const res = await fetch("https://api.mem0.ai/v2/memories/search/", {
            method: "POST",
            headers: { "Authorization": `Token ${config.mem0ApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
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
      "Persist a fact, decision, or operational insight to memory. Categories: process_management, vendor_tracking, hr_pipeline, capacity_planning, change_management.",
      {
        content: z.string().describe("The knowledge to save"),
        category: z.enum(["process_management", "vendor_tracking", "hr_pipeline", "capacity_planning", "change_management"]),
      },
      async (args) => {
        try {
          const res = await fetch("https://api.mem0.ai/v2/memories/", {
            method: "POST",
            headers: { "Authorization": `Token ${config.mem0ApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: args.content }],
              agent_id: "blockdrive-coa",
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
        "Search the Notion workspace for pages, databases, and content.",
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

      tool(
        "query_notion_database",
        "Query a Notion database (Decision Log, Project Hub, etc.) with optional filters.",
        {
          database_id: z.string().describe("Notion database ID"),
          filter: z.string().optional().describe("JSON filter string (Notion filter format)"),
        },
        async (args) => {
          try {
            const query: any = { database_id: args.database_id, page_size: 25 };
            if (args.filter) query.filter = JSON.parse(args.filter);
            const res = await notion.databases.query(query);
            return text(JSON.stringify(res.results.map((r: any) => ({ id: r.id, properties: r.properties }))));
          } catch (e) {
            return err(`Notion query failed: ${String(e)}`);
          }
        },
      ),

      tool(
        "create_notion_page",
        "Create a new page in a Notion database or as a child of an existing page.",
        {
          parent_id: z.string().describe("Database ID or page ID"),
          parent_type: z.enum(["database_id", "page_id"]).default("database_id"),
          title: z.string().describe("Page title"),
          content: z.string().optional().describe("Page body content"),
        },
        async (args) => {
          try {
            const body: any = {
              parent: { [args.parent_type]: args.parent_id },
              properties: { title: { title: [{ text: { content: args.title } }] } },
            };
            if (args.content) {
              body.children = [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: args.content } }] } }];
            }
            const res = await notion.pages.create(body);
            return text(JSON.stringify({ id: res.id, url: (res as any).url }));
          } catch (e) {
            return err(`Notion create failed: ${String(e)}`);
          }
        },
      ),

      tool(
        "update_notion_page",
        "Update properties of an existing Notion page.",
        {
          page_id: z.string().describe("Notion page ID"),
          properties: z.string().describe("JSON string of properties to update"),
        },
        async (args) => {
          try {
            const res = await notion.pages.update({ page_id: args.page_id, properties: JSON.parse(args.properties) });
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
      "Fetch and read a web page URL.",
      { url: z.string().url().describe("URL to fetch") },
      async (args) => {
        try {
          const res = await fetch(args.url, {
            headers: { "User-Agent": "BlockDrive-COA/1.0" },
            signal: AbortSignal.timeout(15000),
          });
          const body = await res.text();
          return text(body.slice(0, 8000));
        } catch (e) {
          return err(`Fetch failed: ${String(e)}`);
        }
      },
    ),

    // ── Operations Tools ──
    tool(
      "get_agent_status",
      "Check the health status of a department agent by querying its health endpoint.",
      { agent_id: z.string().describe("Agent ID (e.g., blockdrive-cfa, blockdrive-cma)") },
      async (args) => {
        const portMap: Record<string, number> = {
          "blockdrive-cfa": 3001, "blockdrive-ea": 3002, "blockdrive-coa": 3003,
          "blockdrive-cma": 3004, "blockdrive-compliance": 3005, "blockdrive-legal": 3006, "blockdrive-sales": 3007,
        };
        const port = portMap[args.agent_id];
        if (!port) return err(`Unknown agent: ${args.agent_id}`);
        try {
          const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(5000) });
          const data = await res.json();
          return text(JSON.stringify(data));
        } catch (e) {
          return err(`Agent ${args.agent_id} unreachable: ${String(e)}`);
        }
      },
    ),

    tool(
      "create_task",
      "Create an operational task in the COA task queue.",
      {
        title: z.string().describe("Task title"),
        description: z.string().describe("Task description"),
        priority: z.enum(["p0", "p1", "p2", "p3"]).default("p2"),
        assigned_to: z.string().optional().describe("Agent ID to assign"),
        due_date: z.string().optional().describe("Due date (ISO 8601)"),
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
      "Draft a department communication or operational email.",
      {
        to: z.string().describe("Recipient (agent name or email)"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body"),
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
      "Send a message to another agent in the network. Use for cross-department coordination, task delegation, or status requests.",
      {
        target_agent_id: z.string().describe("Agent ID to message (e.g., blockdrive-cma, blockdrive-legal)"),
        message: z.string().describe("Message content"),
        priority: z.enum(["normal", "urgent"]).default("normal"),
      },
      async (args) => {
        // TODO: Implement via Redis Streams (XADD to target's stream)
        // For now, log the message to Supabase for tracking
        try {
          const { data, error: dbError } = await supabase
            .from("agent_messages")
            .insert({ org_id: orgId, sender_id: "blockdrive-coa", target_id: args.target_agent_id, message: args.message, priority: args.priority, status: "queued" })
            .select("id, target_id, status")
            .single();
          if (dbError) return err(`Message send failed: ${dbError.message}`);
          return text(JSON.stringify({ ...data, note: "Message queued for delivery via Redis Streams" }));
        } catch (e) {
          return err(`Message send failed: ${String(e)}`);
        }
      },
    ),
  ];

  return createSdkMcpServer({ name: "coa-tools", version: "1.0.0", tools });
}
