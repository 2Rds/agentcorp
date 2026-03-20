/**
 * Model Router — Multi-provider dispatch
 *
 * Routes model calls to the correct provider based on ModelConfig.provider.
 * Handles: Anthropic (direct), OpenRouter (aggregator for Gemini, Grok),
 * Perplexity (direct), Google (Gemini Embedding), Cohere (rerank).
 *
 * Each provider client implements the same interface. The router dispatches
 * based on the model's provider field and tracks usage for cost analysis.
 */

import { GoogleGenAI } from "@google/genai";
import type {
  ModelConfig,
  ModelStack,
  ModelCapability,
  ModelProvider,
  ChatMessage,
  CompletionOptions,
  RouterCompletionOptions,
  CompletionResult,
  ProviderCredentials,
  UsageEvent,
} from "../types.js";

/** Default timeout for provider API calls (60 seconds) */
const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000;

// ─── Provider Client Interface ──────────────────────────────────────────────

export interface ProviderClient {
  readonly provider: ModelProvider;
  chatCompletion(
    modelId: string,
    messages: ChatMessage[],
    opts?: CompletionOptions,
  ): Promise<CompletionResult>;
}

// ─── Timeout Helper ─────────────────────────────────────────────────────────

function createTimeoutSignal(ms: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

// ─── Anthropic Provider ─────────────────────────────────────────────────────

export class AnthropicClient implements ProviderClient {
  readonly provider = "anthropic" as const;
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.anthropic.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chatCompletion(
    modelId: string,
    messages: ChatMessage[],
    opts?: CompletionOptions,
  ): Promise<CompletionResult> {
    const start = Date.now();
    const useCache = opts?.cacheControl !== undefined;
    const { signal, cleanup } = createTimeoutSignal(DEFAULT_PROVIDER_TIMEOUT_MS);

    try {
      // Separate system message from conversation
      const systemMsg = messages.find(m => m.role === "system");
      const conversationMsgs = messages.filter(m => m.role !== "system");

      // Build system param — content block array when caching, plain string otherwise
      let systemParam: unknown;
      if (systemMsg) {
        const cacheSystem = useCache && (opts.cacheControl!.system !== false);
        systemParam = cacheSystem
          ? [{ type: "text", text: systemMsg.content, cache_control: { type: "ephemeral" } }]
          : systemMsg.content;
      }

      // Build messages — add cache_control breakpoint on the last prefix message
      const prefixCount = useCache ? (opts.cacheControl!.prefixMessages ?? 0) : 0;
      const builtMessages = conversationMsgs.map((m, i) => {
        const isLastPrefix = prefixCount > 0 && i === prefixCount - 1 && i < conversationMsgs.length;
        if (isLastPrefix) {
          return {
            role: m.role,
            content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }],
          };
        }
        return { role: m.role, content: m.content };
      });

      const body: Record<string, unknown> = {
        model: modelId,
        max_tokens: opts?.maxTokens ?? 4096,
        messages: builtMessages,
      };
      if (systemParam !== undefined) body.system = systemParam;
      if (opts?.temperature !== undefined) body.temperature = opts.temperature;
      if (opts?.stop) body.stop_sequences = opts.stop;

      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${err}`);
      }

      const data = await res.json() as {
        content?: { type: string; text: string }[];
        model: string;
        usage?: {
          input_tokens: number;
          output_tokens: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };

      if (!data.content || data.content.length === 0) {
        throw new Error(`Anthropic returned empty content for model ${modelId}`);
      }

      const cacheCreationTokens = data.usage?.cache_creation_input_tokens ?? 0;
      const cacheReadTokens = data.usage?.cache_read_input_tokens ?? 0;

      return {
        content: data.content.map(b => b.text).join(""),
        model: data.model,
        provider: "anthropic",
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
          cacheCreationTokens: cacheCreationTokens || undefined,
          cacheReadTokens: cacheReadTokens || undefined,
        },
        latencyMs: Date.now() - start,
        cached: cacheReadTokens > 0,
      };
    } finally {
      cleanup();
    }
  }
}

// ─── OpenRouter Provider ────────────────────────────────────────────────────

export class OpenRouterClient implements ProviderClient {
  readonly provider = "openrouter" as const;
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, cfGateway?: { accountId: string; gatewayId: string }) {
    this.apiKey = apiKey;
    this.baseUrl = cfGateway
      ? `https://gateway.ai.cloudflare.com/v1/${cfGateway.accountId}/${cfGateway.gatewayId}/openrouter`
      : "https://openrouter.ai/api/v1";
  }

  async chatCompletion(
    modelId: string,
    messages: ChatMessage[],
    opts?: CompletionOptions,
  ): Promise<CompletionResult> {
    const start = Date.now();
    const { signal, cleanup } = createTimeoutSignal(DEFAULT_PROVIDER_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model: modelId,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      };
      if (opts?.maxTokens) body.max_tokens = opts.maxTokens;
      if (opts?.temperature !== undefined) body.temperature = opts.temperature;
      if (opts?.stop) body.stop = opts.stop;
      if (opts?.responseFormat) body.response_format = opts.responseFormat;

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://blockdrive.co",
          "X-Title": "BlockDrive Orchestration",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenRouter API error (${res.status}): ${err}`);
      }

      const data = await res.json() as {
        choices?: { message: { content: string } }[];
        model: string;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      const orContent = data.choices?.[0]?.message?.content;
      if (orContent === undefined || orContent === null) {
        throw new Error(`OpenRouter returned no content for model ${modelId}`);
      }

      return {
        content: orContent,
        model: data.model,
        provider: "openrouter",
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
        latencyMs: Date.now() - start,
        cached: false,
      };
    } finally {
      cleanup();
    }
  }
}

// ─── Perplexity Provider ────────────────────────────────────────────────────

export class PerplexityClient implements ProviderClient {
  readonly provider = "perplexity" as const;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chatCompletion(
    modelId: string,
    messages: ChatMessage[],
    opts?: CompletionOptions,
  ): Promise<CompletionResult> {
    const start = Date.now();
    const { signal, cleanup } = createTimeoutSignal(DEFAULT_PROVIDER_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model: modelId,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      };
      if (opts?.maxTokens) body.max_tokens = opts.maxTokens;
      if (opts?.temperature !== undefined) body.temperature = opts.temperature;

      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Perplexity API error (${res.status}): ${err}`);
      }

      const data = await res.json() as {
        choices?: { message: { content: string } }[];
        model: string;
        usage?: { prompt_tokens: number; completion_tokens: number };
        citations?: string[];
      };

      const rawContent = data.choices?.[0]?.message?.content;
      if (rawContent === undefined || rawContent === null) {
        throw new Error(`Perplexity returned no content for model ${modelId}`);
      }

      // Append citations to content if present
      let content = rawContent;
      if (data.citations && data.citations.length > 0) {
        content += "\n\n---\nSources:\n" + data.citations.map((c, i) => `[${i + 1}] ${c}`).join("\n");
      }

      return {
        content,
        model: data.model,
        provider: "perplexity",
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
        latencyMs: Date.now() - start,
        cached: false,
      };
    } finally {
      cleanup();
    }
  }
}

