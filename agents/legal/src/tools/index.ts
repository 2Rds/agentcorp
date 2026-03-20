/**
 * Legal Agent Tools — 11 MCP tools for legal analysis & contract management
 *
 * Uses Agent SDK tool() with 4-arg signature:
 *   tool(name, description, zodRawShape, handler)
 * Handler returns: { content: [{ type: "text", text }] }
 *
 * Special: analyze_contract routes to Claude Opus via Anthropic direct API for long-form contract review
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
      "Search legal namespace memory for past contracts, legal analyses, IP portfolio, and regulatory guidance.",
      {
        query: z.string().max(500).describe("Search query"),
        limit: z.number().default(10).describe("Max results"),
      },
      async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return err("Memory system not available");
        try {
          const results = await memory.searchAgentMemories("blockdrive-legal", orgId, args.query, args.limit);
          return text(JSON.stringify(results.map(m => ({ memory: m.memory, metadata: m.metadata }))));
        } catch (e) { return err(`Memory search failed: ${e}`); }
      },
    ),

    tool(
      "save_knowledge",
      "Persist legal knowledge — contract summaries, regulatory guidance, IP updates, policy decisions.",
      {
        content: z.string().max(5000).describe("The knowledge to save"),
        category: z.enum(["contracts", "compliance_tracking", "ip_portfolio", "regulatory", "policy"]),
      },
      async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return err("Memory system not available");
        try {
          const events = await memory.addAgentMemory("blockdrive-legal", orgId, args.content, "general", { category: args.category });
          return text(`Saved to ${args.category}: ${JSON.stringify(events)}`);
        } catch (e) { return err(`Memory save failed: ${e}`); }
      },
    ),

    // ── Notion Tools (conditional) ──
    ...(notion ? [
      tool(
        "search_notion",
        "Search the Notion workspace for legal documents, contracts, and decision log entries.",
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
        "update_notion_page",
        "Update properties of a Notion page (e.g., update Decision Log with legal decisions).",
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
      "Search the web for legal research — case law, regulations, precedents, and legal analysis.",
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
      "Fetch and read a web page for legal research or regulatory content. Strips HTML for clean output. Blocked for internal/private URLs.",
      { url: z.string().url().max(2000).describe("URL to fetch") },
      async (args) => {
        const result = await safeFetchText(
          args.url,
          { headers: { "User-Agent": "BlockDrive-Legal/1.0" }, signal: AbortSignal.timeout(15000) },
          "Fetch URL",
        );
        if (!result.ok) return err(result.error);
        return text(stripHtml(result.data).slice(0, 8000));
      },
    ),

    // ── Legal-Specific Tools ──
    tool(
      "create_legal_review",
      "Create a structured legal review with risk scoring and recommendations.",
      {
        type: z.enum(["contract", "compliance", "ip", "regulatory", "policy", "general"]).describe("Review type"),
        subject: z.string().max(300).describe("Subject of the review"),
        summary: z.string().max(10000).describe("Summary of findings"),
        risk_level: z.enum(["critical", "high", "medium", "low"]).describe("Overall risk level"),
        key_issues: z.string().max(5000).describe("JSON array of key issues found"),
        recommendations: z.string().max(5000).describe("Recommendations and next steps"),
      },
      async (args) => {
        try {
          const parsed = safeJsonParse(args.key_issues, "key_issues");
          if (!parsed.ok) return err(parsed.error);
          const { data, error: dbError } = await supabase
            .from("legal_reviews")
            .insert({
              org_id: orgId,
              type: args.type,
              subject: args.subject,
              summary: args.summary,
              risk_level: args.risk_level,
              key_issues: parsed.data,
              recommendations: args.recommendations,
              status: "draft",
            })
            .select("id, type, subject, risk_level, status")
            .single();
          if (dbError) return err(`Legal review creation failed: ${dbError.message}`);
          return text(JSON.stringify(data));
        } catch (e) {
          return err(`Legal review creation failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "track_ip",
      "Add or update an entry in the IP portfolio (patents, trademarks, copyrights, trade secrets).",
      {
        action: z.enum(["add", "update", "list"]).describe("Action to perform"),
        name: z.string().max(300).optional().describe("IP asset name"),
        ip_id: z.string().max(100).optional().describe("IP entry ID (for update)"),
        type: z.enum(["patent", "trademark", "copyright", "trade_secret", "domain"]).optional(),
        status: z.enum(["draft", "filed", "pending", "registered", "expired", "abandoned"]).optional(),
        registration_number: z.string().max(100).optional(),
        filing_date: z.string().max(30).optional(),
        expiry_date: z.string().max(30).optional(),
      },
      async (args) => {
        try {
          if (args.action === "list") {
            const { data, error: dbError } = await supabase
              .from("legal_ip_portfolio")
              .select("id, name, type, status, registration_number, filing_date, expiry_date")
              .eq("org_id", orgId)
              .order("created_at", { ascending: false })
              .limit(20);
            if (dbError) return err(`IP list failed: ${dbError.message}`);
            return text(JSON.stringify(data));
          }
          if (args.action === "add") {
            if (!args.name || !args.type) return err("name and type are required for add action");
            const { data, error: dbError } = await supabase
              .from("legal_ip_portfolio")
              .insert({
                org_id: orgId,
                name: args.name,
                type: args.type,
                status: args.status || "draft",
                registration_number: args.registration_number || null,
                filing_date: args.filing_date || null,
                expiry_date: args.expiry_date || null,
              })
              .select("id, name, type, status")
              .single();
            if (dbError) return err(`IP add failed: ${dbError.message}`);
            return text(JSON.stringify(data));
          }
          // update
          if (!args.ip_id) return err("ip_id is required for update action");
          const updates: Record<string, unknown> = {};
          if (args.name) updates.name = args.name;
          if (args.type) updates.type = args.type;
          if (args.status) updates.status = args.status;
          if (args.registration_number) updates.registration_number = args.registration_number;
          if (args.filing_date) updates.filing_date = args.filing_date;
          if (args.expiry_date) updates.expiry_date = args.expiry_date;
          updates.updated_at = new Date().toISOString();
          const { data, error: dbError } = await supabase
            .from("legal_ip_portfolio")
            .update(updates)
            .eq("id", args.ip_id)
            .eq("org_id", orgId)
            .select("id, name, type, status")
            .single();
          if (dbError) return err(`IP update failed: ${dbError.message}`);
          return text(JSON.stringify(data));
        } catch (e) {
          return err(`IP operation failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "draft_email",
      "Draft a legal communication — contract correspondence, regulatory responses, or internal legal guidance. Saved as a legal review draft.",
      {
        to: z.string().max(200).describe("Recipient"),
        subject: z.string().max(200).describe("Email subject"),
        body: z.string().max(10000).describe("Email body"),
        type: z.enum(["contract", "regulatory", "internal", "external"]).default("internal"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("legal_reviews")
            .insert({
              org_id: orgId,
              type: "general",
              subject: `Email Draft: ${args.subject}`,
              summary: JSON.stringify({ to: args.to, subject: args.subject, body: args.body, email_type: args.type }),
              risk_level: "low",
              key_issues: [],
              recommendations: "Review and send",
              status: "draft",
            })
            .select("id, subject, status")
            .single();
          if (dbError) return err(`Draft failed: ${dbError.message}`);
          return text(JSON.stringify({ ...data, message: "Email draft saved as legal review entry. Requires review before sending." }));
        } catch (e) {
          return err(`Draft failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "analyze_contract",
      "Perform long-form contract analysis using Claude Opus. For detailed clause-by-clause review of lengthy agreements.",
      {
        contract_text: z.string().max(500000).describe("Full contract text or key excerpts to analyze"),
        focus_areas: z.string().max(500).optional().describe("Specific areas to focus analysis on (e.g., indemnification, IP, termination)"),
        counterparty: z.string().max(200).optional().describe("Name of the counterparty"),
      },
      async (args) => {
        const prompt = `You are a legal analyst reviewing a contract${args.counterparty ? ` with ${args.counterparty}` : ""}. Provide a thorough analysis including:

1. **Summary**: Brief overview of the agreement type and key terms
2. **Risk Assessment**: Overall risk level (Critical/High/Medium/Low) with justification
3. **Key Clauses**: Analysis of critical clauses${args.focus_areas ? ` with special focus on: ${args.focus_areas}` : ""}
4. **Red Flags**: Any concerning provisions, unusual terms, or one-sided clauses
5. **Missing Provisions**: Standard protections that are absent
6. **Negotiation Points**: Recommended changes or additions
7. **Compliance Check**: Any regulatory compliance considerations

Contract text:
${args.contract_text}`;
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": config.anthropicApiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-opus-4-6",
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) {
          const errText = await response.text();
          return err(`Contract analysis failed (${response.status}): ${errText}`);
        }
        const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
        const resultText = data.content?.filter(c => c.type === "text" && c.text).map(c => c.text!).join("\n") || "Contract analysis returned no results";
        return text(resultText);
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
            from: "blockdrive-legal",
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

  return createSdkMcpServer({ name: "legal-tools", version: "1.0.0", tools });
}
