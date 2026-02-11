import { config } from "../config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  memory: string;
  user_id?: string;
  agent_id?: string;
  app_id?: string;
  run_id?: string;
  metadata?: Record<string, unknown>;
  categories?: string[];
  immutable?: boolean;
  expiration_date?: string | null;
  created_at: string;
  updated_at: string;
  score?: number;
}

export interface MemoryEvent {
  id: string;
  event: "ADD" | "UPDATE" | "DELETE";
  data: { memory: string };
}

export interface GraphRelation {
  source: string;
  source_type: string;
  relationship: string;
  target: string;
  target_type: string;
  score?: number;
}

export interface GraphMemoryResponse {
  results: Memory[];
  relations: GraphRelation[];
  entities?: Array<{ name: string; type: string }>;
}

export interface AddOptions {
  user_id: string;
  agent_id?: string;
  run_id?: string;
  metadata?: Record<string, unknown>;
  enable_graph?: boolean;
  timestamp?: number;
  expiration_date?: string;
  immutable?: boolean;
  includes?: string;
  excludes?: string;
  custom_categories?: Array<Record<string, string>>;
  custom_instructions?: string;
  infer?: boolean;
}

export interface SearchOptions {
  filters: Record<string, unknown>;
  top_k?: number;
  rerank?: boolean;
  keyword_search?: boolean;
  filter_memories?: boolean;
  threshold?: number;
  fields?: string[];
}

export interface GetAllOptions {
  filters: Record<string, unknown>;
  page?: number;
  page_size?: number;
  output_format?: string;
  fields?: string[];
}

// ─── API Client ──────────────────────────────────────────────────────────────

const BASE_URL = "https://api.mem0.ai";

