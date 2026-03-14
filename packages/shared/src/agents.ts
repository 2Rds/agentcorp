/**
 * Agent Configuration Registry
 *
 * Configurations for deployed cognitive agents in the BlockDrive
 * Agentic C-Suite. Additional agents (CMA, Compliance, Legal, Sales)
 * are defined in stacks and scopes but not yet wired here.
 * Each agent gets its model stack, namespace scope, channels,
 * knowledge-work-plugins, and org hierarchy position.
 */

import type { AgentConfig } from "./types.js";
import {
  EA_STACK, COA_STACK, CFA_STACK, IR_STACK,
  CMA_STACK, COMPLIANCE_STACK, LEGAL_STACK, SALES_STACK,
} from "./models/stacks.js";
import {
  EA_SCOPE, COA_SCOPE, CFA_SCOPE, IR_SCOPE,
  CMA_SCOPE, COMPLIANCE_SCOPE, LEGAL_SCOPE, SALES_SCOPE,
} from "./namespace/scopes.js";
import { AGENT_PLUGINS } from "./plugins.js";

// ─── Agent Configs (deployment order) ───────────────────────────────────────

/** Executive Assistant — Sean's direct report (dual-mode: cognitive + conversational) */
export const EA_CONFIG: AgentConfig = {
  id: "blockdrive-ea",
  name: "Executive Assistant",
  title: "Executive Assistant",
  tier: "executive",
  reportsTo: null,  // Reports directly to Sean
  namespace: "ea",
  modelStack: EA_STACK,
  scope: EA_SCOPE,
  channels: [
    { type: "web", channelId: "ea-dashboard", canSend: true },
    { type: "telegram", channelId: "blockdrive_ea_bot", canSend: true },
    { type: "slack", channelId: "blockdrive-ea", canSend: true },
    { type: "email", channelId: "ea@blockdrive.co", canSend: true },
    { type: "voice", channelId: "ea-phone", canSend: true },
  ],
  plugins: AGENT_PLUGINS["blockdrive-ea"]!,
  voice: {
    voiceId: "",  // Set via ELEVENLABS_VOICE_ID env var per deployment
    mode: "conversational",
    ttsModel: "eleven_flash_v2_5",
    sttModel: "scribe_v2_realtime",
    firstMessage: "Hi, this is Alex from BlockDrive. How can I help you?",
    maxCallDurationSecs: 600,
  },
};

/** Chief Operating Agent — VP/GM managing the workforce */
export const COA_CONFIG: AgentConfig = {
  id: "blockdrive-coa",
  name: "Chief Operating Agent",
  title: "Chief Operating Agent",
  tier: "executive",
  reportsTo: null,  // Reports directly to Sean
  namespace: "coa",
  modelStack: COA_STACK,
  scope: COA_SCOPE,
  channels: [
    { type: "web", channelId: "coa-dashboard", canSend: true },
    { type: "telegram", channelId: "blockdrive_coa_bot", canSend: true },
    { type: "slack", channelId: "blockdrive-coa", canSend: true },
  ],
  plugins: AGENT_PLUGINS["blockdrive-coa"]!,
};

/** Chief Financial Agent — financial modeling, investor docs */
export const CFA_CONFIG: AgentConfig = {
  id: "blockdrive-cfa",
  name: "Chief Financial Agent",
  title: "Chief Financial Agent",
  tier: "department-head",
  reportsTo: "blockdrive-coa",
  namespace: "cfa",
  modelStack: CFA_STACK,
  scope: CFA_SCOPE,
  channels: [
    { type: "web", channelId: "cfa-dashboard", canSend: true },
    { type: "telegram", channelId: "blockdrive_cfa_bot", canSend: true },
    { type: "slack", channelId: "blockdrive-cfa", canSend: true },
  ],
  plugins: AGENT_PLUGINS["blockdrive-cfa"]!,
};

/** Investor Relations — market research, data room (junior under CFA) */
export const IR_CONFIG: AgentConfig = {
  id: "blockdrive-ir",
  name: "Investor Relations",
  title: "Investor Relations Agent",
  tier: "junior",
  reportsTo: "blockdrive-cfa",
  namespace: "cfa",  // Same namespace as parent (CFA department)
  modelStack: IR_STACK,
  scope: IR_SCOPE,
  channels: [
    { type: "web", channelId: "ir-dashboard", canSend: true },
    { type: "telegram", channelId: "blockdrive_ir_bot", canSend: true },
    { type: "slack", channelId: "blockdrive-ir", canSend: true },
  ],
  plugins: AGENT_PLUGINS["blockdrive-ir"]!,
};

