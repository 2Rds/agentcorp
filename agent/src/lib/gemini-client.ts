import { chatCompletion, embed } from "./model-router.js";

/**
 * Parse a document (image or PDF) using Gemini 3 Flash vision via OpenRouter.
 * Vision requires raw multipart content, so we use chatCompletion with a full model ID.
 */
export async function parseDocumentWithVision(
  buffer: Buffer,
  mimeType: string,
  prompt: string = "Extract ALL text, numbers, data, and content from this document. Preserve structure, headings, bullet points, and tables. Return only the extracted content.",
): Promise<string> {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // Vision multipart must go through the raw model ID; chatCompletion only accepts string content.
  // Use the OpenRouter client directly for this one case.
  const OpenAI = (await import("openai")).default;
  const { config } = await import("../config.js");
  const client = new OpenAI({
    apiKey: config.openRouterApiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://cfo.blockdrive.co",
      "X-Title": "BlockDrive CFO",
    },
  });

  const response = await client.chat.completions.create({
    model: "google/gemini-3-flash-preview",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: prompt },
      ],
    }],
    max_tokens: 8192,
    temperature: 0.1,
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * Upload a file to Gemini Files API for later use in grounded generation.
 * NOTE: Requires direct Gemini API access (not available through OpenRouter).
 */
export async function uploadToGeminiFiles(
  _buffer: Buffer,
  _mimeType: string,
  _displayName: string,
): Promise<{ uri: string; name: string } | null> {
  console.warn("Gemini Files API not available through OpenRouter — skipping upload");
  return null;
}

/**
 * Query documents using Gemini via OpenRouter.
 * Without Gemini Files API, falls back to a simple query.
 */
export async function queryDocumentsWithGemini(
  _fileUris: Array<{ uri: string; mimeType: string }>,
  question: string,
): Promise<string> {
  return chatCompletion("gemini", [
    {
      role: "user",
      content: `Answer the following question based on your knowledge. If you don't have enough context, say so.\n\nQuestion: ${question}`,
    },
  ], { maxTokens: 4096, temperature: 0.2 });
}

/**
 * Generate text embeddings. Delegates to model-router's embed function.
 */
export { embed as generateEmbedding };
