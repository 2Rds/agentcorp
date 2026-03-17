/**
 * Feature Store — Sub-millisecond feature delivery for AI sales agents
 *
 * Implements the Redis Feature Store pattern using HASH/JSON data structures
 * with RediSearch indexes for fast retrieval. No Redis Cloud Feature Store
 * product needed — we build the pattern ourselves on our existing Redis droplet.
 *
 * Architecture:
 *   - SDR (Sam) WRITES features: computes prospect intelligence, industry
 *     data, competitive intel between calls using the cognitive runtime
 *   - Voice agents READ features in <1ms during/before calls
 *   - All features are org-scoped and expire with configurable TTL
 *
 * Feature categories:
 *   1. Prospect Features — heat scores, engagement history, buying signals
 *   2. Industry Features — objection maps, competitive intel, market data
 *   3. Agent Features — performance metrics, win rates, specializations
 *   4. Call Features — pre-computed call briefs, talking points, context
 *
 * Key schema:
 *   prospect:{orgId}:{prospectId}     — Prospect intelligence
 *   industry:{orgId}:{industrySlug}   — Industry-level features
 *   agent_perf:{orgId}:{agentId}      — Agent performance metrics
 *   call_brief:{orgId}:{callId}       — Pre-computed call preparation
 *
 * All features stored as Redis HASHes for atomic field reads.
 * Sub-millisecond: HGET/HGETALL on HASHes is O(1)/O(N) in-memory.
 */

import type { RedisClientType } from "redis";
import { createIndex, vectorSearch, escapeTag, nowSecs, type IndexFieldSchema } from "./redis-client.js";
import type { ModelRouter } from "@waas/shared";
import { Sentry } from "./observability.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FeatureStoreConfig {
  /** Redis client (already connected) */
  redis: RedisClientType;
  /** ModelRouter for embedding generation (used for similarity-based feature lookup) */
  router: ModelRouter;
  /** Organization ID — all features scoped to org */
  orgId: string;
}

// ─── Prospect Features ──────────────────────────────────────────────────────

export interface ProspectFeatures {
  /** Prospect identifier (email, phone, or CRM ID) */
  prospectId: string;
  /** Company name */
  company: string;
  /** Industry vertical */
  industry: string;
  /** Heat score 0-100 (0 = cold, 100 = ready to buy) */
  heatScore: number;
  /** Current pipeline stage */
  stage: string;
  /** Estimated deal size in USD */
  dealSize: number;
  /** Number of previous touches (calls, emails, meetings) */
  totalTouches: number;
  /** Days since last interaction */
  daysSinceLastTouch: number;
  /** Known pain points (JSON array) */
  painPoints: string[];
  /** Known objections encountered (JSON array) */
  objections: string[];
  /** Buying signals detected (JSON array) */
  buyingSignals: string[];
  /** Competitors being evaluated (JSON array) */
  competitors: string[];
  /** Decision maker name */
  decisionMaker: string;
  /** Decision maker title */
  decisionMakerTitle: string;
  /** Best time to call (hour 0-23) */
  bestCallHour: number;
  /** Preferred communication style: direct, consultative, technical */
  commStyle: string;
  /** Last call outcome summary */
  lastCallSummary: string;
  /** Next recommended action */
  nextAction: string;
  /** Feature freshness: when these features were last computed */
  computedAt: number;
  /** TTL: when these features expire */
  expiresAt: number;
}

// ─── Industry Features ──────────────────────────────────────────────────────

export interface IndustryFeatures {
  /** Industry slug (e.g., "saas", "fintech", "healthcare") */
  industrySlug: string;
  /** Industry display name */
  name: string;
  /** Top objections for this industry with best responses (JSON array of {objection, response, winRate}) */
  objectionMap: Array<{ objection: string; response: string; winRate: number }>;
  /** Key value props that resonate in this industry (JSON array) */
  valueProps: string[];
  /** Common competitors in this vertical (JSON array) */
  competitors: string[];
  /** Average deal cycle length in days */
  avgDealCycleDays: number;
  /** Average deal size in USD */
  avgDealSize: number;
  /** Win rate for this industry (0-1) */
  winRate: number;
  /** Industry-specific talking points (JSON array) */
  talkingPoints: string[];
  /** Regulatory considerations (JSON array) */
  regulations: string[];
  /** Best opening lines tested (JSON array of {line, responseRate}) */
  openingLines: Array<{ line: string; responseRate: number }>;
  /** Feature freshness */
  computedAt: number;
  expiresAt: number;
}

