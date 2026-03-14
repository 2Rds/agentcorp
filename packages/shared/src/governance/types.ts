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

  // ── Approval Requirements ──
  /** Actions in these categories MUST be approved before execution */
  requireApproval: {
    externalCommunications: boolean;
    marketingActivities: boolean;
    socialMediaPosts: boolean;
    financialCommitments: boolean;
    escalations: boolean;
  };

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
  /** Agent requesting approval (e.g., "blockdrive-cma") */
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
  /** Telegram message ID — links callback to the approval message */
  telegramMessageId: number;
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

// ─── Spend Tracking ─────────────────────────────────────────────────────────

/** A single API spend event logged after each model response */
export interface SpendEvent {
  agentId: string;
  orgId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  /** ISO timestamp */
  timestamp: string;
}

// ─── Governance Decision ────────────────────────────────────────────────────

/** Result of a governance check */
export interface GovernanceDecision {
  approved: boolean;
  reason?: string;
  /** Message to show the user/agent */
  message: string;
  /** If not approved, the pending approval ID */
  approvalId?: string;
}
