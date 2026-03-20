import { z } from "zod";
import { chatCompletion, extractStructured } from "./model-router.js";
import { config } from "../config.js";

// Zod schemas for validating Gemini output
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
 * Build a user prompt with optional existing data context prepended.
 */
function buildUserPrompt(plan: string, context: string): string {
  if (!context) return plan;
  return `## Existing Data Context\n${context}\n\n## Plan\n${plan}`;
}

/**
 * Salvage individually valid items from a partially invalid Gemini response.
 */
function salvageValidItems<T extends z.ZodTypeAny>(items: unknown[], schema: T): z.output<T>[] {
  const valid: z.output<T>[] = [];
  for (const raw of items) {
    const result = schema.safeParse(raw);
    if (result.success) valid.push(result.data);
  }
  return valid;
}

/**
 * Classify an API error and rethrow auth/rate-limit errors with clear messages.
 * Returns without throwing for transient or unknown errors (caller returns empty fallback).
 */
function rethrowKnownErrors(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("401") || msg.includes("403")) {
    throw new Error("Gemini 3 Flash API authentication failed. Check GOOGLE_AI_API_KEY or CF_AIG_TOKEN configuration.");
  }
  if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
    throw new Error("Gemini 3 Flash rate limit exceeded. Please wait and try again.");
  }
}

/**
 * Use Gemini 3 Flash to generate financial model rows from a high-level plan.
 * Falls back to returning empty array if Gemini unavailable.
 */
export async function generateFinancialModelRows(
  plan: string,
  context: string = ""
): Promise<FinancialModelRow[]> {
  try {
    const result = await extractStructured<{ rows: unknown[] }>(
      [
        { role: "system", content: FM_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(plan, context) },
      ],
      { maxTokens: 16384, temperature: 0.2 }
    );

    const parsed = FinancialModelResponseSchema.safeParse(result);
    if (parsed.success) return parsed.data.rows;

    console.error("Gemini financial model validation error:", parsed.error.message);
    const salvaged = salvageValidItems(result.rows || [], FinancialModelRowSchema);
    console.log(`Salvaged ${salvaged.length} valid rows from Gemini response`);
    return salvaged;
  } catch (e: unknown) {
    console.error("Gemini financial model generation error:", e);
    rethrowKnownErrors(e);
    return [];
  }
}

/**
 * Use Gemini 3 Flash to generate cap table entries from a high-level plan.
 */
export async function generateCapTableEntries(
  plan: string,
  context: string = ""
): Promise<CapTableEntry[]> {
  try {
    const result = await extractStructured<{ entries: unknown[] }>(
      [
        { role: "system", content: CT_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(plan, context) },
      ],
      { maxTokens: 4096, temperature: 0.2 }
    );

    const parsed = CapTableResponseSchema.safeParse(result);
    if (parsed.success) return parsed.data.entries;

    console.error("Gemini cap table validation error:", parsed.error.message);
    return salvageValidItems(result.entries || [], CapTableEntrySchema);
  } catch (e: unknown) {
    console.error("Gemini cap table generation error:", e);
    rethrowKnownErrors(e);
    return [];
  }
}

/**
 * Use Gemini 3 Flash to generate a PostgreSQL SELECT query from a natural language question.
 * Used by the run_analytics_query analytics tool.
 */
export async function generateSQL(
  question: string,
  schema: string
): Promise<string> {
  const result = await chatCompletion("gemini", [
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
