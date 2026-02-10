import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import * as XLSX from "xlsx";

interface FinancialRow {
  id: string;
  category: string;
  subcategory: string;
  month: string;
  amount: number;
  formula: string | null;
  scenario: string;
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function buildSheet(rows: FinancialRow[], categories: string[], title: string): XLSX.WorkSheet {
  // Get sorted unique months and subcategories for the given categories
  const filtered = rows.filter(r => categories.includes(r.category));
  const months = [...new Set(filtered.map(r => r.month))].sort();
  const subcategories = [...new Set(filtered.map(r => r.subcategory))];

  if (months.length === 0 || subcategories.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([[title], ["No data"]]);
    return ws;
  }

  // Build AOA (array of arrays)
  const header = [title, ...months.map(formatMonth)];
  const data: (string | number)[][] = [header];

  for (const sub of subcategories) {
    const row: (string | number)[] = [sub];
    for (const month of months) {
      const match = filtered.find(r => r.subcategory === sub && r.month === month);
      row.push(match ? match.amount : 0);
    }
    data.push(row);
  }

  // Add total row
  const totalRow: (string | number)[] = ["Total"];
  for (let i = 0; i < months.length; i++) {
    const monthTotal = subcategories.reduce((sum, sub) => {
      const match = filtered.find(r => r.subcategory === sub && r.month === months[i]);
      return sum + (match ? match.amount : 0);
    }, 0);
    totalRow.push(monthTotal);
  }
  data.push(totalRow);

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws["!cols"] = [{ wch: 25 }, ...months.map(() => ({ wch: 14 }))];

  return ws;
}

export function excelExportTools(orgId: string) {
  const export_financial_model_xlsx = tool(
    "export_financial_model_xlsx",
    "Generate a downloadable Excel workbook (.xlsx) from the financial model data. Creates multi-tab spreadsheet with Revenue, Costs, P&L Summary, and Headcount tabs. Returns a signed download URL valid for 1 hour. Proactively offer this after building or updating a financial model.",
    {
      scenario: z.enum(["base", "best", "worst"]).default("base").describe("Which scenario to export"),
    },
    async (args) => {
      // Fetch all financial model data for this scenario
      const { data: rows, error } = await supabaseAdmin
        .from("financial_model")
        .select("id, category, subcategory, month, amount, formula, scenario")
        .eq("organization_id", orgId)
        .eq("scenario", args.scenario)
        .order("month", { ascending: true });

      if (error) {
        return { content: [{ type: "text" as const, text: `Error fetching data: ${error.message}` }], isError: true };
      }

      if (!rows || rows.length === 0) {
        return { content: [{ type: "text" as const, text: `No financial model data found for scenario "${args.scenario}". Build a model first, then export.` }], isError: true };
      }

      const typedRows = rows as FinancialRow[];
      const months = [...new Set(typedRows.map(r => r.month))].sort();

      // Create workbook
      const wb = XLSX.utils.book_new();

      // --- Revenue tab ---
      const revenueSheet = buildSheet(typedRows, ["revenue"], "Revenue");
      XLSX.utils.book_append_sheet(wb, revenueSheet, "Revenue");

      // --- Costs tab (COGS + OpEx) ---
      const costsSheet = buildSheet(typedRows, ["cogs", "opex"], "Costs (COGS + OpEx)");
      XLSX.utils.book_append_sheet(wb, costsSheet, "Costs");

      // --- Headcount tab ---
      const headcountRows = typedRows.filter(r => r.category === "headcount");
      if (headcountRows.length > 0) {
        const headcountSheet = buildSheet(typedRows, ["headcount"], "Headcount");
        XLSX.utils.book_append_sheet(wb, headcountSheet, "Headcount");
      }

      // --- Funding tab ---
      const fundingRows = typedRows.filter(r => r.category === "funding");
      if (fundingRows.length > 0) {
        const fundingSheet = buildSheet(typedRows, ["funding"], "Funding");
        XLSX.utils.book_append_sheet(wb, fundingSheet, "Funding");
      }

      // --- P&L Summary tab ---
      const plData: (string | number)[][] = [["P&L Summary", ...months.map(formatMonth)]];

      const sumByMonth = (cats: string[]) => months.map(m =>
        typedRows.filter(r => cats.includes(r.category) && r.month === m).reduce((s, r) => s + r.amount, 0)
      );

      const revenueByMonth = sumByMonth(["revenue"]);
      const cogsByMonth = sumByMonth(["cogs"]);
      const opexByMonth = sumByMonth(["opex", "headcount"]);

      plData.push(["Revenue", ...revenueByMonth]);
      plData.push(["COGS", ...cogsByMonth]);
      plData.push(["Gross Profit", ...revenueByMonth.map((r, i) => r - cogsByMonth[i])]);
      plData.push(["Gross Margin %", ...revenueByMonth.map((r, i) => r > 0 ? Math.round(((r - cogsByMonth[i]) / r) * 100) : 0)]);
      plData.push(["Operating Expenses", ...opexByMonth]);
      plData.push(["EBITDA", ...revenueByMonth.map((r, i) => r - cogsByMonth[i] - opexByMonth[i])]);

      const plSheet = XLSX.utils.aoa_to_sheet(plData);
      plSheet["!cols"] = [{ wch: 25 }, ...months.map(() => ({ wch: 14 }))];
      XLSX.utils.book_append_sheet(wb, plSheet, "P&L Summary");

      // --- Assumptions tab (formulas) ---
      const formulaRows = typedRows.filter(r => r.formula);
      if (formulaRows.length > 0) {
        const uniqueFormulas = new Map<string, string>();
        formulaRows.forEach(r => {
          const key = `${r.category} > ${r.subcategory}`;
          if (!uniqueFormulas.has(key)) {
            uniqueFormulas.set(key, r.formula!);
          }
        });
        const formulaData: (string | number)[][] = [["Assumptions", "Formula / Logic"]];
        uniqueFormulas.forEach((formula, key) => {
          formulaData.push([key, formula]);
        });
        const formulaSheet = XLSX.utils.aoa_to_sheet(formulaData);
        formulaSheet["!cols"] = [{ wch: 30 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, formulaSheet, "Assumptions");
      }

      // Write to buffer
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      // Upload to Supabase Storage
      const fileName = `financial-model-${args.scenario}-${Date.now()}.xlsx`;
      const storagePath = `${orgId}/exports/${fileName}`;

      const { error: uploadError } = await supabaseAdmin
        .storage
        .from("agent-documents")
        .upload(storagePath, buffer, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });

      if (uploadError) {
        return { content: [{ type: "text" as const, text: `Error uploading file: ${uploadError.message}` }], isError: true };
      }

      // Generate signed URL (1 hour)
      const { data: urlData, error: urlError } = await supabaseAdmin
        .storage
        .from("agent-documents")
        .createSignedUrl(storagePath, 3600);

      if (urlError || !urlData?.signedUrl) {
        return { content: [{ type: "text" as const, text: `File uploaded but could not generate download URL: ${urlError?.message ?? "unknown error"}` }], isError: true };
      }

      const tabList = wb.SheetNames.join(", ");
      return {
        content: [{
          type: "text" as const,
          text: `Excel export ready!\n\n**File:** ${fileName}\n**Tabs:** ${tabList}\n**Months:** ${months.length} (${formatMonth(months[0])} - ${formatMonth(months[months.length - 1])})\n**Rows:** ${typedRows.length} line items\n\n**Download:** ${urlData.signedUrl}\n\n(Link valid for 1 hour)`,
        }],
      };
    }
  );

  return [export_financial_model_xlsx];
}
