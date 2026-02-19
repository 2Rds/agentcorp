import { Router, Request, Response } from "express";
import { createHmac } from "crypto";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { config } from "../config.js";
import { encrypt, decrypt, getEncryptionKey } from "../lib/token-encryption.js";
import { providers } from "../lib/integrations/index.js";
import type { ProviderName, Credentials } from "../lib/integrations/index.js";

const VALID_PROVIDERS = new Set<string>(Object.keys(providers));

function isProviderName(s: string): s is ProviderName {
  return VALID_PROVIDERS.has(s);
}
const FRONTEND_URL = config.corsOrigins[0] || "http://localhost:8080";
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

// ─── OAuth state signing (CSRF protection) ───────────────────────────────────

function signState(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getEncryptionKey()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyState(state: string): { orgId: string; userId: string; provider: string; ts: number } {
  const dotIndex = state.indexOf(".");
  if (dotIndex === -1) throw new Error("Invalid state format");

  const data = state.slice(0, dotIndex);
  const sig = state.slice(dotIndex + 1);
  const expected = createHmac("sha256", getEncryptionKey()).update(data).digest("base64url");

  if (sig !== expected) throw new Error("Invalid state signature");

  const payload = JSON.parse(Buffer.from(data, "base64url").toString());
  if (Date.now() - payload.ts > STATE_MAX_AGE_MS) {
    throw new Error("OAuth state expired — please try connecting again");
  }

  return payload;
}

// ─── Public router (OAuth callbacks — no auth middleware) ────────────────────

export const integrationsCallbackRouter = Router();

/**
 * GET /api/integrations/callback/:provider
 * OAuth callback handler. Exchanges code for tokens, stores encrypted in DB,
 * redirects to frontend /settings with status.
 */
integrationsCallbackRouter.get("/api/integrations/callback/:provider", async (req: Request, res: Response) => {
  const { provider } = req.params;

  // Validate provider early to prevent unvalidated strings in redirect URLs
  if (!isProviderName(provider)) {
    res.status(400).send("Unknown provider");
    return;
  }

  const { code, state, error: oauthError, realmId } = req.query;

  if (oauthError) {
    res.redirect(`${FRONTEND_URL}/settings?integration=${encodeURIComponent(provider)}&status=error&message=${encodeURIComponent(String(oauthError))}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${FRONTEND_URL}/settings?integration=${encodeURIComponent(provider)}&status=error&message=missing_params`);
    return;
  }

  try {
    // Verify HMAC-signed state (CSRF protection + expiry)
    const { orgId, userId, provider: stateProvider } = verifyState(String(state));

    if (stateProvider !== provider || !orgId || !userId) {
      throw new Error("Invalid state parameter");
    }

    const p = providers[provider];
    if (p.authType !== "oauth2") {
      throw new Error(`Provider ${provider} does not support OAuth`);
    }

    const redirectUri = `${getBaseUrl(req)}/api/integrations/callback/${provider}`;
    const tokenSet = await p.exchangeCode(String(code), redirectUri);

    // Merge realmId into metadata if provided (QuickBooks sends it as query param)
    const metadata = { ...tokenSet.metadata };
    if (realmId) metadata.realmId = String(realmId);

    // Encrypt and store
    const { error: upsertError } = await supabaseAdmin
      .from("integrations")
      .upsert({
        organization_id: orgId,
        provider,
        auth_type: "oauth2",
        access_token_encrypted: encrypt(tokenSet.accessToken),
        refresh_token_encrypted: tokenSet.refreshToken ? encrypt(tokenSet.refreshToken) : null,
        token_expires_at: tokenSet.expiresAt?.toISOString() ?? null,
        provider_metadata: metadata,
        status: "active",
        connected_by: userId,
        connected_at: new Date().toISOString(),
        sync_error: null,
      }, { onConflict: "organization_id,provider" });

    if (upsertError) throw upsertError;

    res.redirect(`${FRONTEND_URL}/settings?integration=${encodeURIComponent(provider)}&status=connected`);
  } catch (err: any) {
    console.error(`OAuth callback error (${provider}):`, err);
    res.redirect(`${FRONTEND_URL}/settings?integration=${encodeURIComponent(provider)}&status=error&message=${encodeURIComponent(err.message)}`);
  }
});

// ─── Authenticated router ────────────────────────────────────────────────────

export const integrationsRouter = Router();

/**
 * GET /api/integrations/status
 * List all provider statuses for the org.
 */
integrationsRouter.get("/api/integrations/status", authMiddleware, async (req: Request, res: Response) => {
  const { organizationId } = req as AuthenticatedRequest;

  try {
    const { data, error } = await supabaseAdmin
      .from("integrations")
      .select("provider, status, connected_at, last_synced_at, sync_error, provider_metadata")
      .eq("organization_id", organizationId);

    if (error) throw error;

    // Build a map of all providers with their status
    const statuses: Record<string, { connected: boolean; status: string; connectedAt?: string; lastSyncedAt?: string; syncError?: string }> = {};
    for (const name of VALID_PROVIDERS) {
      const entry = data?.find((d) => d.provider === name);
      statuses[name] = entry
        ? {
            connected: entry.status === "active",
            status: entry.status,
            connectedAt: entry.connected_at,
            lastSyncedAt: entry.last_synced_at,
            syncError: entry.sync_error,
          }
        : { connected: false, status: "not_connected" };
    }

    res.json({ integrations: statuses });
  } catch (err: any) {
    console.error("Integration status error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/integrations/connect/:provider
 * Generate OAuth URL for a provider. Returns { url }.
 */
integrationsRouter.get("/api/integrations/connect/:provider", authMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId } = req as AuthenticatedRequest;
  const { provider } = req.params;

  if (!isProviderName(provider)) {
    res.status(400).json({ error: `Unknown provider: ${provider}` });
    return;
  }

  const p = providers[provider];
  if (p.authType !== "oauth2") {
    res.status(400).json({ error: `${provider} does not use OAuth` });
    return;
  }

  const state = signState({ orgId: organizationId, userId, provider, ts: Date.now() });
  const redirectUri = `${getBaseUrl(req)}/api/integrations/callback/${provider}`;
  const url = p.getAuthorizationUrl(state, redirectUri);

  res.json({ url });
});

/**
 * POST /api/integrations/connect/:provider
 * API key submission (for providers like Mercury).
 * Body: { organizationId, apiKey }
 */
integrationsRouter.post("/api/integrations/connect/:provider", authMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId } = req as AuthenticatedRequest;
  const { provider } = req.params;
  const { apiKey } = req.body;

  if (!isProviderName(provider)) {
    res.status(400).json({ error: `Unknown provider: ${provider}` });
    return;
  }

  const p = providers[provider];
  if (p.authType !== "api_key") {
    res.status(400).json({ error: `${provider} does not use API keys` });
    return;
  }

  if (!apiKey) {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  try {
    const validation = await p.validateApiKey(apiKey);
    if (!validation.valid) {
      res.status(400).json({ error: "API key is invalid. Please check and try again." });
      return;
    }

    const { error: upsertError } = await supabaseAdmin
      .from("integrations")
      .upsert({
        organization_id: organizationId,
        provider,
        auth_type: "api_key",
        api_key_encrypted: encrypt(apiKey),
        provider_metadata: validation.metadata || {},
        status: "active",
        connected_by: userId,
        connected_at: new Date().toISOString(),
        sync_error: null,
      }, { onConflict: "organization_id,provider" });

    if (upsertError) throw upsertError;

    res.json({ connected: true });
  } catch (err: any) {
    console.error(`API key connect error (${provider}):`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/integrations/disconnect/:provider
 * Soft disconnect — clear tokens, set status to disconnected.
 * Body: { organizationId }
 */
integrationsRouter.post("/api/integrations/disconnect/:provider", authMiddleware, async (req: Request, res: Response) => {
  const { organizationId } = req as AuthenticatedRequest;
  const { provider } = req.params;

  if (!isProviderName(provider)) {
    res.status(400).json({ error: `Unknown provider: ${provider}` });
    return;
  }

  try {
    const { error } = await supabaseAdmin
      .from("integrations")
      .update({
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        api_key_encrypted: null,
        status: "disconnected",
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("provider", provider);

    if (error) throw error;

    res.json({ disconnected: true });
  } catch (err: any) {
    console.error(`Disconnect error (${provider}):`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/integrations/sync/:provider
 * Pull financial data from the provider and upsert into financial_model.
 * Body: { organizationId }
 */
integrationsRouter.post("/api/integrations/sync/:provider", authMiddleware, async (req: Request, res: Response) => {
  const { organizationId } = req as AuthenticatedRequest;
  const { provider } = req.params;

  if (!isProviderName(provider)) {
    res.status(400).json({ error: `Unknown provider: ${provider}` });
    return;
  }

  try {
    // Fetch stored credentials
    const { data: integration, error: fetchError } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("provider", provider)
      .single();

    if (fetchError || !integration) {
      res.status(404).json({ error: `No ${provider} integration found` });
      return;
    }

    if (integration.status !== "active") {
      res.status(400).json({ error: `Integration is ${integration.status}. Please reconnect.` });
      return;
    }

    const p = providers[provider];

    // Decrypt credentials
    let accessToken = integration.access_token_encrypted
      ? decrypt(integration.access_token_encrypted)
      : undefined;
    const apiKey = integration.api_key_encrypted
      ? decrypt(integration.api_key_encrypted)
      : undefined;

    // Refresh OAuth token if expired
    if (
      p.authType === "oauth2" &&
      integration.token_expires_at &&
      new Date(integration.token_expires_at) < new Date() &&
      integration.refresh_token_encrypted
    ) {
      const refreshToken = decrypt(integration.refresh_token_encrypted);
      const newTokens = await p.refreshAccessToken(refreshToken);
      accessToken = newTokens.accessToken;

      // Persist refreshed tokens — failure here is critical since providers
      // rotate refresh tokens on each use (QuickBooks, Xero)
      const { error: updateError } = await supabaseAdmin
        .from("integrations")
        .update({
          access_token_encrypted: encrypt(newTokens.accessToken),
          refresh_token_encrypted: newTokens.refreshToken ? encrypt(newTokens.refreshToken) : integration.refresh_token_encrypted,
          token_expires_at: newTokens.expiresAt?.toISOString() ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      if (updateError) {
        console.error("CRITICAL: Failed to persist refreshed tokens:", updateError);
        throw new Error("Token was refreshed but could not be saved. Please reconnect the integration.");
      }
    }

    const credentials: Credentials = integration.auth_type === "oauth2"
      ? { type: "oauth2", accessToken: accessToken!, metadata: integration.provider_metadata }
      : { type: "api_key", apiKey: apiKey!, metadata: integration.provider_metadata };

    const result = await p.syncFinancials(credentials, organizationId);

    // Update last_synced_at (non-fatal if this fails)
    const { error: tsError } = await supabaseAdmin
      .from("integrations")
      .update({
        last_synced_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    if (tsError) {
      console.error(`Failed to update sync timestamp for ${provider}:`, tsError);
    }

    res.json({ result });
  } catch (err: any) {
    console.error(`Sync error (${provider}):`, err);

    // Store error in DB for visibility (best-effort)
    try {
      await supabaseAdmin
        .from("integrations")
        .update({
          sync_error: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("provider", provider);
    } catch (dbErr) {
      console.error(`Failed to persist sync error for ${provider}:`, dbErr);
    }

    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBaseUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}
