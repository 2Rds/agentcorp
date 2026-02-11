import { config } from "../config.js";
import type { MemoryClient as Mem0MemoryClient, Memory, SearchOptions } from "mem0ai";

let mem0Instance: Mem0MemoryClient | null = null;
let initPromise: Promise<Mem0MemoryClient | null> | null = null;

/**
 * Get the Mem0 client (lazy singleton). Returns null if not configured.
 * Uses dynamic import since mem0ai does async init in constructor.
 */
async function getMem0(): Promise<Mem0MemoryClient | null> {
  if (!config.useMem0 || !config.mem0ApiKey) return null;
  if (mem0Instance) return mem0Instance;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const { MemoryClient } = await import("mem0ai");
        mem0Instance = new MemoryClient({ apiKey: config.mem0ApiKey });
        console.log("Mem0 client initialized");
        return mem0Instance;
      } catch (e) {
        console.error("Failed to initialize Mem0 client:", e);
        initPromise = null;
        return null;
      }
    })();
  }

  return initPromise;
}

/**
 * Add a memory to Mem0 for an organization.
 */
export async function addMemory(
  content: string,
  organizationId: string,
  metadata?: Record<string, unknown>
): Promise<Memory[] | null> {
  const client = await getMem0();
  if (!client) return null;

  try {
    const result = await client.add(
      [{ role: "user", content }],
      { user_id: organizationId, metadata: metadata as Record<string, any> }
    );
    return result;
  } catch (e) {
    console.error("Mem0 add error:", e);
    return null;
  }
}

/**
 * Search memories for an organization.
 */
export async function searchMemories(
  query: string,
  organizationId: string,
  limit: number = 10
): Promise<Memory[]> {
  const client = await getMem0();
  if (!client) return [];

  try {
    return await client.search(query, { user_id: organizationId, limit } as SearchOptions);
  } catch (e) {
    console.error("Mem0 search error:", e);
    return [];
  }
}

/**
 * Get all memories for an organization.
 */
export async function getAllMemories(
  organizationId: string,
  limit: number = 100
): Promise<Memory[]> {
  const client = await getMem0();
  if (!client) return [];

  try {
    return await client.getAll({ user_id: organizationId, page_size: limit } as SearchOptions);
  } catch (e) {
    console.error("Mem0 getAll error:", e);
    return [];
  }
}

export type { Memory };
