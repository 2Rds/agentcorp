import { Router, Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  copyTemplateSheet,
  isGoogleSheetsEnabled,
  getSheetNames,
} from "../lib/google-sheets-client.js";
import { convertXlsxToGoogleSheet } from "../lib/xlsx-to-sheets.js";

const router = Router();

/**
 * GET /api/model/status
 * Check if Google Sheets integration is configured. No auth required.
 */
router.get("/api/model/status", (_req: Request, res: Response) => {
  res.json({ googleSheetsEnabled: isGoogleSheetsEnabled() });
});

/**
 * POST /api/model/create-sheet
 * Create a Google Sheet copy from a template for an org.
 * Body: { organizationId, templateSheetId, templateName }
 */
router.post("/api/model/create-sheet", authMiddleware, async (req: Request, res: Response) => {
  const { organizationId } = req as AuthenticatedRequest;
  const { templateSheetId, templateName } = req.body;

  if (!isGoogleSheetsEnabled()) {
    res.status(503).json({ error: "Google Sheets integration is not configured" });
    return;
  }

  if (!templateSheetId) {
    res.status(400).json({ error: "templateSheetId is required" });
    return;
  }

  try {
    // Check if a sheet already exists for this org
    const { data: existing } = await supabaseAdmin
      .from("model_sheets")
      .select("*")
      .eq("organization_id", organizationId)
      .limit(1)
      .single();

    if (existing) {
      res.json({
        spreadsheetId: existing.spreadsheet_id,
        url: existing.sheet_url,
        templateId: existing.template_id,
        templateName: existing.template_name,
        alreadyExists: true,
      });
      return;
    }

    // Create a copy of the template
    const result = await copyTemplateSheet(
      templateSheetId,
      `${templateName ?? "Financial Model"} — CFO Agent`
    );

    if (!result) {
      res.status(500).json({ error: "Failed to create Google Sheet copy" });
      return;
    }

    // Store the mapping
    const { error: insertError } = await supabaseAdmin
      .from("model_sheets")
      .insert({
        organization_id: organizationId,
        spreadsheet_id: result.spreadsheetId,
        sheet_url: result.url,
        template_id: templateSheetId,
        template_name: templateName,
      });

    if (insertError) {
      console.error("Failed to store sheet mapping:", insertError);
      res.status(500).json({ error: "Sheet was created but failed to save mapping. Please try again." });
      return;
    }

    res.json({
      spreadsheetId: result.spreadsheetId,
      url: result.url,
      templateId: templateSheetId,
      alreadyExists: false,
    });
  } catch (err: any) {
    console.error("Create sheet error:", err);
    res.status(500).json({ error: err.message ?? "Failed to create sheet" });
  }
});

/**
 * POST /api/model/get-sheet
 * Get the current org's model sheet info.
 * Body: { organizationId }
 */
router.post("/api/model/get-sheet", authMiddleware, async (req: Request, res: Response) => {
  const { organizationId } = req as AuthenticatedRequest;

  try {
    const { data, error } = await supabaseAdmin
      .from("model_sheets")
      .select("*")
      .eq("organization_id", organizationId)
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Get sheet DB error:", error);
      res.status(500).json({ error: "Failed to fetch sheet data" });
      return;
    }
    if (!data) {
      res.json({ sheet: null });
      return;
    }

    res.json({
      sheet: {
        spreadsheetId: data.spreadsheet_id,
        url: data.sheet_url,
        templateId: data.template_id,
        templateName: data.template_name,
        createdAt: data.created_at,
      },
    });
  } catch (err: any) {
    console.error("Get sheet error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/model/delete-sheet
 * Delete the org's model sheet mapping (doesn't delete the Google Sheet itself).
 * Body: { organizationId }
 */
router.post("/api/model/delete-sheet", authMiddleware, async (req: Request, res: Response) => {
  const { organizationId } = req as AuthenticatedRequest;

  try {
    const { error } = await supabaseAdmin
      .from("model_sheets")
      .delete()
      .eq("organization_id", organizationId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("Delete sheet error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/model/upload-xlsx
 * Upload a custom .xlsx file and convert it to a Google Sheet.
 * Body: { organizationId, storagePath, fileName }
 */
router.post("/api/model/upload-xlsx", authMiddleware, async (req: Request, res: Response) => {
  const { organizationId } = req as AuthenticatedRequest;
  const { storagePath, fileName } = req.body;

  if (!isGoogleSheetsEnabled()) {
    res.status(503).json({ error: "Google Sheets integration is not configured" });
    return;
  }

  if (!storagePath || !fileName) {
    res.status(400).json({ error: "storagePath and fileName are required" });
    return;
  }

  try {
    // Check if a sheet already exists for this org
    const { data: existing } = await supabaseAdmin
      .from("model_sheets")
      .select("*")
      .eq("organization_id", organizationId)
      .limit(1)
      .single();

    if (existing) {
      res.status(409).json({ error: "A model sheet already exists. Delete it first to upload a new one." });
      return;
    }

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from("agent-documents")
      .download(storagePath);

    if (downloadError || !fileData) {
      res.status(400).json({ error: `Failed to download file: ${downloadError?.message ?? "not found"}` });
      return;
    }

    // Check file size (5MB limit)
    const buffer = Buffer.from(await fileData.arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) {
      res.status(413).json({ error: "File exceeds 5MB limit" });
      return;
    }

    const title = `${fileName.replace(/\.(xlsx|xls)$/i, "")} — CFO Agent`;
    const result = await convertXlsxToGoogleSheet(buffer, title);

    // Store the mapping
    const { error: insertError } = await supabaseAdmin
      .from("model_sheets")
      .insert({
        organization_id: organizationId,
        spreadsheet_id: result.spreadsheetId,
        sheet_url: result.url,
        template_id: "custom-upload",
        template_name: fileName,
      });

    if (insertError) {
      console.error("Failed to store sheet mapping:", insertError);
      res.status(500).json({ error: "Sheet was created but failed to save mapping." });
      return;
    }

    res.json({
      spreadsheetId: result.spreadsheetId,
      url: result.url,
      templateId: "custom-upload",
      sheetsWritten: result.sheetsWritten,
      cellsWritten: result.cellsWritten,
      alreadyExists: false,
    });
  } catch (err: any) {
    console.error("Upload xlsx error:", err);
    res.status(500).json({ error: err.message ?? "Failed to convert xlsx" });
  }
});

export default router;
