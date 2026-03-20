/**
 * Redis Memory Client — Persistent memory for cognitive agents
 *
 * Stores agent memories in Redis HASHes with RediSearch vector index
 * for semantic search. Uses Gemini Embedding 2 via ModelRouter.embed().
 *
 * Key schema:  memory:{memoryId}
 * Index name:  idx:memories (shared across all orgs — org isolation
 *              enforced via TAG filter on `org_id` at query time)
 *
 * Structurally compatible with MemoryClient interface. Graph memory
 * is not supported in this backend (cloud-only feature).
 * No external API dependency — everything lives on the existing Redis droplet.
 */

import { randomUUID } from "crypto";
import type { RedisClientType } from "redis";
import type { ModelRouter } from "@waas/shared";
import { createIndex, vectorSearch, escapeTag, type IndexFieldSchema } from "./redis-client.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  memory: string;
  hash?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface MemoryEvent {
  id: string;
  event: "ADD" | "UPDATE" | "DELETE" | "NOOP";
  data: { memory: string } | string;
}

export interface GraphRelation {
  source: string;
  target: string;
  relationship: string;
}

export interface GraphMemoryResponse {
  results: Memory[];
  relations?: GraphRelation[];
}

export type MemoryCategory =
  | "financial"
  | "operational"
  | "strategic"
  | "investor"
  | "market"
  | "compliance"
  | "general";

/**
 * Unified memory client interface — implemented by RedisMemoryClient.
 * All agents use this interface for memory operations.
 */
export interface MemoryClient {
  addMemory(
    text: string,
    userId: string,
    opts?: { agentId?: string; runId?: string; metadata?: Record<string, unknown>; enableGraph?: boolean },
  ): Promise<MemoryEvent[]>;

  searchMemories(
    query: string,
    userId: string,
    opts?: { agentId?: string; limit?: number; rerank?: boolean; keyword?: boolean; enableGraph?: boolean },
  ): Promise<Memory[]>;

  getAllMemories(
    userId: string,
    opts?: { agentId?: string; limit?: number; enableGraph?: boolean },
  ): Promise<Memory[] | GraphMemoryResponse>;

  updateMemory(memoryId: string, text: string): Promise<MemoryEvent[]>;
  deleteMemory(memoryId: string): Promise<void>;
  /** Record feedback on a memory. Implementations may no-op if feedback tracking is not supported. */
  feedbackMemory(memoryId: string, feedback: "positive" | "negative"): Promise<void>;

  addAgentMemory(
    agentId: string,
    orgId: string,
    text: string,
    category?: MemoryCategory,
    metadata?: Record<string, unknown>,
  ): Promise<MemoryEvent[]>;

  searchAgentMemories(agentId: string, orgId: string, query: string, limit?: number): Promise<Memory[]>;
  getSessionMemories(agentId: string, conversationId: string, limit?: number): Promise<Memory[]>;
  searchCrossAgentMemories(orgId: string, query: string, limit?: number): Promise<Memory[]>;
}

export interface RedisMemoryConfig {
  /** Redis client instance (already connected) */
  redis: RedisClientType;
  /** ModelRouter for embedding generation */
  router: ModelRouter;
  /** Organization ID (scopes all memories) */
  organizationId?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INDEX_NAME = "idx:memories";
const KEY_PREFIX = "memory:";
const EMBEDDING_DIM = 1536;

const INDEX_SCHEMA: Record<string, IndexFieldSchema> = {
  text: { type: "TEXT" },
  agent_id: { type: "TAG" },
  user_id: { type: "TAG" },
  run_id: { type: "TAG" },
  category: { type: "TAG" },
  org_id: { type: "TAG" },
  created_at: { type: "NUMERIC" },
  updated_at: { type: "NUMERIC" },
  embedding: { type: "VECTOR", algorithm: "HNSW", dim: EMBEDDING_DIM, distanceMetric: "COSINE" },
};

// ─── Client ─────────────────────────────────────────────────────────────────

export class RedisMemoryClient implements MemoryClient {
  private redis: RedisClientType;
  private router: ModelRouter;
  private orgId?: string;
  private indexReady = false;
  private indexFailCount = 0;
  private static readonly MAX_INDEX_RETRIES = 3;

  constructor(config: RedisMemoryConfig) {
    this.redis = config.redis;
    this.router = config.router;
    this.orgId = config.organizationId;
  }

  // ─── Index Initialization ───────────────────────────────────────────────

