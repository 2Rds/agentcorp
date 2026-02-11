import { supabaseAdmin } from "./supabase.js";
import { config } from "../config.js";
import { uploadToGeminiFiles, generateEmbedding } from "./gemini-client.js";

/**
 * Background indexer: processes a document for Gemini RAG.
 * 1. Downloads file from Supabase Storage
 * 2. Uploads to Gemini Files API
 * 3. Generates embedding via Gemini text-embedding-004
 * 4. Stores gemini_file_uri and embedding in documents table
 *
 * This is fire-and-forget — errors are logged but don't affect the main flow.
 */
export async function indexDocument(documentId: string, orgId: string): Promise<void> {
  if (!config.useGeminiVision || !config.geminiApiKey) return;

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

    // Upload to Gemini Files API
    const geminiFile = await uploadToGeminiFiles(buffer, mimeType, doc.name);

    // Generate embedding from file name + first chunk of content
    // For text-based files, use content; for binary, use name
    let embeddingText = doc.name;
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      embeddingText = `${doc.name}: ${buffer.toString("utf-8").slice(0, 2000)}`;
    }

    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(embeddingText);
    } catch (e) {
      console.error("Embedding generation failed:", e);
    }

    // Update document record
    const updates: Record<string, unknown> = {
      gemini_indexed_at: new Date().toISOString(),
    };

    if (geminiFile) {
      updates.gemini_file_uri = geminiFile.uri;
    }

    if (embedding && embedding.length > 0) {
      // pgvector expects array format: [0.1, 0.2, ...]
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

    console.log(`Indexed document: ${doc.name} (gemini: ${!!geminiFile}, embedding: ${!!embedding})`);
  } catch (e) {
    console.error("Document indexer error:", e);
  }
}

/**
 * Index up to 50 unindexed documents for an organization.
 * Useful for backfilling after enabling Gemini. Call repeatedly for larger backlogs.
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