// ─── Agent Performance Features ─────────────────────────────────────────────

export interface AgentPerformanceFeatures {
  /** Agent identifier */
  agentId: string;
  /** Total calls made */
  totalCalls: number;
  /** Calls that resulted in a meeting booked */
  meetingsBooked: number;
  /** Conversion rate (calls → meetings) */
  conversionRate: number;
  /** Average call duration in seconds */
  avgCallDurationSecs: number;
  /** Average talk-to-listen ratio (0-1, 0.4 = 40% talking) */
  talkRatio: number;
  /** Top performing industries (JSON array of {industry, winRate}) */
  topIndustries: Array<{ industry: string; winRate: number }>;
  /** Weakest objection types (what the agent struggles with) */
  weakObjections: string[];
  /** Strongest objection types (what the agent handles best) */
  strongObjections: string[];
  /** Average sentiment score from prospects (0-1) */
  avgProspectSentiment: number;
  /** Total revenue attributed */
  totalRevenue: number;
  /** Feature freshness */
  computedAt: number;
}

// ─── Call Brief Features ────────────────────────────────────────────────────

export interface CallBriefFeatures {
  /** Call identifier */
  callId: string;
  /** Prospect ID this brief is for */
  prospectId: string;
  /** Company name */
  company: string;
  /** Call purpose: cold_call, follow_up, demo, closing */
  purpose: string;
  /** Pre-computed opening script */
  openingScript: string;
  /** Key talking points for this specific prospect (JSON array) */
  talkingPoints: string[];
  /** Predicted objections based on prospect + industry data (JSON array) */
  predictedObjections: string[];
  /** Prepared responses to predicted objections (JSON map) */
  objectionResponses: Record<string, string>;
  /** Competitive positioning notes */
  competitiveNotes: string;
  /** Meeting booking link/instructions */
  meetingBookingInfo: string;
  /** SDR notes and research summary */
  sdrNotes: string;
  /** Feature freshness */
  computedAt: number;
  expiresAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const KEY_PREFIXES = {
  prospect: "feat:prospect:",
  industry: "feat:industry:",
  agent_perf: "feat:agent_perf:",
  call_brief: "feat:call_brief:",
} as const;

const INDEX_CONFIGS = {
  prospect: {
    name: "idx:feat_prospect",
    prefix: KEY_PREFIXES.prospect,
    schema: {
      company: { type: "TEXT" } as IndexFieldSchema,
      industry: { type: "TAG" } as IndexFieldSchema,
      stage: { type: "TAG" } as IndexFieldSchema,
      heat_score: { type: "NUMERIC" } as IndexFieldSchema,
      deal_size: { type: "NUMERIC" } as IndexFieldSchema,
      org_id: { type: "TAG" } as IndexFieldSchema,
      computed_at: { type: "NUMERIC" } as IndexFieldSchema,
      embedding: { type: "VECTOR", algorithm: "HNSW", dim: 1536, distanceMetric: "COSINE" } as IndexFieldSchema,
    },
  },
  industry: {
    name: "idx:feat_industry",
    prefix: KEY_PREFIXES.industry,
    schema: {
      name: { type: "TEXT" } as IndexFieldSchema,
      industry_slug: { type: "TAG" } as IndexFieldSchema,
      win_rate: { type: "NUMERIC" } as IndexFieldSchema,
      avg_deal_size: { type: "NUMERIC" } as IndexFieldSchema,
      org_id: { type: "TAG" } as IndexFieldSchema,
      computed_at: { type: "NUMERIC" } as IndexFieldSchema,
    },
  },
  agent_perf: {
    name: "idx:feat_agent_perf",
    prefix: KEY_PREFIXES.agent_perf,
    schema: {
      agent_id: { type: "TAG" } as IndexFieldSchema,
      conversion_rate: { type: "NUMERIC" } as IndexFieldSchema,
      total_calls: { type: "NUMERIC" } as IndexFieldSchema,
      total_revenue: { type: "NUMERIC" } as IndexFieldSchema,
      org_id: { type: "TAG" } as IndexFieldSchema,
      computed_at: { type: "NUMERIC" } as IndexFieldSchema,
    },
  },
  call_brief: {
    name: "idx:feat_call_brief",
    prefix: KEY_PREFIXES.call_brief,
    schema: {
      prospect_id: { type: "TAG" } as IndexFieldSchema,
      company: { type: "TEXT" } as IndexFieldSchema,
      purpose: { type: "TAG" } as IndexFieldSchema,
      org_id: { type: "TAG" } as IndexFieldSchema,
      computed_at: { type: "NUMERIC" } as IndexFieldSchema,
    },
  },
} as const;

// Default TTLs in seconds
const DEFAULT_TTLS = {
  prospect: 24 * 3600,      // 24 hours — prospect data refreshes daily
  industry: 7 * 24 * 3600,  // 7 days — industry data changes slowly
  agent_perf: 3600,          // 1 hour — performance updates frequently
  call_brief: 4 * 3600,     // 4 hours — briefs expire after call window
} as const;

// ─── Feature Store ──────────────────────────────────────────────────────────

export class FeatureStore {
  private redis: RedisClientType;
  private router: ModelRouter;
  private orgId: string;
  private indexesReady = new Set<string>();
  private indexPromises = new Map<string, Promise<void>>();

