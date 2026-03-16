/**
 * Governance Module — Dual-Mode AI Agent Governance
 *
 * Exports types, defaults, and constants for the governance system
 * that gates agent actions through CEO approval via the C-Suite
 * Telegram group.
 */

// Types
export type {
  ApprovalCategory,
  ApprovalStatus,
  GovernanceConfig,
  PendingApproval,
  SpendEvent,
  GovernanceDecision,
} from "./types.js";

// Runtime validation
export { isPendingApproval } from "./types.js";

// Defaults & constants
export {
  BLOCKDRIVE_GOVERNANCE,
  validateGovernanceConfig,
  APPROVAL_TTL_SECONDS,
  APPROVAL_KEY_PREFIX,
  SPEND_KEY_PREFIX,
  APPROVAL_TIMEOUT_MS,
} from "./defaults.js";
