/**
 * Per-Agent Model Stacks
 *
 * Each agent gets Opus 4.6 as primary brain + curated support
 * models matching its specialty. No uniform orchestration — each
 * agent is purpose-built.
 *
 * Stack collapsed 2026-03-17: removed Sonar Deep, Command A,
 * Granite, and Grok Fast Reasoning. Gemini updated to 3 Flash
 * Preview. Grok Fast (non-reasoning) kept for CMA X/Twitter.
 */

import type { ModelStack } from "../types.js";
import {
  OPUS, GEMINI, SONAR, GROK_FAST,
  GEMINI_EMBED, COHERE_RERANK,
} from "./registry.js";

// ─── Executive Tier ─────────────────────────────────────────────────────────

/** Executive Assistant — calendar, email, scheduling, daily briefings */
export const EA_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI, SONAR],       // Google Search for scheduling + web research for briefings
  embedding: GEMINI_EMBED,
  reranker: COHERE_RERANK,
};

/** Chief Operating Agent — cross-department analysis, workforce management */
export const COA_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI],                       // Multimodal reports
  embedding: GEMINI_EMBED,
  reranker: COHERE_RERANK,
};

// ─── Department Heads ───────────────────────────────────────────────────────

/** Chief Financial Agent — financial modeling, investor docs, cap table */
export const CFA_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI],                       // Fast multimodal processing
  embedding: GEMINI_EMBED,
  reranker: COHERE_RERANK,
};

/** Investor Relations — market research, data room management */
export const IR_STACK: ModelStack = {
  primary: OPUS,
  support: [SONAR],                        // Web research + citations
  embedding: GEMINI_EMBED,
  reranker: COHERE_RERANK,
};

/** Chief Marketing Agent — content creation, trend research, X/Twitter */
export const CMA_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI, SONAR, GROK_FAST],    // Content + trend research + X/Twitter via Grok
  embedding: GEMINI_EMBED,
};

/** Chief Compliance Agent — regulatory analysis, governance, audit */
export const COMPLIANCE_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI],                       // Fast processing for compliance analysis
  embedding: GEMINI_EMBED,
  reranker: COHERE_RERANK,                 // Audit-read-all generates noisy cross-namespace results
};

/** Chief Legal Agent — contract analysis, legal research */
export const LEGAL_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI],                       // Fast processing for legal analysis
  embedding: GEMINI_EMBED,
  reranker: COHERE_RERANK,
};

/** Sales Manager — pipeline oversight, strategic calls, team orchestration */
export const SALES_MANAGER_STACK: ModelStack = {
  primary: OPUS,
  support: [SONAR, GEMINI],               // Prospect research + proposals
  embedding: GEMINI_EMBED,
};
/** @deprecated Use SALES_MANAGER_STACK */
export const SALES_STACK = SALES_MANAGER_STACK;

/** Sales Development Rep (SDR) — prospect research, Feature Store writes, CRM ops */
export const SDR_STACK: ModelStack = {
  primary: OPUS,
  support: [SONAR, GEMINI],               // Web research + fast processing
  embedding: GEMINI_EMBED,
  reranker: COHERE_RERANK,                 // Rerank prospect search results
};

// ─── Junior Agent Templates ─────────────────────────────────────────────────

/** Research junior — deep web research, citation gathering */
export const RESEARCH_JUNIOR_STACK: ModelStack = {
  primary: OPUS,
  support: [SONAR],                        // Web research + citations
  embedding: GEMINI_EMBED,
};

/** Data/Analyst junior — internal data analysis, report generation */
export const DATA_JUNIOR_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI],                       // Fast processing for data analysis
  embedding: GEMINI_EMBED,
};

/** Compliance/Audit junior — policy checking, audit trail review */
export const COMPLIANCE_JUNIOR_STACK: ModelStack = {
  primary: OPUS,
  support: [GEMINI],                       // Fast processing for compliance checks
  embedding: GEMINI_EMBED,
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
  "blockdrive-sales": SALES_MANAGER_STACK,
  "blockdrive-sdr": SDR_STACK,
  "research-junior": RESEARCH_JUNIOR_STACK,
  "data-junior": DATA_JUNIOR_STACK,
  "compliance-junior": COMPLIANCE_JUNIOR_STACK,
};