// ─── Cohere Provider ────────────────────────────────────────────────────────

export class CohereDirectClient implements ProviderClient {
  readonly provider = "cohere" as const;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chatCompletion(
    modelId: string,
    messages: ChatMessage[],
    opts?: CompletionOptions,
  ): Promise<CompletionResult> {
    const start = Date.now();
    const { signal, cleanup } = createTimeoutSignal(DEFAULT_PROVIDER_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model: modelId,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      };
      if (opts?.maxTokens) body.max_tokens = opts.maxTokens;
      if (opts?.temperature !== undefined) body.temperature = opts.temperature;
      if (opts?.stop) body.stop_sequences = opts.stop;
      if (opts?.responseFormat) body.response_format = opts.responseFormat;

      const res = await fetch("https://api.cohere.com/v2/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Cohere API error (${res.status}): ${err}`);
      }

      const data = await res.json() as {
        message?: { content?: { type: string; text: string }[] };
        model?: string;
        usage?: { tokens?: { input_tokens: number; output_tokens: number } };
      };

      if (!data.message?.content || data.message.content.length === 0) {
        throw new Error(`Cohere returned empty content for model ${modelId}`);
      }

      return {
        content: data.message.content.map(b => b.text).join(""),
        model: modelId,
        provider: "cohere",
        usage: {
          inputTokens: data.usage?.tokens?.input_tokens ?? 0,
          outputTokens: data.usage?.tokens?.output_tokens ?? 0,
        },
        latencyMs: Date.now() - start,
        cached: false,
      };
    } finally {
      cleanup();
    }
  }
}

// ─── Embedding Result ───────────────────────────────────────────────────────

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  provider: ModelProvider;
}

// ─── Rerank Result ───────────────────────────────────────────────────────────

export interface RerankResult {
  index: number;
  relevanceScore: number;
}

// ─── Model Router ───────────────────────────────────────────────────────────

export class ModelRouter {
  private providers: Map<ModelProvider, ProviderClient>;
  private usageLog: UsageEvent[] = [];
  private stack?: ModelStack;
  private cohereApiKey?: string;
  private googleAi?: GoogleGenAI;

  constructor(creds: ProviderCredentials);
  constructor(stack: ModelStack, creds: ProviderCredentials);
  constructor(stackOrCreds: ModelStack | ProviderCredentials, maybeCreds?: ProviderCredentials) {
    this.providers = new Map();

    let creds: ProviderCredentials;
    if (maybeCreds) {
      this.stack = stackOrCreds as ModelStack;
      creds = maybeCreds;
    } else {
      creds = stackOrCreds as ProviderCredentials;
    }

    this.cohereApiKey = creds.cohereApiKey;
    if (creds.googleAiApiKey) {
      this.googleAi = new GoogleGenAI({ apiKey: creds.googleAiApiKey });
    }

    if (creds.anthropicApiKey) {
      this.providers.set("anthropic", new AnthropicClient(creds.anthropicApiKey));
    }
    if (creds.openRouterApiKey) {
      this.providers.set(
        "openrouter",
        new OpenRouterClient(creds.openRouterApiKey, creds.cfGateway),
      );
    }
    if (creds.perplexityApiKey) {
      this.providers.set("perplexity", new PerplexityClient(creds.perplexityApiKey));
    }
    if (creds.cohereApiKey) {
      this.providers.set("cohere", new CohereDirectClient(creds.cohereApiKey));
    }
  }