/** Chief Marketing Agent — content, campaigns, brand, X/Twitter */
export const CMA_CONFIG: AgentConfig = {
  id: "blockdrive-cma",
  name: "Chief Marketing Agent",
  title: "Chief Marketing Agent",
  tier: "department-head",
  reportsTo: "blockdrive-coa",
  namespace: "cma",
  modelStack: CMA_STACK,
  scope: CMA_SCOPE,
  channels: [
    { type: "web", channelId: "cma-dashboard", canSend: true },
    { type: "telegram", channelId: "blockdrive_cma_bot", canSend: true },
    { type: "slack", channelId: "blockdrive-cma", canSend: true },
  ],
  plugins: AGENT_PLUGINS["blockdrive-cma"]!,
};

/** Chief Compliance Officer — regulatory, governance, audit */
export const COMPLIANCE_CONFIG: AgentConfig = {
  id: "blockdrive-compliance",
  name: "Chief Compliance Officer",
  title: "Chief Compliance Officer",
  tier: "department-head",
  reportsTo: "blockdrive-coa",
  namespace: "compliance",
  modelStack: COMPLIANCE_STACK,
  scope: COMPLIANCE_SCOPE,
  channels: [
    { type: "web", channelId: "compliance-dashboard", canSend: true },
    { type: "telegram", channelId: "blockdrive_compliance_bot", canSend: true },
    { type: "slack", channelId: "blockdrive-compliance", canSend: true },
  ],
  plugins: AGENT_PLUGINS["blockdrive-compliance"]!,
};

/** Legal Counsel — contracts, IP, regulatory filings */
export const LEGAL_CONFIG: AgentConfig = {
  id: "blockdrive-legal",
  name: "Legal Counsel",
  title: "Legal Counsel",
  tier: "department-head",
  reportsTo: "blockdrive-coa",
  namespace: "legal",
  modelStack: LEGAL_STACK,
  scope: LEGAL_SCOPE,
  channels: [
    { type: "web", channelId: "legal-dashboard", canSend: true },
    { type: "telegram", channelId: "blockdrive_legal_bot", canSend: true },
    { type: "slack", channelId: "blockdrive-legal", canSend: true },
  ],
  plugins: AGENT_PLUGINS["blockdrive-legal"]!,
};

/** Head of Sales — pipeline, prospecting, proposals */
export const SALES_CONFIG: AgentConfig = {
  id: "blockdrive-sales",
  name: "Head of Sales",
  title: "Head of Sales",
  tier: "department-head",
  reportsTo: "blockdrive-coa",
  namespace: "sales",
  modelStack: SALES_STACK,
  scope: SALES_SCOPE,
  channels: [
    { type: "web", channelId: "sales-dashboard", canSend: true },
    { type: "telegram", channelId: "blockdrive_sales_bot", canSend: true },
    { type: "slack", channelId: "blockdrive-sales", canSend: true },
  ],
  plugins: AGENT_PLUGINS["blockdrive-sales"]!,
};

// ─── Agent Registry ─────────────────────────────────────────────────────────

/** All configured agents, indexed by ID */
export const AGENT_REGISTRY: Record<string, AgentConfig> = {
  "blockdrive-ea": EA_CONFIG,
  "blockdrive-coa": COA_CONFIG,
  "blockdrive-cfa": CFA_CONFIG,
  "blockdrive-ir": IR_CONFIG,
  "blockdrive-cma": CMA_CONFIG,
  "blockdrive-compliance": COMPLIANCE_CONFIG,
  "blockdrive-legal": LEGAL_CONFIG,
  "blockdrive-sales": SALES_CONFIG,
};

/** Get an agent's configuration or throw */
export function getAgentConfig(agentId: string): AgentConfig {
  const config = AGENT_REGISTRY[agentId];
  if (!config) throw new Error(`Unknown agent: ${agentId}`);
  return config;
}

/** Get all agents that report to a given agent */
export function getDirectReports(agentId: string): AgentConfig[] {
  return Object.values(AGENT_REGISTRY).filter(a => a.reportsTo === agentId);
}

/** Get the reporting chain from an agent up through its parent agents */
export function getChainOfCommand(agentId: string): AgentConfig[] {
  const chain: AgentConfig[] = [];
  let current: AgentConfig | undefined = AGENT_REGISTRY[agentId];
  while (current) {
    chain.push(current);
    current = current.reportsTo ? AGENT_REGISTRY[current.reportsTo] : undefined;
  }
  return chain;
}
