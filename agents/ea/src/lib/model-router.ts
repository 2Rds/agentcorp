import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

// ─── Gemini SDK (lazy init, routes through CF AI Gateway when configured) ────

let _geminiAI: GoogleGenAI | null | undefined;

export function getGeminiAI(): GoogleGenAI | null {
  if (_geminiAI !== undefined) return _geminiAI;

  const apiKey = config.googleAiApiKey || (config.cfAigToken ? "provider-keys" : "");
  if (!apiKey) {
    _geminiAI = null;
    return null;
  }

  const opts: ConstructorParameters<typeof GoogleGenAI>[0] = { apiKey };

  // Route through CF AI Gateway when configured
  if (config.cfAccountId && config.cfGatewayId) {
    opts.httpOptions = {
      baseUrl: `https://gateway.ai.cloudflare.com/v1/${config.cfAccountId}/${config.cfGatewayId}/google-ai-studio`,
    };
  }

  try {
    _geminiAI = new GoogleGenAI(opts);
  } catch (err) {
    console.error("Failed to initialize GoogleGenAI:", err);
    _geminiAI = null;
    return null;
  }
  return _geminiAI;
}

// ─── Model aliases ───────────────────────────────────────────────────────────

export type ModelAlias =
  | "gemini";

const MODEL_IDS: Record<ModelAlias, string> = {
  gemini: "gemini-3-flash-preview",
};

// ─── AI Gateway helpers ──────────────────────────────────────────────────────

function useGateway(): boolean {
  return !!(config.cfAccountId && config.cfGatewayId);
}

function useProviderKeys(): boolean {
  return useGateway() && !!config.cfAigToken;
}

function getOpenRouterBaseURL(): string {
  if (useGateway()) {
    return `https://gateway.ai.cloudflare.com/v1/${config.cfAccountId}/${config.cfGatewayId}/openrouter`;
  }
  return "https://openrouter.ai/api/v1";
}

function getOpenRouterHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": "https://ea.blockdrive.co",
    "X-Title": "BlockDrive EA",
  };

  if (useProviderKeys()) {
    headers["cf-aig-authorization"] = `Bearer ${config.cfAigToken}`;
  } else {
    headers["Authorization"] = `Bearer ${config.openRouterApiKey}`;
  }

  return headers;
}

export function getAnthropicHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };

  if (useProviderKeys()) {
    headers["cf-aig-authorization"] = `Bearer ${config.cfAigToken}`;
  } else {
    headers["x-api-key"] = config.anthropicApiKey;
  }

  return headers;
}

/**
 * Extra headers for the Anthropic SDK constructor (defaultHeaders).
 * Unlike getAnthropicHeaders(), this excludes headers the SDK manages
 * internally (x-api-key, Content-Type, anthropic-version) and only
 * includes CF AI Gateway headers (auth + metadata).
 */
export function getAnthropicSdkHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  if (useProviderKeys()) {
    headers["cf-aig-authorization"] = `Bearer ${config.cfAigToken}`;
  }

  if (useGateway()) {
    headers["cf-aig-metadata"] = JSON.stringify({ agentId: "blockdrive-ea" });
    headers["cf-aig-max-attempts"] = "3";
    headers["cf-aig-backoff"] = "exponential";
    headers["cf-aig-retry-delay"] = "1000";
    headers["cf-aig-skip-cache"] = "true";
  }

  return headers;
}

export function getAnthropicBaseURL(): string {
  if (useGateway()) {
    return `https://gateway.ai.cloudflare.com/v1/${config.cfAccountId}/${config.cfGatewayId}/anthropic`;
  }
  return "https://api.anthropic.com";
}

// ─── Chat completion ─────────────────────────────────────────────────────────

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatCompletionOpts {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" } | { type: "text" };
}

/**
 * Route a chat completion to its native provider.
 * - "gemini" → Google AI Studio via @google/genai SDK (through CF AIG when configured)
 * - Unknown models → OpenRouter fallback
 */
