import { CohereClientV2 } from "cohere-ai";
import { config } from "../config.js";

// ─── Singleton client ─────────────────────────────────────────────────────────

let client: CohereClientV2 | null = null;

function getClient(): CohereClientV2 | null {
  if (!config.cohereApiKey) return null;
  if (!client) {
    client = new CohereClientV2({ token: config.cohereApiKey });
  }
  return client;
}

/**
 * Check if Cohere is configured and available.
 */
export function isCohereAvailable(): boolean {
  return !!config.cohereApiKey;
}

// ─── Rerank ───────────────────────────────────────────────────────────────────

export interface RerankResult {
  index: number;
  relevanceScore: number;
}

/**
 * Rerank documents against a query using Cohere Rerank.
 */
export async function rerank(
  query: string,
  documents: string[],
  topN?: number,
  model: string = "rerank-v3.5",
): Promise<RerankResult[]> {
  const cohere = getClient();
  if (!cohere) return [];
  if (documents.length === 0) return [];

  if (documents.length === 1) {
    return [{ index: 0, relevanceScore: 1.0 }];
  }

  try {
    const response = await cohere.rerank({
      model,
      query,
      documents,
      topN: topN ?? documents.length,
    });

    return response.results.map((r) => ({
      index: r.index,
      relevanceScore: r.relevanceScore,
    }));
  } catch (err) {
    console.error("Cohere rerank failed:", err);
    return [];
  }
}
