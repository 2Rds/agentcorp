import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { withCache } from "./semantic-cache.js";

// ─── Model aliases ───────────────────────────────────────────────────────────

export type ModelAlias =
  | "gemini"
  | "grok-fast";

/** Native provider model IDs (not OpenRouter format). */
export const MODEL_IDS: Record<ModelAlias, string> = {
  gemini: "gemini-3-flash-preview",
  "grok-fast": "grok-4-1-fast-non-reasoning",
};

/** Which provider each alias routes to. */
type Provider = "google" | "xai" | "openrouter";

const MODEL_PROVIDER: Record<ModelAlias, Provider> = {
  gemini: "google",
  "grok-fast": "xai",
};

// ─── AI Gateway helpers ──────────────────────────────────────────────────────

/** Whether AI Gateway is configured. */
function useGateway(): boolean {
  return !!(config.cfAccountId && config.cfGatewayId);
}

/** Whether Provider Keys are configured (gateway injects API keys at the edge). */
function useProviderKeys(): boolean {
  return useGateway() && !!config.cfAigToken;
}

function gatewayBase(provider: string): string {
  return `https://gateway.ai.cloudflare.com/v1/${config.cfAccountId}/${config.cfGatewayId}/${provider}`;
}

function getOpenRouterBaseURL(): string {
  if (useGateway()) return gatewayBase("openrouter");
  return "https://openrouter.ai/api/v1";
}

export function getGoogleBaseURL(): string {
  if (useGateway()) return gatewayBase("google-ai-studio");
  return "https://generativelanguage.googleapis.com";
}

export function getGrokBaseURL(): string {
  if (useGateway()) return gatewayBase("grok");
  return "https://api.x.ai";
}

export function getAnthropicBaseURL(): string {
  if (useGateway()) return gatewayBase("anthropic");
  return "https://api.anthropic.com";
}

// ─── Per-provider auth headers ──────────────────────────────────────────────

/**
 * Build auth headers for OpenRouter calls.
 * With Provider Keys: gateway auth token only (gateway injects OpenRouter key).
 * Without: direct OpenRouter API key.
 */
function getOpenRouterHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": "https://corp.blockdrive.co",
    "X-Title": "BlockDrive AgentCorp",
  };

  if (useProviderKeys()) {
    headers["cf-aig-authorization"] = `Bearer ${config.cfAigToken}`;
  } else {
    headers["Authorization"] = `Bearer ${config.openRouterApiKey}`;
  }

  return headers;
}

/**
 * Build auth headers for Anthropic calls.
 * With Provider Keys: gateway auth token only (gateway injects Anthropic key).
 * Without: direct Anthropic API key.
 */
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
 * Build auth headers for xAI/Grok calls (OpenAI-compatible).
 * With Provider Keys: gateway auth token only (gateway injects xAI key).
 * Without: direct xAI API key.
 */
function getGrokHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (useProviderKeys()) {
    headers["cf-aig-authorization"] = `Bearer ${config.cfAigToken}`;
  } else {
    headers["Authorization"] = `Bearer ${config.xaiApiKey}`;
  }

  return headers;
}

// ─── CF AI Gateway metadata, retry, and cache headers ───────────────────────

/**
 * Build CF AI Gateway control headers for a request.
 * Includes metadata (agentId + orgId), retry policy, and per-model caching.
 */
function getCfAigHeaders(model: ModelAlias | string, agentId: string): Record<string, string> {
  if (!useGateway()) return {};

  const headers: Record<string, string> = {
    "cf-aig-metadata": JSON.stringify({ agentId, cfAccountId: config.cfAccountId }),
    "cf-aig-max-attempts": "3",
    "cf-aig-backoff": "exponential",
    "cf-aig-retry-delay": "1000",
  };

  // Cache deterministic models at CF edge; skip for Opus and web search
  if (model === "gemini" || model === "grok-fast") {
    headers["cf-aig-cache-ttl"] = "3600";
  } else {
    headers["cf-aig-skip-cache"] = "true";
  }

  return headers;
}

/**
 * Log CF AI Gateway correlation headers from a response for debugging.
 */
function logCfAigCorrelation(response: Response, provider: string): void {
  const logId = response.headers.get("cf-aig-log-id");
  const eventId = response.headers.get("cf-aig-event-id");
  if (logId || eventId) {
    console.debug(`[CF AIG ${provider}] log-id=${logId ?? "n/a"} event-id=${eventId ?? "n/a"}`);
  }
}

// ─── Gemini SDK client (lazy init, routed through CF AIG) ───────────────────

let _geminiAI: GoogleGenAI | null = null;