  constructor(config: FeatureStoreConfig) {
    this.redis = config.redis;
    this.router = config.router;
    this.orgId = config.orgId;
  }

  /**
   * Resolve the effective orgId for a method call.
   * Per-method override > constructor orgId. Warns if both are empty.
   */
  private resolveOrgId(override?: string): string {
    const effective = override ?? this.orgId;
    if (!effective) {
      console.warn("[FeatureStore] orgId is empty — keys will be malformed. Pass orgId per-method or set at construction.");
    }
    return effective;
  }

  // ─── Index Management ───────────────────────────────────────────────

  /**
   * Initialize all feature indexes. Call once at startup.
   */
  async initializeIndexes(): Promise<void> {
    const results = await Promise.allSettled([
      this.ensureIndex("prospect"),
      this.ensureIndex("industry"),
      this.ensureIndex("agent_perf"),
      this.ensureIndex("call_brief"),
    ]);

    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[FeatureStore] Index creation failed:", r.reason);
        Sentry.captureException(r.reason);
      }
    }
  }

  private async ensureIndex(type: keyof typeof INDEX_CONFIGS): Promise<void> {
    if (this.indexesReady.has(type)) return;
    // Promise lock: prevent concurrent duplicate index creation
    const existing = this.indexPromises.get(type);
    if (existing) return existing;

    const promise = (async () => {
      const cfg = INDEX_CONFIGS[type];
      const ok = await createIndex(this.redis, cfg.name, cfg.prefix, cfg.schema);
      if (ok) this.indexesReady.add(type);
    })();
    this.indexPromises.set(type, promise);

    try {
      await promise;
    } finally {
      this.indexPromises.delete(type);
    }
  }

  /** Write a HASH and set its TTL. Shared by all set* methods. */
  private async writeHash(key: string, fields: Record<string, string>, ttl: number): Promise<void> {
    await this.redis.hSet(key, fields);
    if (ttl > 0) await this.redis.expire(key, ttl);
  }

  // ─── Prospect Features ────────────────────────────────────────────────

  /**
   * Write prospect features. Called by SDR (Sam) after research/enrichment.
   * Sub-ms write via HSET.
   */
  async setProspectFeatures(features: ProspectFeatures, ttlSeconds?: number, orgId?: string): Promise<void> {
    const effectiveOrgId = this.resolveOrgId(orgId);
    const key = `${KEY_PREFIXES.prospect}${effectiveOrgId}:${features.prospectId}`;
    const ttl = ttlSeconds ?? DEFAULT_TTLS.prospect;
    const now = nowSecs();

    const fields: Record<string, string> = {
      prospect_id: features.prospectId,
      company: features.company,
      industry: features.industry,
      heat_score: String(features.heatScore),
      stage: features.stage,
      deal_size: String(features.dealSize),
      total_touches: String(features.totalTouches),
      days_since_last_touch: String(features.daysSinceLastTouch),
      pain_points: JSON.stringify(features.painPoints),
      objections: JSON.stringify(features.objections),
      buying_signals: JSON.stringify(features.buyingSignals),
      competitors: JSON.stringify(features.competitors),
      decision_maker: features.decisionMaker,
      decision_maker_title: features.decisionMakerTitle,
      best_call_hour: String(features.bestCallHour),
      comm_style: features.commStyle,
      last_call_summary: features.lastCallSummary,
      next_action: features.nextAction,
      org_id: effectiveOrgId,
      computed_at: String(features.computedAt || now),
      expires_at: String(features.expiresAt || now + ttl),
    };

    // Generate embedding for prospect description (enables similarity-based lookup)
    try {
      const description = `${features.company} ${features.industry} ${features.painPoints.join(" ")} ${features.stage}`;
      const embResult = await this.router.embed(description);
      const blob = Buffer.from(new Float32Array(embResult.embedding).buffer);
      await this.redis.sendCommand([
        "HSET", key,
        ...Object.entries(fields).flat(),
        "embedding", blob as unknown as string,
      ]);
      if (ttl > 0) await this.redis.expire(key, ttl);
    } catch (embErr) {
      console.warn("[FeatureStore] Embedding failed for prospect, storing without vector:", (embErr as Error).message);
      // Fall back to storing without embedding
      await this.writeHash(key, fields, ttl);
    }
  }

  /**
   * Get prospect features by ID. Sub-ms read via HGETALL.
   * Called by voice agents before/during calls.
   */
  async getProspectFeatures(prospectId: string, orgId?: string): Promise<ProspectFeatures | null> {
    const key = `${KEY_PREFIXES.prospect}${this.resolveOrgId(orgId)}:${prospectId}`;
    const fields = await this.redis.hGetAll(key);
    if (!fields || Object.keys(fields).length === 0) return null;
    return hashToProspectFeatures(fields);
  }

  /**
   * Find similar prospects by description (semantic search).
   * Useful for: "find prospects similar to this one" or "what worked with companies like X".
   */
  async findSimilarProspects(description: string, limit = 5, orgId?: string): Promise<ProspectFeatures[]> {
    await this.ensureIndex("prospect");

    try {
      const embResult = await this.router.embed(description);
      const filter = `@org_id:{${escapeTag(this.resolveOrgId(orgId))}}`;
      const results = await vectorSearch(
        this.redis,
        INDEX_CONFIGS.prospect.name,
        embResult.embedding,
        limit,
        filter,
      );

      const prospects: ProspectFeatures[] = [];
      for (const r of results) {
        const full = await this.redis.hGetAll(r.id);
        if (full && Object.keys(full).length > 0) {
          prospects.push(hashToProspectFeatures(full));
        }
      }
      return prospects;
    } catch (err) {
      console.error("[FeatureStore] findSimilarProspects failed:", err);
      Sentry.captureException(err);
      return [];
    }
  }

  /**
   * Get the hottest prospects (highest heat scores).
   * Called by SDR to prioritize the call queue.
   */
  async getHottestProspects(limit = 10, orgId?: string): Promise<ProspectFeatures[]> {
    await this.ensureIndex("prospect");

    try {
      const query = `@org_id:{${escapeTag(this.resolveOrgId(orgId))}}`;
      const result = await this.redis.sendCommand([
        "FT.SEARCH", INDEX_CONFIGS.prospect.name, query,
        "SORTBY", "heat_score", "DESC",
        "LIMIT", "0", String(limit),
        "DIALECT", "2",
      ]) as unknown[];

      return parseFeatureResults(result, hashToProspectFeatures);
    } catch (err) {
      console.error("[FeatureStore] getHottestProspects failed:", err);
      Sentry.captureException(err);
      return [];
    }
  }

  // ─── Industry Features ────────────────────────────────────────────────

  /**
   * Write industry features. Called by SDR after market research.
   */
  async setIndustryFeatures(features: IndustryFeatures, ttlSeconds?: number, orgId?: string): Promise<void> {
    const effectiveOrgId = this.resolveOrgId(orgId);
    const key = `${KEY_PREFIXES.industry}${effectiveOrgId}:${features.industrySlug}`;
    const ttl = ttlSeconds ?? DEFAULT_TTLS.industry;
    const now = nowSecs();

    const fields: Record<string, string> = {
      industry_slug: features.industrySlug,
      name: features.name,
      objection_map: JSON.stringify(features.objectionMap),
      value_props: JSON.stringify(features.valueProps),
      competitors: JSON.stringify(features.competitors),
      avg_deal_cycle_days: String(features.avgDealCycleDays),
      avg_deal_size: String(features.avgDealSize),
      win_rate: String(features.winRate),
      talking_points: JSON.stringify(features.talkingPoints),
      regulations: JSON.stringify(features.regulations),
      opening_lines: JSON.stringify(features.openingLines),
      org_id: effectiveOrgId,
      computed_at: String(features.computedAt || now),
      expires_at: String(features.expiresAt || now + ttl),
    };

    await this.writeHash(key, fields, ttl);
  }

  /**
   * Get industry features by slug. Sub-ms read.
   * Called by voice agents to load objection maps before/during calls.
   */
  async getIndustryFeatures(industrySlug: string, orgId?: string): Promise<IndustryFeatures | null> {
    const key = `${KEY_PREFIXES.industry}${this.resolveOrgId(orgId)}:${industrySlug}`;
    const fields = await this.redis.hGetAll(key);
    if (!fields || Object.keys(fields).length === 0) return null;
    return hashToIndustryFeatures(fields);
  }

  /**
   * Get all industry features (for cache warming or analytics).
   */
  async getAllIndustryFeatures(orgId?: string): Promise<IndustryFeatures[]> {
    await this.ensureIndex("industry");

    try {
      const query = `@org_id:{${escapeTag(this.resolveOrgId(orgId))}}`;
      const result = await this.redis.sendCommand([
        "FT.SEARCH", INDEX_CONFIGS.industry.name, query,
        "SORTBY", "win_rate", "DESC",
        "LIMIT", "0", "100",
        "DIALECT", "2",
      ]) as unknown[];

      return parseFeatureResults(result, hashToIndustryFeatures);
    } catch (err) {
      console.error("[FeatureStore] getAllIndustryFeatures failed:", err);
      Sentry.captureException(err);
      return [];
    }
  }

  // ─── Agent Performance Features ───────────────────────────────────────

  /**
   * Write agent performance features. Called after each call or in batch.
   */
  async setAgentPerformance(features: AgentPerformanceFeatures, ttlSeconds?: number, orgId?: string): Promise<void> {
    const effectiveOrgId = this.resolveOrgId(orgId);
    const key = `${KEY_PREFIXES.agent_perf}${effectiveOrgId}:${features.agentId}`;
    const ttl = ttlSeconds ?? DEFAULT_TTLS.agent_perf;
    const now = nowSecs();

    const fields: Record<string, string> = {
      agent_id: features.agentId,
      total_calls: String(features.totalCalls),
      meetings_booked: String(features.meetingsBooked),
      conversion_rate: String(features.conversionRate),
      avg_call_duration_secs: String(features.avgCallDurationSecs),
      talk_ratio: String(features.talkRatio),
      top_industries: JSON.stringify(features.topIndustries),
      weak_objections: JSON.stringify(features.weakObjections),
      strong_objections: JSON.stringify(features.strongObjections),
      avg_prospect_sentiment: String(features.avgProspectSentiment),
      total_revenue: String(features.totalRevenue),
      org_id: effectiveOrgId,
      computed_at: String(features.computedAt || now),
    };

    await this.writeHash(key, fields, ttl);
  }

  /**
   * Get agent performance features. Sub-ms read.
   */
  async getAgentPerformance(agentId: string, orgId?: string): Promise<AgentPerformanceFeatures | null> {
    const key = `${KEY_PREFIXES.agent_perf}${this.resolveOrgId(orgId)}:${agentId}`;
    const fields = await this.redis.hGetAll(key);
    if (!fields || Object.keys(fields).length === 0) return null;
    return hashToAgentPerf(fields);
  }

  /**
   * Get all agents' performance, sorted by conversion rate.
   */
  async getAgentLeaderboard(limit = 10, orgId?: string): Promise<AgentPerformanceFeatures[]> {
    await this.ensureIndex("agent_perf");

    try {
      const query = `@org_id:{${escapeTag(this.resolveOrgId(orgId))}}`;
      const result = await this.redis.sendCommand([
        "FT.SEARCH", INDEX_CONFIGS.agent_perf.name, query,
        "SORTBY", "conversion_rate", "DESC",
        "LIMIT", "0", String(limit),
        "DIALECT", "2",
      ]) as unknown[];

      return parseFeatureResults(result, hashToAgentPerf);
    } catch (err) {
      console.error("[FeatureStore] getAgentLeaderboard failed:", err);
      Sentry.captureException(err);
      return [];
    }
  }

  // ─── Call Brief Features ──────────────────────────────────────────────

  /**
   * Write a pre-computed call brief. Called by SDR before a scheduled call.
   */
  async setCallBrief(brief: CallBriefFeatures, ttlSeconds?: number, orgId?: string): Promise<void> {
    const effectiveOrgId = this.resolveOrgId(orgId);
    const key = `${KEY_PREFIXES.call_brief}${effectiveOrgId}:${brief.callId}`;
    const ttl = ttlSeconds ?? DEFAULT_TTLS.call_brief;
    const now = nowSecs();

    const fields: Record<string, string> = {
      call_id: brief.callId,
      prospect_id: brief.prospectId,
      company: brief.company,
      purpose: brief.purpose,
      opening_script: brief.openingScript,
      talking_points: JSON.stringify(brief.talkingPoints),
      predicted_objections: JSON.stringify(brief.predictedObjections),
      objection_responses: JSON.stringify(brief.objectionResponses),
      competitive_notes: brief.competitiveNotes,
      meeting_booking_info: brief.meetingBookingInfo,
      sdr_notes: brief.sdrNotes,
      org_id: effectiveOrgId,
      computed_at: String(brief.computedAt || now),
      expires_at: String(brief.expiresAt || now + ttl),
    };

    await this.writeHash(key, fields, ttl);
  }

  /**
   * Get a call brief by call ID. Sub-ms read.
   * Called by voice agent at the start of a call.
   */
  async getCallBrief(callId: string, orgId?: string): Promise<CallBriefFeatures | null> {
    const key = `${KEY_PREFIXES.call_brief}${this.resolveOrgId(orgId)}:${callId}`;
    const fields = await this.redis.hGetAll(key);
    if (!fields || Object.keys(fields).length === 0) return null;
    return hashToCallBrief(fields);
  }

  /**
   * Get a call brief by prospect ID (finds the latest brief for this prospect).
   * Uses FT.SEARCH on the call_brief index — O(log N) not O(N).
   */
  async getCallBriefForProspect(prospectId: string, orgId?: string): Promise<CallBriefFeatures | null> {
    await this.ensureIndex("call_brief");
    const effectiveOrgId = this.resolveOrgId(orgId);

    try {
      const query = `@prospect_id:{${escapeTag(prospectId)}} @org_id:{${escapeTag(effectiveOrgId)}}`;
      const result = await this.redis.sendCommand([
        "FT.SEARCH", INDEX_CONFIGS.call_brief.name, query,
        "SORTBY", "computed_at", "DESC",
        "LIMIT", "0", "1",
        "DIALECT", "2",
      ]) as unknown[];

      const briefs = parseFeatureResults(result, hashToCallBrief);
      return briefs.length > 0 ? briefs[0] : null;
    } catch (err) {
      console.error("[FeatureStore] getCallBriefForProspect failed:", err);
      Sentry.captureException(err);
      return null;
    }
  }

  // ─── Bulk Operations ──────────────────────────────────────────────────

  /**
   * Get a complete intelligence package for a call.
   * Combines prospect features + industry features + call brief in parallel.
   * Single round-trip for voice agents before/during a call.
   */
  async getCallIntelligence(
    prospectId: string,
    callId?: string,
    orgId?: string,
  ): Promise<{
    prospect: ProspectFeatures | null;
    industry: IndustryFeatures | null;
    brief: CallBriefFeatures | null;
  }> {
    const prospectPromise = this.getProspectFeatures(prospectId, orgId);

    // Get prospect first to know the industry
    const prospect = await prospectPromise;

    const [industryResult, briefResult] = await Promise.allSettled([
      prospect?.industry
        ? this.getIndustryFeatures(prospect.industry, orgId)
        : Promise.resolve(null),
      callId
        ? this.getCallBrief(callId, orgId)
        : this.getCallBriefForProspect(prospectId, orgId),
    ]);

    return {
      prospect,
      industry: industryResult.status === "fulfilled" ? industryResult.value : null,
      brief: briefResult.status === "fulfilled" ? briefResult.value : null,
    };
  }
}

