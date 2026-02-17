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
 * Returns results sorted by relevance (highest first).
 *
 * Cross-encoder architecture: jointly processes query+document pairs,
 * capturing semantic relationships that independent embeddings miss.
 *
 * @param query - The search query
 * @param documents - Array of document strings to rerank
 * @param topN - Number of top results to return (default: all)
 * @param model - Rerank model to use (default: rerank-v3.5)
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

  // Single document doesn't need reranking
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
