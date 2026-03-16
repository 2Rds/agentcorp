/**
 * Agent Memory Server Client — TypeScript HTTP client for Redis AMS
 *
 * The Agent Memory Server (https://github.com/redis/agent-memory-server)
 * provides a two-tier cognitive memory system:
 *
 *   1. Working Memory (session-scoped): Messages, structured memories,
 *      summaries, and metadata that live within a conversation session.
 *
 *   2. Long-term Memory (persistent): Semantic search, topic modeling,
 *      entity recognition, and deduplication across all sessions.
 *
 * This client wraps the AMS REST API and implements the MemoryClient
 * interface for drop-in compatibility with the existing RedisMemoryClient.
 *
 * AMS auto-extracts:
 *   - Topics from conversations
 *   - Named entities (people, companies, products)
 *   - Conversation summaries
 *   - Deduplicates overlapping memories
 *
 * Deployment: Docker container on the Redis droplet (waas-redis-nyc1)
 *   docker run -p 8000:8000 \
 *     -e REDIS_URL=redis://localhost:6379 \
 *     -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
 *     -e GENERATION_MODEL=claude-sonnet-4-5-20250929 \
 *     -e EMBEDDING_MODEL=text-embedding-3-small \
 *     redislabs/agent-memory-server:latest \
 *     agent-memory api --host 0.0.0.0 --port 8000
 */

import type {
  MemoryClient,
  Memory,
  MemoryEvent,
  MemoryCategory,
  GraphMemoryResponse,
} from "./redis-memory.js";
import { Sentry } from "./observability.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentMemoryServerConfig {
  /** AMS base URL (e.g., "http://localhost:8000" or "http://10.116.0.2:8000") */
  baseUrl: string;
  /** Agent ID (used as default user namespace) */
  agentId: string;
  /** Organization ID (prepended to user_id for namespace isolation) */
  orgId?: string;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
  /** API key for AMS auth (optional — disabled in dev) */
  apiKey?: string;
}

export interface AMSLongTermMemory {
  id: string;
  text: string;
  user_id: string;
  memory_type?: string;
  topics?: string[];
  entities?: Array<{ name: string; label: string }>;
  created_at?: string;
  updated_at?: string;
  last_accessed?: string;
  namespace?: string;
  persisted_at?: string;
  id_?: string;
  dist?: number;
}

export interface AMSWorkingMemory {
  messages: AMSMessage[];
  memories: AMSStructuredMemory[];
  context?: string;
}

export interface AMSMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AMSStructuredMemory {
  id?: string;
  text: string;
  memory_type?: string;
  metadata?: Record<string, unknown>;
}

export interface AMSSearchResult {
  memories: AMSLongTermMemory[];
  total?: number;
}

// ─── Client Implementation ──────────────────────────────────────────────────

export class AgentMemoryServerClient implements MemoryClient {
  private baseUrl: string;
  private agentId: string;
  private orgId?: string;
  private timeoutMs: number;
  private apiKey?: string;

  constructor(config: AgentMemoryServerConfig) {
    // Strip trailing slash
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.agentId = config.agentId;
    this.orgId = config.orgId;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.apiKey = config.apiKey;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private buildUserId(userId: string): string {
    // Namespace: org:agentId:userId for full isolation
    const parts = [this.orgId, this.agentId, userId].filter(Boolean);
    return parts.join(":");
  }

  private buildOrgUserId(userId: string): string {
    // Org-level namespace (no agent prefix — for cross-agent search)
    return this.orgId ? `${this.orgId}:${userId}` : userId;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(`AMS ${method} ${path} failed (${res.status}): ${errText}`);
      }

      // DELETE returns no body
      if (res.status === 204 || method === "DELETE") {
        return undefined as T;
      }

      return await res.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── MemoryClient Interface Implementation ────────────────────────────

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
    const amsUserId = this.buildUserId(userId);
    const category = (opts?.metadata?.category as string) ?? "general";

    try {
      // If we have a runId, also add to working memory for session context
      if (opts?.runId) {
        await this.addToWorkingMemory(opts.runId, {
          text,
          memory_type: category,
          metadata: opts?.metadata,
        });
      }

      // Add to long-term memory
      const result = await this.request<{ id: string }>("POST", "/long-term-memory", {
        text,
        user_id: amsUserId,
        memory_type: category,
        namespace: opts?.agentId ?? this.agentId,
      });

      return [{
        id: result?.id ?? crypto.randomUUID(),
        event: "ADD" as const,
        data: { memory: text },
      }];
    } catch (err) {
      console.error("[AMS] addMemory failed:", err);
      Sentry.captureException(err);
      return [];
    }
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
    const amsUserId = this.buildUserId(userId);
    const limit = opts?.limit ?? 10;

    try {
      const params = new URLSearchParams({
        text: query,
        user_id: amsUserId,
        limit: String(limit),
      });

      if (opts?.agentId) {
        params.set("namespace", opts.agentId);
      }

      const result = await this.request<AMSSearchResult>(
        "GET",
        `/long-term-memory/search?${params.toString()}`,
      );

      return (result.memories ?? []).map(amsToMemory);
    } catch (err) {
      console.error("[AMS] searchMemories failed:", err);
      Sentry.captureException(err);
      return [];
    }
  }

