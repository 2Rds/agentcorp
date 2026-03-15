import { createClient, type RedisClientType } from "redis";

export type { RedisClientType };
import { config } from "../config.js";

// ─── Singleton connection ────────────────────────────────────────────────────

let client: RedisClientType | null = null;
let connected = false;
let connecting = false;

export async function getRedis(): Promise<RedisClientType | null> {
  if (client && connected) return client;
  if (!config.redisUrl) return null;
  if (connecting) return null;

  try {
    connecting = true;
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

export function isRedisAvailable(): boolean {
  return connected && client !== null;
}

export async function disconnectRedis(): Promise<void> {
  if (client && connected) {
    await client.disconnect();
    connected = false;
    client = null;
  }
}

// ─── Vector search ───────────────────────────────────────────────────────────

export interface VectorSearchResult {
  id: string;
  distance: number;
  fields: Record<string, string>;
}

export async function vectorSearch(
  index: string,
  embedding: number[],
  topK: number = 5,
): Promise<VectorSearchResult[]> {
  const redis = await getRedis();
  if (!redis) return [];

  try {
    const blob = Buffer.from(new Float32Array(embedding).buffer);
    const query = `*=>[KNN ${topK} @embedding $BLOB AS score]`;

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

// ─── Index management ────────────────────────────────────────────────────────

export async function initializeRedisIndexes(): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    console.log("Redis not available -- skipping index initialization");
    return;
  }

  // Create plugins index for skill resolution
  try {
    await redis.sendCommand(["FT.INFO", "idx:plugins"]);
  } catch {
    try {
      await redis.sendCommand([
        "FT.CREATE", "idx:plugins", "ON", "HASH", "PREFIX", "1", "plugin:",
        "SCHEMA",
        "description", "TEXT",
        "keywords", "TEXT",
        "skill_id", "TAG",
        "embedding", "VECTOR", "HNSW", "6", "DIM", "768", "DISTANCE_METRIC", "COSINE", "TYPE", "FLOAT32",
      ]);
      console.log("Redis index created: idx:plugins");
    } catch (err) {
      console.error("Failed to create idx:plugins:", err);
    }
  }

  console.log("Redis indexes initialized");
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function parseSearchResults(result: unknown[]): VectorSearchResult[] {
  if (!Array.isArray(result) || result.length < 1) return [];
  const totalResults = result[0] as number;
  if (totalResults === 0) return [];

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
