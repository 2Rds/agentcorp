/**
 * Agent Namespace Scopes
 *
 * Defines what each agent can access. Enforced at the tool factory
 * level — agents receive only the tools their scope permits.
 *
 * Principle: default deny. Agents access own namespace only unless
 * explicitly granted cross-namespace read (executives, compliance).
 */

import type { ToolScope } from "../types.js";

// Notion Database IDs (from BlockDrive HQ workspace, verified in memory/context/company.md)
const NOTION_INVESTOR_PIPELINE = "b6b305990a8a438d921867d1a8628f31";
const NOTION_DECISION_LOG = "492613a71ab443eba53553f086375d0d";
const NOTION_PROJECT_HUB = "4fa32110ae2b43b6839c1d25e84111fe";

// ─── Executive Tier (cross-namespace read) ──────────────────────────────────

export const EA_SCOPE: ToolScope = {
  tables: [
    { name: "user_profiles", access: "read" },
    { name: "organizations", access: "read" },
  ],
  notionDatabases: [
    { id: NOTION_INVESTOR_PIPELINE, access: "read" },
    { id: NOTION_DECISION_LOG, access: "readwrite" },
    { id: NOTION_PROJECT_HUB, access: "readwrite" },
  ],
  redisNamespaces: [
    { prefix: "blockdrive:ea:", access: "readwrite" },
    { prefix: "blockdrive:global:", access: "readwrite" },
    { prefix: "blockdrive:", access: "read" },       // Cross-namespace read
  ],
  memoryNamespaces: [
    { agentId: "blockdrive-ea", access: "readwrite" },
    { agentId: "*", access: "read" },                 // Executive read privilege
  ],
  externalApis: ["notion-mail", "notion-calendar", "slack"],
  canMessage: ["blockdrive-coa", "blockdrive-cfa", "blockdrive-cma", "blockdrive-legal", "blockdrive-sales"],
};

export const COA_SCOPE: ToolScope = {
  tables: [
    { name: "organizations", access: "read" },
    { name: "agent_usage_events", access: "readwrite" },
  ],
  notionDatabases: [
    { id: NOTION_INVESTOR_PIPELINE, access: "read" },
    { id: NOTION_DECISION_LOG, access: "readwrite" },
    { id: NOTION_PROJECT_HUB, access: "readwrite" },
  ],
  redisNamespaces: [
    { prefix: "blockdrive:coa:", access: "readwrite" },
    { prefix: "blockdrive:global:", access: "readwrite" },
    { prefix: "blockdrive:router:", access: "readwrite" },
    { prefix: "blockdrive:", access: "read" },       // Cross-namespace read
  ],
  memoryNamespaces: [
    { agentId: "blockdrive-coa", access: "readwrite" },
    { agentId: "*", access: "read" },                 // Executive read privilege
  ],
  externalApis: ["notion", "slack", "linear"],
  canMessage: ["blockdrive-ea", "blockdrive-cfa", "blockdrive-cma", "blockdrive-compliance", "blockdrive-legal", "blockdrive-sales"],
};

// ─── Department Heads (own namespace only) ──────────────────────────────────

export const CFA_SCOPE: ToolScope = {
  tables: [
    { name: "financial_model", access: "readwrite" },
    { name: "cap_table_entries", access: "readwrite" },
    { name: "documents", access: "readwrite" },
    { name: "organizations", access: "read" },
  ],
  notionDatabases: [
    { id: NOTION_INVESTOR_PIPELINE, access: "readwrite" },
    { id: NOTION_DECISION_LOG, access: "readwrite" },
    { id: NOTION_PROJECT_HUB, access: "read" },
  ],
  redisNamespaces: [
    { prefix: "blockdrive:cfa:", access: "readwrite" },
    { prefix: "blockdrive:global:", access: "read" },
  ],
  memoryNamespaces: [
    { agentId: "blockdrive-cfa", access: "readwrite" },
  ],
  externalApis: ["notion", "slack", "google-sheets"],
  canMessage: ["blockdrive-ea", "blockdrive-coa", "blockdrive-ir"],
};

