import { supabaseAdmin } from "./supabase.js";
import { config } from "../config.js";
import { uploadToGeminiFiles, generateEmbedding } from "./gemini-client.js";
import { setHashWithVector, deleteHash, isRedisAvailable } from "./redis-client.js";

const CHUNK_SIZE = 1500; // ~375 tokens per chunk
const CHUNK_OVERLAP = 200;

/**
 * Split text into overlapping chunks for embedding.
 */
function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + CHUNK_SIZE;

    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      const slice = text.slice(start, end + 100);
      const breakPoint = slice.lastIndexOf("\n\n");
      if (breakPoint > CHUNK_SIZE * 0.5) {
        end = start + breakPoint;
      } else {
        const sentenceBreak = slice.lastIndexOf(". ");
        if (sentenceBreak > CHUNK_SIZE * 0.5) {
          end = start + sentenceBreak + 1;
        }
      }
    }

    chunks.push(text.slice(start, Math.min(end, text.length)));
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

/**
 * Background indexer: processes a document for RAG via Redis vector search.
 * 1. Downloads file from Supabase Storage
 * 2. Uploads to Gemini Files API (if available)
 * 3. Chunks text content and generates embeddings
 * 4. Stores chunks + embeddings in Redis idx:documents
 * 5. Updates Supabase documents table with index metadata
 *
 * This is fire-and-forget — errors are logged but don't affect the main flow.
 */
export async function indexDocument(documentId: string, orgId: string): Promise<void> {
  if (!config.useGeminiVision) return;

  try {
    // Get document metadata
    const { data: doc, error } = await supabaseAdmin
      .from("documents")
      .select("id, name, mime_type, storage_path, gemini_file_uri")
      .eq("id", documentId)
      .eq("organization_id", orgId)
      .single();

    if (error || !doc) {
      console.error("Document indexer: doc not found:", error?.message);
      return;
    }

    // Skip if already indexed
    if (doc.gemini_file_uri) {
      console.log(`Document ${doc.name} already indexed`);
      return;
    }

    // Download file
    const { data: fileData, error: dlError } = await supabaseAdmin
      .storage
      .from("agent-documents")
      .download(doc.storage_path);

    if (dlError || !fileData) {
      console.error("Document indexer: download failed:", dlError?.message);
      return;
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const mimeType = doc.mime_type || "application/octet-stream";

    // Upload to Gemini Files API (still useful for grounded generation)
    const geminiFile = await uploadToGeminiFiles(buffer, mimeType, doc.name);

    // Extract text content for chunking
    let textContent = "";
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      textContent = buffer.toString("utf-8");
    } else {
      // For non-text files, use the document name as a minimal representation
      textContent = doc.name;
    }

    // Index into Redis if available
    let redisChunks = 0;
    if (isRedisAvailable() && textContent.length > 0) {
      const chunks = chunkText(textContent);
      let consecutiveFailures = 0;

      for (let i = 0; i < chunks.length; i++) {
        try {
          const chunkWithContext = `${doc.name}: ${chunks[i]}`;
          const embedding = await generateEmbedding(chunkWithContext, "RETRIEVAL_DOCUMENT");

          if (embedding.length > 0) {
            const chunkKey = `doc:${documentId}:${i}`;
            await setHashWithVector(chunkKey, {
              content: chunks[i],
              source: doc.name,
              org_id: orgId,
              document_id: documentId,
              chunk_index: String(i),
            }, embedding);
            redisChunks++;
          }
          consecutiveFailures = 0;
        } catch (e) {
          consecutiveFailures++;
          console.error(`Chunk ${i} embedding failed for ${doc.name}:`, e);
          if (consecutiveFailures >= 3) {
            console.error(`Aborting chunk embedding for ${doc.name}: ${consecutiveFailures} consecutive failures`);
            break;
          }
        }
      }
    }

    // Also generate a whole-document embedding for Supabase (backward compat)
    let embedding: number[] | null = null;
    try {
      const embeddingText = `${doc.name}: ${textContent.slice(0, 2000)}`;
      embedding = await generateEmbedding(embeddingText, "RETRIEVAL_DOCUMENT");
    } catch (e) {
      console.error("Embedding generation failed:", e);
    }

    // Update document record in Supabase
    const updates: Record<string, unknown> = {
      gemini_indexed_at: new Date().toISOString(),
    };

    if (geminiFile) {
      updates.gemini_file_uri = geminiFile.uri;
    }

    if (embedding && embedding.length > 0) {
      updates.embedding = JSON.stringify(embedding);
    }

    const { error: updateError } = await supabaseAdmin
      .from("documents")
      .update(updates)
      .eq("id", documentId);

    if (updateError) {
      console.error("Document indexer: update failed:", updateError.message);
      return;
    }

    console.log(`Indexed document: ${doc.name} (gemini: ${!!geminiFile}, redis chunks: ${redisChunks}, embedding: ${!!embedding})`);
  } catch (e) {
    console.error("Document indexer error:", e);
  }
}

/**
 * Remove all Redis chunks for a document (on deletion).
 */
export async function removeDocumentFromRedis(documentId: string): Promise<void> {
  if (!isRedisAvailable()) return;

  // Remove up to 100 chunks (more than enough for any document)
  for (let i = 0; i < 100; i++) {
    const deleted = await deleteHash(`doc:${documentId}:${i}`);
    if (!deleted) break;
  }
}

/**
 * Index up to 50 unindexed documents for an organization.
 * Useful for backfilling after enabling Gemini/Redis. Call repeatedly for larger backlogs.
 * Returns the number of documents attempted (not necessarily succeeded).
 */
export async function indexAllDocuments(orgId: string): Promise<number> {
  const { data: docs, error } = await supabaseAdmin
    .from("documents")
    .select("id")
    .eq("organization_id", orgId)
    .is("gemini_file_uri", null)
    .limit(50);

  if (error || !docs) return 0;

  let indexed = 0;
  for (const doc of docs) {
    await indexDocument(doc.id, orgId);
    indexed++;
  }

  return indexed;
}
