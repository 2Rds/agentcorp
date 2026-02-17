import { google, sheets_v4, drive_v3 } from "googleapis";
import { config } from "../config.js";

let sheetsClient: sheets_v4.Sheets | null = null;
let driveClient: drive_v3.Drive | null = null;

function getAuth() {
  if (!config.googleSheetsEnabled) return null;
  const oauth2 = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret
  );
  oauth2.setCredentials({ refresh_token: config.googleRefreshToken });
  return oauth2;
}

function getSheets(): sheets_v4.Sheets | null {
  if (!config.googleSheetsEnabled) return null;
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: getAuth()! });
  }
  return sheetsClient;
}

function getDrive(): drive_v3.Drive | null {
  if (!config.googleSheetsEnabled) return null;
  if (!driveClient) {
    driveClient = google.drive({ version: "v3", auth: getAuth()! });
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

  const spreadsheetId = res.data.id!;

  // Make the copy accessible to anyone with the link (editor access)
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      role: "writer",
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
 * Check if Google Sheets integration is available.
 */
export function isGoogleSheetsEnabled(): boolean {
  return config.googleSheetsEnabled;
}
