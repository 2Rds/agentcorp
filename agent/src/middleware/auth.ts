import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { supabaseAdmin } from "../lib/supabase.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
  organizationId: string;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Clerk's clerkMiddleware() (in index.ts) has already verified the JWT.
    // getAuth() extracts the userId from the verified token.
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    // Extract organizationId from body or query
    const organizationId = req.body?.organizationId || req.query?.organizationId;
    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId in request body" });
      return;
    }

    // Verify user is a member of this organization via service role (bypasses RLS)
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