  /** Direct model call — caller specifies exact model */
  async complete(
    model: ModelConfig,
    messages: ChatMessage[],
    opts?: RouterCompletionOptions,
  ): Promise<CompletionResult> {
    const client = this.providers.get(model.provider);
    if (!client) {
      throw new Error(`No client configured for provider: ${model.provider}`);
    }

    const result = await client.chatCompletion(model.id, messages, opts);

    // Track usage
    if (opts?.agentId) {
      this.trackUsage(opts.agentId, model, result);
    }

    return result;
  }

  /** Capability-based routing — find best model in stack for a capability */
  async completeWithCapability(
    stack: ModelStack,
    capability: ModelCapability,
    messages: ChatMessage[],
    opts?: RouterCompletionOptions,
  ): Promise<CompletionResult> {
    const allModels = [stack.primary, ...stack.support];
    const model = allModels.find(m => m.capabilities.includes(capability));

    if (!model) {
      throw new Error(
        `No model with capability '${capability}' in stack. ` +
        `Available: ${allModels.map(m => `${m.alias}[${m.capabilities.join(",")}]`).join(", ")}`,
      );
    }

    return this.complete(model, messages, opts);
  }

  /**
   * Generate an embedding vector for text.
   * Uses Gemini Embedding 2 (gemini-embedding-001) at 1536 dimensions.
   * Task type: RETRIEVAL_QUERY (optimized for search queries).
   */
  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.googleAi) {
      throw new Error("Google AI API key required for embeddings (GOOGLE_AI_API_KEY)");
    }

    const modelId = this.stack?.embedding?.id ?? "gemini-embedding-001";

    const result = await this.googleAi.models.embedContent({
      model: modelId,
      contents: text,
      config: {
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: 1536,
      },
    });

    const embedding = result.embeddings?.[0]?.values;
    if (!embedding || embedding.length === 0) {
      throw new Error("Gemini embed returned empty embedding");
    }

    return { embedding, model: modelId, provider: "google" };
  }

  /**
   * Rerank documents by relevance to a query.
   * Uses Cohere Rerank API directly.
   */
  async rerank(
    query: string,
    documents: string[],
    topN?: number,
  ): Promise<RerankResult[]> {
    if (!this.cohereApiKey) {
      throw new Error("Cohere API key required for reranking");
    }

    const rerankModelId = this.stack?.reranker?.id ?? "rerank-v4.0";
    const { signal, cleanup } = createTimeoutSignal(30_000);

    try {
      const res = await fetch("https://api.cohere.com/v2/rerank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cohereApiKey}`,
        },
        body: JSON.stringify({
          model: rerankModelId,
          query,
          documents,
          top_n: topN ?? documents.length,
        }),
        signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Cohere rerank API error (${res.status}): ${err}`);
      }

      const data = await res.json() as {
        results?: { index: number; relevance_score: number }[];
      };

      return (data.results ?? []).map(r => ({
        index: r.index,
        relevanceScore: r.relevance_score,
      }));
    } finally {
      cleanup();
    }
  }

  /** Get accumulated usage events (for cost tracking) */
  getUsageLog(): readonly UsageEvent[] {
    return this.usageLog;
  }

  /** Flush usage log and return events (for batch persistence) */
  flushUsageLog(): UsageEvent[] {
    const events = [...this.usageLog];
    this.usageLog = [];
    return events;
  }

  private trackUsage(agentId: string, model: ModelConfig, result: CompletionResult): void {
    const inputRate = model.pricing.inputPerMillion;
    const outputRate = model.pricing.outputPerMillion;

    // Base cost for non-cached input + output tokens
    let costUsd =
      (result.usage.inputTokens / 1_000_000) * inputRate +
      (result.usage.outputTokens / 1_000_000) * outputRate;

    // Anthropic prompt caching adjustments:
    // - Cache writes: 25% surcharge on input price
    // - Cache reads: 90% discount on input price (charged at 10%)
    // These tokens are already included in inputTokens, so we adjust the delta
    if (result.usage.cacheCreationTokens) {
      costUsd += (result.usage.cacheCreationTokens / 1_000_000) * inputRate * 0.25;
    }
    if (result.usage.cacheReadTokens) {
      costUsd -= (result.usage.cacheReadTokens / 1_000_000) * inputRate * 0.90;
    }

    // Safety floor — prevent negative cost from malformed API responses
    costUsd = Math.max(0, costUsd);

    this.usageLog.push({
      agentId,
      modelAlias: model.alias,
      provider: model.provider,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd,
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
      capability: model.capabilities[0] ?? "reasoning",
      cached: result.cached,
    });
  }
}
