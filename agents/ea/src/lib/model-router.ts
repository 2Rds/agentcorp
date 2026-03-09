import { config } from "../config.js";

// ─── Model aliases ───────────────────────────────────────────────────────────

export type ModelAlias =
  | "gemini"
  | "sonar"
  | "granite";

const MODEL_IDS: Record<ModelAlias, string> = {
  gemini: "google/gemini-3.1-pro",
  sonar: "perplexity/sonar-pro",
  granite: "ibm-granite/granite-4.0-h-micro",
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

// ─── Embeddings ──────────────────────────────────────────────────────────────

/**
 * Generate embeddings via Cloudflare Workers AI (primary) with OpenRouter fallback.
 */
export async function embed(text: string): Promise<number[]> {
  if (config.cfAccountId && config.cfApiToken) {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.cfApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: [text] }),
      },
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Workers AI embedding error (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    const embedding = data.result?.data?.[0];
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error(`Workers AI returned no embedding`);
    }
    return embedding;
  }

  const resp = await fetch(`${getOpenRouterBaseURL()}/embeddings`, {
    method: "POST",
    headers: getOpenRouterHeaders(),
    body: JSON.stringify({
      model: "google/text-embedding-004",
      input: text,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenRouter embedding error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`OpenRouter returned no embedding`);
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
