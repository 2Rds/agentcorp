import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
  organizationId: string;
}

// Simple TTL cache for token -> userId to avoid per-request Supabase auth calls
const tokenCache = new Map<string, { userId: string; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function verifyToken(token: string): Promise<string | null> {
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId;
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    tokenCache.delete(token);
    return null;
  }

  tokenCache.set(token, { userId: user.id, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });

  // Prune stale entries periodically
  if (tokenCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of tokenCache) {
      if (v.expiresAt <= now) tokenCache.delete(k);
    }
  }

  return user.id;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }
    const token = authHeader.slice(7);

    const userId = await verifyToken(token);
    if (!userId) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const organizationId = req.body?.organizationId || req.query?.organizationId;
    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId in request body" });
      return;
    }

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
  } catch (err: any) {
    console.error("Auth error:", err);
    if (err?.message?.includes("token") || err?.message?.includes("jwt") || err?.message?.includes("expired")) {
      res.status(401).json({ error: "Invalid or expired token" });
    } else {
      res.status(500).json({ error: "Authentication failed" });
    }
  }
}
