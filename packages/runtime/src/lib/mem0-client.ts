/**
 * mem0 API Client — Persistent Memory for Cognitive Agents
 *
 * Every agent gets org-scoped memory (addressable by agent_id) plus
 * session-scoped memory (addressable by conversation thread). The
 * client supports graph memory mode for relationship-heavy categories.
 *
 * Generalized from the CFO agent's mem0 integration.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  memory: string;
  hash?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface MemoryEvent {
  id: string;
  event: "ADD" | "UPDATE" | "DELETE" | "NOOP";
  data: { memory: string } | string;
}

export interface GraphRelation {
  source: string;
  target: string;
  relationship: string;
}

export interface GraphMemoryResponse {
  results: Memory[];
  relations?: GraphRelation[];
}

export interface Mem0Config {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
  /** Request timeout in ms (default: 15000) */
  timeoutMs?: number;
}

type MemoryCategory =
  | "financial"
  | "operational"
  | "strategic"
  | "investor"
  | "market"
  | "compliance"
  | "general";

// Relationship-heavy categories get graph memory enabled by default
const GRAPH_CATEGORIES = new Set<MemoryCategory>(["investor", "market", "strategic"]);

/** Default timeout for mem0 API requests (15 seconds) */
const DEFAULT_TIMEOUT_MS = 15_000;

// ─── Client ────────────────────────────────────────────────────────────────

export class Mem0Client {
  private apiKey: string;
  private baseUrl: string;
  private orgId?: string;
  private projectId?: string;
  private timeoutMs: number;

  constructor(config: Mem0Config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.mem0.ai/v1";
    this.orgId = config.organizationId;
    this.projectId = config.projectId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ─── Core Operations ────────────────────────────────────────────────────

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
    const body: Record<string, unknown> = {
      messages: [{ role: "user", content: text }],
      user_id: userId,
    };
    if (opts?.agentId) body.agent_id = opts.agentId;
    if (opts?.runId) body.run_id = opts.runId;
    if (opts?.metadata) body.metadata = opts.metadata;
    if (this.orgId) body.org_id = this.orgId;
    if (this.projectId) body.project_id = this.projectId;
    if (opts?.enableGraph) body.output_format = "v1.1";

    const res = await this.request("POST", "/memories/", body);
    // Handle both v1.0 ({results: MemoryEvent[]}) and v1.1 response formats
    const results = res.results;
    if (Array.isArray(results)) return results as MemoryEvent[];
    return [];
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
    const body: Record<string, unknown> = {
      query,
      user_id: userId,
      limit: opts?.limit ?? 10,
    };
    if (opts?.agentId) body.agent_id = opts.agentId;
    if (opts?.rerank !== false) body.rerank = true;
    if (opts?.keyword !== false) body.keyword_search = true;
    if (this.orgId) body.org_id = this.orgId;
    if (this.projectId) body.project_id = this.projectId;
    if (opts?.enableGraph) body.output_format = "v1.1";

    const res = await this.request("POST", "/memories/search/", body);
    return (res.results ?? []) as Memory[];
  }

  async getAllMemories(
    userId: string,
    opts?: { agentId?: string; limit?: number; enableGraph?: boolean },
  ): Promise<Memory[] | GraphMemoryResponse> {
    const params = new URLSearchParams({ user_id: userId });
    if (opts?.agentId) params.set("agent_id", opts.agentId);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (this.orgId) params.set("org_id", this.orgId);
    if (this.projectId) params.set("project_id", this.projectId);
    if (opts?.enableGraph) params.set("output_format", "v1.1");

    const res = await this.request("GET", `/memories/?${params.toString()}`);
    return (res.results ?? res) as Memory[] | GraphMemoryResponse;
  }

  async updateMemory(memoryId: string, text: string): Promise<MemoryEvent[]> {
    const res = await this.request("PUT", `/memories/${memoryId}/`, { text });
    return (res.results ?? []) as MemoryEvent[];
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await this.request("DELETE", `/memories/${memoryId}/`);
  }

  async feedbackMemory(memoryId: string, feedback: "positive" | "negative"): Promise<void> {
    await this.request("POST", `/memories/${memoryId}/feedback/`, { feedback });
  }

  // ─── Agent-Scoped Convenience Methods ────────────────────────────────────

  /**
   * Add memory scoped to an agent's organization context.
   * Automatically enables graph for relationship-heavy categories.
   */
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
      enableGraph: GRAPH_CATEGORIES.has(category),
    });
  }

  /**
   * Search memories scoped to an agent's organization.
   */
  async searchAgentMemories(
    agentId: string,
    orgId: string,
    query: string,
    limit = 10,
  ): Promise<Memory[]> {
    return this.searchMemories(query, orgId, { agentId, limit });
  }

  /**
   * Get session-scoped memories (conversation thread).
   */
  async getSessionMemories(
    agentId: string,
    conversationId: string,
    limit = 20,
  ): Promise<Memory[]> {
    const params = new URLSearchParams({
      agent_id: agentId,
      run_id: conversationId,
      limit: String(limit),
    });
    if (this.orgId) params.set("org_id", this.orgId);
    if (this.projectId) params.set("project_id", this.projectId);

    const res = await this.request("GET", `/memories/?${params.toString()}`);
    return (res.results ?? res) as Memory[];
  }

  /**
   * Search across all agents in an organization (cross-agent memory).
   * Used for inter-department knowledge sharing.
   */
  async searchCrossAgentMemories(
    orgId: string,
    query: string,
    limit = 10,
  ): Promise<Memory[]> {
    return this.searchMemories(query, orgId, { limit });
  }

  // ─── HTTP Transport ────────────────────────────────────────────────────

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Authorization": `Token ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (res.status === 429) {
        // Rate limited — throw specific error for caller to handle
        const retryAfter = res.headers.get("Retry-After");
        throw new Error(
          `mem0 API rate limited (429)${retryAfter ? ` — retry after ${retryAfter}s` : ""}`,
        );
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`mem0 API ${method} ${path} failed (${res.status}): ${text}`);
      }

      if (res.status === 204) return {};
      return res.json() as Promise<Record<string, unknown>>;
    } finally {
      clearTimeout(timer);
    }
  }
}