// ─── Hash Conversion Helpers ────────────────────────────────────────────────

function safeParseJson<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

/** Parse a hash field as float, with fallback */
function safeFloat(value: string | undefined, fallback = 0): number {
  return parseFloat(value ?? String(fallback));
}

/** Parse a hash field as int, with fallback */
function safeInt(value: string | undefined, fallback = 0): number {
  return parseInt(value ?? String(fallback), 10);
}

function hashToProspectFeatures(f: Record<string, string>): ProspectFeatures {
  return {
    prospectId: f.prospect_id ?? "",
    company: f.company ?? "",
    industry: f.industry ?? "",
    heatScore: safeFloat(f.heat_score),
    stage: f.stage ?? "unknown",
    dealSize: safeFloat(f.deal_size),
    totalTouches: safeInt(f.total_touches),
    daysSinceLastTouch: safeInt(f.days_since_last_touch),
    painPoints: safeParseJson<string[]>(f.pain_points, []),
    objections: safeParseJson<string[]>(f.objections, []),
    buyingSignals: safeParseJson<string[]>(f.buying_signals, []),
    competitors: safeParseJson<string[]>(f.competitors, []),
    decisionMaker: f.decision_maker ?? "",
    decisionMakerTitle: f.decision_maker_title ?? "",
    bestCallHour: safeInt(f.best_call_hour, 10),
    commStyle: f.comm_style ?? "direct",
    lastCallSummary: f.last_call_summary ?? "",
    nextAction: f.next_action ?? "",
    computedAt: safeInt(f.computed_at),
    expiresAt: safeInt(f.expires_at),
  };
}

