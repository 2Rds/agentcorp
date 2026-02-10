import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
  organizationId: string;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing authorization header" });
      return;
    }

    const token = authHeader.slice(7);

    // Use Supabase's own auth to verify the token — no JWT secret needed
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth verification failed:", authError?.message);
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const userId = user.id;

    // Extract organizationId from body
    const organizationId = req.body?.organizationId;
    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId in request body" });
      return;
    }

    // Verify user is a member of this organization
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
    res.status(500).json({ error: "Authentication failed" });
  }
}
