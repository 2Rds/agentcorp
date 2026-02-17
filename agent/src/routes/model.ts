import { Router, Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  copyTemplateSheet,
  isGoogleSheetsEnabled,
  getSheetNames,
} from "../lib/google-sheets-client.js";

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

    if (error || !data) {
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

export default router;
