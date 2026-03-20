/**
 * Semantic Cache — Shared LLM response caching for all cognitive agents
 *
 * Uses Redis vector search to cache and retrieve LLM responses based on
 * semantic similarity. When a new prompt is semantically similar to a
 * previously cached prompt (above the similarity threshold), the cached
 * response is returned — skipping the LLM call entirely.
 *
 * Key architecture decisions:
 *   - Uses Gemini Embedding 2 (1536-dim) via ModelRouter — consistent with
 *     all other vector indexes in the platform
 *   - Namespace-isolated: agents can share cache (cross-agent hits) or
 *     scope to their own namespace via TAG filters
 *   - Double-caching compatible: stacks with Anthropic prompt caching
 *     (prompt caching handles system prompt prefix, semantic cache handles
 *     repeated query patterns)
 *   - Fire-and-forget writes: cache misses don't slow down the response
 *   - Graceful degradation: returns null on any Redis failure
 *
 * Index schema:
 *   Key prefix:  llmcache:
 *   Index name:  idx:llm_cache_v2
 *   Fields:      response TEXT, model TAG, agent_id TAG, org_id TAG,
 *                namespace TAG, cached_at NUMERIC, expires_at NUMERIC,
 *                prompt_hash TAG, prompt_embedding VECTOR(1536, HNSW, COSINE)
 */

import { createHash } from "crypto";
import type { RedisClientType } from "redis";
import type { ModelRouter } from "@waas/shared";
import { createIndex, escapeTag, nowSecs, type IndexFieldSchema } from "./redis-client.js";
import { Sentry } from "./observability.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SemanticCacheConfig {
  /** Redis client (already connected) */
  redis: RedisClientType;
  /** ModelRouter for embedding generation (Gemini Embedding 2) */
  router: ModelRouter;
  /** Agent ID — used for namespace isolation */
  agentId: string;
  /** Organization ID — scopes all cache entries */
  orgId?: string;
  /** Default TTL in seconds (default: 3600 = 1 hour) */
  defaultTtlSeconds?: number;
  /** Default similarity threshold 0-1 (default: 0.92) */
  defaultThreshold?: number;
  /** Enable cross-agent cache sharing (default: true) */
  crossAgentSharing?: boolean;
  /** Models to never cache (responses too variable) */
  skipModels?: Set<string>;
  /** Models explicitly cacheable (if set, only these are cached) */
  cacheableModels?: Set<string>;
}

export interface CacheEntry {
  response: string;
  model: string;
  agentId: string;
  cachedAt: number;
  similarity: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  errors: number;
  hitRate: number;
}

export interface CacheSearchOptions {
  /** Similarity threshold override (0-1, higher = stricter) */
  threshold?: number;
  /** Restrict to a specific namespace (e.g., industry, objection_type) */
  namespace?: string;
  /** Search across all agents' caches (ignores agentId filter) */
  crossAgent?: boolean;
  /** Per-request org ID override (used when orgId isn't known at construction time) */
  orgId?: string;
}

export interface CacheWriteOptions {
  /** TTL override in seconds */
  ttlSeconds?: number;
  /** Namespace tag for organized cache segments */
  namespace?: string;
  /** Additional metadata stored alongside the cached response */
  metadata?: Record<string, string>;
  /** Per-request org ID override (used when orgId isn't known at construction time) */
  orgId?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INDEX_NAME = "idx:llm_cache_v2";
const KEY_PREFIX = "llmcache:";
const EXACT_KEY_PREFIX = "llmcache:exact:";
const EMBEDDING_DIM = 1536;

/** Default models whose responses should NOT be cached */
const DEFAULT_SKIP_MODELS = new Set<string>([
  // Web search via Gemini Search Grounding is not cacheable (results change)
]);

const INDEX_SCHEMA: Record<string, IndexFieldSchema> = {
  response: { type: "TEXT" },
  model: { type: "TAG" },
  agent_id: { type: "TAG" },
  org_id: { type: "TAG" },
  namespace: { type: "TAG" },
  prompt_hash: { type: "TAG" },
  cached_at: { type: "NUMERIC" },
  expires_at: { type: "NUMERIC" },
  prompt_embedding: { type: "VECTOR", algorithm: "HNSW", dim: EMBEDDING_DIM, distanceMetric: "COSINE" },
};

// ─── Cache Implementation ───────────────────────────────────────────────────

export class SemanticCache {
  private redis: RedisClientType;
  private router: ModelRouter;
  private agentId: string;
  private orgId?: string;
  private defaultTtl: number;
  private defaultThreshold: number;
  private crossAgentSharing: boolean;
  private skipModels: Set<string>;
  private cacheableModels?: Set<string>;

