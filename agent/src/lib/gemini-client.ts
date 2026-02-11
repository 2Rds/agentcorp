import { GoogleGenAI, type Part } from "@google/genai";
import { config } from "../config.js";

let genai: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY not configured");
  if (!genai) {
    genai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return genai;
}

/**
 * Parse a document (image or PDF) using Gemini Flash vision.
 * Accepts a buffer and mime type, returns extracted text.
 */
export async function parseDocumentWithVision(
  buffer: Buffer,
  mimeType: string,
  prompt: string = "Extract ALL text, numbers, data, and content from this document. Preserve structure, headings, bullet points, and tables. Return only the extracted content."
): Promise<string> {
  const ai = getGenAI();
  const base64 = buffer.toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: base64 } } as Part,
        { text: prompt } as Part,
      ],
    }],
    config: {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
  });

  return response.text ?? "";
}

/**
 * Upload a file to Gemini Files API for later use in grounded generation.
 * Returns the file URI for subsequent API calls.
 */
export async function uploadToGeminiFiles(
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<{ uri: string; name: string } | null> {
  const ai = getGenAI();

  try {
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    const file = await ai.files.upload({
      file: blob,
      config: { displayName },
    });

    if (!file.uri || !file.name) {
      console.error("Gemini file upload returned incomplete response:", JSON.stringify(file));
      return null;
    }
    return { uri: file.uri, name: file.name };
  } catch (e) {
    console.error("Gemini file upload error:", e);
    return null;
  }
}

/**
 * Query uploaded documents using Gemini with file references.
 * Takes file URIs and a question, returns grounded answer.
 */
export async function queryDocumentsWithGemini(
  fileUris: Array<{ uri: string; mimeType: string }>,
  question: string
): Promise<string> {
  const ai = getGenAI();

  const fileParts: Part[] = fileUris.map(f => ({
    fileData: { fileUri: f.uri, mimeType: f.mimeType },
  }));

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        ...fileParts,
        { text: `Based on the uploaded documents, answer the following question. Cite specific sections or page numbers when possible.\n\nQuestion: ${question}` } as Part,
      ],
    }],
    config: {
      maxOutputTokens: 4096,
      temperature: 0.2,
    },
  });

  return response.text ?? "";
}

/**
 * Generate text embeddings via Gemini text-embedding-004.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const ai = getGenAI();

  const response = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: text,
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini embedding API returned no embedding vectors");
  }
  return values;
}
