import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getClerkSession } from "@/lib/clerk-session";

interface ModelSheet {
  spreadsheetId: string;
  url: string;
  templateId: string;
  templateName: string;
  createdAt: string;
}

type CreateSheetResult =
  | { ok: true; sheet: ModelSheet }
  | { ok: false; error: string };

interface UseModelSheetReturn {
  sheet: ModelSheet | null;
  loading: boolean;
  error: string | null;
  googleSheetsEnabled: boolean | null;
  createSheet: (templateSheetId: string, templateName: string) => Promise<CreateSheetResult>;
  uploadXlsx: (file: File) => Promise<CreateSheetResult>;
  deleteSheet: () => Promise<void>;
}

const agentUrl = import.meta.env.VITE_AGENT_URL;

async function getAuthHeaders(): Promise<{ "Content-Type": string; Authorization: string }> {
  const session = getClerkSession();
  if (!session) throw new Error("Not authenticated — please sign in again");
  const token = await session.getToken();
  if (!token) throw new Error("Session expired — please sign in again");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function useModelSheet(orgId: string | null): UseModelSheetReturn {
  const [sheet, setSheet] = useState<ModelSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [googleSheetsEnabled, setGoogleSheetsEnabled] = useState<boolean | null>(null);

  // Check status + fetch existing sheet on mount
  useEffect(() => {
    if (!orgId || !agentUrl) {
      setLoading(false);
      return;
    }

    const init = async () => {
      try {
        // Check if Google Sheets is enabled on the server
        const statusRes = await fetch(`${agentUrl}/api/model/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setGoogleSheetsEnabled(statusData.googleSheetsEnabled);
        }

        // Fetch existing sheet for this org
        const headers = await getAuthHeaders();
        const sheetRes = await fetch(`${agentUrl}/api/model/get-sheet`, {
          method: "POST",
          headers,
          body: JSON.stringify({ organizationId: orgId }),
        });

        if (sheetRes.ok) {
          const data = await sheetRes.json();
          setSheet(data.sheet ?? null);
        }
      } catch (err: any) {
        console.error("Model sheet init error:", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [orgId]);

  const createSheet = useCallback(
    async (templateSheetId: string, templateName: string): Promise<CreateSheetResult> => {
      if (!orgId) return { ok: false, error: "No organization selected" };
      if (!agentUrl) return { ok: false, error: "Agent server URL not configured" };
      setError(null);

      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${agentUrl}/api/model/create-sheet`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            organizationId: orgId,
            templateSheetId,
            templateName,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          const msg = err.error ?? "Failed to create sheet";
          setError(msg);
          return { ok: false, error: msg };
        }

        const data = await res.json();
        const newSheet: ModelSheet = {
          spreadsheetId: data.spreadsheetId,
          url: data.url,
          templateId: data.templateId,
          templateName,
          createdAt: new Date().toISOString(),
        };
        setSheet(newSheet);
        return { ok: true, sheet: newSheet };
      } catch (err: any) {
        const msg = err.message || "Unknown error";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [orgId]
  );

  const uploadXlsx = useCallback(
    async (file: File): Promise<CreateSheetResult> => {
      if (!orgId) return { ok: false, error: "No organization selected" };
      if (!agentUrl) return { ok: false, error: "Agent server URL not configured" };
      setError(null);

      try {
        // Upload to Supabase Storage
        const storagePath = `${orgId}/model-uploads/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("agent-documents")
          .upload(storagePath, file);

        if (uploadError) {
          const msg = `Upload failed: ${uploadError.message}`;
          setError(msg);
          return { ok: false, error: msg };
        }

        // Call agent to convert to Google Sheet
        const headers = await getAuthHeaders();
        const res = await fetch(`${agentUrl}/api/model/upload-xlsx`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            organizationId: orgId,
            storagePath,
            fileName: file.name,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          const msg = err.error ?? "Failed to convert xlsx";
          setError(msg);
          return { ok: false, error: msg };
        }

        const data = await res.json();
        const newSheet: ModelSheet = {
          spreadsheetId: data.spreadsheetId,
          url: data.url,
          templateId: "custom-upload",
          templateName: file.name,
          createdAt: new Date().toISOString(),
        };
        setSheet(newSheet);
        return { ok: true, sheet: newSheet };
      } catch (err: any) {
        const msg = err.message || "Unknown error";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [orgId]
  );

  const deleteSheet = useCallback(async () => {
    if (!orgId || !agentUrl) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${agentUrl}/api/model/delete-sheet`, {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? "Failed to delete sheet");
      }
      setSheet(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [orgId]);

  return { sheet, loading, error, googleSheetsEnabled, createSheet, uploadXlsx, deleteSheet };
}
