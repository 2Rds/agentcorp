import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

const googleAi = config.googleAiApiKey
  ? new GoogleGenAI({ apiKey: config.googleAiApiKey })
  : null;

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
 * Route a chat completion to any model via OpenRouter.
 */
export async function chatCompletion(
  model: ModelAlias | string,
  messages: ChatMessage[],
  opts: ChatCompletionOpts = {},
): Promise<string> {
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
  if (!googleAi) {
    throw new Error("GOOGLE_AI_API_KEY is required for web search (Gemini Search Grounding)");
  }

  const response = await googleAi.models.generateContent({
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
 * Task type: RETRIEVAL_QUERY (optimized for search queries).
 */
export async function embed(text: string): Promise<number[]> {
  if (!googleAi) {
    throw new Error("GOOGLE_AI_API_KEY is required for embeddings");
  }

  const result = await googleAi.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: {
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 1536,
    },
  });

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
