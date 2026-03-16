import { createClient, type RedisClientType } from "redis";

export type { RedisClientType };
import { config } from "../config.js";

// ─── Singleton connection ────────────────────────────────────────────────────

let client: RedisClientType | null = null;
let connected = false;

let connecting = false;

/**
 * Get the singleton Redis client. Auto-connects on first call.
 * Returns null if Redis is not available (graceful degradation).
 */
export async function getRedis(): Promise<RedisClientType | null> {
  if (client && connected) return client;

  if (!config.redisUrl) return null;

  // Prevent concurrent connection attempts from creating duplicate clients
  if (connecting) return null;

  try {
    connecting = true;

    // Clean up any stale client before creating a new one
    if (client) {
      try { await client.disconnect(); } catch { /* ignore */ }
      client = null;
      connected = false;
    }

    client = createClient({ url: config.redisUrl });

    client.on("error", (err) => {
      console.error("Redis client error:", err);
      connected = false;
    });

    client.on("reconnecting", () => {
      console.log("Redis reconnecting...");
    });

    await client.connect();
    connected = true;
    connecting = false;
    console.log("Redis connected");
    return client;
  } catch (err) {
    console.warn("Redis connection failed (features will degrade gracefully):", err);
    client = null;
    connected = false;
    connecting = false;
    return null;
  }
}

/**
 * Check if Redis is available.
 */
export function isRedisAvailable(): boolean {
  return connected && client !== null;
}

/**
 * Disconnect Redis cleanly (for graceful shutdown).
 */
export async function disconnectRedis(): Promise<void> {
  if (client && connected) {
    await client.disconnect();
    connected = false;
    client = null;
  }
}

// ─── Index management ────────────────────────────────────────────────────────

interface VectorFieldSchema {
  type: "VECTOR";
  algorithm: "HNSW" | "FLAT";
  dim: number;
  distanceMetric: "COSINE" | "L2" | "IP";
  dataType?: "FLOAT32" | "FLOAT64";
}

interface TextFieldSchema {
  type: "TEXT";
}

interface TagFieldSchema {
  type: "TAG";
  separator?: string;
}

interface NumericFieldSchema {
  type: "NUMERIC";
}

type FieldSchema = VectorFieldSchema | TextFieldSchema | TagFieldSchema | NumericFieldSchema;

/**
 * Create a RediSearch index if it doesn't already exist.
 */
export async function createIndex(
  name: string,
  prefix: string,
  schema: Record<string, FieldSchema>,
): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;

  try {
    // Check if index already exists
    await redis.sendCommand(["FT.INFO", name]);
    return true; // Already exists
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (!msg.includes("Unknown index name") && !msg.includes("Unknown Index name")) {
      console.error(`FT.INFO failed for ${name} (unexpected error):`, err);
      return false;
    }
    // Index doesn't exist, create it
  }

  try {
    const args: string[] = ["FT.CREATE", name, "ON", "HASH", "PREFIX", "1", prefix, "SCHEMA"];

    for (const [field, def] of Object.entries(schema)) {
      args.push(field);

      switch (def.type) {
        case "VECTOR":
          args.push(
            "VECTOR", def.algorithm,
            "6",
            "DIM", String(def.dim),
            "DISTANCE_METRIC", def.distanceMetric,
            "TYPE", def.dataType ?? "FLOAT32",
          );
          break;
        case "TEXT":
          args.push("TEXT");
          break;
        case "TAG":
          args.push("TAG");
          if (def.separator) args.push("SEPARATOR", def.separator);
          break;
        case "NUMERIC":
          args.push("NUMERIC");
          break;
      }
    }

    await redis.sendCommand(args);
    console.log(`Redis index created: ${name}`);
    return true;
  } catch (err) {
    console.error(`Failed to create Redis index ${name}:`, err);
    return false;
  }
}

// ─── Vector search ───────────────────────────────────────────────────────────

export interface VectorSearchResult {
  id: string;
  /** Cosine distance: 0 = identical, 1 = orthogonal. Use `1 - distance` for similarity. */
  distance: number;
  fields: Record<string, string>;
}

/**
 * Perform a KNN vector search on a Redis index.
 */
export async function vectorSearch(
  index: string,
  embedding: number[],
  topK: number = 5,
  filter?: string,
): Promise<VectorSearchResult[]> {
  const redis = await getRedis();
  if (!redis) return [];

  try {
    const blob = Buffer.from(new Float32Array(embedding).buffer);
    const queryFilter = filter ? `(${filter})` : "*";
    const query = `${queryFilter}=>[KNN ${topK} @embedding $BLOB AS score]`;

    const result = await redis.sendCommand([
      "FT.SEARCH", index, query,
      "PARAMS", "2", "BLOB", blob as unknown as string,
      "SORTBY", "score",
      "LIMIT", "0", String(topK),
      "DIALECT", "2",
    ]) as unknown[];

    return parseSearchResults(result);
  } catch (err) {
    console.error(`Vector search failed on ${index}:`, err);
    return [];
  }
}

