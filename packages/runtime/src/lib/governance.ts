/**
 * Governance Engine — Spend Tracking + Approval Gates
 *
 * Core governance runtime for the C-Suite Telegram group approval flow.
 * Handles:
 *   - Daily spend tracking per agent (Redis counters with orgId scoping)
 *   - Pending approval management (Redis + Telegram inline keyboards)
 *   - Approval resolution from Telegram callback queries
 *   - Authorized approver enforcement
 *
 * Each agent instantiates its own GovernanceEngine. The engine is
 * independent of the Agent SDK — it works at the transport layer.
 *
 * See: docs/waas/governance-architecture.md
 */

import { randomUUID } from "node:crypto";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import type { RedisClientType } from "redis";
import type {
  GovernanceConfig,
  GovernanceDecision,
  PendingApproval,
  ApprovalCategory,
  SpendEvent,
} from "@waas/shared";
import {
  APPROVAL_KEY_PREFIX,
  SPEND_KEY_PREFIX,
  APPROVAL_TTL_SECONDS,
} from "@waas/shared";
import { Sentry } from "./observability.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GovernanceEngineConfig {
  /** Governance configuration (from BLOCKDRIVE_GOVERNANCE or override) */
  governance: GovernanceConfig;
  /** This agent's ID (e.g., "blockdrive-cma") */
  agentId: string;
  /** This agent's display name (e.g., "Taylor") */
  agentName: string;
  /** Redis client getter (from runtime) */
  getRedis: () => Promise<RedisClientType | null>;
}

