/**
 * Redis Memory Client — CFO standalone implementation
 *
 * Redis-backed memory system for the CFO agent. Uses the same idx:memories
 * index schema as @waas/runtime's RedisMemoryClient so all agents share
 * one memory pool.
 */

import { randomUUID } from "crypto";
import { getRedis, type RedisClientType } from "./redis-client.js";
import { config } from "../config.js";

// ─── Types (compatible with @waas/runtime MemoryClient) ─────────────────────

export interface Memory {
  id: string;
  memory: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  metadata?: Record<string, unknown>;
  categories?: string[];
  created_at: string;
  updated_at: string;
  score?: number;
}

export interface MemoryEvent {
  id: string;
  event: "ADD" | "UPDATE" | "DELETE" | "NOOP";
  data: { memory: string };
}

export interface GraphRelation {
  source: string;
  source_type: string;
  relationship: string;
  target: string;
  target_type: string;
  score?: number;
}

export interface GraphMemoryResponse {
  results: Memory[];
  relations: GraphRelation[];
  entities?: Array<{ name: string; type: string }>;
}

// ─── Constants (matching @waas/runtime idx:memories schema) ─────────────────

const INDEX_NAME = "idx:memories";
const KEY_PREFIX = "memory:";
const EMBEDDING_DIM = 768;
const EMBEDDING_MODEL = "embed-v4.0";

// ─── Index Management ───────────────────────────────────────────────────────

let indexReady = false;
let indexFailCount = 0;
const MAX_INDEX_RETRIES = 3;

async function ensureIndex(redis: RedisClientType): Promise<void> {
  if (indexReady || indexFailCount >= MAX_INDEX_RETRIES) return;

  try {
    await redis.sendCommand(["FT.INFO", INDEX_NAME]);
    indexReady = true;
    return;
  } catch {
    // Index doesn't exist — create it
  }

  try {
    await redis.sendCommand([
      "FT.CREATE", INDEX_NAME, "ON", "HASH", "PREFIX", "1", KEY_PREFIX,
      "SCHEMA",
      "text", "TEXT",
      "agent_id", "TAG",
      "user_id", "TAG",
      "run_id", "TAG",
      "category", "TAG",
      "org_id", "TAG",
      "created_at", "NUMERIC",
      "updated_at", "NUMERIC",
      "embedding", "VECTOR", "HNSW", "6", "DIM", String(EMBEDDING_DIM), "DISTANCE_METRIC", "COSINE", "TYPE", "FLOAT32",
    ]);
    indexReady = true;
    console.log(`[CFA Memory] Index created: ${INDEX_NAME}`);
  } catch (err) {
    indexFailCount++;
    console.error(`[CFA Memory] Index creation failed (${indexFailCount}/${MAX_INDEX_RETRIES}):`, err);
    if (indexFailCount >= MAX_INDEX_RETRIES) {
      console.error("[CFA Memory] CIRCUIT OPEN: Stopped retrying index creation.");
    }
  }
}

