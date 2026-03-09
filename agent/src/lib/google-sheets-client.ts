import { google, sheets_v4, drive_v3 } from "googleapis";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";

let sheetsClient: sheets_v4.Sheets | null = null;
let driveClient: drive_v3.Drive | null = null;

function getAuth() {
  if (!config.googleSheetsEnabled || !config.googleServiceAccountKeyFile) return null;
  const keyPath = resolve(config.googleServiceAccountKeyFile);
  const credentials = JSON.parse(readFileSync(keyPath, "utf-8"));
  // Use JWT for domain-wide delegation (impersonate a Workspace user)
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
    subject: config.googleImpersonateEmail || undefined,
  });
}

function getSheets(): sheets_v4.Sheets | null {
  if (!config.googleSheetsEnabled) return null;
  if (!sheetsClient) {
    const auth = getAuth();
    if (!auth) return null;
    sheetsClient = google.sheets({ version: "v4", auth });
  }
  return sheetsClient;
}

function getDrive(): drive_v3.Drive | null {
  if (!config.googleSheetsEnabled) return null;
  if (!driveClient) {
    const auth = getAuth();
    if (!auth) return null;
    driveClient = google.drive({ version: "v3", auth });
  }
  return driveClient;
}

/**
 * Copy a template Google Sheet to create a new sheet for an org.
 * Returns the new spreadsheet ID and URL.
 */
export async function copyTemplateSheet(
  templateSheetId: string,
  title: string
): Promise<{ spreadsheetId: string; url: string } | null> {
  const drive = getDrive();
  if (!drive) return null;

  const res = await drive.files.copy({
    fileId: templateSheetId,
    requestBody: { name: title },
  });

  const spreadsheetId = res.data.id;
  if (!spreadsheetId) {
    throw new Error("Google Drive API returned no file ID after copy");
  }

  // Make the copy accessible to anyone with the link (read-only)
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

/**
 * Read values from a range in a Google Sheet.
 */
export async function readSheetRange(
  spreadsheetId: string,
  range: string
): Promise<string[][] | null> {
  const sheets = getSheets();
  if (!sheets) return null;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });

  return (res.data.values as string[][]) ?? [];
}

/**
 * Write values to a range in a Google Sheet.
 * Preserves existing formulas in cells not being written to.
 */
export async function writeSheetRange(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<number> {
  const sheets = getSheets();
  if (!sheets) return 0;

  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  return res.data.updatedCells ?? 0;
}

/**
 * Batch write multiple ranges at once.
 */
export async function batchWriteSheetRanges(
  spreadsheetId: string,
  data: { range: string; values: (string | number | null)[][] }[]
): Promise<number> {
  const sheets = getSheets();
  if (!sheets) return 0;

  const res = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: data.map((d) => ({ range: d.range, values: d.values })),
    },
  });

  return res.data.totalUpdatedCells ?? 0;
}

/**
 * Get all sheet names in a spreadsheet.
 */
export async function getSheetNames(
  spreadsheetId: string
): Promise<string[]> {
  const sheets = getSheets();
  if (!sheets) return [];

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  return (
    res.data.sheets?.map((s) => s.properties?.title ?? "") ?? []
  );
}

/**
 * Create a blank spreadsheet with named tabs and link-sharing enabled.
 * Used for custom .xlsx uploads converted to Google Sheets.
 */
export async function createBlankSpreadsheet(
  title: string,
  sheetNames: string[]
): Promise<{ spreadsheetId: string; url: string } | null> {
  const sheets = getSheets();
  const drive = getDrive();
  if (!sheets || !drive) return null;

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: sheetNames.map((name, i) => ({
        properties: { title: name, index: i },
      })),
    },
  });

  const spreadsheetId = res.data.spreadsheetId;
  if (!spreadsheetId) {
    throw new Error("Google Sheets API returned no spreadsheet ID after create");
  }

  // Make accessible to anyone with the link (read-only)
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

/**
 * Check if Google Sheets integration is available.
 */
export function isGoogleSheetsEnabled(): boolean {
  return config.googleSheetsEnabled;
}