export interface ApprovalRequest {
  category: ApprovalCategory;
  toolName: string;
  toolArgs: Record<string, unknown>;
  action: string;
  orgId: string;
  userId: string;
  estimatedCost?: number;
  riskNote?: string;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class GovernanceEngine {
  private config: GovernanceConfig;
  private agentId: string;
  private agentName: string;
  private getRedis: () => Promise<RedisClientType | null>;

  constructor(engineConfig: GovernanceEngineConfig) {
    this.config = engineConfig.governance;
    this.agentId = engineConfig.agentId;
    this.agentName = engineConfig.agentName;
    this.getRedis = engineConfig.getRedis;
  }

  // ─── Spend Tracking ────────────────────────────────────────────────────

  /**
   * Record a spend event after an agent response.
   * Increments the daily Redis counter for this agent (scoped by orgId).
   * Returns the new daily total and whether the limit is breached.
   *
   * Fail-open with Sentry alert when Redis is unavailable.
   */
  async recordSpend(event: SpendEvent): Promise<{ totalToday: number; limitBreached: boolean }> {
    const redis = await this.getRedis();
    if (!redis) {
      const msg = `[${this.agentId}] Governance DEGRADED: Redis unavailable — spend tracking disabled`;
      console.warn(msg);
      Sentry.captureMessage(msg, "warning");
      return { totalToday: 0, limitBreached: false };
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `${SPEND_KEY_PREFIX}${event.orgId}:${event.agentId}:${today}`;

    // INCRBYFLOAT returns the new value as a string
    const rawResult = await redis.incrByFloat(key, event.estimatedCostUsd);
    const newTotal = parseFloat(rawResult);

    // NaN guard — if Redis returns something unexpected, treat as 0
    if (isNaN(newTotal)) {
      console.error(`[${this.agentId}] Redis INCRBYFLOAT returned NaN for key ${key}`);
      Sentry.captureMessage(`INCRBYFLOAT returned NaN for ${key}`, "error");
      return { totalToday: 0, limitBreached: false };
    }

    // Always set TTL (idempotent, avoids race between INCRBYFLOAT and TTL check)
    await redis.expire(key, 172_800); // 48 hours

    return {
      totalToday: newTotal,
      limitBreached: newTotal >= this.config.spendLimitPerAgentPerDay,
    };
  }

  /**
   * Get the current daily spend for an agent.
   */
  async getDailySpend(orgId: string, agentId?: string): Promise<number> {
    const redis = await this.getRedis();
    if (!redis) return 0;

    const today = new Date().toISOString().slice(0, 10);
    const key = `${SPEND_KEY_PREFIX}${orgId}:${agentId ?? this.agentId}:${today}`;
    const val = await redis.get(key);
    if (!val) return 0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Check if the agent has breached its daily spend limit.
   * Call this before processing a new request.
   */
  async checkSpendLimit(orgId: string): Promise<GovernanceDecision> {
    const spent = await this.getDailySpend(orgId);
    if (spent >= this.config.spendLimitPerAgentPerDay) {
      return {
        approved: false,
        reason: "spend_limit_exceeded",
        message: `Daily spend limit reached ($${spent.toFixed(2)}/$${this.config.spendLimitPerAgentPerDay}). ` +
          `CEO approval required to continue.`,
      };
    }
    return { approved: true, message: "Spend within limits" };
  }

  // ─── Approval Gates ────────────────────────────────────────────────────

  /**
   * Check if an action requires approval based on the governance config.
   * Uses exhaustive switch (no default) so TypeScript catches new categories.
   */
  requiresApproval(category: ApprovalCategory): boolean {
    const r = this.config.requireApproval;
    switch (category) {
      case "external_communication": return r.externalCommunications;
      case "marketing_activity": return r.marketingActivities;
      case "social_media_post": return r.socialMediaPosts;
      case "financial_commitment": return r.financialCommitments;
      case "escalation": return r.escalations;
      case "spend_limit_exceeded": return true; // Always requires approval
    }
  }

  /**
   * Create a pending approval in Redis.
   * Returns the PendingApproval object.
   * Throws if Redis is unavailable (fail-closed for approvals).
   */
  async createApproval(request: ApprovalRequest): Promise<PendingApproval> {
    const approval: PendingApproval = {
      id: randomUUID(),
      agentId: this.agentId,
      agentName: this.agentName,
      action: request.action,
      category: request.category,
      toolName: request.toolName,
      toolArgs: request.toolArgs,
      orgId: request.orgId,
      userId: request.userId,
      estimatedCost: request.estimatedCost ?? 0,
      riskNote: request.riskNote ?? "",
      telegramMessageId: 0, // Set after sending Telegram message
      telegramChatId: this.config.csuiteGroupChatId,
      status: "pending",
      requestedAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
    };

    const redis = await this.getRedis();
    if (!redis) {
      const msg = `[${this.agentId}] Governance FAIL-CLOSED: Redis unavailable — cannot create approval`;
      console.error(msg);
      Sentry.captureMessage(msg, "error");
      throw new Error("Governance infrastructure unavailable — cannot process approval request");
    }

    await redis.set(
      `${APPROVAL_KEY_PREFIX}${approval.id}`,
      JSON.stringify(approval),
      { EX: APPROVAL_TTL_SECONDS },
    );

    return approval;
  }

  /**
   * Send an approval request to the C-Suite Telegram group.
   * Returns { sent: true, approval } on success, { sent: false, approval } on failure.
   */
  async sendApprovalToTelegram(
    approval: PendingApproval,
    bot: Bot,
  ): Promise<{ sent: boolean; approval: PendingApproval }> {
    const chatId = this.config.csuiteGroupChatId;
    if (!chatId) {
      console.warn(`[${this.agentId}] No C-Suite group chat ID configured — skipping Telegram approval`);
      return { sent: false, approval };
    }

    // Build the approval message
    const costLine = approval.estimatedCost > 0
      ? `\n💰 Est. cost: $${approval.estimatedCost.toFixed(2)}`
      : "";
    const riskLine = approval.riskNote
      ? `\n⚠️ Risk: ${escapeMarkdownV1(approval.riskNote)}`
      : "";

    const text =
      `🔔 *Approval Request*\n\n` +
      `*Agent:* ${escapeMarkdownV1(approval.agentName)} (${escapeMarkdownV1(approval.agentId)})\n` +
      `*Action:* ${escapeMarkdownV1(approval.action)}\n` +
      `*Category:* ${escapeMarkdownV1(formatCategory(approval.category))}\n` +
      `*Tool:* \`${approval.toolName}\`` +
      costLine +
      riskLine +
      `\n\n_ID: ${approval.id.slice(0, 8)}_`;

    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `gov:approve:${approval.id}`)
      .text("❌ Deny", `gov:deny:${approval.id}`);

    try {
      const sent = await bot.api.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });

      approval.telegramMessageId = sent.message_id;
      await this.updateApprovalInRedis(approval);
      return { sent: true, approval };
    } catch (mdErr) {
      console.error(`[${this.agentId}] Markdown send failed, trying plain text:`, mdErr);
      // Try plain text fallback
      try {
        const plainText =
          `🔔 Approval Request\n\n` +
          `Agent: ${approval.agentName} (${approval.agentId})\n` +
          `Action: ${approval.action}\n` +
          `Category: ${formatCategory(approval.category)}\n` +
          `Tool: ${approval.toolName}` +
          (approval.estimatedCost > 0 ? `\nEst. cost: $${approval.estimatedCost.toFixed(2)}` : "") +
          (approval.riskNote ? `\nRisk: ${approval.riskNote}` : "") +
          `\n\nID: ${approval.id.slice(0, 8)}`;

        const sent = await bot.api.sendMessage(chatId, plainText, {
          reply_markup: keyboard,
        });
        approval.telegramMessageId = sent.message_id;
        await this.updateApprovalInRedis(approval);
        return { sent: true, approval };
      } catch (fallbackErr) {
        console.error(`[${this.agentId}] Telegram send completely failed:`, fallbackErr);
        Sentry.captureException(fallbackErr);
        return { sent: false, approval };
      }
    }
  }