  private indexReady = false;
  private indexFailCount = 0;
  private indexPromise?: Promise<boolean>;
  private static readonly MAX_INDEX_RETRIES = 3;

  // Stats
  private stats: CacheStats = { hits: 0, misses: 0, writes: 0, errors: 0, hitRate: 0 };

  constructor(config: SemanticCacheConfig) {
    this.redis = config.redis;
    this.router = config.router;
    this.agentId = config.agentId;
    this.orgId = config.orgId;
    this.defaultTtl = config.defaultTtlSeconds ?? 3600;
    this.defaultThreshold = config.defaultThreshold ?? 0.92;
    this.crossAgentSharing = config.crossAgentSharing ?? true;
    this.skipModels = config.skipModels ?? DEFAULT_SKIP_MODELS;
    this.cacheableModels = config.cacheableModels;
  }

  // ─── Index Management ───────────────────────────────────────────────────

  async ensureIndex(): Promise<boolean> {
    if (this.indexReady) return true;
    if (this.indexFailCount >= SemanticCache.MAX_INDEX_RETRIES) return false;
    // Promise lock: prevent concurrent duplicate index creation
    if (this.indexPromise) return this.indexPromise;

    this.indexPromise = (async () => {
      const ok = await createIndex(this.redis, INDEX_NAME, KEY_PREFIX, INDEX_SCHEMA);
      if (ok) {
        this.indexReady = true;
        this.indexFailCount = 0;
        return true;
      }

      this.indexFailCount++;
      if (this.indexFailCount >= SemanticCache.MAX_INDEX_RETRIES) {
        console.error(`[SemanticCache] CIRCUIT OPEN: Stopped retrying index creation for "${INDEX_NAME}".`);
      }
      return false;
    })();

    try {
      return await this.indexPromise;
    } finally {
      this.indexPromise = undefined;
    }
  }

  // ─── Model Filtering ───────────────────────────────────────────────────

  private isCacheable(model: string): boolean {
    if (this.skipModels.has(model)) return false;
    if (this.cacheableModels) return this.cacheableModels.has(model);
    return true;
  }

  // ─── Exact-Match Fast Path ──────────────────────────────────────────

  /**
   * SHA-256 hash of prompt + model for exact-match cache key.
   */
  private exactKey(prompt: string, model: string): string {
    const scope = `${this.orgId ?? ""}\x00${this.agentId}`;
    const hash = createHash("sha256").update(`${scope}\x00${prompt}\x00${model}`).digest("hex");
    return `${EXACT_KEY_PREFIX}${hash}`;
  }

  /**
   * Exact-match cache lookup. O(1) Redis GET — no embedding, no vector search.
   */
  async getExact(prompt: string, model: string): Promise<string | null> {
    try {
      const key = this.exactKey(prompt, model);
      const value = await this.redis.get(key);
      if (value !== null) {
        // Adaptive TTL extension on hit
        this.extendTTL(key).catch(() => {});
      }
      return value;
    } catch (err) {
      console.error("[SemanticCache] Exact-match lookup failed:", err);
      return null;
    }
  }

  /**
   * Store an exact-match cache entry. Simple Redis SET with TTL.
   */
  async setExact(prompt: string, model: string, response: string, ttlSecs?: number): Promise<void> {
    try {
      const key = this.exactKey(prompt, model);
      const ttl = ttlSecs ?? this.defaultTtl;
      await this.redis.set(key, response, { EX: ttl });
    } catch (err) {
      console.error("[SemanticCache] Exact-match write failed:", err);
    }
  }

  /**
   * Adaptive TTL extension — on any cache hit, extend the TTL.
   * New TTL = min(currentTTL + defaultTTL/2, defaultTTL * 2)
   */
  private async extendTTL(key: string): Promise<void> {
    try {
      const currentTTL = await this.redis.ttl(key);
      if (currentTTL > 0) {
        const extended = Math.min(currentTTL + Math.floor(this.defaultTtl / 2), this.defaultTtl * 2);
        await this.redis.expire(key, extended);
      }
    } catch {
      // Non-fatal — TTL extension is best-effort
    }
  }

  // ─── Cache Lookup ─────────────────────────────────────────────────────

