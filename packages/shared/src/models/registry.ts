/**
 * Model Registry — The 6-model stack
 *
 * Collapsed 2026-03-17 from 8 models to 6:
 * 1. Opus 4.6 — Brain (every agent) + Board Chairman
 * 2. Gemini 3 Flash Preview — Fast multimodal + Google Search grounding
 * 3. Sonar Pro — Web research + citations (direct Perplexity)
 * 4. Grok 4.1 Fast Non-Reasoning — 2M context, ultra-fast processing
 * 5. Cohere embed-v4.0 — Embedding (1536-dim vectors)
 * 6. Cohere rerank-v4.0 — Reranking
 *
 * Removed: Sonar Deep Research (redundant with Sonar Pro), Command A
 * (free tier exhaustion risk), Granite (compliance handled by Opus),
 * Grok Fast Reasoning (non-reasoning variant sufficient).
 *
 * Board of Directors (LLM Council): Opus (dual-role: participant + chairman),
 * Gemini, Grok, Sonar (members). Cohere excluded from board — free tier
 * reserved for RAG/rerank ops. Gemini serves as governance advisor.
 *
 * No Sonnet (token inefficiency negates cost savings with memory compounding).
 * No Chinese models (trust non-negotiable in blockchain/fintech).
 */

import type { ModelConfig } from "../types.js";

// ─── Primary Brain ──────────────────────────────────────────────────────────

export const OPUS: ModelConfig = {
  id: "claude-opus-4-6",
  provider: "anthropic",
  alias: "opus",
  capabilities: ["reasoning", "code", "multimodal"],
  pricing: { inputPerMillion: 15, outputPerMillion: 75 },
  contextWindow: 200_000,
  maxOutput: 64_000,
};

// ─── Support Models ─────────────────────────────────────────────────────────

export const GEMINI: ModelConfig = {
  id: "google/gemini-3-flash-preview",
  provider: "openrouter",
  alias: "gemini",
  capabilities: ["multimodal", "search-grounding"],
  pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
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
  "grok-fast": GROK_FAST,
  embed: COHERE_EMBED,
  rerank: COHERE_RERANK,
} as const;

export type ModelAlias = keyof typeof MODEL_REGISTRY;
