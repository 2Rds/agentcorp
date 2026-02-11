import { z } from "zod";
import { chatCompletion, extractStructured } from "./model-router.js";
import { config } from "../config.js";

// Zod schemas for validating K2 output
const FinancialModelRowSchema = z.object({
  category: z.enum(["revenue", "cogs", "opex", "headcount", "funding"]),
  subcategory: z.string(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number(),
  formula: z.string().optional(),
  scenario: z.enum(["base", "best", "worst"]).default("base"),
});

const FinancialModelResponseSchema = z.object({
  rows: z.array(FinancialModelRowSchema),
});

const CapTableEntrySchema = z.object({
  stakeholder_name: z.string(),
  stakeholder_type: z.enum(["founder", "investor", "option_pool", "advisor"]),
  shares: z.number(),
  ownership_pct: z.number(),
  investment_amount: z.number().optional(),
  share_price: z.number().optional(),
  round_name: z.string().optional(),
  date: z.string().optional(),
});

const CapTableResponseSchema = z.object({
  entries: z.array(CapTableEntrySchema),
});

export type FinancialModelRow = z.infer<typeof FinancialModelRowSchema>;
export type CapTableEntry = z.infer<typeof CapTableEntrySchema>;

const FM_SYSTEM_PROMPT = `You are a financial modeling engine. Generate precise financial model data as JSON.

You output structured JSON with a "rows" array. Each row has:
- category: "revenue" | "cogs" | "opex" | "headcount" | "funding"
- subcategory: descriptive name (e.g. "SaaS Stream 1", "Salaries & Benefits")
- month: YYYY-MM-DD (first of month, e.g. "2025-01-01")
- amount: dollar amount (number)
- formula: description of calculation logic (string, optional)
- scenario: "base" | "best" | "worst"

Follow Forecastr Monthly SaaS Template methodology:
- Bottom-up, formula-driven projections
- Revenue = acquisition channels → customers → churn → active subs × price
- COGS ~35% of revenue
- OpEx: Salaries, G&A, Sales & Marketing, Professional Fees, Other
- Include formulas explaining each number's derivation

Generate EVERY month in the requested range. Be precise with numbers.
Output ONLY valid JSON: {"rows": [...]}`;

const CT_SYSTEM_PROMPT = `You are a cap table modeling engine. Generate precise cap table entries as JSON.

You output structured JSON with an "entries" array. Each entry has:
- stakeholder_name: name of the person/entity
- stakeholder_type: "founder" | "investor" | "option_pool" | "advisor"
- shares: number of shares
- ownership_pct: ownership percentage (0-100)
- investment_amount: dollars invested (optional)
- share_price: price per share (optional)
- round_name: e.g. "Pre-Seed", "Seed" (optional)
- date: YYYY-MM-DD (optional)

Ensure ownership percentages sum to 100%.
Output ONLY valid JSON: {"entries": [...]}`;

/**
 * Use Kimi K2 to generate financial model rows from a high-level plan.
 * Falls back to returning empty array if K2 unavailable.
 */
export async function generateFinancialModelRows(
  plan: string,
  context: string = ""
): Promise<FinancialModelRow[]> {
  if (!config.useKimi) {
    console.warn("Kimi K2 not configured, skipping plan generation");
    return [];
  }

  const userPrompt = context
    ? `## Existing Data Context\n${context}\n\n## Plan\n${plan}`
    : plan;

  try {
    const result = await extractStructured<{ rows: unknown[] }>(
      [
        { role: "system", content: FM_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { maxTokens: 16384, temperature: 0.2 }
    );

    const parsed = FinancialModelResponseSchema.safeParse(result);
    if (!parsed.success) {
      console.error("K2 financial model validation error:", parsed.error.message);
      // Try to salvage valid rows
      const rows: FinancialModelRow[] = [];
      for (const raw of result.rows || []) {
        const rowParse = FinancialModelRowSchema.safeParse(raw);
        if (rowParse.success) rows.push(rowParse.data);
      }
      console.log(`Salvaged ${rows.length} valid rows from K2 response`);
      return rows;
    }

    return parsed.data.rows;
  } catch (e: any) {
    console.error("K2 financial model generation error:", e);
    const msg = e?.message ?? String(e);
    if (msg.includes("401") || msg.includes("403")) {
      throw new Error("Kimi K2 API authentication failed. Check MOONSHOT_API_KEY configuration.");
    }
    if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
      throw new Error("Kimi K2 rate limit exceeded. Please wait and try again.");
    }
    return [];
  }
}

/**
 * Use Kimi K2 to generate cap table entries from a high-level plan.
 */
export async function generateCapTableEntries(
  plan: string,
  context: string = ""
): Promise<CapTableEntry[]> {
  if (!config.useKimi) {
    console.warn("Kimi K2 not configured, skipping cap table generation");
    return [];
  }

  const userPrompt = context
    ? `## Existing Data Context\n${context}\n\n## Plan\n${plan}`
    : plan;

  try {
    const result = await extractStructured<{ entries: unknown[] }>(
      [
        { role: "system", content: CT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { maxTokens: 4096, temperature: 0.2 }
    );

    const parsed = CapTableResponseSchema.safeParse(result);
    if (!parsed.success) {
      console.error("K2 cap table validation error:", parsed.error.message);
      const entries: CapTableEntry[] = [];
      for (const raw of result.entries || []) {
        const entryParse = CapTableEntrySchema.safeParse(raw);
        if (entryParse.success) entries.push(entryParse.data);
      }
      return entries;
    }

    return parsed.data.entries;
  } catch (e: any) {
    console.error("K2 cap table generation error:", e);
    const msg = e?.message ?? String(e);
    if (msg.includes("401") || msg.includes("403")) {
      throw new Error("Kimi K2 API authentication failed. Check MOONSHOT_API_KEY configuration.");
    }
    if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
      throw new Error("Kimi K2 rate limit exceeded. Please wait and try again.");
    }
    return [];
  }
}

/**
 * Use Kimi K2 to generate a PostgreSQL SELECT query from a natural language question.
 * Used by the run_analytics_query analytics tool.
 */
export async function generateSQL(
  question: string,
  schema: string
): Promise<string> {
  if (!config.useKimi) {
    throw new Error("Kimi K2 not configured");
  }

  const result = await chatCompletion("kimi", [
    {
      role: "system",
      content: `You are a SQL generation engine. Given a database schema and a natural language question, generate a PostgreSQL SELECT query.

Rules:
- Output ONLY the SQL query, no markdown fences or explanation
- Only SELECT statements allowed
- Always include WHERE organization_id = $ORG_ID placeholder
- Use appropriate aggregations, GROUP BY, ORDER BY
- Limit results to 1000 rows max

Schema:
${schema}`,
    },
    { role: "user", content: question },
  ], { temperature: 0.1, maxTokens: 2048 });

  return result.trim();
}