  /**
   * Search for a semantically similar cached response.
   * Checks exact-match first (O(1)), then falls back to vector search.
   * Returns the cached response if similarity > threshold, null otherwise.
   */
  async get(
    prompt: string,
    model: string,
    options?: CacheSearchOptions,
  ): Promise<CacheEntry | null> {
    if (this.skipModels.has(model)) return null;

    try {
      // ── Step 8: Exact-match fast path (O(1) — no embedding needed) ──
      const exactHit = await this.getExact(prompt, model);
      if (exactHit !== null) {
        this.stats.hits++;
        this.updateHitRate();
        return {
          response: exactHit,
          model,
          agentId: this.agentId,
          cachedAt: 0, // Exact-match entries don't store cachedAt
          similarity: 1.0,
        };
      }

      if (!(await this.ensureIndex())) return null;

      // Generate embedding for the prompt
      const embResult = await this.router.embed(prompt);
      if (!embResult.embedding || embResult.embedding.length === 0) {
        console.warn("[SemanticCache] Embedding returned empty for cache lookup — skipping");
        return null;
      }

      const blob = Buffer.from(new Float32Array(embResult.embedding).buffer);
      const threshold = options?.threshold ?? this.defaultThreshold;

      // Build TAG filter
      const filters: string[] = [];
      filters.push(`@model:{${escapeTag(model)}}`);

      const effectiveOrgId = options?.orgId ?? this.orgId;
      if (effectiveOrgId) {
        filters.push(`@org_id:{${escapeTag(effectiveOrgId)}}`);
      }

      // Namespace filter
      if (options?.namespace) {
        filters.push(`@namespace:{${escapeTag(options.namespace)}}`);
      }

      // Agent scope: search own cache by default, or cross-agent if configured
      const searchCrossAgent = options?.crossAgent ?? this.crossAgentSharing;
      if (!searchCrossAgent) {
        filters.push(`@agent_id:{${escapeTag(this.agentId)}}`);
      }

      // Expiration filter: only return entries that haven't expired
      const now = nowSecs();
      filters.push(`@expires_at:[(${now} +inf]`);

      const filterQuery = filters.join(" ");
      const query = `(${filterQuery})=>[KNN 1 @prompt_embedding $BLOB AS score]`;

      const result = await this.redis.sendCommand([
        "FT.SEARCH", INDEX_NAME, query,
        "PARAMS", "2", "BLOB", blob as unknown as string,
        "SORTBY", "score",
        "LIMIT", "0", "1",
        "RETURN", "5", "response", "model", "agent_id", "cached_at", "score",
        "DIALECT", "2",
      ]) as unknown[];

      if (!Array.isArray(result) || (result[0] as number) === 0) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      const fieldArray = result[2] as string[];
      if (!fieldArray) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      const fields: Record<string, string> = {};
      for (let i = 0; i < fieldArray.length; i += 2) {
        fields[fieldArray[i]] = fieldArray[i + 1];
      }

      const score = parseFloat(fields.score ?? "1");
      // Cosine distance: 0 = identical, 2 = opposite
      // Convert to similarity: 1 - distance
      const similarity = 1 - score;

      if (similarity < threshold) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();

      // Adaptive TTL extension on semantic hit (Step 9)
      const hitKey = result[1] as string;
      if (hitKey) {
        this.extendTTL(hitKey).catch(() => {});
        // Also extend the exact-match key if it exists
        this.extendTTL(this.exactKey(prompt, model)).catch(() => {});
      }

      return {
        response: fields.response ?? "",
        model: fields.model ?? model,
        agentId: fields.agent_id ?? this.agentId,
        cachedAt: parseInt(fields.cached_at ?? "0", 10),
        similarity,
      };
    } catch (err) {
      console.error("[SemanticCache] Lookup failed:", err);
      Sentry.captureException(err);
      this.stats.errors++;
      return null;
    }
  }

  // ─── Cache Write ──────────────────────────────────────────────────────

  /**
   * Store an LLM response in the semantic cache.
   * Returns true if stored successfully, false otherwise.
   */
  async set(
    prompt: string,
    response: string,
    model: string,
    options?: CacheWriteOptions,
  ): Promise<boolean> {
    if (!this.isCacheable(model)) return false;

    try {
      if (!(await this.ensureIndex())) return false;

      // Generate embedding
      const embResult = await this.router.embed(prompt);
      if (!embResult.embedding || embResult.embedding.length === 0) {
        console.warn("[SemanticCache] Embedding returned empty for cache write — skipping");
        return false;
      }

      const blob = Buffer.from(new Float32Array(embResult.embedding).buffer);
      const now = nowSecs();
      const ttl = options?.ttlSeconds ?? this.defaultTtl;
      const expiresAt = ttl > 0 ? now + ttl : 0;

      // Generate a stable hash for exact-match dedup
      const promptHash = simpleHash(prompt);

      const key = `${KEY_PREFIX}${now}-${Math.random().toString(36).slice(2, 10)}`;

      // Build field list for HSET
      const hsetArgs: (string | Buffer)[] = [
        "response", response,
        "model", model,
        "agent_id", this.agentId,
        "org_id", options?.orgId ?? this.orgId ?? "",
        "namespace", options?.namespace ?? "default",
        "prompt_hash", promptHash,
        "cached_at", String(now),
        "expires_at", String(expiresAt),
        "prompt_embedding", blob,
      ];

      // Store metadata fields if provided (prefixed to avoid index collision)
      if (options?.metadata) {
        for (const [k, v] of Object.entries(options.metadata)) {
          hsetArgs.push(`meta_${k}`, v);
        }
      }

      await this.redis.sendCommand([
        "HSET", key, ...hsetArgs.map(v => v as unknown as string),
      ]);

      // Set Redis TTL as safety net for cleanup
      if (ttl > 0) {
        await this.redis.expire(key, ttl);
      }

      // Step 8: Also write exact-match key for O(1) lookup on identical prompts
      this.setExact(prompt, model, response, ttl > 0 ? ttl : undefined).catch(() => {});

      this.stats.writes++;
      return true;
    } catch (err) {
      console.error("[SemanticCache] Write failed:", err);
      Sentry.captureException(err);
      this.stats.errors++;
      return false;
    }
  }