  async getAllMemories(
    userId: string,
    opts?: { agentId?: string; limit?: number; enableGraph?: boolean },
  ): Promise<Memory[] | GraphMemoryResponse> {
    // AMS doesn't have a "get all" — use a broad search
    return this.searchMemories("*", userId, opts);
  }

  async updateMemory(memoryId: string, text: string): Promise<MemoryEvent[]> {
    try {
      await this.request("PUT", `/long-term-memory/${memoryId}`, { text });
      return [{ id: memoryId, event: "UPDATE" as const, data: { memory: text } }];
    } catch (err) {
      console.error("[AMS] updateMemory failed:", err);
      Sentry.captureException(err);
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    try {
      await this.request("DELETE", `/long-term-memory/${memoryId}`);
    } catch (err) {
      console.error("[AMS] deleteMemory failed:", err);
      Sentry.captureException(err);
    }
  }

  async feedbackMemory(_memoryId: string, _feedback: "positive" | "negative"): Promise<void> {
    // AMS doesn't support feedback scoring — no-op
  }

  // ─── Agent-Scoped Convenience Methods ─────────────────────────────────

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
    _agentId: string,
    conversationId: string,
    limit = 20,
  ): Promise<Memory[]> {
    try {
      const workingMemory = await this.getWorkingMemory(conversationId);
      const memories = (workingMemory.memories ?? []).slice(-limit);
      return memories.map((m, i) => ({
        id: m.id ?? `session-${i}`,
        memory: m.text,
        metadata: { category: m.memory_type ?? "session", ...m.metadata },
      }));
    } catch (err) {
      console.error("[AMS] getSessionMemories failed:", err);
      Sentry.captureException(err);
      return [];
    }
  }

  async searchCrossAgentMemories(
    orgId: string,
    query: string,
    limit = 10,
  ): Promise<Memory[]> {
    // Cross-agent: use org-level user_id without agent prefix
    const amsUserId = this.buildOrgUserId(orgId);

    try {
      const params = new URLSearchParams({
        text: query,
        user_id: amsUserId,
        limit: String(limit),
      });

      const result = await this.request<AMSSearchResult>(
        "GET",
        `/long-term-memory/search?${params.toString()}`,
      );

      return (result.memories ?? []).map(amsToMemory);
    } catch (err) {
      console.error("[AMS] searchCrossAgentMemories failed:", err);
      Sentry.captureException(err);
      return [];
    }
  }

  // ─── Working Memory (Session-Scoped) ──────────────────────────────────

  /**
   * Get the working memory for a session (conversation thread).
   */
  async getWorkingMemory(sessionId: string): Promise<AMSWorkingMemory> {
    try {
      return await this.request<AMSWorkingMemory>(
        "GET",
        `/sessions/${sessionId}/working-memory`,
      );
    } catch (err) {
      console.error("[AMS] getWorkingMemory failed:", err);
      Sentry.captureException(err);
      return { messages: [], memories: [] };
    }
  }

  /**
   * Add a message to the working memory for a session.
   */
  async addMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
  ): Promise<void> {
    try {
      await this.request("POST", `/sessions/${sessionId}/working-memory/messages`, {
        messages: [{ role, content }],
      });
    } catch (err) {
      console.error("[AMS] addMessage failed:", err);
      Sentry.captureException(err);
    }
  }

  /**
   * Add a structured memory to the session's working memory.
   */
  private async addToWorkingMemory(
    sessionId: string,
    memory: AMSStructuredMemory,
  ): Promise<void> {
    try {
      await this.request("POST", `/sessions/${sessionId}/working-memory/memories`, {
        memories: [memory],
      });
    } catch (err) {
      console.error("[AMS] addToWorkingMemory failed:", err);
      Sentry.captureException(err);
    }
  }

  // ─── Health Check ─────────────────────────────────────────────────────

  /**
   * Check if the AMS is reachable and healthy.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.request("GET", "/health");
      return true;
    } catch (err) {
      console.warn("[AMS] Health check failed:", (err as Error).message);
      return false;
    }
  }

  // ─── Memory Extraction ────────────────────────────────────────────────

  /**
   * Trigger memory extraction for a session.
   * AMS will analyze the session's working memory and extract
   * topics, entities, and summaries into long-term memory.
   */
  async extractMemories(sessionId: string): Promise<void> {
    try {
      await this.request("POST", `/sessions/${sessionId}/extract-memories`);
    } catch (err) {
      console.error("[AMS] extractMemories failed:", err);
      Sentry.captureException(err);
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert an AMS long-term memory to the MemoryClient Memory format.
 */
function amsToMemory(ams: AMSLongTermMemory): Memory {
  return {
    id: ams.id ?? ams.id_ ?? "",
    memory: ams.text,
    metadata: {
      memory_type: ams.memory_type,
      topics: ams.topics,
      entities: ams.entities,
      namespace: ams.namespace,
      dist: ams.dist,
    },
    created_at: ams.created_at,
    updated_at: ams.updated_at,
  };
}
