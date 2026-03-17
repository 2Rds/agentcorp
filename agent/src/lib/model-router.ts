import { config } from "../config.js";

// ─── Model aliases ───────────────────────────────────────────────────────────

export type ModelAlias =
  | "gemini"
  | "sonar"
  | "grok-fast";

const MODEL_IDS: Record<ModelAlias, string> = {
  gemini: "google/gemini-3-flash-preview",
  sonar: "perplexity/sonar-pro",
  "grok-fast": "x-ai/grok-4-1-fast-non-reasoning",
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

function getOpenRouterBaseURL(): string {
  if (useGateway()) {
    return `https://gateway.ai.cloudflare.com/v1/${config.cfAccountId}/${config.cfGatewayId}/openrouter`;
  }
  return "https://openrouter.ai/api/v1";
}

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

export function getAnthropicBaseURL(): string {
  if (useGateway()) {
    return `https://gateway.ai.cloudflare.com/v1/${config.cfAccountId}/${config.cfGatewayId}/anthropic`;
  }
  return "https://api.anthropic.com";
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
}

/**
 * Route a chat completion to any model via OpenRouter (native fetch).
 * Use aliases ("gemini", "sonar", "grok-fast") or full model IDs.
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

// ─── Embeddings ──────────────────────────────────────────────────────────────

/**
 * Generate embeddings via Cohere embed-v4.0 (1536-dim).
 * All Redis vector indexes (idx:memories, idx:llm_cache, idx:plugins) use 1536-dim.
 */
export async function embed(text: string): Promise<number[]> {
  if (!config.cohereApiKey) {
    throw new Error("COHERE_API_KEY is required for embeddings (all indexes use 1536-dim Cohere embed-v4.0)");
  }

  const resp = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.cohereApiKey}`,
    },
    body: JSON.stringify({
      model: "embed-v4.0",
      texts: [text],
      input_type: "search_query",
      embedding_types: ["float"],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Cohere embed API error (${resp.status}): ${err}`);
  }

  const data = await resp.json() as { embeddings?: { float?: number[][] } };
  const embedding = data.embeddings?.float?.[0];
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`Cohere embed returned empty embedding (response: ${JSON.stringify(data).slice(0, 200)})`);
  }
  return embedding;
}

// ─── Structured extraction ───────────────────────────────────────────────────

/**
 * Extract structured JSON from a conversation using Gemini 3 Flash.
 * Parses the response as JSON; throws if the response is not valid JSON.
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