function hashToIndustryFeatures(f: Record<string, string>): IndustryFeatures {
  return {
    industrySlug: f.industry_slug ?? "",
    name: f.name ?? "",
    objectionMap: safeParseJson<Array<{ objection: string; response: string; winRate: number }>>(f.objection_map, []),
    valueProps: safeParseJson<string[]>(f.value_props, []),
    competitors: safeParseJson<string[]>(f.competitors, []),
    avgDealCycleDays: safeInt(f.avg_deal_cycle_days),
    avgDealSize: safeFloat(f.avg_deal_size),
    winRate: safeFloat(f.win_rate),
    talkingPoints: safeParseJson<string[]>(f.talking_points, []),
    regulations: safeParseJson<string[]>(f.regulations, []),
    openingLines: safeParseJson<Array<{ line: string; responseRate: number }>>(f.opening_lines, []),
    computedAt: safeInt(f.computed_at),
    expiresAt: safeInt(f.expires_at),
  };
}

function hashToAgentPerf(f: Record<string, string>): AgentPerformanceFeatures {
  return {
    agentId: f.agent_id ?? "",
    totalCalls: safeInt(f.total_calls),
    meetingsBooked: safeInt(f.meetings_booked),
    conversionRate: safeFloat(f.conversion_rate),
    avgCallDurationSecs: safeFloat(f.avg_call_duration_secs),
    talkRatio: safeFloat(f.talk_ratio),
    topIndustries: safeParseJson<Array<{ industry: string; winRate: number }>>(f.top_industries, []),
    weakObjections: safeParseJson<string[]>(f.weak_objections, []),
    strongObjections: safeParseJson<string[]>(f.strong_objections, []),
    avgProspectSentiment: safeFloat(f.avg_prospect_sentiment),
    totalRevenue: safeFloat(f.total_revenue),
    computedAt: safeInt(f.computed_at),
  };
}

