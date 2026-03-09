/**
 * Authentication Middleware
 *
 * Bearer token verification via Supabase Auth. Each agent's Express
 * server uses this middleware on protected routes. The token cache
 * avoids per-request Supabase calls (5-min TTL, bounded at 500 entries).
 *
 * Organizations are verified via the `user_roles` table — users can
 * only interact with agents within their org.
 */

import type { Request, Response, NextFunction } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthenticatedRequest extends Request {
  userId: string;
  organizationId: string;
}

export interface AuthMiddlewareOptions {
  /** Token cache shared across auth middleware instances (default: module-level cache) */
  tokenCache?: Map<string, { userId: string; expiresAt: number }>;
}

// Simple TTL cache: token hash → userId
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

async function verifyToken(
  supabase: SupabaseClient,
  token: string,
  cache: Map<string, { userId: string; expiresAt: number }>,
): Promise<string | null> {
  const cached = cache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.userId;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    cache.delete(token);
    return null;
  }

  // Prune expired entries before adding (prevents unbounded growth)
  if (cache.size >= MAX_CACHE_SIZE) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
    // If still at capacity after pruning, evict oldest entry
    if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
  }

  cache.set(token, { userId: user.id, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
  return user.id;
}

/**
 * Create auth middleware bound to a Supabase admin client.
 * Each AgentRuntime can pass its own token cache to avoid module-level singleton sharing.
 */
export function createAuthMiddleware(supabaseAdmin: SupabaseClient, opts?: AuthMiddlewareOptions) {
  const tokenCache = opts?.tokenCache ?? new Map<string, { userId: string; expiresAt: number }>();

  return async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing or invalid Authorization header" });
        return;
      }

      const userId = await verifyToken(supabaseAdmin, authHeader.slice(7), tokenCache);
      if (!userId) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }

      // organizationId can come from body or query — validate it's a single string
      const rawOrgId = req.body?.organizationId ?? req.query?.organizationId;
      const organizationId = Array.isArray(rawOrgId) ? rawOrgId[0] : rawOrgId;
      if (!organizationId || typeof organizationId !== "string") {
        res.status(400).json({ error: "Missing or invalid organizationId" });
        return;
      }

      // Basic format validation (UUID-like)
      if (organizationId.length > 128 || /[^\w-]/.test(organizationId)) {
        res.status(400).json({ error: "Invalid organizationId format" });
        return;
      }

      // Verify org membership
      const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .limit(1)
        .single();

      if (error || !data) {
        res.status(403).json({ error: "Not a member of this organization" });
        return;
      }

      (req as AuthenticatedRequest).userId = userId;
      (req as AuthenticatedRequest).organizationId = organizationId;
      next();
    } catch (err: unknown) {
      console.error("Auth middleware error:", err);
      res.status(500).json({ error: "Authentication failed" });
    }
  };
}
