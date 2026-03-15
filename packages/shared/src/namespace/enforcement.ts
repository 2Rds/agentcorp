/**
 * Namespace Enforcement Layer
 *
 * Runtime enforcement of namespace isolation. Wraps Redis, mem0,
 * and Supabase clients with scope checks. Agents receive pre-scoped
 * clients that physically cannot access unauthorized namespaces.
 */

import type { ToolScope, AccessLevel } from "../types.js";

// ─── Scope Checker ──────────────────────────────────────────────────────────

export class ScopeEnforcer {
  constructor(private readonly agentId: string, private readonly scope: ToolScope) {}

  /** Check if agent can access a Redis key */
  checkRedisAccess(key: string, requiredAccess: AccessLevel): boolean {
    return this.scope.redisNamespaces.some(ns => {
      if (!key.startsWith(ns.prefix)) return false;
      if (requiredAccess === "readwrite" && ns.access === "read") return false;
      return true;
    });
  }

  /** Check if agent can access a Supabase table */
  checkTableAccess(tableName: string, requiredAccess: AccessLevel): boolean {
    return this.scope.tables.some(t => {
      if (t.name !== tableName) return false;
      if (requiredAccess === "readwrite" && t.access === "read") return false;
      return true;
    });
  }

  /** Check if agent can access a Notion database */
  checkNotionAccess(databaseId: string, requiredAccess: AccessLevel): boolean {
    return this.scope.notionDatabases.some(db => {
      if (db.id !== databaseId) return false;
      if (requiredAccess === "readwrite" && db.access === "read") return false;
      return true;
    });
  }

  /** Check if agent can query another agent's mem0 memories */
  checkMem0Access(targetAgentId: string, requiredAccess: AccessLevel): boolean {
    return this.scope.mem0Namespaces.some(ns => {
      if (ns.agentId !== "*" && ns.agentId !== targetAgentId) return false;
      if (requiredAccess === "readwrite" && ns.access === "read") return false;
      return true;
    });
  }

  /** Check if agent can call an external API */
  checkApiAccess(apiName: string): boolean {
    return this.scope.externalApis.includes(apiName);
  }

  /** Check if agent can message another agent */
  checkMessageAccess(targetAgentId: string): boolean {
    return this.scope.canMessage.includes(targetAgentId);
  }

  /** Get the agent's own Redis key prefix for writes */
  getOwnRedisPrefix(): string {
    const ownNs = this.scope.redisNamespaces.find(
      ns => ns.access === "readwrite" && !ns.prefix.endsWith("global:"),
    );
    if (!ownNs) throw new Error(`Agent ${this.agentId} has no writable Redis namespace`);
    return ownNs.prefix;
  }

  /** Build mem0 search filters scoped to this agent's access */
  buildMem0Filters(additionalFilters?: Record<string, unknown>): Record<string, unknown> {
    const hasWildcardRead = this.scope.mem0Namespaces.some(ns => ns.agentId === "*");

    if (hasWildcardRead) {
      // Executive/compliance: can search all agents, no agent_id filter
      return {
        AND: [
          { user_id: "project-waas" },
          ...(additionalFilters ? [additionalFilters] : []),
        ],
      };
    }

    // Department-scoped: only own agent_id + readable parent
    const readableIds = this.scope.mem0Namespaces.map(ns => ns.agentId);
    return {
      AND: [
        { user_id: "project-waas" },
        { agent_id: { in: readableIds } },
        ...(additionalFilters ? [additionalFilters] : []),
      ],
    };
  }

  /** Build mem0 write metadata for this agent */
  buildMem0WriteMetadata(category: string, extra?: Record<string, unknown>): Record<string, unknown> {
    return {
      namespace: this.agentId.replace("blockdrive-", ""),
      agent_id: this.agentId,
      category,
      ...extra,
    };
  }
}

// ─── Scoped Redis Client ────────────────────────────────────────────────────

export interface StreamEntry {
  id: string;
  message: Record<string, string>;
}

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  // List operations (legacy — kept for backwards compat with LIST fallback)
  rpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  // Stream operations for MessageBus (optional — MessageBus falls back to LIST ops when absent)
  xadd?(key: string, id: string, fields: Record<string, string>, maxlen?: number): Promise<string>;
  xrange?(key: string, start: string, end: string, count?: number): Promise<StreamEntry[]>;
  xlen?(key: string): Promise<number>;
  xtrim?(key: string, maxlen: number): Promise<number>;
}