function hashToCallBrief(f: Record<string, string>): CallBriefFeatures {
  return {
    callId: f.call_id ?? "",
    prospectId: f.prospect_id ?? "",
    company: f.company ?? "",
    purpose: f.purpose ?? "cold_call",
    openingScript: f.opening_script ?? "",
    talkingPoints: safeParseJson<string[]>(f.talking_points, []),
    predictedObjections: safeParseJson<string[]>(f.predicted_objections, []),
    objectionResponses: safeParseJson<Record<string, string>>(f.objection_responses, {}),
    competitiveNotes: f.competitive_notes ?? "",
    meetingBookingInfo: f.meeting_booking_info ?? "",
    sdrNotes: f.sdr_notes ?? "",
    computedAt: safeInt(f.computed_at),
    expiresAt: safeInt(f.expires_at),
  };
}

/** Parse FT.SEARCH results into typed feature arrays */
function parseFeatureResults<T>(result: unknown[], converter: (fields: Record<string, string>) => T): T[] {
  if (!Array.isArray(result) || (result[0] as number) === 0) return [];
  const items: T[] = [];
  for (let i = 1; i < result.length; i += 2) {
    const fieldArray = result[i + 1] as string[];
    if (!fieldArray || !Array.isArray(fieldArray)) continue;
    const fields: Record<string, string> = {};
    for (let j = 0; j < fieldArray.length; j += 2) {
      if (fieldArray[j] !== "embedding") {
        fields[fieldArray[j]] = fieldArray[j + 1];
      }
    }
    items.push(converter(fields));
  }
  return items;
}

