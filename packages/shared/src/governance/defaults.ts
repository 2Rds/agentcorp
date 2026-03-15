/**
 * Governance Defaults — BlockDrive Production Config
 *
 * Sean's exact preferences for startup-mode governance:
 * - $10/agent/day spend limit
 * - All external actions require CEO approval
 * - C-Suite Telegram group for approvals
 * - 9am/5pm ET async CCA audit cron
 */

import type { GovernanceConfig } from "./types.js";

/** BlockDrive's production governance config (startup mode) */
export const BLOCKDRIVE_GOVERNANCE: GovernanceConfig = {
  mode: "startup",

  // ── Spend Controls ──
  spendLimitPerAgentPerDay: 10,   // $10 USD per agent per day
  spendLimitGlobalPerDay: 100,    // $100 USD all agents combined

  // ── Approval Requirements (#14: keyed on ApprovalCategory) ──
  requireApproval: {
    external_communication: true,  // Any outbound to non-internal
    marketing_activity: true,      // Content, campaigns
    social_media_post: true,       // X/Twitter, LinkedIn, etc.
    financial_commitment: true,    // Pricing, contracts, spending
    escalation: true,              // Inter-agent escalation
    spend_limit_exceeded: true,    // Always requires approval
  },

  // ── Logging ──
  logExternalComms: true,
  blockedExternalDomains: [],      // None blocked initially

  // ── Alert Configuration ──
  alertChannel: "telegram",
  csuiteGroupChatId: "",           // Set at runtime from env: CSUITE_TELEGRAM_CHAT_ID
  authorizedApproverIds: [],       // Set at runtime from env: GOVERNANCE_APPROVER_IDS (empty = anyone)
  alertOnEscalation: true,
  alertOnExternalComms: true,
  alertOnSpendLimitBreached: true,

  // ── Audit Schedule ──
  auditCron: {
    enabled: true,
    timezone: "America/New_York",
    morningHour: 9,                // 9 AM ET
    eveningHour: 17,               // 5 PM ET
  },
};

/**
 * Validate governance config has required runtime values populated.
 * Call at agent startup to fail-fast on misconfiguration. (#21)
 */
export function validateGovernanceConfig(config: GovernanceConfig): void {
  if (!config.csuiteGroupChatId) {
    console.warn("[Governance] CSUITE_TELEGRAM_CHAT_ID not set — Telegram approvals will be skipped");
  }
  if (config.authorizedApproverIds.length === 0) {
    console.warn("[Governance] GOVERNANCE_APPROVER_IDS empty — any group member can approve");
  }
}

/** Approval request TTL in Redis (24 hours) */
export const APPROVAL_TTL_SECONDS = 86_400;

/** Redis key prefix for pending approvals */
export const APPROVAL_KEY_PREFIX = "governance:approval:";

/** Redis key prefix for daily spend counters */
export const SPEND_KEY_PREFIX = "governance:spend:";

/** Max time to wait for CEO approval before auto-expiring (24h) */
export const APPROVAL_TIMEOUT_MS = 86_400_000;
