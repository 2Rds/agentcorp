import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  readSheetRange,
  writeSheetRange,
  batchWriteSheetRanges,
  getSheetNames,
  isGoogleSheetsEnabled,
} from "../lib/google-sheets-client.js";
import { addOrgMemory } from "../lib/mem0-client.js";

export function googleSheetsTools(orgId: string) {
  const populate_model_sheet = tool(
    "populate_model_sheet",
    `Write data to the organization's Google Sheet financial model. Use this to populate assumptions (customer counts, pricing, churn rates, salaries, expenses, etc.) into the Assumptions sheet. The Google Sheet preserves all formulas — you only write to INPUT cells and all computed cells (revenue, COGS, margins, P&L, balance sheet, cash flows) auto-recalculate.

IMPORTANT: Only write to INPUT cells. Never overwrite formula cells. The Assumptions sheet has these input sections:
- Customer Acquisition: leads, conversion rates, budgets per channel
- Revenue: tier allocation %, churn rates, pricing
- People: names, salaries, benefits %, start dates
- COGS: % of revenue per line item
- G&A: fixed monthly amounts
- S&M: commission % and marketing budget
- Professional Fees: fixed monthly amounts
- Other: misc % of revenue
- Balance Sheet: starting cash, days receivable/payable, equity rounds`,
    {
      ranges: z.array(z.object({
        range: z.string().describe("A1 notation range, e.g. 'Assumptions!F10:BM10' for a row of monthly values, or 'Assumptions!D10' for a single cell"),
        values: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).describe("2D array of values to write. Use null to skip a cell (preserve existing formula)."),
      })).describe("Array of range+values pairs to write in one batch"),
    },
    async (args) => {
      if (!isGoogleSheetsEnabled()) {
        return { content: [{ type: "text" as const, text: "Google Sheets integration is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE in agent/.env" }], isError: true };
      }

      // Get the org's sheet ID
      const { data: sheetRecord } = await supabaseAdmin
        .from("model_sheets")
        .select("spreadsheet_id")
        .eq("organization_id", orgId)
        .limit(1)
        .single();

      if (!sheetRecord) {
        return { content: [{ type: "text" as const, text: "No Google Sheet found for this organization. The user must first select a template on the /model page." }], isError: true };
      }

      try {
        const updatedCells = await batchWriteSheetRanges(
          sheetRecord.spreadsheet_id,
          args.ranges
        );

        // Store memory of what was populated
        addOrgMemory(
          `Financial model Google Sheet populated: ${updatedCells} cells updated across ${args.ranges.length} ranges`,
          orgId,
          {
            agentId: "opus-brain",
            category: "financial_model",
            metadata: { tool: "populate_model_sheet", cell_count: updatedCells },
            timestamp: Math.floor(Date.now() / 1000),
          },
        ).catch(e => console.error("Mem0 memory store failed:", e));

        return { content: [{ type: "text" as const, text: `Successfully wrote ${updatedCells} cells to the Google Sheet. All dependent formulas have auto-recalculated.` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Google Sheets API error: ${err.message}` }], isError: true };
      }
    }
  );

  const read_model_sheet = tool(
    "read_model_sheet",
    "Read data from the organization's Google Sheet financial model. Use this to check current values, verify formula outputs, or understand the model structure before writing.",
    {
      range: z.string().describe("A1 notation range to read, e.g. 'Assumptions!A1:BM4' for headers, 'Financials!A6:BM31' for income statement"),
      sheet_name: z.string().optional().describe("If provided, reads this sheet. Otherwise, range must include the sheet name."),
    },
    async (args) => {
      if (!isGoogleSheetsEnabled()) {
        return { content: [{ type: "text" as const, text: "Google Sheets integration is not configured." }], isError: true };
      }

      const { data: sheetRecord } = await supabaseAdmin
        .from("model_sheets")
        .select("spreadsheet_id")
        .eq("organization_id", orgId)
        .limit(1)
        .single();

      if (!sheetRecord) {
        return { content: [{ type: "text" as const, text: "No Google Sheet found for this organization." }], isError: true };
      }

      try {
        const range = args.sheet_name ? `${args.sheet_name}!${args.range}` : args.range;
        const values = await readSheetRange(sheetRecord.spreadsheet_id, range);

        if (!values || values.length === 0) {
          return { content: [{ type: "text" as const, text: "No data found in the specified range." }] };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(values, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Google Sheets API error: ${err.message}` }], isError: true };
      }
    }
  );

  const get_model_sheet_info = tool(
    "get_model_sheet_info",
    "Get information about the organization's Google Sheet financial model — sheet names, URL, and template type.",
    {},
    async () => {
      if (!isGoogleSheetsEnabled()) {
        return { content: [{ type: "text" as const, text: "Google Sheets integration is not configured." }], isError: true };
      }

      const { data: sheetRecord } = await supabaseAdmin
        .from("model_sheets")
        .select("*")
        .eq("organization_id", orgId)
        .limit(1)
        .single();

      if (!sheetRecord) {
        return { content: [{ type: "text" as const, text: "No Google Sheet found for this organization. The user must first select a template on the /model page." }], isError: true };
      }

      try {
        const sheetNames = await getSheetNames(sheetRecord.spreadsheet_id);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              spreadsheetId: sheetRecord.spreadsheet_id,
              url: sheetRecord.sheet_url,
              templateName: sheetRecord.template_name,
              sheets: sheetNames,
            }, null, 2),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  return [populate_model_sheet, read_model_sheet, get_model_sheet_info];
}
