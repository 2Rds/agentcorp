/**
 * Model Registry — The 5-model stack
 *
 * Collapsed from 6 to 5 models (2026-03-20):
 * 1. Opus 4.6 — Brain (every agent) + Board Chairman
 * 2. Gemini 3 Flash Preview — Fast multimodal + Google Search grounding + embeddings
 * 3. Grok 4.1 Fast Non-Reasoning — 2M context, ultra-fast processing
 * 4. Gemini Embedding 2 — Embedding (1536-dim vectors, MTEB 68.17)
 * 5. Cohere rerank-v4.0 — Reranking
 *
 * Removed: Sonar Pro replaced by Gemini Search Grounding (2026-03-20).
 * Cohere embed-v4.0 replaced by Gemini Embedding 2 (2026-03-20).
 *
 * Board of Directors (LLM Council): Opus (dual-role: participant + chairman),
 * Gemini (dual-role: member + governance advisor), Grok (member).
 * Cohere excluded from board — reserved for rerank ops.
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

/** @deprecated Use GEMINI with google_search tool — Sonar Pro replaced by Gemini Search Grounding (2026-03-20) */
export const SONAR = GEMINI;

export const GROK_FAST: ModelConfig = {
  id: "x-ai/grok-4-1-fast-non-reasoning",
  provider: "openrouter",
  alias: "grok-fast",
  capabilities: ["code", "reasoning"],
  pricing: { inputPerMillion: 0.20, outputPerMillion: 0.50 },
  contextWindow: 2_000_000,
};

// ─── Utility Models ─────────────────────────────────────────────────────────

export const GEMINI_EMBED: ModelConfig = {
  id: "gemini-embedding-001",
  provider: "google",
  alias: "embed",
  capabilities: ["embedding"],
  pricing: { inputPerMillion: 0.1, outputPerMillion: 0 },
  contextWindow: 8_192, // Max input tokens for embedding (not conversational context window)
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
  "grok-fast": GROK_FAST,
  embed: GEMINI_EMBED,
  rerank: COHERE_RERANK,
} as const;

export type ModelAlias = keyof typeof MODEL_REGISTRY;
