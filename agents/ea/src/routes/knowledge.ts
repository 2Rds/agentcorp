import { Router, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { getAllOrgMemories, type Memory } from "../lib/memory-client.js";

const router = Router();

/**
 * GET /api/knowledge/graph?organizationId=...
 * Returns memories from the knowledge base for the org.
 */
router.get("/api/knowledge/graph", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const organizationId = req.query.organizationId as string;
    if (!organizationId) {
      res.status(400).json({ error: "Missing organizationId query parameter" });
      return;
    }

    const { data: role, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .limit(1)
      .single();

    if (roleError || !role) {
      res.status(403).json({ error: "Not a member of this organization" });
      return;
    }

    const memories = await getAllOrgMemories(organizationId, { pageSize: 200 });

    const entities = memories.map((mem) => ({
      id: `memory-${mem.id}`,
      label: (mem.metadata?.title as string) || mem.memory.slice(0, 50),
      type: "memory" as const,
      content: mem.memory,
      categories: mem.categories,
      metadata: mem.metadata,
    }));

    res.json({
      entities,
      relationships: [],
      stats: {
        memories: memories.length,
        knowledgeEntries: entities.length,
        documents: 0,
        connections: 0,
      },
    });
  } catch (err: any) {
    console.error("Knowledge graph error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch knowledge graph" });
  }
});

export default router;