  // ─── Convenience Wrapper ──────────────────────────────────────────────

  /**
   * Wrap a model call with semantic caching.
   * Checks cache first — on hit, returns cached response.
   * On miss, calls the function, caches the result (fire-and-forget), and returns.
   */
  async withCache<T extends string>(
    prompt: string,
    model: string,
    callFn: () => Promise<T>,
    options?: CacheSearchOptions & CacheWriteOptions,
  ): Promise<{ result: T; fromCache: boolean; similarity?: number }> {
    // Check cache
    const cached = await this.get(prompt, model, options);
    if (cached) {
      console.log(
        `[SemanticCache] HIT for ${model} (similarity: ${cached.similarity.toFixed(3)}, ` +
        `agent: ${cached.agentId}, age: ${nowSecs() - cached.cachedAt}s)`,
      );
      return { result: cached.response as T, fromCache: true, similarity: cached.similarity };
    }

    // Cache miss — call the LLM
    const result = await callFn();

    // Store in cache (fire-and-forget — never block the response)
    this.set(prompt, result, model, options).catch((err) => {
      console.error("[SemanticCache] Background write failed:", err);
    });

    return { result, fromCache: false };
  }

  // ─── Cache Management ─────────────────────────────────────────────────

  /**
   * Pre-warm the cache with known prompt-response pairs.
   * Useful for loading FAQs, common objections, standard responses.
   */
  async warmCache(
    entries: Array<{ prompt: string; response: string; model: string; namespace?: string; ttlSeconds?: number }>,
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Process in batches of 10 to avoid overwhelming Redis
    const batchSize = 10;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(entry =>
          this.set(entry.prompt, entry.response, entry.model, {
            namespace: entry.namespace,
            ttlSeconds: entry.ttlSeconds,
          }),
        ),
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) success++;
        else failed++;
      }
    }

    console.log(`[SemanticCache] Cache warm complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Invalidate cache entries by namespace or model.
   * Uses FT.SEARCH to find matching keys, then deletes them.
   */
  async invalidate(filter: { namespace?: string; model?: string; agentId?: string }): Promise<number> {
    try {
      if (!(await this.ensureIndex())) return 0;

      const filters: string[] = [];
      if (filter.namespace) filters.push(`@namespace:{${escapeTag(filter.namespace)}}`);
      if (filter.model) filters.push(`@model:{${escapeTag(filter.model)}}`);
      if (filter.agentId) filters.push(`@agent_id:{${escapeTag(filter.agentId)}}`);
      if (this.orgId) filters.push(`@org_id:{${escapeTag(this.orgId)}}`);

      if (filters.length === 0) return 0;

      const query = filters.join(" ");
      const result = await this.redis.sendCommand([
        "FT.SEARCH", INDEX_NAME, query,
        "NOCONTENT",
        "LIMIT", "0", "1000",
        "DIALECT", "2",
      ]) as unknown[];

      if (!Array.isArray(result) || (result[0] as number) === 0) return 0;

      const keys: string[] = [];
      for (let i = 1; i < result.length; i++) {
        keys.push(result[i] as string);
      }

      if (keys.length > 0) {
        await this.redis.del(keys);
      }

      console.log(`[SemanticCache] Invalidated ${keys.length} entries`);
      return keys.length;
    } catch (err) {
      console.error("[SemanticCache] Invalidation failed:", err);
      Sentry.captureException(err);
      return 0;
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics.
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, writes: 0, errors: 0, hitRate: 0 };
  }

  // ─── Internals ────────────────────────────────────────────────────────

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simple non-cryptographic hash for prompt dedup.
 * Used for exact-match TAG filter, not security.
 */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }
  return (hash >>> 0).toString(36);
}
