import { Router, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { config } from "../config.js";
import { getAllMemories } from "../lib/mem0-client.js";

const router = Router();

/**
 * GET /api/knowledge/graph?organizationId=...
 * Returns knowledge entries + Mem0 memories + graph data for the org.
 * Requires Bearer token auth (org membership verified via user_roles).
 */
router.get("/api/knowledge/graph", async (req: Request, res: Response) => {
  try {
    // Auth check
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

    // Verify membership
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

    // Fetch both Mem0 memories and Supabase knowledge_base in parallel
    const [mem0Memories, kbResult, docsResult] = await Promise.all([
      config.useMem0 ? getAllMemories(organizationId) : Promise.resolve([]),
      supabaseAdmin
        .from("knowledge_base")
        .select("id, title, source, content, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("documents")
        .select("id, name, mime_type, size_bytes, storage_path, created_at, tags")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

    // Build graph data: entities + relationships from Mem0 memories
    const entities: Array<{
      id: string;
      label: string;
      type: "memory" | "knowledge" | "document";
      content: string;
      metadata?: Record<string, unknown>;
    }> = [];

    const relationships: Array<{
      source: string;
      target: string;
      type: string;
    }> = [];

    // Mem0 memories as entities
    for (const mem of mem0Memories) {
      entities.push({
        id: `mem0-${mem.id}`,
        label: (mem.metadata?.title as string) || (mem.memory ?? "").slice(0, 50),
        type: "memory",
        content: mem.memory ?? "",
        metadata: mem.metadata,
      });
    }

    // Supabase KB entries as entities
    const kbEntries = kbResult.data ?? [];
    for (const entry of kbEntries) {
      entities.push({
        id: `kb-${entry.id}`,
        label: entry.title,
        type: "knowledge",
        content: entry.content,
      });
    }

    // Documents as entities
    const docs = docsResult.data ?? [];
    for (const doc of docs) {
      entities.push({
        id: `doc-${doc.id}`,
        label: doc.name,
        type: "document",
        content: doc.name,
      });
    }

    // Build simple relationships: connect knowledge entries that share keywords
    // and connect Mem0 memories to related KB entries
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        // Skip document-to-document connections
        if (a.type === "document" && b.type === "document") continue;

        // Simple keyword overlap check
        const aWords = new Set(a.content.toLowerCase().split(/\W+/).filter(w => w.length > 4));
        const bWords = new Set(b.content.toLowerCase().split(/\W+/).filter(w => w.length > 4));
        let overlap = 0;
        for (const w of aWords) {
          if (bWords.has(w)) overlap++;
        }
        if (overlap >= 2) {
          relationships.push({
            source: a.id,
            target: b.id,
            type: "related",
          });
        }
      }
    }

    res.json({
      entities,
      relationships,
      stats: {
        memories: mem0Memories.length,
        knowledgeEntries: kbEntries.length,
        documents: docs.length,
        connections: relationships.length,
      },
    });
  } catch (err: any) {
    console.error("Knowledge graph error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch knowledge graph" });
  }
});

export default router;