/**
 * Perform a hybrid text + vector search.
 * Optional `filter` adds a pre-filter (e.g. `@org_id:{orgId}`) for multi-tenancy.
 */
export async function hybridSearch(
  index: string,
  textQuery: string,
  embedding: number[],
  topK: number = 5,
  textField: string = "content",
  filter?: string,
): Promise<VectorSearchResult[]> {
  const redis = await getRedis();
  if (!redis) return [];

  try {
    const blob = Buffer.from(new Float32Array(embedding).buffer);
    // Combine text filter (and optional tag filter) with vector KNN
    const textPart = `@${textField}:${escapeRedisQuery(textQuery)}`;
    const filterPart = filter ? `(${filter}) (${textPart})` : `(${textPart})`;
    const query = `${filterPart}=>[KNN ${topK} @embedding $BLOB AS score]`;

    const result = await redis.sendCommand([
      "FT.SEARCH", index, query,
      "PARAMS", "2", "BLOB", blob as unknown as string,
      "SORTBY", "score",
      "LIMIT", "0", String(topK),
      "DIALECT", "2",
    ]) as unknown[];

    return parseSearchResults(result);
  } catch (err) {
    console.error(`Hybrid search failed on ${index}:`, err);
    // Fallback to pure vector search with filter
    return vectorSearch(index, embedding, topK, filter);
  }
}

// ─── Hash helpers ────────────────────────────────────────────────────────────

/**
 * Store a hash with an embedding vector in Redis.
 */
export async function setHashWithVector(
  key: string,
  fields: Record<string, string>,
  embedding: number[],
): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;

  try {
    const blob = Buffer.from(new Float32Array(embedding).buffer);
    const args: string[] = ["HSET", key];

    for (const [field, value] of Object.entries(fields)) {
      args.push(field, value);
    }
    args.push("embedding", blob as unknown as string);

    await redis.sendCommand(args);
    return true;
  } catch (err) {
    console.error(`Failed to set hash ${key}:`, err);
    return false;
  }
}

/**
 * Delete a hash from Redis. Returns true if the key existed and was deleted.
 */
export async function deleteHash(key: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;

  try {
    const count = await redis.del(key);
    return count > 0;
  } catch (err) {
    console.error(`Failed to delete hash ${key}:`, err);
    return false;
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escapeRedisQuery(text: string): string {
  // Escape special RediSearch characters
  return text.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|/\\]/g, "\\$&");
}

function parseSearchResults(result: unknown[]): VectorSearchResult[] {
  if (!Array.isArray(result) || result.length < 1) return [];

  const totalResults = result[0] as number;
  if (totalResults === 0) return [];

  const results: VectorSearchResult[] = [];

  // FT.SEARCH returns: [total, id1, [field1, val1, ...], id2, [field2, val2, ...], ...]
  for (let i = 1; i < result.length; i += 2) {
    const id = result[i] as string;
    const fieldArray = result[i + 1] as string[];

    if (!fieldArray || !Array.isArray(fieldArray)) continue;

    const fields: Record<string, string> = {};
    let distance = 0;

    for (let j = 0; j < fieldArray.length; j += 2) {
      const key = fieldArray[j];
      const val = fieldArray[j + 1];
      if (key === "score") {
        distance = parseFloat(val);
      } else if (key !== "embedding") {
        fields[key] = val;
      }
    }

    results.push({ id, distance, fields });
  }

  return results;
}

// ─── Initialize indexes ──────────────────────────────────────────────────────

/**
 * Create all required Redis indexes at server startup.
 * Safe to call multiple times — skips existing indexes.
 */
export async function initializeRedisIndexes(): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    console.log("Redis not available — skipping index initialization");
    return;
  }

  await Promise.all([
    createIndex("idx:plugins", "plugin:", {
      description: { type: "TEXT" },
      keywords: { type: "TEXT" },
      skill_id: { type: "TAG" },
      embedding: { type: "VECTOR", algorithm: "HNSW", dim: 768, distanceMetric: "COSINE" },
    }),

    createIndex("idx:documents", "doc:", {
      content: { type: "TEXT" },
      source: { type: "TEXT" },
      org_id: { type: "TAG" },
      embedding: { type: "VECTOR", algorithm: "HNSW", dim: 768, distanceMetric: "COSINE" },
    }),

    createIndex("idx:llm_cache", "cache:", {
      model: { type: "TAG" },
      ttl: { type: "NUMERIC" },
      prompt_embedding: { type: "VECTOR", algorithm: "HNSW", dim: 768, distanceMetric: "COSINE" },
    }),
  ]);

  console.log("Redis indexes initialized");
}
