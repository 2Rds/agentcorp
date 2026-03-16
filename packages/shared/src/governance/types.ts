/**
 * Governance Types — Dual-Mode AI Agent Governance
 *
 * Types for the governance system that gates agent actions through
 * CEO approval via the C-Suite Telegram group. Supports "startup"
 * mode (human-configured tripwires + async audit) and future
 * "enterprise" mode (CCA-managed policy enforcement).
 *
 * See: docs/waas/governance-architecture.md
 */

import type { AgentId } from "../agents.js";

// ─── Approval Categories ────────────────────────────────────────────────────

/** Categories of actions that can require CEO approval */
export type ApprovalCategory =
  | "external_communication"   // Outbound message to non-internal recipients
  | "marketing_activity"       // Content creation, campaigns
  | "social_media_post"        // X/Twitter, LinkedIn, any public social
  | "financial_commitment"     // Pricing, contracts, spending above threshold
  | "escalation"               // Inter-agent escalation
  | "spend_limit_exceeded";    // Daily API spend threshold breached

// ─── Governance Config ──────────────────────────────────────────────────────

/** Governance configuration — set by CEO/admins, not agents */
export interface GovernanceConfig {
  mode: "startup" | "enterprise";

  // ── Spend Controls ──
  /** USD per agent per day — alerts + blocks above this */
  spendLimitPerAgentPerDay: number;
  /** USD all agents combined per day */
  spendLimitGlobalPerDay: number;

  // ── Approval Requirements ── (#14: keyed on ApprovalCategory for type safety)
  /** Actions in these categories MUST be approved before execution */
  requireApproval: Record<ApprovalCategory, boolean>;

  // ── Logging ──
  /** Log all outbound messages to non-internal recipients */
  logExternalComms: boolean;
  /** Domains agents cannot contact */
  blockedExternalDomains: string[];

  // ── Alert Configuration ──
  alertChannel: "telegram" | "slack" | "email";
  /** Telegram chat ID for the C-Suite group */
  csuiteGroupChatId: string;
  /** Telegram user IDs authorized to approve/deny actions (empty = anyone in group) */
  authorizedApproverIds: number[];
  alertOnEscalation: boolean;
  alertOnExternalComms: boolean;
  /** Alert when an agent's daily spend limit is breached */
  alertOnSpendLimitBreached: boolean;

  // ── Audit Schedule ──
  auditCron: {
    enabled: boolean;
    /** IANA timezone (e.g., "America/New_York") */
    timezone: string;
    /** Hour for morning audit (0-23) */
    morningHour: number;
    /** Hour for evening audit (0-23) */
    eveningHour: number;
  };
}

// ─── Pending Approval ───────────────────────────────────────────────────────

/** Status of a pending approval request */
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

/**
 * A pending approval stored in Redis.
 * Created when an agent action requires CEO authorization.
 * Resolved when CEO taps Approve/Deny in the C-Suite Telegram group.
 */
export interface PendingApproval {
  /** UUID */
  id: string;
  /** Agent requesting approval */
  agentId: string;
  /** Agent display name (e.g., "Taylor") */
  agentName: string;
  /** Human-readable description of the action */
  action: string;
  /** What triggered the approval requirement */
  category: ApprovalCategory;
  /** The tool call that needs approval */
  toolName: string;
  /** Saved tool args to replay on approval */
  toolArgs: Record<string, unknown>;
  /** Organization ID */
  orgId: string;
  /** User ID that triggered the agent */
  userId: string;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Agent's own risk assessment */
  riskNote: string;
  /** Telegram message ID — null until sent (#16: no sentinel values) */
  telegramMessageId: number | null;
  /** C-Suite group chat ID */
  telegramChatId: string;
  status: ApprovalStatus;
  /** ISO timestamp */
  requestedAt: string;
  /** ISO timestamp, null if pending */
  resolvedAt: string | null;
  /** Name/ID of approver (e.g., "Sean") */
  resolvedBy: string | null;
}

// ─── Runtime validation (#5: type guard for Redis deserialization) ────────

/** Validate a parsed object is structurally a PendingApproval */
export function isPendingApproval(x: unknown): x is PendingApproval {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.agentId === "string" &&
    typeof o.agentName === "string" &&
    typeof o.action === "string" &&
    typeof o.category === "string" &&
    typeof o.toolName === "string" &&
    typeof o.status === "string" &&
    typeof o.requestedAt === "string" &&
    typeof o.orgId === "string"
  );
}

// ─── Spend Tracking ─────────────────────────────────────────────────────────

/** A single API spend event logged after each model response */
export interface SpendEvent {
  /** #17: typed agent ID */
  agentId: AgentId | (string & {});
  orgId: string;
  /** #17: model identifier */
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  /** ISO timestamp */
  timestamp: string;
}

// ─── Governance Decision (#20: discriminated union) ─────────────────────────

/** Result of a governance check */
export type GovernanceDecision =
  | { approved: true; message: string }
  | { approved: false; reason: string; message: string; approvalId?: string };
