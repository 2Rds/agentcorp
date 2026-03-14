/**
 * Compliance Agent Tools — 10 MCP tools for governance & compliance
 *
 * Uses Agent SDK tool() with 4-arg signature:
 *   tool(name, description, zodRawShape, handler)
 * Handler returns: { content: [{ type: "text", text }] }
 *
 * Special: audit-read ALL namespaces via mem0 (no agent_id filter)
 * Special: scan_compliance routes analysis to Granite 4.0 via OpenRouter
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
    // ── Knowledge Tools (audit-read ALL namespaces) ──
    tool(
      "search_knowledge",
      "Search persistent memory across ALL department namespaces (compliance audit-read access). Use for cross-department compliance monitoring.",
      {
        query: z.string().describe("Search query"),
        namespace: z.string().optional().describe("Limit to specific namespace (cfa, cma, legal, etc.) or omit for cross-namespace audit"),
        limit: z.number().default(10).describe("Max results"),
      },
      async (args) => {
        try {
          const body: Record<string, unknown> = { query: args.query, top_k: args.limit, rerank: true };
          if (args.namespace) body.agent_id = args.namespace;
          // No agent_id filter when namespace is omitted = audit-read-all
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
      "Persist compliance findings, policy updates, risk assessments, and governance actions.",
      {
        content: z.string().describe("The knowledge to save"),
        category: z.enum(["audit_log", "policy_register", "risk_assessment", "governance_actions"]),
      },
      async (args) => {
        try {
          const res = await fetch("https://api.mem0.ai/v2/memories/", {
            method: "POST",
            headers: { "Authorization": `Token ${config.mem0ApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: args.content }],
              agent_id: "blockdrive-compliance",
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
        "Search the Notion workspace for compliance documents, policies, and decision log entries.",
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
        "Read the content and properties of a Notion page (Decision Log, policies, etc.).",
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
      "Search the web for regulatory updates, compliance frameworks, and governance best practices.",
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
      "Fetch and read a regulatory or compliance web page.",
      { url: z.string().url().describe("URL to fetch") },
      async (args) => {
        try {
          const res = await fetch(args.url, {
            headers: { "User-Agent": "BlockDrive-Compliance/1.0" },
            signal: AbortSignal.timeout(15000),
          });
          const body = await res.text();
          return text(body.slice(0, 8000));
        } catch (e) {
          return err(`Fetch failed: ${String(e)}`);
        }
      },
    ),

    // ── Compliance-Specific Tools ──
    tool(
      "scan_compliance",
      "Run a structured compliance scan across departments. Routes analysis to IBM Granite 4.0 for regulatory reasoning.",
      {
        scope: z.enum(["all", "financial", "marketing", "legal", "operations", "data"]).describe("Scan scope"),
        framework: z.string().optional().describe("Specific framework to check against (e.g., SOX, GDPR, ISO42001)"),
        focus_area: z.string().optional().describe("Specific area to focus the scan on"),
      },
      async (args) => {
        try {
          const prompt = `You are a compliance auditor. Perform a ${args.scope} compliance scan${args.framework ? ` against ${args.framework}` : ""}${args.focus_area ? ` focusing on ${args.focus_area}` : ""}.

Analyze and report:
1. **Compliance Status**: Overall assessment (Compliant, Partially Compliant, Non-Compliant)
2. **Findings**: Specific compliance issues found, each with severity (Critical/High/Medium/Low)
3. **Regulatory References**: Cite specific regulations, standards, or policies
4. **Remediation**: Clear steps to address each finding
5. **Timeline**: Recommended remediation timeline

Format as a structured compliance report.`;
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${config.openRouterApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "ibm/granite-4.0-8b-instruct",
              messages: [{ role: "user", content: prompt }],
            }),
          });
          const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
          return text(data.choices?.[0]?.message?.content || "Compliance scan returned no results");
        } catch (e) {
          return err(`Compliance scan failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "assess_risk",
      "Create a structured risk assessment with severity scoring.",
      {
        subject: z.string().describe("What is being assessed"),
        risk_type: z.enum(["regulatory", "operational", "financial", "reputational", "data_privacy", "ai_governance"]),
        description: z.string().describe("Description of the potential risk"),
        likelihood: z.enum(["very_low", "low", "medium", "high", "very_high"]),
        impact: z.enum(["minimal", "minor", "moderate", "major", "severe"]),
        mitigation: z.string().optional().describe("Proposed mitigation steps"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("compliance_risk_assessments")
            .insert({
              org_id: orgId,
              subject: args.subject,
              risk_type: args.risk_type,
              description: args.description,
              likelihood: args.likelihood,
              impact: args.impact,
              mitigation: args.mitigation || null,
              status: "open",
            })
            .select("id, subject, risk_type, likelihood, impact, status")
            .single();
          if (dbError) return err(`Risk assessment failed: ${dbError.message}`);
          return text(JSON.stringify(data));
        } catch (e) {
          return err(`Risk assessment failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "log_governance_action",
      "Record a governance decision or enforcement action for audit trail.",
      {
        action: z.string().describe("The governance action taken"),
        affected_agents: z.string().describe("Comma-separated agent IDs affected"),
        decision: z.string().describe("The decision and rationale"),
        severity: z.enum(["informational", "advisory", "mandatory", "enforcement"]).default("advisory"),
      },
      async (args) => {
        try {
          const { data, error: dbError } = await supabase
            .from("compliance_governance_log")
            .insert({
              org_id: orgId,
              action: args.action,
              affected_agents: args.affected_agents.split(",").map(a => a.trim()),
              decision: args.decision,
              severity: args.severity,
            })
            .select("id, action, severity")
            .single();
          if (dbError) return err(`Governance log failed: ${dbError.message}`);
          return text(JSON.stringify(data));
        } catch (e) {
          return err(`Governance log failed: ${String(e)}`);
        }
      },
    ),

    tool(
      "check_policy",
      "Look up a policy in the compliance policy register.",
      {
        query: z.string().describe("Policy name or keyword to search"),
        category: z.string().optional().describe("Policy category filter"),
      },
      async (args) => {
        try {
          let query = supabase
            .from("compliance_policy_register")
            .select("id, name, category, status, owner, review_date, last_updated")
            .eq("org_id", orgId)
            .ilike("name", `%${args.query}%`);
          if (args.category) query = query.eq("category", args.category);
          const { data, error: dbError } = await query.limit(10);
          if (dbError) return err(`Policy lookup failed: ${dbError.message}`);
          if (!data || data.length === 0) return text(`No policies found matching "${args.query}"`);
          return text(JSON.stringify(data));
        } catch (e) {
          return err(`Policy lookup failed: ${String(e)}`);
        }
      },
    ),
  ];

  return createSdkMcpServer({ name: "compliance-tools", version: "1.0.0", tools });
}