export async function chatCompletion(
  model: ModelAlias | string,
  messages: ChatMessage[],
  opts: ChatCompletionOpts = {},
): Promise<string> {
  // Route Gemini through @google/genai SDK
  if (model === "gemini") {
    const ai = getGeminiAI();
    if (ai) {
      const modelId = MODEL_IDS.gemini;
      const systemInstruction = messages
        .filter(m => m.role === "system")
        .map(m => typeof m.content === "string" ? m.content : JSON.stringify(m.content))
        .join("\n");

      const contents = messages
        .filter(m => m.role !== "system")
        .map(m => ({
          role: m.role === "assistant" ? "model" as const : "user" as const,
          parts: typeof m.content === "string"
            ? [{ text: m.content }]
            : m.content.map(part => {
                if (part.type === "text") return { text: part.text };
                if (part.type === "image_url") {
                  const match = part.image_url.url.match(/^data:(.+);base64,(.+)$/);
                  if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
                  return { text: `[image: ${part.image_url.url}]` };
                }
                return { text: JSON.stringify(part) };
              }),
        }));

      const geminiConfig: Record<string, unknown> = {
        maxOutputTokens: opts.maxTokens ?? 8192,
        temperature: opts.temperature ?? 0.3,
      };
      if (opts.responseFormat?.type === "json_object") {
        geminiConfig.responseMimeType = "application/json";
      }

      try {
        const response = await ai.models.generateContent({
          model: modelId,
          contents,
          config: {
            ...geminiConfig,
            ...(systemInstruction ? { systemInstruction } : {}),
          },
        });
        const text = response.text;
        if (!text) throw new Error(`${modelId} returned no content`);
        return text;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Gemini ${modelId} error: ${msg}`);
      }
    }
    // No Gemini SDK available — fall through to OpenRouter
  }

  // OpenRouter fallback for non-Gemini models or when Gemini SDK unavailable
  const modelId = MODEL_IDS[model as ModelAlias] ?? model;

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 8192,
  };

  if (opts.responseFormat) {
    body.response_format = opts.responseFormat;
  }

  const response = await fetch(`${getOpenRouterBaseURL()}/chat/completions`, {
    method: "POST",
    headers: getOpenRouterHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter ${modelId} error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (content == null) {
    throw new Error(
      `${modelId} returned no content (finish_reason: ${data.choices?.[0]?.finish_reason ?? "no choices"})`,
    );
  }
  return content;
}

// ─── Web Search (Gemini Search Grounding) ───────────────────────────────────

export interface WebSearchResult {
  content: string;
  citations: { title: string; url: string }[];
}

/**
 * Search the web using Gemini Search Grounding (replaces Perplexity Sonar).
 * Uses google_search tool with @google/genai SDK.
 */
export async function webSearch(
  query: string,
  opts: { maxTokens?: number; agentId?: string } = {},
): Promise<WebSearchResult> {
  const ai = getGeminiAI();
  if (!ai) {
    throw new Error("GOOGLE_AI_API_KEY is required for web search (Gemini Search Grounding)");
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: query,
    config: {
      maxOutputTokens: opts.maxTokens ?? 2000,
      temperature: 0.1,
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text ?? "";

  const citations: { title: string; url: string }[] = [];
  const metadata = response.candidates?.[0]?.groundingMetadata;
  if (metadata?.groundingChunks) {
    for (const chunk of metadata.groundingChunks) {
      if (chunk.web?.title && chunk.web?.uri) {
        citations.push({ title: chunk.web.title, url: chunk.web.uri });
      }
    }
  }

  let content = text;
  if (citations.length > 0) {
    content += "\n\n---\nSources:\n" + citations.map((c, i) => `[${i + 1}] ${c.title}: ${c.url}`).join("\n");
  }

  return { content, citations };
}

// ─── Embeddings (Gemini Embedding 2, 1536-dim) ──────────────────────────────

/**
 * Generate embeddings via Gemini Embedding 2 (1536-dim).
 * Matches the dimension used by idx:memories and idx:plugins indexes.
 * @param taskType - RETRIEVAL_QUERY for search queries (default), RETRIEVAL_DOCUMENT for storage/indexing
 */
export async function embed(text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_QUERY"): Promise<number[]> {
  const ai = getGeminiAI();
  if (!ai) {
    throw new Error("GOOGLE_AI_API_KEY is required for embeddings");
  }

  const embedPromise = ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: {
      taskType,
      outputDimensionality: 1536,
    },
  });

  const result = await Promise.race([
    embedPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini embed timed out after 30s")), 30_000),
    ),
  ]);

  const embedding = result.embeddings?.[0]?.values;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Gemini embed returned empty embedding");
  }
  return embedding;
}

// ─── Structured extraction ───────────────────────────────────────────────────

/**
 * Extract structured JSON from a conversation using Gemini.
 */
export async function extractStructured<T>(
  messages: ChatMessage[],
  opts: ChatCompletionOpts = {},
): Promise<T> {
  const text = await chatCompletion("gemini", messages, {
    ...opts,
    responseFormat: { type: "json_object" },
    temperature: opts.temperature ?? 0.2,
  });

  if (!text.trim()) {
    throw new Error("LLM returned empty response");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`);
  }
}
