import { chatCompletion, embed, getGeminiAI, MODEL_IDS } from "./model-router.js";
import type { Part } from "@google/genai";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ─── Vision / Document parsing ───────────────────────────────────────────────

/**
 * Parse a document (image or PDF) using Gemini vision.
 * Uses @google/genai SDK directly when GOOGLE_AI_API_KEY is set,
 * falls back to model-router chatCompletion otherwise.
 */
export async function parseDocumentWithVision(
  buffer: Buffer,
  mimeType: string,
  prompt: string = "Extract ALL text, numbers, data, and content from this document. Preserve structure, headings, bullet points, and tables. Return only the extracted content.",
): Promise<string> {
  const ai = getGeminiAI();

  if (!ai) {
    // Fallback: route through model-router (requires GOOGLE_AI_API_KEY or Provider Keys)
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    return chatCompletion("gemini", [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: prompt },
        ],
      },
    ], { maxTokens: 8192, temperature: 0.1 });
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_IDS.gemini,
      contents: [
        { inlineData: { data: buffer.toString("base64"), mimeType } },
        prompt,
      ],
      config: {
        maxOutputTokens: 8192,
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini vision returned no content");
    }
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini vision failed: ${msg}`);
  }
}

// ─── File API ────────────────────────────────────────────────────────────────

/**
 * Upload a file to Gemini Files API for later use in grounded generation.
 * Requires GOOGLE_AI_API_KEY (or CF_AIG_TOKEN for Provider Keys mode).
 * Returns null if the API key is not configured.
 */
export async function uploadToGeminiFiles(
  buffer: Buffer,
  mimeType: string,
  displayName: string,
): Promise<{ uri: string; name: string } | null> {
  const ai = getGeminiAI();
  if (!ai) {
    console.warn("Gemini Files API requires GOOGLE_AI_API_KEY — skipping upload");
    return null;
  }

  // SDK expects a file path — write buffer to temp file, upload, then clean up
  const tempPath = join(tmpdir(), `gemini-upload-${randomUUID()}`);
  try {
    await writeFile(tempPath, buffer, { mode: 0o600 });

    const uploaded = await ai.files.upload({
      file: tempPath,
      config: { mimeType, displayName },
    });

    if (!uploaded.name) {
      throw new Error("Gemini Files API returned incomplete response (missing name)");
    }

    // Poll until file processing completes (large files may take time)
    let file = uploaded;
    const maxWait = 60_000;
    const start = Date.now();
    while (file.state === "PROCESSING" && Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 2000));
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state === "FAILED") {
      throw new Error("Gemini file processing failed");
    }
    if (file.state !== "ACTIVE") {
      throw new Error("Gemini file processing timed out");
    }

    if (!file.uri) {
      throw new Error("Gemini Files API returned no URI after processing");
    }

    return { uri: file.uri, name: file.name! };
  } finally {
    // Clean up temp file (fire-and-forget)
    unlink(tempPath).catch(() => {});
  }
}

// ─── Document query with file URIs ──────────────────────────────────────────

/**
 * Query documents using Gemini with uploaded file URIs for grounded generation.
 * Uses @google/genai SDK directly when GOOGLE_AI_API_KEY is set,
 * falls back to a simple query via model-router otherwise.
 */
export async function queryDocumentsWithGemini(
  fileUris: Array<{ uri: string; mimeType: string }>,
  question: string,
): Promise<string> {
  const ai = getGeminiAI();

  if (!ai) {
    // Fallback: simple query without file context
    return chatCompletion("gemini", [
      {
        role: "user",
        content: `Answer the following question based on your knowledge. If you don't have enough context, say so.\n\nQuestion: ${question}`,
      },
    ], { maxTokens: 4096, temperature: 0.2 });
  }

  if (fileUris.length === 0) {
    throw new Error("queryDocumentsWithGemini requires at least one file URI");
  }

  // Build content parts: file references + question
  const parts: Array<Part | string> = fileUris.map(f => ({
    fileData: { fileUri: f.uri, mimeType: f.mimeType },
  }));
  parts.push(question);

  try {
    const response = await ai.models.generateContent({
      model: MODEL_IDS.gemini,
      contents: parts,
      config: {
        maxOutputTokens: 4096,
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned no content for document query");
    }
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini document query failed: ${msg}`);
  }
}

// ─── Embeddings (delegates to model-router — migration is Task #4) ──────────

/**
 * Generate text embeddings. Delegates to model-router's embed function.
 */
export { embed as generateEmbedding };
