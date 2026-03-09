/**
 * Singleton Redis Client
 *
 * Every agent gets its own Express process but shares this singleton
 * Redis connection. Graceful degradation — all features that depend on
 * Redis (semantic cache, plugin vector search, message persistence)
 * fall back cleanly when Redis is unavailable.
 */

import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connected = false;
let connectingPromise: Promise<RedisClientType | null> | null = null;

/**
 * Get the singleton Redis client. Auto-connects on first call.
 * Returns null if Redis URL is not configured or connection fails.
 * Concurrent calls share the same connection promise (no race condition).
 */
export async function getRedis(redisUrl?: string): Promise<RedisClientType | null> {
  if (client && connected) return client;
  if (!redisUrl) return null;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    try {
      if (client) {
        try { await client.disconnect(); } catch (err) {
          console.warn("Failed to disconnect stale Redis client:", err);
        }
        client = null;
        connected = false;
      }

      client = createClient({ url: redisUrl });

      client.on("error", (err) => {
        console.error("Redis client error:", err);
        connected = false;
      });

      client.on("reconnecting", () => {
        console.log("Redis reconnecting...");
      });

      await client.connect();
      connected = true;
      console.log("Redis connected");
      return client;
    } catch (err) {
      console.warn("Redis connection failed (features will degrade gracefully):", err);
      client = null;
      connected = false;
      return null;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

export function isRedisAvailable(): boolean {
  return connected && client !== null;
}

export async function disconnectRedis(): Promise<void> {
  if (client && connected) {
    try {
      await client.disconnect();
    } catch (err) {
      console.error("Redis disconnect failed:", err);
    } finally {
      connected = false;
      client = null;
    }
  }
}

// ─── Vector Search ───────────────────────────────────────────────────────────

export interface VectorSearchResult {
  id: string;
  distance: number;
  fields: Record<string, string>;
}

/**
 * Create a RediSearch index if it doesn't exist.
 */
export async function createIndex(
  redis: RedisClientType,
  name: string,
  prefix: string,
  schema: Record<string, IndexFieldSchema>,
): Promise<boolean> {
  try {
    await redis.sendCommand(["FT.INFO", name]);
    return true;
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    if (!msg.includes("Unknown index name") && !msg.includes("Unknown Index name")) {
      console.error(`FT.INFO failed for ${name}:`, err);
      return false;
    }
  }

  try {
    const args: string[] = ["FT.CREATE", name, "ON", "HASH", "PREFIX", "1", prefix, "SCHEMA"];
    for (const [field, def] of Object.entries(schema)) {
      args.push(field);
      switch (def.type) {
        case "VECTOR":
          args.push("VECTOR", def.algorithm, "6", "DIM", String(def.dim), "DISTANCE_METRIC", def.distanceMetric, "TYPE", def.dataType ?? "FLOAT32");
          break;
        case "TEXT": args.push("TEXT"); break;
        case "TAG":
          args.push("TAG");
          if (def.separator) args.push("SEPARATOR", def.separator);
          break;
        case "NUMERIC": args.push("NUMERIC"); break;
      }
    }
    await redis.sendCommand(args);
    console.log(`Redis index created: ${name}`);
    return true;
  } catch (err) {
    console.error(`Failed to create index ${name}:`, err);
    return false;
  }
}

export type IndexFieldSchema =
  | { type: "VECTOR"; algorithm: "HNSW" | "FLAT"; dim: number; distanceMetric: "COSINE" | "L2" | "IP"; dataType?: "FLOAT32" | "FLOAT64" }
  | { type: "TEXT" }
  | { type: "TAG"; separator?: string }
  | { type: "NUMERIC" };

/**
 * KNN vector search on a Redis index.
 */
export async function vectorSearch(
  redis: RedisClientType,
  index: string,
  embedding: number[],
  topK = 5,
  filter?: string,
): Promise<VectorSearchResult[]> {
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

function parseSearchResults(result: unknown[]): VectorSearchResult[] {
  if (!Array.isArray(result) || (result[0] as number) === 0) return [];
  const results: VectorSearchResult[] = [];
  for (let i = 1; i < result.length; i += 2) {
    const id = result[i] as string;
    const fieldArray = result[i + 1] as string[];
    if (!fieldArray || !Array.isArray(fieldArray)) continue;
    const fields: Record<string, string> = {};
    let distance = 0;
    for (let j = 0; j < fieldArray.length; j += 2) {
      const key = fieldArray[j];
      const val = fieldArray[j + 1];
      if (key === "score") distance = parseFloat(val);
      else if (key !== "embedding") fields[key] = val;
    }
    results.push({ id, distance, fields });
  }
  return results;
}
