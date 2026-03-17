import { getRedis, isRedisAvailable } from "./redis-client.js";
import { embed } from "./model-router.js";

const CACHE_INDEX = "idx:llm_cache_v2";
const CACHE_PREFIX = "llmcache:";

// Models whose responses should be cached (structured/deterministic outputs)
const CACHEABLE_MODELS = new Set([
  "google/gemini-3-flash-preview",
  "x-ai/grok-4-1-fast-non-reasoning",
]);

// Don't cache conversational/reasoning models — responses vary too much
const SKIP_CACHE_MODELS = new Set([
  "claude-opus-4-6",
  "perplexity/sonar-pro", // Web research results change frequently
]);

export interface CacheEntry {
  response: string;
  model: string;
  cachedAt: number;
}

/**
 * Check if a similar prompt has been cached. Uses vector similarity on embeddings.
 * Returns cached response if similarity > threshold, null otherwise.
 */
export async function getCached(
  prompt: string,
  model: string,
  threshold: number = 0.95,
): Promise<CacheEntry | null> {
  if (!isRedisAvailable() || SKIP_CACHE_MODELS.has(model)) return null;

  try {
    const redis = await getRedis();
    if (!redis) return null;

    const promptEmbedding = await embed(prompt);
    if (promptEmbedding.length === 0) return null;

    const blob = Buffer.from(new Float32Array(promptEmbedding).buffer);

    // KNN search with model filter
    const query = `(@model:{${escapeTag(model)}})=>[KNN 1 @prompt_embedding $BLOB AS score]`;

    const result = await redis.sendCommand([
      "FT.SEARCH", CACHE_INDEX, query,
      "PARAMS", "2", "BLOB", blob as unknown as string,
      "RETURN", "5", "response", "model", "cached_at", "score", "expires_at",
      "SORTBY", "score",
      "LIMIT", "0", "1",
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

    // Cosine distance: 0 = identical, 1 = orthogonal
    // Convert to similarity: 1 - distance
    const similarity = 1 - score;

    if (similarity < threshold) return null;

    // Check TTL — expired entries should not be returned
    const expiresAt = parseInt(fields.expires_at ?? "0", 10);
    if (expiresAt > 0 && Date.now() / 1000 > expiresAt) {
      // Clean up expired entry
      const id = result[1] as string;
      await redis.del(id).catch((e) => console.warn(`Failed to clean up expired cache entry ${id}:`, e));
      return null;
    }

    return {
      response: fields.response ?? "",
      model: fields.model ?? model,
      cachedAt: parseInt(fields.cached_at ?? "0", 10),
    };
  } catch (err) {
    console.error("Semantic cache lookup failed:", err);
    return null;
  }
}

/**
 * Store an LLM response in the semantic cache.
 */
export async function setCached(
  prompt: string,
  response: string,
  model: string,
  ttlSeconds: number = 3600, // Default 1 hour
): Promise<boolean> {
  if (!isRedisAvailable() || !CACHEABLE_MODELS.has(model)) return false;

  try {
    const redis = await getRedis();
    if (!redis) return false;

    const promptEmbedding = await embed(prompt);
    if (promptEmbedding.length === 0) return false;

    const blob = Buffer.from(new Float32Array(promptEmbedding).buffer);
    const key = `${CACHE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Math.floor(Date.now() / 1000);

    await redis.sendCommand([
      "HSET", key,
      "response", response,
      "model", model,
      "cached_at", String(now),
      "expires_at", String(ttlSeconds > 0 ? now + ttlSeconds : 0),
      "prompt_embedding", blob as unknown as string,
    ]);

    // Set Redis key expiry as a safety net
    if (ttlSeconds > 0) {
      await redis.expire(key, ttlSeconds);
    }

    return true;
  } catch (err) {
    console.error("Semantic cache write failed:", err);
    return false;
  }
}

/**
 * Wrap a model call with semantic caching.
 * Checks cache before calling the model, stores the result after.
 */
export async function withCache<T extends string>(
  prompt: string,
  model: string,
  callFn: () => Promise<T>,
  opts?: { threshold?: number; ttl?: number },
): Promise<T> {
  // Check cache first
  const cached = await getCached(prompt, model, opts?.threshold);
  if (cached) {
    console.log(`Semantic cache hit for ${model} (similarity > ${opts?.threshold ?? 0.95})`);
    return cached.response as T;
  }

  // Call the model
  const response = await callFn();

  // Store in cache (fire-and-forget)
  setCached(prompt, response, model, opts?.ttl).catch((err) => {
    console.error("Failed to cache response:", err);
  });

  return response;
}

function escapeTag(value: string): string {
  // RediSearch TAG values: escape special chars
  return value.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|/\\]/g, "\\$&");
}