  private async ensureIndex(): Promise<void> {
    if (this.indexReady) return;
    if (this.indexFailCount >= RedisMemoryClient.MAX_INDEX_RETRIES) return;

    const ok = await createIndex(this.redis, INDEX_NAME, KEY_PREFIX, INDEX_SCHEMA);
    if (ok) {
      this.indexReady = true;
      this.indexFailCount = 0;
    } else {
      this.indexFailCount++;
      console.error(
        `[RedisMemoryClient] Index creation failed (attempt ${this.indexFailCount}/${RedisMemoryClient.MAX_INDEX_RETRIES}). ` +
        `Memory operations will return empty results until RediSearch index "${INDEX_NAME}" is available.`,
      );
      if (this.indexFailCount >= RedisMemoryClient.MAX_INDEX_RETRIES) {
        console.error(`[RedisMemoryClient] CIRCUIT OPEN: Stopped retrying index creation. All memory operations degraded.`);
      }
    }
  }

  // ─── Core Operations ───────────────────────────────────────────────────

  async addMemory(
    text: string,
    userId: string,
    opts?: {
      agentId?: string;
      runId?: string;
      metadata?: Record<string, unknown>;
      enableGraph?: boolean;
    },
  ): Promise<MemoryEvent[]> {
    await this.ensureIndex();

    const id = randomUUID();
    const now = Date.now();
    const category = (opts?.metadata?.category as string) ?? "general";

    // Generate embedding
    let embeddingBuf: Buffer | null = null;
    try {
      const result = await this.router.embed(text, "RETRIEVAL_DOCUMENT");
      embeddingBuf = Buffer.from(new Float32Array(result.embedding).buffer);
    } catch (err) {
      console.error("[RedisMemoryClient] Failed to generate embedding for memory — stored without embedding (not vector-searchable):", err);
    }

    const key = `${KEY_PREFIX}${id}`;
    const fields: Record<string, string | Buffer> = {
      text,
      agent_id: opts?.agentId ?? "",
      user_id: userId,
      run_id: opts?.runId ?? "",
      category,
      org_id: this.orgId ?? "",
      created_at: String(now),
      updated_at: String(now),
    };
    if (embeddingBuf) {
      fields.embedding = embeddingBuf;
    }

    // Store metadata as JSON string (excluding category which is a TAG)
    if (opts?.metadata) {
      const { category: _cat, ...rest } = opts.metadata;
      if (Object.keys(rest).length > 0) {
        fields.metadata_json = JSON.stringify(rest);
      }
    }

    await this.redis.hSet(key, fields as Record<string, string>);

    return [{ id, event: embeddingBuf ? "ADD" : "NOOP", data: { memory: text } }];
  }

  async searchMemories(
    query: string,
    userId: string,
    opts?: {
      agentId?: string;
      limit?: number;
      rerank?: boolean;
      keyword?: boolean;
      enableGraph?: boolean;
    },
  ): Promise<Memory[]> {
    await this.ensureIndex();
    const limit = opts?.limit ?? 10;

    // Build TAG filter
    const filters: string[] = [];
    if (userId) filters.push(`@user_id:{${escapeTag(userId)}}`);
    if (opts?.agentId) filters.push(`@agent_id:{${escapeTag(opts.agentId)}}`);
    if (this.orgId) filters.push(`@org_id:{${escapeTag(this.orgId)}}`);
    const filter = filters.length > 0 ? filters.join(" ") : undefined;

    // Semantic vector search
    let results;
    try {
      const embResult = await this.router.embed(query);
      results = await vectorSearch(this.redis, INDEX_NAME, embResult.embedding, limit, filter);
    } catch (err) {
      console.error("Memory semantic search failed:", err);
      return [];
    }

    return results.map((r) => hashToMemory(r.id, r.fields));
  }

  async getAllMemories(
    userId: string,
    opts?: { agentId?: string; limit?: number; enableGraph?: boolean },
  ): Promise<Memory[]> {
    await this.ensureIndex();
    const limit = opts?.limit ?? 50;

    // Use FT.SEARCH with TAG filter (no vector — just list all)
    const filters: string[] = [];
    if (userId) filters.push(`@user_id:{${escapeTag(userId)}}`);
    if (opts?.agentId) filters.push(`@agent_id:{${escapeTag(opts.agentId)}}`);
    if (this.orgId) filters.push(`@org_id:{${escapeTag(this.orgId)}}`);
    const query = filters.length > 0 ? filters.join(" ") : "*";

    try {
      const result = await this.redis.sendCommand([
        "FT.SEARCH", INDEX_NAME, query,
        "SORTBY", "created_at", "DESC",
        "LIMIT", "0", String(limit),
        "RETURN", "7", "text", "agent_id", "user_id", "category", "metadata_json", "created_at", "updated_at",
        "DIALECT", "2",
      ]) as unknown[];
      return parseListResults(result);
    } catch (err) {
      console.error("getAllMemories failed:", err);
      return [];
    }
  }

