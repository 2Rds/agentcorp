/**
 * Per-Agent Model Stacks
 *
 * Each agent gets Opus 4.6 as primary brain + curated support
 * models matching its specialty. No uniform orchestration — each
 * agent is purpose-built.
 *
 * Grok 4.1 Fast Reasoning added for agents needing 2M context
 * or budget reasoning. COA gets it for cross-department synthesis.
 *
 * Sonar Deep Research (direct Perplexity) added for IR and
 * Research juniors — multi-step deep research with reasoning
 * for investor reports, market analysis, and competitor intel.
 */

import type { ModelStack } from "../types.js";
import {
  OPUS, GEMINI, SONAR, SONAR_DEEP, COMMAND_A, GRANITE,
  GROK_FAST_REASONING, GROK_FAST,
  COHERE_EMBED, COHERE_RERANK,
} from "./registry.js";

// ─── Executive Tier ─────────────────────────────────────────────────────────

/** Executive Assistant — calendar, email, scheduling, daily briefings */
export const EA_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI, SONAR],       // Google Search for scheduling + web research for briefings
  embedding: COHERE_EMBED,
  reranker: COHERE_RERANK,
};

/** Chief Operating Agent — cross-department analysis, workforce management */
export const COA_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI, GROK_FAST_REASONING],  // Multimodal reports + 2M context for cross-dept synthesis
  embedding: COHERE_EMBED,
  reranker: COHERE_RERANK,
};

// ─── Department Heads ───────────────────────────────────────────────────────

/** Chief Financial Agent — financial modeling, investor docs, cap table */
export const CFA_STACK: ModelStack = {
  primary: OPUS,
  support: [COMMAND_A, GROK_FAST],         // Financial RAG + 2M context for large models
  embedding: COHERE_EMBED,
  reranker: COHERE_RERANK,
};

/** Investor Relations — market research, data room management */
export const IR_STACK: ModelStack = {
  primary: OPUS,
  support: [SONAR, SONAR_DEEP, COMMAND_A], // Quick research + deep research + doc RAG
  embedding: COHERE_EMBED,
  reranker: COHERE_RERANK,
};

/** Chief Marketing Agent — content creation, trend research */
export const CMA_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI, SONAR],               // Content + trend research
  embedding: COHERE_EMBED,
};

/** Chief Compliance Agent — regulatory analysis, governance, audit */
export const COMPLIANCE_STACK: ModelStack = {
  primary: OPUS,
  support: [GRANITE, COMMAND_A],           // ISO 42001 compliance + legal doc RAG
  embedding: COHERE_EMBED,
};

/** Legal Counsel — contract analysis, legal research */
export const LEGAL_STACK: ModelStack = {
  primary: OPUS,
  support: [COMMAND_A, GROK_FAST_REASONING],  // Legal RAG + 2M context for long contracts
  embedding: COHERE_EMBED,
  reranker: COHERE_RERANK,
};

/** Head of Sales — prospect research, proposals */
export const SALES_STACK: ModelStack = {
  primary: OPUS,
  support: [SONAR, GEMINI],               // Prospect research + proposals
  embedding: COHERE_EMBED,
};

// ─── Junior Agent Templates ─────────────────────────────────────────────────

/** Research junior — deep web research, citation gathering */
export const RESEARCH_JUNIOR_STACK: ModelStack = {
  primary: OPUS,
  support: [SONAR, SONAR_DEEP],           // Quick lookups + deep research
  embedding: COHERE_EMBED,
};

/** Data/Analyst junior — internal data analysis, report generation */
export const DATA_JUNIOR_STACK: ModelStack = {
  primary: OPUS,
  support: [COMMAND_A, GROK_FAST],         // RAG + 2M context for large datasets
  embedding: COHERE_EMBED,
};

/** Compliance/Audit junior — policy checking, audit trail review */
export const COMPLIANCE_JUNIOR_STACK: ModelStack = {
  primary: OPUS,
  support: [GRANITE],
  embedding: COHERE_EMBED,
};

// ─── Stack Registry ─────────────────────────────────────────────────────────

export const AGENT_STACKS: Record<string, ModelStack> = {
  "blockdrive-ea": EA_STACK,
  "blockdrive-coa": COA_STACK,
  "blockdrive-cfa": CFA_STACK,
  "blockdrive-ir": IR_STACK,
  "blockdrive-cma": CMA_STACK,
  "blockdrive-compliance": COMPLIANCE_STACK,
  "blockdrive-legal": LEGAL_STACK,
  "blockdrive-sales": SALES_STACK,
  "research-junior": RESEARCH_JUNIOR_STACK,
  "data-junior": DATA_JUNIOR_STACK,
  "compliance-junior": COMPLIANCE_JUNIOR_STACK,
};