/**
 * Get the GoogleGenAI SDK client, configured to route through CF AI Gateway
 * when available. Used by both chatCompletion (Gemini path) and embed().
 */
export function getGeminiAI(): GoogleGenAI | null {
  if (_geminiAI) return _geminiAI;

  // Provider Keys mode: gateway injects API key, but SDK still needs a placeholder
  const apiKey = config.googleAiApiKey || (useProviderKeys() ? "provider-keys" : "");
  if (!apiKey) return null;

  const opts: ConstructorParameters<typeof GoogleGenAI>[0] = { apiKey };

  // Route through CF AI Gateway when configured
  if (useGateway()) {
    opts.httpOptions = { baseUrl: getGoogleBaseURL() };
  }

  _geminiAI = new GoogleGenAI(opts);
  return _geminiAI;
}

/** Reset the cached Gemini SDK client (for testing). */
export function _resetGeminiAI(): void {
  _geminiAI = null;
}

// ─── Chat completion ─────────────────────────────────────────────────────────

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | { type: "image"; source: { type: string; media_type: string; data: string } }
  | { type: "document"; source: { type: string; media_type: string; data: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatCompletionOpts {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" } | { type: "text" };
  agentId?: string;
}

/**
 * Route a chat completion to its native provider via CF AI Gateway.
 * - "gemini" → Google AI Studio via @google/genai SDK
 * - "grok-fast" → xAI via OpenAI-compatible endpoint
 * - Unknown model IDs → OpenRouter fallback
 */
export async function chatCompletion(
  model: ModelAlias | string,
  messages: ChatMessage[],
  opts: ChatCompletionOpts = {},
): Promise<string> {
  const alias = model as ModelAlias;
  const provider = MODEL_PROVIDER[alias];
  const agentId = opts.agentId ?? "blockdrive-cfa";

  // Route Gemini through @google/genai SDK
  if (provider === "google") {
    return chatCompletionGemini(alias, messages, opts, agentId);
  }

  // Route Grok through native xAI endpoint (OpenAI-compatible)
  if (provider === "xai") {
    return chatCompletionGrok(alias, messages, opts, agentId);
  }

  // Unknown models → OpenRouter fallback
  return chatCompletionOpenRouter(model, messages, opts, agentId);
}

/**
 * Gemini chat completion via @google/genai SDK routed through CF AI Gateway.
 */
async function chatCompletionGemini(
  alias: ModelAlias,
  messages: ChatMessage[],
  opts: ChatCompletionOpts,
  agentId: string,
): Promise<string> {
  const ai = getGeminiAI();
  if (!ai) {
    // No Google AI API key and no Provider Keys — fall back to OpenRouter
    return chatCompletionOpenRouter(alias, messages, opts, agentId);
  }

  const modelId = MODEL_IDS[alias];

  // Extract system instructions
  const systemInstruction = messages
    .filter(m => m.role === "system")
    .map(m => typeof m.content === "string" ? m.content : JSON.stringify(m.content))
    .join("\n");

  // Convert ChatMessage[] to Gemini SDK contents format
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
    httpOptions: {
      headers: getCfAigHeaders(alias, agentId),
    },
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
    if (!text) {
      throw new Error(`${modelId} returned no content`);
    }
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini ${modelId} error: ${msg}`);
  }
}

/**
 * Grok chat completion via xAI native endpoint (OpenAI-compatible).
 */
async function chatCompletionGrok(
  alias: ModelAlias,
  messages: ChatMessage[],
  opts: ChatCompletionOpts,
  agentId: string,
): Promise<string> {
  const modelId = MODEL_IDS[alias];

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 8192,
  };

  if (opts.responseFormat) {
    body.response_format = opts.responseFormat;
  }

  const headers = {
    ...getGrokHeaders(),
    ...getCfAigHeaders(alias, agentId),
  };

  const response = await fetch(`${getGrokBaseURL()}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  logCfAigCorrelation(response, "grok");

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`xAI ${modelId} error (${response.status}): ${errText}`);
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

/**
 * OpenRouter chat completion (fallback for unknown models).
 */
async function chatCompletionOpenRouter(
  model: ModelAlias | string,
  messages: ChatMessage[],
  opts: ChatCompletionOpts,
  agentId: string,
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

  const headers = {
    ...getOpenRouterHeaders(),
    ...getCfAigHeaders(model, agentId),
  };

  const response = await fetch(`${getOpenRouterBaseURL()}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  logCfAigCorrelation(response, "openrouter");

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

export interface WebSearchCitation {
  title: string;
  url: string;
}

export interface WebSearchResult {
  content: string;
  citations: WebSearchCitation[];
}

/**
 * Search the web using Gemini Search Grounding (replaces Perplexity Sonar).
 * Uses google_search tool with @google/genai SDK.
 * Returns content with structured citations from groundingMetadata.
 */
export async function webSearch(
  query: string,
  opts: { maxTokens?: number; agentId?: string } = {},
): Promise<WebSearchResult> {
  const ai = getGeminiAI();
  if (!ai) {
    throw new Error("GOOGLE_AI_API_KEY is required for web search (Gemini Search Grounding)");
  }

  const agentId = opts.agentId ?? "blockdrive-cfa";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: query,
    config: {
      maxOutputTokens: opts.maxTokens ?? 2000,
      temperature: 0.1,
      tools: [{ googleSearch: {} }],
      httpOptions: {
        headers: {
          ...getCfAigHeaders("gemini", agentId),
          "cf-aig-skip-cache": "true", // Web search results must be fresh
        },
      },
    },
  });

  const text = response.text ?? "";

  // Parse grounding metadata for structured citations
  const citations: WebSearchCitation[] = [];
  const metadata = response.candidates?.[0]?.groundingMetadata;
  if (metadata?.groundingChunks) {
    for (const chunk of metadata.groundingChunks) {
      if (chunk.web?.title && chunk.web?.uri) {
        citations.push({ title: chunk.web.title, url: chunk.web.uri });
      }
    }
  }

  // Format content with inline citations if available
  let content = text;
  if (citations.length > 0) {
    content += "\n\n---\nSources:\n" + citations.map((c, i) => `[${i + 1}] ${c.title}: ${c.url}`).join("\n");
  }

  return { content, citations };
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

/**
 * Generate embeddings via Gemini Embedding 2 (1536-dim).
 * All Redis vector indexes (idx:memories, idx:llm_cache, idx:plugins) use 1536-dim.
 * @param taskType - RETRIEVAL_QUERY for search queries (default), RETRIEVAL_DOCUMENT for storage/indexing
 */
export async function embed(text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_QUERY"): Promise<number[]> {
  const ai = getGeminiAI();
  if (!ai) {
    throw new Error("GOOGLE_AI_API_KEY is required for embeddings (all indexes use 1536-dim Gemini Embedding 2)");
  }

  const embedPromise = ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: {
      taskType,
      outputDimensionality: 1536,
    },
  });

  // Timeout guard — prevent hung embedding requests
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
 * Extract structured JSON from a conversation using Gemini 3 Flash.
 * Parses the response as JSON; throws if the response is not valid JSON.
 * Wraps with semantic cache — identical structured prompts return cached results.
 */
export async function extractStructured<T>(
  messages: ChatMessage[],
  opts: ChatCompletionOpts = {},
): Promise<T> {
  // Build cache key from system + user prompt combined
  const cacheKey = messages.map(m => {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return `[${m.role}] ${content}`;
  }).join("\n");

  const text = await withCache(
    cacheKey,
    "gemini-3-flash-preview",
    () => chatCompletion("gemini", messages, {
      ...opts,
      responseFormat: { type: "json_object" },
      temperature: opts.temperature ?? 0.2,
    }),
  );

  if (!text.trim()) {
    throw new Error("LLM returned empty response — model may need higher max_tokens");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Batch processing (parallel dispatch) ────────────────────────────────────

export interface BatchProcessOpts {
  concurrency?: number;
  model?: ModelAlias;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Dispatch N items as parallel model calls with configurable concurrency.
 * Returns aggregated results. Failed items return null.
 */
export async function batchProcess<T>(
  items: string[],
  systemPrompt: string,
  opts: BatchProcessOpts = {},
): Promise<(T | null)[]> {
  const { concurrency = 20, model = "gemini", temperature = 0.2, maxTokens = 4096 } = opts;

  // Process in batches of `concurrency`
  const results: (T | null)[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (item) => {
        const text = await chatCompletion(model, [
          { role: "system", content: systemPrompt },
          { role: "user", content: item },
        ], { temperature, maxTokens, responseFormat: { type: "json_object" } });

        return JSON.parse(text) as T;
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error("Batch item failed:", result.reason);
        results.push(null);
      }
    }
  }

  const failureCount = results.filter(r => r === null).length;
  if (failureCount > 0) {
    console.error(`Batch processing: ${failureCount}/${items.length} items failed`);
  }
  if (failureCount === items.length && items.length > 0) {
    throw new Error(`Batch processing failed: all ${items.length} items returned errors`);
  }

  return results;
}