  async updateMemory(memoryId: string, text: string): Promise<MemoryEvent[]> {
    const key = `${KEY_PREFIX}${memoryId}`;

    // Check exists
    const exists = await this.redis.exists(key);
    if (!exists) return [];

    const now = Date.now();

    // Re-embed
    const updateFields: Record<string, string | Buffer> = {
      text,
      updated_at: String(now),
    };
    try {
      const result = await this.router.embed(text, "RETRIEVAL_DOCUMENT");
      updateFields.embedding = Buffer.from(new Float32Array(result.embedding).buffer);
    } catch (err) {
      console.error("[RedisMemoryClient] Failed to re-embed memory on update — keeping existing embedding:", err);
    }

    await this.redis.hSet(key, updateFields as Record<string, string>);

    return [{ id: memoryId, event: "UPDATE", data: { memory: text } }];
  }

  async deleteMemory(memoryId: string): Promise<void> {
    const key = `${KEY_PREFIX}${memoryId}`;
    await this.redis.del(key);
  }

  async feedbackMemory(_memoryId: string, _feedback: "positive" | "negative"): Promise<void> {
    // No-op in Redis implementation — could add a score field later
  }

  // ─── Agent-Scoped Convenience Methods ──────────────────────────────────

  async addAgentMemory(
    agentId: string,
    orgId: string,
    text: string,
    category: MemoryCategory = "general",
    metadata?: Record<string, unknown>,
  ): Promise<MemoryEvent[]> {
    return this.addMemory(text, orgId, {
      agentId,
      metadata: { category, ...metadata },
    });
  }

  async searchAgentMemories(
    agentId: string,
    orgId: string,
    query: string,
    limit = 10,
  ): Promise<Memory[]> {
    return this.searchMemories(query, orgId, { agentId, limit });
  }

  async getSessionMemories(
    agentId: string,
    conversationId: string,
    limit = 20,
  ): Promise<Memory[]> {
    await this.ensureIndex();

    // Session memories scoped by run_id (conversation thread)
    const filters: string[] = [
      `@agent_id:{${escapeTag(agentId)}}`,
      `@run_id:{${escapeTag(conversationId)}}`,
    ];
    if (this.orgId) filters.push(`@org_id:{${escapeTag(this.orgId)}}`);
    const query = filters.join(" ");

    try {
      const result = await this.redis.sendCommand([
        "FT.SEARCH", INDEX_NAME, query,
        "SORTBY", "created_at", "DESC",
        "LIMIT", "0", String(limit),
        "RETURN", "7", "text", "agent_id", "user_id", "category", "metadata_json", "created_at", "updated_at",
        "DIALECT", "2",
      ]) as unknown[];
      return parseListResults(result);
    } catch (err) {
      console.error("getSessionMemories failed:", err);
      return [];
    }
  }

  async searchCrossAgentMemories(
    orgId: string,
    query: string,
    limit = 10,
  ): Promise<Memory[]> {
    // No agent_id filter — searches across all agents in the org
    return this.searchMemories(query, orgId, { limit });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a Redis HASH result to a Memory object */
function hashToMemory(key: string, fields: Record<string, string>): Memory {
  const id = key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key;

  let metadata: Record<string, unknown> | undefined;
  if (fields.metadata_json) {
    try {
      metadata = JSON.parse(fields.metadata_json);
    } catch (parseErr) {
      console.warn(`[RedisMemoryClient] Failed to parse metadata_json for key ${key}:`, (parseErr as Error).message);
    }
  }
  if (fields.category) {
    metadata = { ...metadata, category: fields.category };
  }

  return {
    id,
    memory: fields.text ?? "",
    metadata,
    created_at: fields.created_at ? new Date(parseInt(fields.created_at, 10)).toISOString() : undefined,
    updated_at: fields.updated_at ? new Date(parseInt(fields.updated_at, 10)).toISOString() : undefined,
  };
}

/** Parse FT.SEARCH results (non-vector queries) into Memory[] */
function parseListResults(result: unknown[]): Memory[] {
  if (!Array.isArray(result) || (result[0] as number) === 0) return [];
  const memories: Memory[] = [];
  for (let i = 1; i < result.length; i += 2) {
    const key = result[i] as string;
    const fieldArray = result[i + 1] as string[];
    if (!fieldArray || !Array.isArray(fieldArray)) continue;
    const fields: Record<string, string> = {};
    for (let j = 0; j < fieldArray.length; j += 2) {
      fields[fieldArray[j]] = fieldArray[j + 1];
    }
    memories.push(hashToMemory(key, fields));
  }
  return memories;
}
