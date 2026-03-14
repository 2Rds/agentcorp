/**
 * Legal Agent Tools — 11 MCP tools for legal analysis & contract management
 *
 * Uses Agent SDK tool() with 4-arg signature:
 *   tool(name, description, zodRawShape, handler)
 * Handler returns: { content: [{ type: "text", text }] }
 *
 * Special: analyze_contract routes to Grok 4.1 Reasoning (2M context) for long-form contract review
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
      "Search legal namespace memory for past contracts, legal analyses, IP portfolio, and regulatory guidance.",
      {
        query: z.string().describe("Search query"),
        limit: z.number().default(10).describe("Max results"),
      },
      async (args) => {
        try {
          const res = await fetch("https://api.mem0.ai/v2/memories/search/", {
            method: "POST",
            headers: { "Authorization": `Token ${config.mem0ApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: args.query, top_k: args.limit, rerank: true, agent_id: "blockdrive-legal" }),
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
      "Persist legal knowledge — contract summaries, regulatory guidance, IP updates, policy decisions.",
      {
        content: z.string().describe("The knowledge to save"),
        category: z.enum(["contracts", "compliance_tracking", "ip_portfolio", "regulatory", "policy"]),
      },
      async (args) => {
        try {
          const res = await fetch("https://api.mem0.ai/v2/memories/", {
            method: "POST",
            headers: { "Authorization": `Token ${config.mem0ApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: args.content }],
              agent_id: "blockdrive-legal",
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
        "Search the Notion workspace for legal documents, contracts, and decision log entries.",
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
        "update_notion_page",
        "Update properties of a Notion page (e.g., update Decision Log with legal decisions).",
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
      "Search the web for legal research — case law, regulations, precedents, and legal analysis.",
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
      "Fetch and read a web page for legal research or regulatory content.",
      { url: z.string().url().describe("URL to fetch") },
      async (args) => {
        try {
          const res = await fetch(args.url, {
            headers: { "User-Agent": "BlockDrive-Legal/1.0" },
            signal: AbortSignal.timeout(15000),
          });
          const body = await res.text();
          return text(body.slice(0, 8000));
        } catch (e) {
          return err(`Fetch failed: ${String(e)}`);
        }
      },
    ),

    // ── Legal-Specific Tools ──
    tool(
      "create_legal_review",
      "Create a structured legal review with risk scoring and recommendations.",
      {
        type: z.enum(["contract", "compliance", "ip", "regulatory", "policy", "general"]).describe("Review type"),
        subject: z.string().describe("Subject of the review"),
        summary: z.string().describe("Summary of findings"),
        risk_level: z.enum(["critical", "high", "medium", "low"]).describe("Overall risk level"),
        key_issues: z.string().describe("JSON array of key issues found"),
        recommendations: z.string().describe("Recommendations and next steps"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("legal_reviews")
            .insert({
              org_id: orgId,
              type: args.type,
              subject: args.subject,
              summary: args.summary,
              risk_level: args.risk_level,
              key_issues: JSON.parse(args.key_issues),
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
        name: z.string().optional().describe("IP asset name"),
        ip_id: z.string().optional().describe("IP entry ID (for update)"),
        type: z.enum(["patent", "trademark", "copyright", "trade_secret", "domain"]).optional(),
        status: z.enum(["draft", "filed", "pending", "registered", "expired", "abandoned"]).optional(),
        registration_number: z.string().optional(),
        filing_date: z.string().optional(),
        expiry_date: z.string().optional(),
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
      "Draft a legal communication — contract correspondence, regulatory responses, or internal legal guidance.",
      {
        to: z.string().describe("Recipient"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body"),
        type: z.enum(["contract", "regulatory", "internal", "external"]).default("internal"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("legal_reviews")
            .insert({
              org_id: orgId,
              type: "general",
              subject: `Email: ${args.subject}`,
              summary: JSON.stringify({ to: args.to, subject: args.subject, body: args.body, email_type: args.type }),
              risk_level: "low",
              key_issues: [],
              recommendations: "Review and send",
              status: "draft",
            })
            .select("id, subject, status")
            .single();
          if (dbError) return err(`Draft failed: ${dbError.message}`);
          return text(JSON.stringify({ ...data, message: "Email draft saved as legal review. Requires review before sending." }));
        } catch (e) {
          return err(`Draft failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "analyze_contract",
      "Perform long-form contract analysis using Grok 4.1 Reasoning with 2M context window. For detailed clause-by-clause review of lengthy agreements.",
      {
        contract_text: z.string().describe("Full contract text or key excerpts to analyze"),
        focus_areas: z.string().optional().describe("Specific areas to focus analysis on (e.g., indemnification, IP, termination)"),
        counterparty: z.string().optional().describe("Name of the counterparty"),
      },
      async (args) => {
        try {
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
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${config.openRouterApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "x-ai/grok-4-1-fast-reasoning",
              messages: [{ role: "user", content: prompt }],
            }),
          });
          const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
          return text(data.choices?.[0]?.message?.content || "Contract analysis returned no results");
        } catch (e) {
          return err(`Contract analysis failed: ${String(e)}`);
        }
      },
    ),
  ];

  return createSdkMcpServer({ name: "legal-tools", version: "1.0.0", tools });
}
