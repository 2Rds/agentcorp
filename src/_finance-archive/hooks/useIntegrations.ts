import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type IntegrationStatusValue = "active" | "disconnected" | "expired" | "not_connected";

export interface IntegrationStatus {
  connected: boolean;
  status: IntegrationStatusValue;
  connectedAt?: string;
  lastSyncedAt?: string;
  syncError?: string;
}

export interface SyncResultData {
  rowsImported: number;
  categories: Record<string, number>;
  period: { start: string; end: string };
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

interface UseIntegrationsReturn {
  integrations: Record<string, IntegrationStatus>;
  loading: boolean;
  connectOAuth: (provider: string) => Promise<ActionResult>;
  connectApiKey: (provider: string, apiKey: string) => Promise<ActionResult>;
  disconnect: (provider: string) => Promise<ActionResult>;
  sync: (provider: string) => Promise<ActionResult & { result?: SyncResultData }>;
  refresh: () => Promise<void>;
}

const agentUrl = import.meta.env.VITE_AGENT_URL;

async function getAuthHeaders(): Promise<{ "Content-Type": string; Authorization: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

export function useIntegrations(orgId: string | null): UseIntegrationsReturn {
  const [integrations, setIntegrations] = useState<Record<string, IntegrationStatus>>({});
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!orgId || !agentUrl) {
      setLoading(false);
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${agentUrl}/api/integrations/status?organizationId=${orgId}`, {
        headers,
      });
      if (!res.ok) {
        console.error("Integration status fetch failed:", res.status);
        return;
      }
      const data = await res.json();
      setIntegrations(data.integrations || {});
    } catch (err) {
      console.error("Failed to fetch integration status:", err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const connectOAuth = useCallback(async (provider: string): Promise<ActionResult> => {
    if (!orgId || !agentUrl) return { ok: false, error: "Not configured" };
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${agentUrl}/api/integrations/connect/${provider}?organizationId=${orgId}`,
        { headers }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || `HTTP ${res.status}` };
      }
      const { url } = await res.json();
      window.location.href = url;
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }, [orgId]);

  const connectApiKey = useCallback(async (provider: string, apiKey: string): Promise<ActionResult> => {
    if (!orgId || !agentUrl) return { ok: false, error: "Not configured" };
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${agentUrl}/api/integrations/connect/${provider}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: orgId, apiKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || `HTTP ${res.status}` };
      }
      await fetchStatus();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }, [orgId, fetchStatus]);

  const disconnect = useCallback(async (provider: string): Promise<ActionResult> => {
    if (!orgId || !agentUrl) return { ok: false, error: "Not configured" };
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${agentUrl}/api/integrations/disconnect/${provider}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || `HTTP ${res.status}` };
      }
      await fetchStatus();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }, [orgId, fetchStatus]);

  const sync = useCallback(async (provider: string): Promise<ActionResult & { result?: SyncResultData }> => {
    if (!orgId || !agentUrl) return { ok: false, error: "Not configured" };
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${agentUrl}/api/integrations/sync/${provider}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || `HTTP ${res.status}` };
      }
      const data = await res.json();
      await fetchStatus();
      return { ok: true, result: data.result };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }, [orgId, fetchStatus]);

  return {
    integrations,
    loading,
    connectOAuth,
    connectApiKey,
    disconnect,
    sync,
    refresh: fetchStatus,
  };
}
