import * as XLSX from "xlsx";
import {
  createBlankSpreadsheet,
  batchWriteSheetRanges,
} from "./google-sheets-client.js";

interface ConversionResult {
  spreadsheetId: string;
  url: string;
  sheetsWritten: number;
  cellsWritten: number;
}

/**
 * Convert an .xlsx buffer into a live Google Sheet.
 *
 * 1. Parse workbook with the xlsx library
 * 2. Create a blank Google Sheet with matching tab names
 * 3. Batch-write all cell data (formulas preserved via USER_ENTERED mode)
 */
export async function convertXlsxToGoogleSheet(
  buffer: Buffer,
  title: string
): Promise<ConversionResult> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: true });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    throw new Error("Workbook has no sheets");
  }

  // Create blank Google Sheet with matching tabs
  const created = await createBlankSpreadsheet(title, sheetNames);
  if (!created) {
    throw new Error("Google Sheets integration is not configured");
  }

  // Build batch write data for all sheets
  const batchData: { range: string; values: (string | number | null)[][] }[] = [];
  let totalCells = 0;

  for (const name of sheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws || !ws["!ref"]) continue;

    const range = XLSX.utils.decode_range(ws["!ref"]);
    const rows: (string | number | null)[][] = [];

    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: (string | number | null)[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) {
          row.push(null);
          continue;
        }

        // Prefer formula (USER_ENTERED mode will interpret it)
        if (cell.f) {
          row.push(`=${cell.f}`);
        } else if (cell.t === "n") {
          row.push(cell.v as number);
        } else if (cell.t === "b") {
          row.push(cell.v ? "TRUE" : "FALSE");
        } else if (cell.w !== undefined) {
          row.push(cell.w);
        } else if (cell.v !== undefined) {
          row.push(String(cell.v));
        } else {
          row.push(null);
        }
        totalCells++;
      }
      rows.push(row);
    }

    if (rows.length > 0) {
      // Escape sheet names with special characters for A1 notation
      const safeName = name.includes(" ") || name.includes("'")
        ? `'${name.replace(/'/g, "''")}'`
        : name;
      const endCol = XLSX.utils.encode_col(range.e.c);
      const endRow = range.e.r + 1;
      batchData.push({
        range: `${safeName}!A1:${endCol}${endRow}`,
        values: rows,
      });
    }
  }

  // Write all data in a single batch
  let cellsWritten = 0;
  if (batchData.length > 0) {
    cellsWritten = await batchWriteSheetRanges(created.spreadsheetId, batchData);
  }

  return {
    spreadsheetId: created.spreadsheetId,
    url: created.url,
    sheetsWritten: batchData.length,
    cellsWritten: cellsWritten || totalCells,
  };
}
