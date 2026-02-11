import OpenAI from "openai";
import { config } from "../config.js";

// ─── Single OpenRouter client ────────────────────────────────────────────────

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  client = new OpenAI({
    apiKey: config.openRouterApiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://cfo.blockdrive.co",
      "X-Title": "BlockDrive CFO",
    },
  });
  return client;
}

// ─── Model aliases ───────────────────────────────────────────────────────────

export type ModelAlias = "kimi" | "gemini" | "gemini-lite" | "sonar" | "grok";

const MODEL_IDS: Record<ModelAlias, string> = {
  kimi: "moonshotai/kimi-k2.5",
  gemini: "google/gemini-3-flash-preview",
  "gemini-lite": "google/gemini-2.5-flash-lite",
  sonar: "perplexity/sonar-pro",
  grok: "x-ai/grok-4",
};

// ─── Chat completion ─────────────────────────────────────────────────────────

export interface ChatCompletionOpts {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" } | { type: "text" };
}

/**
 * Route a chat completion to any model via OpenRouter.
 * Use aliases ("kimi", "gemini", "sonar") or full model IDs.
 */
export async function chatCompletion(
  model: ModelAlias | string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: ChatCompletionOpts = {},
): Promise<string> {
  const modelId = MODEL_IDS[model as ModelAlias] ?? model;

  const response = await getClient().chat.completions.create({
    model: modelId,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 8192,
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
  });

  const content = response.choices[0]?.message?.content;
  if (content == null) {
    throw new Error(`${modelId} returned no content (finish_reason: ${response.choices[0]?.finish_reason ?? "no choices"})`);
  }
  return content;
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

/**
 * Generate embeddings via OpenRouter.
 */
export async function embed(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: "google/text-embedding-004",
    input: text,
  });

  return response.data[0].embedding;
}

// ─── Structured extraction ───────────────────────────────────────────────────

/**
 * Extract structured JSON from a conversation using Kimi K2.5.
 * Parses the response as JSON; throws if the response is not valid JSON.
 */
export async function extractStructured<T>(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: ChatCompletionOpts = {},
): Promise<T> {
  const text = await chatCompletion("kimi", messages, {
    ...opts,
    responseFormat: { type: "json_object" },
    temperature: opts.temperature ?? 0.2,
  });

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`);
  }
}