// ─── Embedding Generation (Cohere direct) ───────────────────────────────────

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!config.cohereApiKey) return null;

  const res = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.cohereApiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      texts: [text],
      input_type: "search_query",
      embedding_types: ["float"],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cohere embed API error (${res.status}): ${err}`);
  }

  const data = await res.json() as { embeddings?: { float?: number[][] } };
  const embedding = data.embeddings?.float?.[0];
  if (!embedding || embedding.length === 0) {
    throw new Error("Cohere embed returned empty embedding");
  }

  return embedding;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeTag(value: string): string {
  return value.replace(/[\\{}|@$%^&*()!,.<>?;:'"[\]\-\/]/g, "\\$&");
}

function hashToMemory(key: string, fields: Record<string, string>): Memory {
  const id = key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key;

  let metadata: Record<string, unknown> | undefined;
  if (fields.metadata_json) {
    try { metadata = JSON.parse(fields.metadata_json); } catch { /* ignore */ }
  }
  if (fields.category) {
    metadata = { ...metadata, category: fields.category };
  }

  return {
    id,
    memory: fields.text ?? "",
    user_id: fields.user_id,
    agent_id: fields.agent_id,
    run_id: fields.run_id,
    metadata,
    categories: fields.category ? [fields.category] : undefined,
    created_at: fields.created_at ? new Date(parseInt(fields.created_at, 10)).toISOString() : new Date().toISOString(),
    updated_at: fields.updated_at ? new Date(parseInt(fields.updated_at, 10)).toISOString() : new Date().toISOString(),
  };
}

function parseSearchResults(result: unknown[]): Array<{ id: string; distance: number; fields: Record<string, string> }> {
  if (!Array.isArray(result) || (result[0] as number) === 0) return [];
  const results: Array<{ id: string; distance: number; fields: Record<string, string> }> = [];
  for (let i = 1; i < result.length; i += 2) {
    const key = result[i] as string;
    const fieldArray = result[i + 1] as string[];
    if (!fieldArray || !Array.isArray(fieldArray)) continue;
    const fields: Record<string, string> = {};
    let distance = 0;
    for (let j = 0; j < fieldArray.length; j += 2) {
      const k = fieldArray[j];
      const v = fieldArray[j + 1];
      if (k === "score") distance = parseFloat(v);
      else if (k !== "embedding") fields[k] = v;
    }
    results.push({ id: key, distance, fields });
  }
  return results;
}

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

// ─── Core Operations ────────────────────────────────────────────────────────

export async function addOrgMemory(
  content: string | Array<{ role: string; content: string }>,
  organizationId: string,
  opts?: {
    agentId?: string;
    runId?: string;
    metadata?: Record<string, unknown>;
    enableGraph?: boolean;
    timestamp?: number;
    category?: string;
  },
): Promise<MemoryEvent[]> {
  const redis = await getRedis() as RedisClientType | null;
  if (!redis) return [];

  await ensureIndex(redis);

  const text = typeof content === "string"
    ? content
    : content.map(m => `${m.role}: ${m.content}`).join("\n");

  const id = randomUUID();
  const now = Date.now();
  const category = opts?.category ?? "general";

  let embeddingBuf: Buffer | null = null;
  try {
    const embedding = await generateEmbedding(text);
    if (embedding) embeddingBuf = Buffer.from(new Float32Array(embedding).buffer);
  } catch (err) {
    console.error("[CFA Memory] Embedding failed (stored without vector):", err);
  }

  const fields: Record<string, string | Buffer> = {
    text,
    agent_id: opts?.agentId ?? "blockdrive-cfa",
    user_id: organizationId,
    run_id: opts?.runId ?? "",
    category,
    org_id: organizationId,
    created_at: String(now),
    updated_at: String(now),
  };
  if (embeddingBuf) fields.embedding = embeddingBuf;

  if (opts?.metadata) {
    const { category: _cat, ...rest } = opts.metadata;
    if (Object.keys(rest).length > 0) {
      fields.metadata_json = JSON.stringify(rest);
    }
  }

  await redis.hSet(`${KEY_PREFIX}${id}`, fields as Record<string, string>);
  return [{ id, event: embeddingBuf ? "ADD" : "NOOP", data: { memory: text } }];
}

export async function searchOrgMemories(
  query: string,
  organizationId: string,
  opts?: {
    agentId?: string;
    limit?: number;
    rerank?: boolean;
    keywordSearch?: boolean;
    filterMemories?: boolean;
    threshold?: number;
    categories?: string[];
    runId?: string;
  },
): Promise<Memory[]> {
  const redis = await getRedis() as RedisClientType | null;
  if (!redis) return [];

  await ensureIndex(redis);
  const limit = opts?.limit ?? 10;

  const filters: string[] = [];
  filters.push(`@user_id:{${escapeTag(organizationId)}}`);
  if (opts?.agentId) filters.push(`@agent_id:{${escapeTag(opts.agentId)}}`);
  if (opts?.runId) filters.push(`@run_id:{${escapeTag(opts.runId)}}`);
  const filter = filters.join(" ");

  try {
    const embedding = await generateEmbedding(query);
    if (!embedding) return [];

    const blob = Buffer.from(new Float32Array(embedding).buffer);
    const knnQuery = `(${filter})=>[KNN ${limit} @embedding $BLOB AS score]`;

    const result = await redis.sendCommand([
      "FT.SEARCH", INDEX_NAME, knnQuery,
      "PARAMS", "2", "BLOB", blob as unknown as string,
      "SORTBY", "score",
      "LIMIT", "0", String(limit),
      "DIALECT", "2",
    ]) as unknown[];

    return parseSearchResults(result).map(r => hashToMemory(r.id, r.fields));
  } catch (err) {
    console.error("[CFA Memory] Search failed:", err);
    return [];
  }
}

export async function searchCrossNamespaceMemories(
  query: string,
  organizationId: string,
  opts?: { limit?: number },
): Promise<Memory[]> {
  return searchOrgMemories(query, organizationId, { limit: opts?.limit ?? 15 });
}

export async function getSessionMemories(
  organizationId: string,
  runId: string,
  opts?: { limit?: number },
): Promise<Memory[]> {
  const redis = await getRedis() as RedisClientType | null;
  if (!redis) return [];

  await ensureIndex(redis);
  const limit = opts?.limit ?? 50;

  const filter = `@user_id:{${escapeTag(organizationId)}} @run_id:{${escapeTag(runId)}}`;

  try {
    const result = await redis.sendCommand([
      "FT.SEARCH", INDEX_NAME, filter,
      "SORTBY", "created_at", "DESC",
      "LIMIT", "0", String(limit),
      "RETURN", "7", "text", "agent_id", "user_id", "category", "metadata_json", "created_at", "updated_at",
      "DIALECT", "2",
    ]) as unknown[];
    return parseListResults(result);
  } catch (err) {
    console.error("[CFA Memory] Session search failed:", err);
    return [];
  }
}

export async function getAllOrgMemories(
  organizationId: string,
  opts?: {
    includeGraph?: boolean;
    page?: number;
    pageSize?: number;
  },
): Promise<Memory[]> {
  const redis = await getRedis() as RedisClientType | null;
  if (!redis) return [];

  await ensureIndex(redis);
  const limit = opts?.pageSize ?? 100;
  const offset = ((opts?.page ?? 1) - 1) * limit;

  const filter = `@user_id:{${escapeTag(organizationId)}}`;

  try {
    const result = await redis.sendCommand([
      "FT.SEARCH", INDEX_NAME, filter,
      "SORTBY", "created_at", "DESC",
      "LIMIT", String(offset), String(limit),
      "RETURN", "7", "text", "agent_id", "user_id", "category", "metadata_json", "created_at", "updated_at",
      "DIALECT", "2",
    ]) as unknown[];
    return parseListResults(result);
  } catch (err) {
    console.error("[CFA Memory] GetAll failed:", err);
    return [];
  }
}

export async function updateMemory(
  memoryId: string,
  text: string,
): Promise<Memory> {
  const redis = await getRedis() as RedisClientType | null;
  if (!redis) throw new Error("Redis not available");

  const key = `${KEY_PREFIX}${memoryId}`;
  const exists = await redis.exists(key);
  if (!exists) throw new Error(`Memory ${memoryId} not found`);

  const now = Date.now();
  const updateFields: Record<string, string | Buffer> = {
    text,
    updated_at: String(now),
  };

  try {
    const embedding = await generateEmbedding(text);
    if (embedding) updateFields.embedding = Buffer.from(new Float32Array(embedding).buffer);
  } catch (err) {
    console.error("[CFA Memory] Re-embed failed on update:", err);
  }

  await redis.hSet(key, updateFields as Record<string, string>);
  return { id: memoryId, memory: text, created_at: new Date().toISOString(), updated_at: new Date(now).toISOString() };
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const redis = await getRedis() as RedisClientType | null;
  if (!redis) return;
  await redis.del(`${KEY_PREFIX}${memoryId}`);
}

export async function feedbackMemory(
  _memoryId: string,
  _feedback: string,
  _reason?: string,
): Promise<void> {
  // No-op — Redis implementation doesn't track feedback
}
