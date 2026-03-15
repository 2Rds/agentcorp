/**
 * Compliance Agent Tools — 10 MCP tools for governance & compliance
 *
 * Uses Agent SDK tool() with 4-arg signature:
 *   tool(name, description, zodRawShape, handler)
 * Handler returns: { content: [{ type: "text", text }] }
 *
 * Special: audit-read ALL namespaces via memory store (no agent_id filter)
 * Special: scan_compliance routes analysis to Granite 4.0 via OpenRouter
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { createClient } from "@supabase/supabase-js";
import { Client as NotionClient } from "@notionhq/client";
import type { PageObjectResponse, DatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { z } from "zod";
import { safeFetch, safeFetchText, stripHtml } from "@waas/runtime";
import { config } from "../config.js";
import { getRuntime } from "../runtime-ref.js";

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
        query: z.string().max(500).describe("Search query"),
        namespace: z.string().max(50).optional().describe("Limit to specific namespace (cfa, cma, legal, etc.) or omit for cross-namespace audit"),
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
      "Persist compliance findings, policy updates, risk assessments, and governance actions.",
      {
        content: z.string().max(5000).describe("The knowledge to save"),
        category: z.enum(["audit_log", "policy_register", "risk_assessment", "governance_actions"]),
      },
      async (args) => {
        const memory = getRuntime()?.memory;
        if (!memory) return err("Memory system not available");
        try {
          const events = await memory.addAgentMemory("blockdrive-compliance", orgId, args.content, "compliance", { category: args.category });
          return text(`Saved to ${args.category}: ${JSON.stringify(events)}`);
        } catch (e) { return err(`Memory save failed: ${e}`); }
      },
    ),

    // ── Notion Tools (conditional) ──
    ...(notion ? [
      tool(
        "search_notion",
        "Search the Notion workspace for compliance documents, policies, and decision log entries.",
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
        "Read the content and properties of a Notion page (Decision Log, policies, etc.).",
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
      "Search the web for regulatory updates, compliance frameworks, and governance best practices.",
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
      "Fetch and read a regulatory or compliance web page. Strips HTML for clean output. Blocked for internal/private URLs.",
      { url: z.string().url().max(2000).describe("URL to fetch") },
      async (args) => {
        const result = await safeFetchText(
          args.url,
          { headers: { "User-Agent": "BlockDrive-Compliance/1.0" }, signal: AbortSignal.timeout(15000) },
          "Fetch URL",
        );
        if (!result.ok) return err(result.error);
        return text(stripHtml(result.data).slice(0, 8000));
      },
    ),

    // ── Compliance-Specific Tools ──
    tool(
      "scan_compliance",
      "Generate a structured compliance analysis using Granite 4.0. Produces a report template based on scope and framework — combine with search_knowledge audit-read to include actual department data.",
      {
        scope: z.enum(["all", "financial", "marketing", "legal", "operations", "data"]).describe("Scan scope"),
        framework: z.string().max(100).optional().describe("Specific framework to check against (e.g., SOX, GDPR, ISO42001)"),
        focus_area: z.string().max(500).optional().describe("Specific area to focus the scan on"),
      },
      async (args) => {
        const prompt = `You are a compliance auditor. Perform a ${args.scope} compliance scan${args.framework ? ` against ${args.framework}` : ""}${args.focus_area ? ` focusing on ${args.focus_area}` : ""}.

Analyze and report:
1. **Compliance Status**: Overall assessment (Compliant, Partially Compliant, Non-Compliant)
2. **Findings**: Specific compliance issues found, each with severity (Critical/High/Medium/Low)
3. **Regulatory References**: Cite specific regulations, standards, or policies
4. **Remediation**: Clear steps to address each finding
5. **Timeline**: Recommended remediation timeline

Format as a structured compliance report.`;
        const result = await safeFetch<{ choices?: Array<{ message: { content: string } }> }>(
          "https://openrouter.ai/api/v1/chat/completions",
          { method: "POST", headers: { "Authorization": `Bearer ${config.openRouterApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "ibm/granite-4.0-8b-instruct", messages: [{ role: "user", content: prompt }] }) },
          "Compliance scan",
        );
        if (!result.ok) return err(result.error);
        return text(result.data.choices?.[0]?.message?.content || "Compliance scan returned no results");
      },
    ),

    tool(
      "assess_risk",
      "Create a structured risk assessment with severity scoring.",
      {
        subject: z.string().max(300).describe("What is being assessed"),
        risk_type: z.enum(["regulatory", "operational", "financial", "reputational", "data_privacy", "ai_governance"]),
        description: z.string().max(5000).describe("Description of the potential risk"),
        likelihood: z.enum(["very_low", "low", "medium", "high", "very_high"]),
        impact: z.enum(["minimal", "minor", "moderate", "major", "severe"]),
        mitigation: z.string().max(5000).optional().describe("Proposed mitigation steps"),
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
        action: z.string().max(500).describe("The governance action taken"),
        affected_agents: z.string().max(500).describe("Comma-separated agent IDs affected"),
        decision: z.string().max(5000).describe("The decision and rationale"),
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
        query: z.string().max(200).describe("Policy name or keyword to search"),
        category: z.string().max(100).optional().describe("Policy category filter"),
      },
      async (args) => {
        try {
          // Escape LIKE wildcards in user input
          const escapedQuery = args.query.replace(/[%_]/g, "\\$&");
          let query = supabase
            .from("compliance_policy_register")
            .select("id, name, category, status, owner, review_date, updated_at")
            .eq("org_id", orgId)
            .ilike("name", `%${escapedQuery}%`);
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

    // ── Inter-Agent Messaging ──
    tool(
      "message_agent",
      "Send a message to another agent via the inter-agent MessageBus. Scope-enforced: can message COA only.",
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
            from: "blockdrive-compliance",
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

  return createSdkMcpServer({ name: "compliance-tools", version: "1.0.0", tools });
}