export const IR_SCOPE: ToolScope = {
  tables: [
    { name: "investor_links", access: "readwrite" },
    { name: "documents", access: "read" },
    { name: "financial_model", access: "read" },
    { name: "cap_table_entries", access: "read" },
  ],
  notionDatabases: [
    { id: NOTION_INVESTOR_PIPELINE, access: "readwrite" },
    { id: NOTION_DECISION_LOG, access: "read" },
  ],
  redisNamespaces: [
    { prefix: "blockdrive:cfa:ir:", access: "readwrite" },
    { prefix: "blockdrive:cfa:", access: "read" },
    { prefix: "blockdrive:global:", access: "read" },
  ],
  memoryNamespaces: [
    { agentId: "blockdrive-ir", access: "readwrite" },
    { agentId: "blockdrive-cfa", access: "read" },  // Read parent dept
  ],
  externalApis: ["notion", "slack", "docsend"],
  canMessage: ["blockdrive-cfa"],
};

export const CMA_SCOPE: ToolScope = {
  tables: [
    { name: "organizations", access: "read" },
  ],
  notionDatabases: [
    { id: NOTION_PROJECT_HUB, access: "read" },
  ],
  redisNamespaces: [
    { prefix: "blockdrive:cma:", access: "readwrite" },
    { prefix: "blockdrive:global:", access: "read" },
  ],
  memoryNamespaces: [
    { agentId: "blockdrive-cma", access: "readwrite" },
  ],
  externalApis: ["notion", "slack"],
  canMessage: ["blockdrive-ea", "blockdrive-coa"],
};

export const COMPLIANCE_SCOPE: ToolScope = {
  tables: [
    { name: "escrow_audit_log", access: "read" },
    { name: "agent_usage_events", access: "read" },
    { name: "organizations", access: "read" },
  ],
  notionDatabases: [
    { id: NOTION_DECISION_LOG, access: "read" },
    { id: NOTION_PROJECT_HUB, access: "read" },
  ],
  redisNamespaces: [
    { prefix: "blockdrive:compliance:", access: "readwrite" },
    { prefix: "blockdrive:", access: "read" },       // Audit-read all namespaces
  ],
  memoryNamespaces: [
    { agentId: "blockdrive-compliance", access: "readwrite" },
    { agentId: "*", access: "read" },                 // Audit-read privilege
  ],
  externalApis: ["notion", "slack"],
  canMessage: ["blockdrive-coa"],
};

export const LEGAL_SCOPE: ToolScope = {
  tables: [
    { name: "documents", access: "read" },
    { name: "organizations", access: "read" },
  ],
  notionDatabases: [
    { id: NOTION_DECISION_LOG, access: "readwrite" },
  ],
  redisNamespaces: [
    { prefix: "blockdrive:legal:", access: "readwrite" },
    { prefix: "blockdrive:global:", access: "read" },
  ],
  memoryNamespaces: [
    { agentId: "blockdrive-legal", access: "readwrite" },
  ],
  externalApis: ["notion", "slack"],
  canMessage: ["blockdrive-ea", "blockdrive-coa"],
};

export const SALES_SCOPE: ToolScope = {
  tables: [
    { name: "organizations", access: "read" },
  ],
  notionDatabases: [
    { id: NOTION_INVESTOR_PIPELINE, access: "read" },
  ],
  redisNamespaces: [
    { prefix: "blockdrive:sales:", access: "readwrite" },
    { prefix: "blockdrive:global:", access: "read" },
  ],
  memoryNamespaces: [
    { agentId: "blockdrive-sales", access: "readwrite" },
  ],
  externalApis: ["notion", "slack"],
  canMessage: ["blockdrive-ea", "blockdrive-coa"],
};

// ─── Scope Registry ─────────────────────────────────────────────────────────

export const AGENT_SCOPES: Record<string, ToolScope> = {
  "blockdrive-ea": EA_SCOPE,
  "blockdrive-coa": COA_SCOPE,
  "blockdrive-cfa": CFA_SCOPE,
  "blockdrive-ir": IR_SCOPE,
  "blockdrive-cma": CMA_SCOPE,
  "blockdrive-compliance": COMPLIANCE_SCOPE,
  "blockdrive-legal": LEGAL_SCOPE,
  "blockdrive-sales": SALES_SCOPE,
};