/** Redis client wrapper that enforces namespace scoping */
export class ScopedRedisClient {
  constructor(
    private readonly redis: RedisClient,
    private readonly enforcer: ScopeEnforcer,
  ) {}

  async get(key: string): Promise<string | null> {
    if (!this.enforcer.checkRedisAccess(key, "read")) {
      throw new Error(`Access denied: cannot read Redis key '${key}'`);
    }
    return this.redis.get(key);
  }

  async set(key: string, value: string, opts?: { ex?: number }): Promise<void> {
    if (!this.enforcer.checkRedisAccess(key, "readwrite")) {
      throw new Error(`Access denied: cannot write Redis key '${key}'`);
    }
    return this.redis.set(key, value, opts);
  }

  async del(key: string): Promise<void> {
    if (!this.enforcer.checkRedisAccess(key, "readwrite")) {
      throw new Error(`Access denied: cannot delete Redis key '${key}'`);
    }
    return this.redis.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    // Extract literal prefix before any glob character for access check
    const prefixEnd = pattern.search(/[*?\[]/);
    const literalPrefix = prefixEnd === -1 ? pattern : pattern.slice(0, prefixEnd);
    if (!this.enforcer.checkRedisAccess(literalPrefix, "read")) {
      throw new Error(`Access denied: cannot list Redis keys matching '${pattern}'`);
    }
    const allKeys = await this.redis.keys(pattern);
    // Post-filter: only return keys the agent can actually read
    return allKeys.filter(key => this.enforcer.checkRedisAccess(key, "read"));
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    if (!this.enforcer.checkRedisAccess(key, "readwrite")) {
      throw new Error(`Access denied: cannot write Redis key '${key}'`);
    }
    return this.redis.rpush(key, ...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.enforcer.checkRedisAccess(key, "read")) {
      throw new Error(`Access denied: cannot read Redis key '${key}'`);
    }
    return this.redis.lrange(key, start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    if (!this.enforcer.checkRedisAccess(key, "readwrite")) {
      throw new Error(`Access denied: cannot write Redis key '${key}'`);
    }
    return this.redis.ltrim(key, start, stop);
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.enforcer.checkRedisAccess(key, "readwrite")) {
      throw new Error(`Access denied: cannot set expiry on Redis key '${key}'`);
    }
    return this.redis.expire(key, seconds);
  }

  // Stream operations (scoped) — only available when underlying client supports them

  async xadd(key: string, id: string, fields: Record<string, string>, maxlen?: number): Promise<string> {
    if (!this.redis.xadd) throw new Error("Stream operations not supported by this Redis client");
    if (!this.enforcer.checkRedisAccess(key, "readwrite")) {
      throw new Error(`Access denied: cannot write to Redis stream '${key}'`);
    }
    return this.redis.xadd(key, id, fields, maxlen);
  }

  async xrange(key: string, start: string, end: string, count?: number): Promise<StreamEntry[]> {
    if (!this.redis.xrange) throw new Error("Stream operations not supported by this Redis client");
    if (!this.enforcer.checkRedisAccess(key, "read")) {
      throw new Error(`Access denied: cannot read Redis stream '${key}'`);
    }
    return this.redis.xrange(key, start, end, count);
  }

  async xlen(key: string): Promise<number> {
    if (!this.redis.xlen) throw new Error("Stream operations not supported by this Redis client");
    if (!this.enforcer.checkRedisAccess(key, "read")) {
      throw new Error(`Access denied: cannot read Redis stream '${key}'`);
    }
    return this.redis.xlen(key);
  }

  async xtrim(key: string, maxlen: number): Promise<number> {
    if (!this.redis.xtrim) throw new Error("Stream operations not supported by this Redis client");
    if (!this.enforcer.checkRedisAccess(key, "readwrite")) {
      throw new Error(`Access denied: cannot trim Redis stream '${key}'`);
    }
    return this.redis.xtrim(key, maxlen);
  }
}
