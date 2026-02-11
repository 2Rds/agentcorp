import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { generateSQL } from "../lib/kimi-builder.js";
import { validateSQL } from "../lib/sql-validator.js";
import { suggestChart, type ChartConfig } from "../lib/chart-suggestor.js";

const DB_SCHEMA = `
Tables (all have organization_id UUID for multi-tenancy):

financial_model:
  id UUID PK, organization_id UUID, category TEXT (revenue|cogs|opex|headcount|funding),
  subcategory TEXT, month DATE, amount NUMERIC, formula TEXT, scenario TEXT (base|best|worst),
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ

cap_table_entries:
  id UUID PK, organization_id UUID, stakeholder_name TEXT, stakeholder_type TEXT (founder|investor|option_pool|advisor),
  shares NUMERIC, ownership_pct NUMERIC, investment_amount NUMERIC, share_price NUMERIC,
  round_name TEXT, date DATE, notes TEXT, created_at TIMESTAMPTZ

knowledge_base:
  id UUID PK, organization_id UUID, title TEXT, content TEXT, source TEXT, created_at TIMESTAMPTZ

documents:
  id UUID PK, organization_id UUID, name TEXT, mime_type TEXT, size_bytes BIGINT,
  storage_path TEXT, tags TEXT[], created_at TIMESTAMPTZ

investor_links:
  id UUID PK, organization_id UUID, name TEXT, slug TEXT UNIQUE, email TEXT,
  passcode TEXT, require_email BOOLEAN, expires_at TIMESTAMPTZ, is_active BOOLEAN,
  created_at TIMESTAMPTZ

link_views:
  id UUID PK, link_id UUID FK, viewer_email TEXT, viewer_ip TEXT,
  duration_seconds INT, pages_viewed INT, completion_pct NUMERIC, created_at TIMESTAMPTZ
`;

export function analyticsTools(orgId: string) {
  const run_analytics_query = tool(
    "run_analytics_query",
    "Answer data questions by generating and executing SQL queries against the company database. Automatically creates chart visualizations. Use for questions like 'Show monthly revenue trend', 'What is our burn rate by category?', 'Compare scenarios'. Returns data + a chart configuration that renders inline.",
    {
      question: z.string().describe("Natural language question about the data (e.g. 'Show monthly revenue for the last 12 months')"),
    },
    async (args) => {
      try {
        // Step 1: Generate SQL from natural language using Kimi K2
        const rawSQL = await generateSQL(args.question, DB_SCHEMA);
        console.log("Generated SQL:", rawSQL);

        // Step 2: Validate SQL (SELECT only, org-scoped, limited)
        const validation = validateSQL(rawSQL, orgId);
        if (!validation.valid) {
          return {
            content: [{
              type: "text" as const,
              text: `SQL validation failed: ${validation.error}\n\nGenerated query:\n\`\`\`sql\n${rawSQL}\n\`\`\``,
            }],
            isError: true,
          };
        }

        // Step 3: Execute via Supabase RPC
        const { data, error } = await supabaseAdmin.rpc("run_analytics_query", {
          query_text: validation.query,
          org_id: orgId,
        });

        if (error) {
          // If RPC doesn't exist yet, fall back to direct query
          if (error.message.includes("function") && error.message.includes("does not exist")) {
            return {
              content: [{
                type: "text" as const,
                text: `Analytics RPC not set up yet. The generated SQL query was:\n\n\`\`\`sql\n${validation.query}\n\`\`\`\n\nTo enable this, run the analytics migration to create the \`run_analytics_query\` function.`,
              }],
            };
          }
          return {
            content: [{
              type: "text" as const,
              text: `Query execution error: ${error.message}\n\nQuery:\n\`\`\`sql\n${validation.query}\n\`\`\``,
            }],
            isError: true,
          };
        }

        const results = Array.isArray(data) ? data : data ? [data] : [];

        if (results.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `Query returned no results.\n\nQuery:\n\`\`\`sql\n${validation.query}\n\`\`\``,
            }],
          };
        }

        // Step 4: Suggest chart type from result shape
        const chartConfig: ChartConfig = suggestChart(results, args.question);

        // Step 5: Return data + chart config as a special ```chart block
        const chartJson = JSON.stringify(chartConfig, null, 2);

        return {
          content: [{
            type: "text" as const,
            text: `**Query:** ${args.question}\n\n\`\`\`sql\n${validation.query}\n\`\`\`\n\n**Results:** ${results.length} rows\n\n\`\`\`chart\n${chartJson}\n\`\`\`\n\n<details><summary>Raw Data</summary>\n\n\`\`\`json\n${JSON.stringify(results.slice(0, 20), null, 2)}\n\`\`\`\n</details>`,
          }],
        };
      } catch (e: any) {
        return {
          content: [{
            type: "text" as const,
            text: `Analytics error: ${e.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  return [run_analytics_query];
}
