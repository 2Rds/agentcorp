/**
 * Semantic Cache — Standalone LLM response cache for EA Agent
 *
 * The EA runs in a standalone Docker build (no @waas/runtime access), so this
 * is a self-contained semantic cache using the EA's own Redis client and Gemini
 * embeddings. Writes to the same idx:llm_cache_v2 index shared by all agents.
 *
 * Architecture:
 *   - Uses EA's redis-client.ts for Redis connection
 *   - Uses EA's model-router.ts embed() for Gemini Embedding 2 (1536-dim)
 *   - Same index schema as @waas/runtime SemanticCache (cross-agent compatible)
 *   - Fire-and-forget writes (never slows down the response)
 *   - Graceful degradation (returns null on any failure)
 */

import { getRedis, isRedisAvailable } from "./redis-client.js";
import { embed } from "./model-router.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const INDEX_NAME = "idx:llm_cache_v2";
const KEY_PREFIX = "llmcache:";
const EMBEDDING_DIM = 1536;
const AGENT_ID = "blockdrive-ea";
const DEFAULT_TTL = 3600; // 1 hour
const DEFAULT_THRESHOLD = 0.92;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CacheEntry {
  response: string;
  model: string;
  agentId: string;
  cachedAt: number;
  similarity: number;
}

// ─── Index management ───────────────────────────────────────────────────────

let indexReady = false;
let indexFailCount = 0;
let indexPromise: Promise<boolean> | undefined;
const MAX_INDEX_RETRIES = 3;

async function ensureIndex(): Promise<boolean> {
  if (indexReady) return true;
  if (indexFailCount >= MAX_INDEX_RETRIES) return false;
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    try {
      const redis = await getRedis();
      if (!redis) return false;

      // Check if index already exists
      try {
        await redis.sendCommand(["FT.INFO", INDEX_NAME]);
        indexReady = true;
        return true;
      } catch {
        // Index doesn't exist — create it
      }

      await redis.sendCommand([
        "FT.CREATE", INDEX_NAME, "ON", "HASH", "PREFIX", "1", KEY_PREFIX,
        "SCHEMA",
        "response", "TEXT",
        "model", "TAG",
        "agent_id", "TAG",
        "org_id", "TAG",
        "namespace", "TAG",
        "prompt_hash", "TAG",
        "cached_at", "NUMERIC",
        "expires_at", "NUMERIC",
        "prompt_embedding", "VECTOR", "HNSW", "6",
          "DIM", String(EMBEDDING_DIM), "DISTANCE_METRIC", "COSINE", "TYPE", "FLOAT32",
      ]);
      console.log(`[SemanticCache/EA] Index created: ${INDEX_NAME}`);
      indexReady = true;
      indexFailCount = 0;
      return true;
    } catch (err) {
      indexFailCount++;
      if (indexFailCount >= MAX_INDEX_RETRIES) {
        console.error(`[SemanticCache/EA] CIRCUIT OPEN: Stopped retrying index creation for "${INDEX_NAME}".`);
      }
      return false;
    }
  })();

  try {
    return await indexPromise;
  } finally {
    indexPromise = undefined;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeTag(value: string): string {
  return value.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|/\\]/g, "\\$&");
}

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

// ─── Cache lookup ───────────────────────────────────────────────────────────

/**
 * Search for a semantically similar cached response.
 * Searches cross-agent (any agent's cache for the same model).
 */
export async function getCached(
  prompt: string,
  model: string,
  threshold: number = DEFAULT_THRESHOLD,
): Promise<CacheEntry | null> {
  if (!isRedisAvailable()) return null;

  try {
    if (!(await ensureIndex())) return null;

    const redis = await getRedis();
    if (!redis) return null;

    const promptEmbedding = await embed(prompt);
    if (promptEmbedding.length === 0) return null;

    const blob = Buffer.from(new Float32Array(promptEmbedding).buffer);
    const now = nowSecs();

    // KNN search with model + expiration filters (cross-agent: no agent_id filter)
    const query = `(@model:{${escapeTag(model)}} @expires_at:[(${now} +inf])=>[KNN 1 @prompt_embedding $BLOB AS score]`;

    const result = await redis.sendCommand([
      "FT.SEARCH", INDEX_NAME, query,
      "PARAMS", "2", "BLOB", blob as unknown as string,
      "SORTBY", "score",
      "LIMIT", "0", "1",
      "RETURN", "5", "response", "model", "agent_id", "cached_at", "score",
      "DIALECT", "2",
    ]) as unknown[];

    if (!Array.isArray(result) || (result[0] as number) === 0) return null;

    const fieldArray = result[2] as string[];
    if (!fieldArray) return null;

    const fields: Record<string, string> = {};
    for (let i = 0; i < fieldArray.length; i += 2) {
      fields[fieldArray[i]] = fieldArray[i + 1];
    }

    const score = parseFloat(fields.score ?? "1");
    const similarity = 1 - score;

    if (similarity < threshold) return null;

    console.log(
      `[SemanticCache/EA] HIT for ${model} (similarity: ${similarity.toFixed(3)}, ` +
      `agent: ${fields.agent_id ?? "unknown"}, age: ${now - parseInt(fields.cached_at ?? "0", 10)}s)`,
    );

    return {
      response: fields.response ?? "",
      model: fields.model ?? model,
      agentId: fields.agent_id ?? AGENT_ID,
      cachedAt: parseInt(fields.cached_at ?? "0", 10),
      similarity,
    };
  } catch (err) {
    console.error("[SemanticCache/EA] Lookup failed:", err);
    return null;
  }
}

// ─── Cache write ────────────────────────────────────────────────────────────

/**
 * Store an LLM response in the semantic cache.
 * Fire-and-forget — callers should .catch(() => {}) this.
 */
export async function setCached(
  prompt: string,
  response: string,
  model: string,
  ttlSeconds: number = DEFAULT_TTL,
  orgId?: string,
): Promise<boolean> {
  if (!isRedisAvailable()) return false;

  try {
    if (!(await ensureIndex())) return false;

    const redis = await getRedis();
    if (!redis) return false;

    const promptEmbedding = await embed(prompt, "RETRIEVAL_DOCUMENT");
    if (promptEmbedding.length === 0) return false;

    const blob = Buffer.from(new Float32Array(promptEmbedding).buffer);
    const now = nowSecs();
    const expiresAt = ttlSeconds > 0 ? now + ttlSeconds : 0;
    const promptHash = simpleHash(prompt);
    const key = `${KEY_PREFIX}${now}-${Math.random().toString(36).slice(2, 10)}`;

    await redis.sendCommand([
      "HSET", key,
      "response", response,
      "model", model,
      "agent_id", AGENT_ID,
      "org_id", orgId ?? "",
      "namespace", "default",
      "prompt_hash", promptHash,
      "cached_at", String(now),
      "expires_at", String(expiresAt),
      "prompt_embedding", blob as unknown as string,
    ]);

    if (ttlSeconds > 0) {
      await redis.expire(key, ttlSeconds);
    }

    return true;
  } catch (err) {
    console.error("[SemanticCache/EA] Write failed:", err);
    return false;
  }
}
