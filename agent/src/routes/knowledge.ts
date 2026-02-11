import { Router, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { getAllOrgMemories, type GraphMemoryResponse, type Memory } from "../lib/mem0-client.js";

const router = Router();

/**
 * GET /api/knowledge/graph?organizationId=...
 * Returns Mem0 memories with graph relations + documents for the org.
 * Uses Mem0's native graph memory API for real entity/relationship extraction.
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

    // Fetch Mem0 memories with graph relations + documents in parallel
    const [mem0Result, docsResult] = await Promise.all([
      getAllOrgMemories(organizationId, { includeGraph: true, pageSize: 200 }),
      supabaseAdmin
        .from("documents")
        .select("id, name, mime_type, size_bytes, storage_path, created_at, tags")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

    // Parse graph response
    const isGraphResponse = (r: Memory[] | GraphMemoryResponse): r is GraphMemoryResponse =>
      !Array.isArray(r) && "results" in r;

    const memories = isGraphResponse(mem0Result) ? mem0Result.results : mem0Result;
    const graphRelations = isGraphResponse(mem0Result) ? mem0Result.relations ?? [] : [];
    const graphEntities = isGraphResponse(mem0Result) ? mem0Result.entities ?? [] : [];

    // Build entities from memories
    const entities: Array<{
      id: string;
      label: string;
      type: "memory" | "document" | "entity";
      content: string;
      categories?: string[];
      metadata?: Record<string, unknown>;
    }> = [];

    // Mem0 memories as entities
    for (const mem of memories) {
      entities.push({
        id: `mem0-${mem.id}`,
        label: (mem.metadata?.title as string) || mem.memory.slice(0, 50),
        type: "memory",
        content: mem.memory,
        categories: mem.categories,
        metadata: mem.metadata,
      });
    }

    // Graph entities (people, companies, concepts extracted by Mem0)
    for (const entity of graphEntities) {
      entities.push({
        id: `entity-${entity.name.toLowerCase().replace(/\s+/g, "-")}`,
        label: entity.name,
        type: "entity",
        content: `${entity.type}: ${entity.name}`,
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

    // Use Mem0's graph relations directly (no more O(n²) keyword overlap)
    const relationships = graphRelations.map(rel => ({
      source: `entity-${rel.source.toLowerCase().replace(/\s+/g, "-")}`,
      target: `entity-${rel.target.toLowerCase().replace(/\s+/g, "-")}`,
      type: rel.relationship,
      score: rel.score,
    }));

    res.json({
      entities,
      relationships,
      stats: {
        memories: memories.length,
        graphEntities: graphEntities.length,
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