export function mem0Headers(): Record<string, string> {
  return {
    "Authorization": `Token ${config.mem0ApiKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

async function mem0Fetch<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Authorization": `Token ${config.mem0ApiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (method === "DELETE" && res.status === 204) {
    return { message: "Deleted" } as T;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Mem0 ${method} ${path} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Memory Operations ──────────────────────────────────────────────────────

/**
 * Add memories from messages. Mem0 auto-extracts facts, deduplicates,
 * and optionally builds graph relations.
 */
export async function addMemory(
  content: string | Array<{ role: string; content: string }>,
  options: AddOptions,
): Promise<MemoryEvent[]> {
  const messages = typeof content === "string"
    ? [{ role: "user", content }]
    : content;

  const body: Record<string, unknown> = {
    messages,
    user_id: options.user_id,
    ...(options.agent_id && { agent_id: options.agent_id }),
    ...(options.run_id && { run_id: options.run_id }),
    ...(options.metadata && { metadata: options.metadata }),
    ...(options.enable_graph != null && { enable_graph: options.enable_graph }),
    ...(options.timestamp != null && { timestamp: options.timestamp }),
    ...(options.expiration_date && { expiration_date: options.expiration_date }),
    ...(options.immutable != null && { immutable: options.immutable }),
    ...(options.includes && { includes: options.includes }),
    ...(options.excludes && { excludes: options.excludes }),
    ...(options.custom_categories && { custom_categories: options.custom_categories }),
    ...(options.custom_instructions && { custom_instructions: options.custom_instructions }),
    ...(options.infer != null && { infer: options.infer }),
  };

  return mem0Fetch<MemoryEvent[]>("/v1/memories/", "POST", body);
}

/**
 * Semantic search with optional reranking, keyword expansion, and filtering.
 */
export async function searchMemories(
  query: string,
  options: SearchOptions,
): Promise<Memory[]> {
  const body: Record<string, unknown> = {
    query,
    version: "v2",
    filters: options.filters,
    ...(options.top_k != null && { top_k: options.top_k }),
    ...(options.rerank != null && { rerank: options.rerank }),
    ...(options.keyword_search != null && { keyword_search: options.keyword_search }),
    ...(options.filter_memories != null && { filter_memories: options.filter_memories }),
    ...(options.threshold != null && { threshold: options.threshold }),
    ...(options.fields && { fields: options.fields }),
  };

  return mem0Fetch<Memory[]>("/v2/memories/search/", "POST", body);
}

/**
 * Get all memories with pagination and optional graph output.
 */
export async function getAllMemories(
  options: GetAllOptions,
): Promise<Memory[] | GraphMemoryResponse> {
  const body: Record<string, unknown> = {
    filters: options.filters,
    ...(options.page != null && { page: options.page }),
    ...(options.page_size != null && { page_size: options.page_size }),
    ...(options.output_format && { output_format: options.output_format }),
    ...(options.fields && { fields: options.fields }),
  };

  return mem0Fetch<Memory[] | GraphMemoryResponse>("/v2/memories/", "POST", body);
}

/**
 * Update a memory's text and/or metadata.
 */
export async function updateMemory(
  memoryId: string,
  text: string,
  metadata?: Record<string, unknown>,
): Promise<Memory> {
  return mem0Fetch<Memory>(`/v1/memories/${memoryId}/`, "PUT", {
    text,
    ...(metadata && { metadata }),
  });
}

/**
 * Delete a single memory by ID.
 */
export async function deleteMemory(memoryId: string): Promise<void> {
  await mem0Fetch<{ message: string }>(`/v1/memories/${memoryId}/`, "DELETE");
}

/**
 * Submit feedback on a memory to improve future retrieval quality.
 */
export async function feedbackMemory(
  memoryId: string,
  feedback: "POSITIVE" | "NEGATIVE" | "VERY_NEGATIVE" | null,
  reason?: string,
): Promise<void> {
  await mem0Fetch<unknown>(`/v1/memories/${memoryId}/feedback/`, "POST", {
    feedback,
    ...(reason && { feedback_reason: reason }),
  });
}

// ─── Convenience Wrappers (org-scoped) ──────────────────────────────────────

/**
 * Add a knowledge entry for an organization with smart defaults.
 * Automatically enables graph for relationship-heavy categories.
 */
export async function addOrgMemory(
  content: string | Array<{ role: string; content: string }>,
  organizationId: string,
  opts?: {
    agentId?: string;
    runId?: string;
    metadata?: Record<string, unknown>;
    enableGraph?: boolean;
    timestamp?: number;
    category?: string;
  },
): Promise<MemoryEvent[]> {
  const graphCategories = new Set([
    "fundraising", "investor_relations", "company_operations",
  ]);
  const shouldGraph = opts?.enableGraph ??
    (opts?.category ? graphCategories.has(opts.category) : false);

  return addMemory(content, {
    user_id: organizationId,
    agent_id: opts?.agentId,
    run_id: opts?.runId,
    metadata: {
      ...opts?.metadata,
      ...(opts?.category && { category: opts.category }),
    },
    enable_graph: shouldGraph,
    timestamp: opts?.timestamp,
  });
}

/**
 * Search org memories with advanced retrieval. Uses rerank + keyword by default.
 */
export async function searchOrgMemories(
  query: string,
  organizationId: string,
  opts?: {
    agentId?: string;
    runId?: string;
    limit?: number;
    rerank?: boolean;
    keywordSearch?: boolean;
    filterMemories?: boolean;
    threshold?: number;
    categories?: string[];
  },
): Promise<Memory[]> {
  const filters: Record<string, unknown> = { user_id: organizationId };
  if (opts?.agentId) filters.agent_id = opts.agentId;
  if (opts?.runId) filters.run_id = opts.runId;
  if (opts?.categories?.length) {
    filters.categories = { contains: opts.categories };
  }

  return searchMemories(query, {
    filters,
    top_k: opts?.limit ?? 10,
    rerank: opts?.rerank ?? true,
    keyword_search: opts?.keywordSearch ?? true,
    filter_memories: opts?.filterMemories,
    threshold: opts?.threshold,
  });
}

/**
 * Get all org memories with optional graph relations.
 */
export async function getAllOrgMemories(
  organizationId: string,
  opts?: {
    includeGraph?: boolean;
    page?: number;
    pageSize?: number;
  },
): Promise<Memory[] | GraphMemoryResponse> {
  return getAllMemories({
    filters: { user_id: organizationId },
    page: opts?.page ?? 1,
    page_size: opts?.pageSize ?? 100,
    output_format: opts?.includeGraph ? "v1.1" : undefined,
  });
}

/**
 * Get session-scoped memories (per conversation thread).
 */
export async function getSessionMemories(
  organizationId: string,
  runId: string,
  opts?: { limit?: number },
): Promise<Memory[]> {
  const result = await getAllMemories({
    filters: {
      AND: [
        { user_id: organizationId },
        { run_id: runId },
      ],
    },
    page_size: opts?.limit ?? 50,
  });
  return Array.isArray(result) ? result : result.results;
}

/**
 * Search across all agents' memories in a session (group chat pattern).
 */
export async function searchGroupMemories(
  query: string,
  organizationId: string,
  runId: string,
  opts?: { limit?: number },
): Promise<Memory[]> {
  return searchMemories(query, {
    filters: {
      AND: [
        { user_id: organizationId },
        { run_id: runId },
      ],
    },
    top_k: opts?.limit ?? 10,
    rerank: true,
    keyword_search: true,
  });
}
