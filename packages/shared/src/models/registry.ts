/**
 * Model Registry — The 8-model stack
 *
 * Final allocation decided 2026-03-04, updated 2026-03-04:
 * 1. Opus 4.6 — Brain (every agent) + Board Chairman
 * 2. Gemini 3.1 Pro — Multimodal + Google Search grounding
 * 3. Sonar Pro — Web research + citations (direct Perplexity)
 * 4. Sonar Deep Research — Multi-step deep research + reasoning (direct Perplexity)
 * 5. Cohere Command A — Enterprise RAG + Rerank
 * 6. IBM Granite 4.0 — Compliance engine via OpenRouter (not board member)
 * 7. Grok 4.1 Fast Reasoning — 2M context, budget reasoning, Board Member
 * 8. Grok 4.1 Fast Non-Reasoning — 2M context, ultra-fast processing
 *
 * Board of Directors (LLM Council): Opus (dual-role: participant + chairman),
 * Gemini, Grok, Sonar (members). Cohere excluded from board — free tier
 * reserved for RAG/rerank ops. Granite embedded with chairman as governance
 * advisor. Every board decision gets a compliance pass before synthesis.
 *
 * No Sonnet (token inefficiency negates cost savings with memory compounding).
 * No Chinese models (trust non-negotiable in blockchain/fintech).
 */

import type { ModelConfig } from "../types.js";

// ─── Primary Brain ──────────────────────────────────────────────────────────

export const OPUS: ModelConfig = {
  id: "claude-opus-4-6-20250929",
  provider: "anthropic",
  alias: "opus",
  capabilities: ["reasoning", "code", "multimodal"],
  pricing: { inputPerMillion: 15, outputPerMillion: 75 },
  contextWindow: 200_000,
  maxOutput: 64_000,
};

// ─── Support Models ─────────────────────────────────────────────────────────

export const GEMINI: ModelConfig = {
  id: "google/gemini-3.1-pro",
  provider: "openrouter",
  alias: "gemini",
  capabilities: ["multimodal", "search-grounding", "reasoning"],
  pricing: { inputPerMillion: 2, outputPerMillion: 12 },
  contextWindow: 1_000_000,
};

export const SONAR: ModelConfig = {
  id: "sonar-pro",
  provider: "perplexity",
  alias: "sonar",
  capabilities: ["web-search", "reasoning"],
  pricing: { inputPerMillion: 3, outputPerMillion: 15 },
  contextWindow: 200_000,
};

export const SONAR_DEEP: ModelConfig = {
  id: "sonar-deep-research",
  provider: "perplexity",
  alias: "sonar-deep",
  capabilities: ["web-search", "reasoning"],
  pricing: { inputPerMillion: 2, outputPerMillion: 8 },
  contextWindow: 128_000,
};

export const COMMAND_A: ModelConfig = {
  id: "command-a-08-2025",
  provider: "cohere",
  alias: "command-a",
  capabilities: ["rag", "reasoning", "code"],
  pricing: { inputPerMillion: 2.5, outputPerMillion: 10 },
  contextWindow: 256_000,
};

export const GRANITE: ModelConfig = {
  id: "ibm-granite/granite-4.0-h-micro",
  provider: "openrouter",
  alias: "granite",
  capabilities: ["compliance", "reasoning"],
  pricing: { inputPerMillion: 0.017, outputPerMillion: 0.11 },
  contextWindow: 131_000,
};

export const GROK_FAST_REASONING: ModelConfig = {
  id: "x-ai/grok-4-1-fast-reasoning",
  provider: "openrouter",
  alias: "grok-reason",
  capabilities: ["reasoning", "code"],
  pricing: { inputPerMillion: 0.20, outputPerMillion: 0.50 },
  contextWindow: 2_000_000,
};

export const GROK_FAST: ModelConfig = {
  id: "x-ai/grok-4-1-fast-non-reasoning",
  provider: "openrouter",
  alias: "grok-fast",
  capabilities: ["code", "reasoning"],
  pricing: { inputPerMillion: 0.20, outputPerMillion: 0.50 },
  contextWindow: 2_000_000,
};

// ─── Utility Models ─────────────────────────────────────────────────────────

export const COHERE_EMBED: ModelConfig = {
  id: "embed-v4.0",
  provider: "cohere",
  alias: "embed",
  capabilities: ["embedding"],
  pricing: { inputPerMillion: 0.1, outputPerMillion: 0 },
  contextWindow: 128_000,
};

export const COHERE_RERANK: ModelConfig = {
  id: "rerank-v4.0",
  provider: "cohere",
  alias: "rerank",
  capabilities: ["reranking"],
  pricing: { inputPerMillion: 2, outputPerMillion: 0 },
  contextWindow: 128_000,
};

/** All available models, indexed by alias */
export const MODEL_REGISTRY = {
  opus: OPUS,
  gemini: GEMINI,
  sonar: SONAR,
  "sonar-deep": SONAR_DEEP,
  "command-a": COMMAND_A,
  granite: GRANITE,
  "grok-reason": GROK_FAST_REASONING,
  "grok-fast": GROK_FAST,
  embed: COHERE_EMBED,
  rerank: COHERE_RERANK,
} as const;

export type ModelAlias = keyof typeof MODEL_REGISTRY;
