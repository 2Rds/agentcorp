import OpenAI from "openai";
import { config } from "../config.js";

export type ModelProvider = "kimi" | "gemini";

const clients: Partial<Record<ModelProvider, OpenAI>> = {};

function getClient(provider: ModelProvider): OpenAI {
  if (clients[provider]) return clients[provider]!;

  if (provider === "kimi") {
    if (!config.moonshotApiKey) throw new Error("MOONSHOT_API_KEY not configured");
    clients.kimi = new OpenAI({
      apiKey: config.moonshotApiKey,
      baseURL: "https://api.moonshot.ai/v1",
    });
    return clients.kimi;
  }

  if (provider === "gemini") {
    if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY not configured");
    clients.gemini = new OpenAI({
      apiKey: config.geminiApiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
    return clients.gemini;
  }

  throw new Error(`Unknown provider: ${provider}`);
}

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  kimi: "kimi-k2-0711-preview",
  gemini: "gemini-2.5-flash",
};

export interface ChatCompletionOpts {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" } | { type: "text" };
}

/**
 * Route a chat completion to Kimi K2 or Gemini via OpenAI-compatible API.
 */
export async function chatCompletion(
  provider: ModelProvider,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: ChatCompletionOpts = {}
): Promise<string> {
  const client = getClient(provider);
  const model = opts.model ?? DEFAULT_MODELS[provider];

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
  });

  const content = response.choices[0]?.message?.content;
  if (content == null) {
    throw new Error(`${provider} API returned no content (finish_reason: ${response.choices[0]?.finish_reason ?? "no choices"})`);
  }
  return content;
}

/**
 * Generate embeddings via Gemini text-embedding-004.
 */
export async function embed(text: string): Promise<number[]> {
  const client = getClient("gemini");

  const response = await client.embeddings.create({
    model: "text-embedding-004",
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Extract structured JSON from a conversation using Kimi K2.
 * Parses the response as JSON; throws if the response is not valid JSON.
 */
export async function extractStructured<T>(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: ChatCompletionOpts = {}
): Promise<T> {
  const text = await chatCompletion("kimi", messages, {
    ...opts,
    responseFormat: { type: "json_object" },
    temperature: opts.temperature ?? 0.2,
  });

  if (!text || text.trim() === "") {
    throw new Error("LLM returned empty response — expected JSON");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`);
  }
}
