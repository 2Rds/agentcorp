/**
 * Webhook Route — Receives Database Webhook events from Supabase Edge Function
 *
 * The Supabase webhook-handler Edge Function forwards pg_net trigger
 * events to agent servers at /{prefix}/webhook. This route:
 *
 *   1. Validates X-Webhook-Secret header (timing-safe comparison)
 *   2. Parses the webhook payload { type, table, record }
 *   3. Dispatches to registered table handlers
 *   4. Always returns 200 (never block pg_net retries)
 *
 * Agents register handlers via runtime.onWebhook(table, handler).
 */

import { Router, type Request, type Response } from "express";
import crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
}

export type WebhookHandler = (payload: WebhookPayload) => void | Promise<void>;

export interface WebhookRouteDeps {
  agentId: string;
  /** Shared secret for X-Webhook-Secret header verification */
  webhookSecret?: string;
}

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createWebhookRouter(
  deps: WebhookRouteDeps,
  handlers: Map<string, WebhookHandler>,
): Router {
  const router = Router();

  router.post("/webhook", (req: Request, res: Response) => {
    // Verify X-Webhook-Secret header
    if (deps.webhookSecret) {
      const provided = req.headers["x-webhook-secret"] as string | undefined;
      if (!provided || !timingSafeEqual(provided, deps.webhookSecret)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const payload = req.body as WebhookPayload | undefined;
    if (!payload?.type || !payload?.table || !payload?.record) {
      res.status(400).json({ error: "Invalid webhook payload" });
      return;
    }

    // Always return 200 immediately — handler runs async
    res.status(200).json({ received: true, table: payload.table });

    // Dispatch to registered handler (fire-and-forget)
    const handler = handlers.get(payload.table);
    if (handler) {
      Promise.resolve(handler(payload)).catch((err) => {
        console.error(`[${deps.agentId}] Webhook handler error for ${payload.table}:`, err);
      });
    } else {
      console.log(`[${deps.agentId}] No webhook handler for table: ${payload.table}`);
    }
  });

  return router;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
