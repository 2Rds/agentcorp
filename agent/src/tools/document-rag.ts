import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { config } from "../config.js";
import { queryDocumentsWithGemini, generateEmbedding } from "../lib/gemini-client.js";
import { vectorSearch, hybridSearch, isRedisAvailable } from "../lib/redis-client.js";
import { rerank, isCohereAvailable } from "../lib/cohere-client.js";

export function documentRagTools(orgId: string) {
  const query_documents = tool(
    "query_documents",
    "Semantically search and query uploaded documents. Uses AI to find relevant passages and answer questions about document content with citations. Prefer this over read_document for questions about document content — it searches across all documents intelligently. Falls back to keyword search if semantic search is unavailable.",
    {
      query: z.string().describe("The question or search query about document content"),
      document_ids: z.array(z.string()).optional().describe("Optional: limit search to specific document IDs"),
    },
    async (args) => {
      try {
        // Strategy 1: Redis hybrid search (text + vector)
        if (isRedisAvailable()) {
          try {
            const queryEmbedding = await generateEmbedding(args.query);
            if (queryEmbedding.length > 0) {
              const orgFilter = `@org_id:{${orgId.replace(/-/g, "\\-")}}`;

              // Try hybrid search first (text + vector + org filter), fall back to pure vector
              let results = await hybridSearch(
                "idx:documents",
                args.query,
                queryEmbedding,
                5,
                "content",
                orgFilter,
              );

              if (results.length === 0) {
                results = await vectorSearch("idx:documents", queryEmbedding, 5, orgFilter);
              }

              if (results.length > 0) {
                // Filter by document_ids if specified
                let filtered = results;
                if (args.document_ids && args.document_ids.length > 0) {
                  const allowedIds = new Set(args.document_ids);
                  filtered = results.filter(r => allowedIds.has(r.fields.document_id ?? ""));
                }

                if (filtered.length > 0) {
                  // Cohere Rerank: cross-encoder re-scoring for better relevance
                  if (filtered.length >= 2 && isCohereAvailable()) {
                    try {
                      const contents = filtered.map(r => r.fields.content ?? "");
                      const reranked = await rerank(args.query, contents, 5);
                      if (reranked.length > 0) {
                        filtered = reranked.map(r => filtered[r.index]);
                      }
                    } catch (err) {
                      console.error("Cohere rerank failed for document RAG (using vector order):", err);
                    }
                  }

                  const chunks = filtered.map((r, i) => {
                    const similarity = (1 - r.distance).toFixed(3);
                    return `**${r.fields.source ?? "Unknown"}** (chunk ${r.fields.chunk_index ?? "?"}, similarity: ${similarity})\n${r.fields.content ?? ""}`;
                  });

                  const sources = [...new Set(filtered.map(r => r.fields.source ?? "Unknown"))].join(", ");
                  return {
                    content: [{
                      type: "text" as const,
                      text: `## Relevant Document Passages (Redis hybrid search)\n\n${chunks.join("\n\n---\n\n")}\n\n**Sources:** ${sources}`,
                    }],
                  };
                }
              }
            }
          } catch (err) {
            console.error("Redis document search failed (falling back):", err);
          }
        }

        // Strategy 2: Gemini grounded generation with file URIs
        let docQuery = supabaseAdmin
          .from("documents")
          .select("id, name, mime_type, gemini_file_uri, embedding")
          .eq("organization_id", orgId);

        if (args.document_ids && args.document_ids.length > 0) {
          docQuery = docQuery.in("id", args.document_ids);
        }

        const { data: docs, error } = await docQuery;
        if (error) return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
        if (!docs || docs.length === 0) {
          return { content: [{ type: "text" as const, text: "No documents found. Upload documents first using the Knowledge page." }] };
        }

        const geminiDocs = docs.filter(d => d.gemini_file_uri);
        if (config.useGeminiVision && geminiDocs.length > 0) {
          const fileUris = geminiDocs.map(d => ({
            uri: d.gemini_file_uri!,
            mimeType: d.mime_type || "application/octet-stream",
          }));

          const answer = await queryDocumentsWithGemini(
            fileUris.slice(0, 10),
            args.query
          );

          const sourceNames = geminiDocs.slice(0, 10).map(d => d.name).join(", ");
          return {
            content: [{
              type: "text" as const,
              text: `## Answer (from ${geminiDocs.length} indexed documents)\n\n${answer}\n\n**Sources:** ${sourceNames}`,
            }],
          };
        }

        // Strategy 3: Supabase pgvector (legacy fallback — requires embeddings)
        if (config.googleAiApiKey || config.cfAigToken) {
          try {
            const queryEmbedding = await generateEmbedding(args.query);
            if (queryEmbedding.length > 0) {
              const { data: results, error: searchError } = await supabaseAdmin
                .rpc("match_documents", {
                  query_embedding: JSON.stringify(queryEmbedding),
                  match_threshold: 0.5,
                  match_count: 5,
                  org_id: orgId,
                });

              if (!searchError && results && results.length > 0) {
                const formatted = results.map((r: any) =>
                  `**${r.name}** (score: ${r.similarity?.toFixed(3)})`
                ).join("\n");
                return {
                  content: [{
                    type: "text" as const,
                    text: `## Relevant Documents\n\n${formatted}\n\nUse \`read_document\` to read the full content of relevant documents.`,
                  }],
                };
              }
            }
          } catch (err: any) {
            const msg = err?.message ?? String(err);
            if (msg.includes("function") && msg.includes("does not exist")) {
              // pgvector RPC not deployed — expected, fall through
            } else {
              console.error("Semantic search failed (falling back to document list):", err);
            }
          }
        }

        // Strategy 4: Return document list for manual reading
        const docList = docs.map(d => `- **${d.name}** (id: ${d.id})`).join("\n");
        return {
          content: [{
            type: "text" as const,
            text: `Found ${docs.length} documents but semantic search is not available yet. Use \`read_document\` to read specific documents:\n\n${docList}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  return [query_documents];
}