  /**
   * Full approval flow: check if approval is needed, create + send to Telegram.
   * Returns a GovernanceDecision.
   */
  async requestApproval(
    request: ApprovalRequest,
    bot?: Bot,
  ): Promise<GovernanceDecision> {
    if (!this.requiresApproval(request.category)) {
      return { approved: true, message: "No approval required for this category" };
    }

    const approval = await this.createApproval(request);

    let telegramSent = false;
    if (bot) {
      const result = await this.sendApprovalToTelegram(approval, bot);
      telegramSent = result.sent;
    }

    const telegramNote = telegramSent
      ? "A request has been sent to the C-Suite group."
      : "WARNING: Could not deliver approval request to Telegram. Contact CEO directly.";

    return {
      approved: false,
      reason: `Requires CEO approval (${formatCategory(request.category)})`,
      message: `This action requires CEO approval. ${telegramNote} ` +
        `Approval ID: ${approval.id.slice(0, 8)}`,
      approvalId: approval.id,
    };
  }

  // ─── Approval Resolution ───────────────────────────────────────────────

  /**
   * Get a pending approval from Redis.
   */
  async getApproval(approvalId: string): Promise<PendingApproval | null> {
    const redis = await this.getRedis();
    if (!redis) return null;

    const raw = await redis.get(`${APPROVAL_KEY_PREFIX}${approvalId}`);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as PendingApproval;
    } catch (err) {
      console.error(`[${this.agentId}] Corrupted approval data for ${approvalId}:`, err);
      Sentry.captureException(err);
      return null;
    }
  }

  /**
   * Resolve a pending approval (approve or deny).
   * Uses atomic check: only resolves if status is still "pending".
   * Returns { resolved: true, approval } if this call did the resolution,
   * or { resolved: false, approval } if already resolved by someone else.
   */
  async resolveApproval(
    approvalId: string,
    status: "approved" | "denied",
    resolvedBy: string,
  ): Promise<{ resolved: boolean; approval: PendingApproval | null }> {
    const redis = await this.getRedis();
    if (!redis) return { resolved: false, approval: null };

    const key = `${APPROVAL_KEY_PREFIX}${approvalId}`;
    const raw = await redis.get(key);
    if (!raw) return { resolved: false, approval: null };

    let approval: PendingApproval;
    try {
      approval = JSON.parse(raw) as PendingApproval;
    } catch (err) {
      Sentry.captureException(err);
      return { resolved: false, approval: null };
    }

    if (approval.status !== "pending") {
      return { resolved: false, approval }; // Already resolved
    }

    // Resolve it
    approval.status = status;
    approval.resolvedAt = new Date().toISOString();
    approval.resolvedBy = resolvedBy;

    await redis.set(key, JSON.stringify(approval), { EX: APPROVAL_TTL_SECONDS });

    return { resolved: true, approval };
  }

  // ─── Telegram Callback Handler ─────────────────────────────────────────

  /**
   * Register the governance callback handler on a grammy Bot.
   * Listens for callback queries matching `gov:approve:{id}` or `gov:deny:{id}`.
   *
   * Call this once during agent startup, BEFORE bot.start().
   */
  setupCallbackHandler(bot: Bot): void {
    bot.on("callback_query:data", async (ctx) => {
      try {
        const data = ctx.callbackQuery.data;
        if (!data.startsWith("gov:")) return;

        const parts = data.split(":");
        if (parts.length !== 3) return;

        const action = parts[1];
        const approvalId = parts[2];

        if (action !== "approve" && action !== "deny") return;

        // Authorization check — only authorized approvers can resolve
        const fromId = ctx.callbackQuery.from.id;
        if (this.config.authorizedApproverIds.length > 0 &&
            !this.config.authorizedApproverIds.includes(fromId)) {
          await ctx.answerCallbackQuery({ text: "You are not authorized to approve actions." });
          return;
        }

        const status = action === "approve" ? "approved" as const : "denied" as const;
        const resolvedBy = ctx.callbackQuery.from.first_name ?? String(fromId);

        const result = await this.resolveApproval(approvalId, status, resolvedBy);

        if (!result.approval) {
          await ctx.answerCallbackQuery({ text: "Approval not found or expired." });
          return;
        }

        if (!result.resolved) {
          // Already resolved by someone else
          await ctx.answerCallbackQuery({
            text: `Already ${result.approval.status} by ${result.approval.resolvedBy}`,
          });
          return;
        }

        // Successfully resolved — update the Telegram message
        const emoji = status === "approved" ? "✅" : "❌";
        const verb = status === "approved" ? "Approved" : "Denied";

        try {
          await ctx.editMessageText(
            `${emoji} *${verb}* by ${escapeMarkdownV1(resolvedBy)}\n\n` +
            `Agent: ${escapeMarkdownV1(result.approval.agentName)}\n` +
            `Action: ${escapeMarkdownV1(result.approval.action)}\n` +
            `_${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}_`,
            { parse_mode: "Markdown" },
          );
        } catch (editErr) {
          // If Markdown edit fails, try plain text
          try {
            await ctx.editMessageText(
              `${emoji} ${verb} by ${resolvedBy}\n\n` +
              `Agent: ${result.approval.agentName}\n` +
              `Action: ${result.approval.action}\n` +
              `${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`,
            );
          } catch (plainEditErr) {
            console.error(`[${this.agentId}] Failed to edit approval message:`, plainEditErr);
          }
        }

        await ctx.answerCallbackQuery({ text: `${verb} ${result.approval.agentName}'s request` });

        console.log(
          `[${this.agentId}] Approval ${approvalId.slice(0, 8)} ${status} by ${resolvedBy}: ${result.approval.action}`,
        );
      } catch (err) {
        console.error(`[${this.agentId}] Governance callback handler error:`, err);
        Sentry.captureException(err);
        try {
          await ctx.answerCallbackQuery({ text: "Error processing approval. Try again." });
        } catch { /* best effort */ }
      }
    });
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────

  private async updateApprovalInRedis(approval: PendingApproval): Promise<void> {
    const redis = await this.getRedis();
    if (redis) {
      await redis.set(
        `${APPROVAL_KEY_PREFIX}${approval.id}`,
        JSON.stringify(approval),
        { EX: APPROVAL_TTL_SECONDS },
      );
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Format an approval category for display */
function formatCategory(category: ApprovalCategory): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Escape Telegram Markdown v1 special characters.
 * V1 only treats _ * ` [ as special — NOT the extended MarkdownV2 set.
 */
function escapeMarkdownV1(text: string): string {
  return text.replace(/[_*`\[]/g, "\\$&");
}
