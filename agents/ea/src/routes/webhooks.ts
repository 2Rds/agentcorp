import { Router, Request, Response } from "express";
import crypto from "crypto";
import { config } from "../config.js";

const router = Router();

// ── Telegram notification bridge ──
// Set by index.ts after Telegram bot starts
let telegramNotifier: ((text: string) => Promise<void>) | null = null;

export function setTelegramNotifier(fn: (text: string) => Promise<void>): void {
  telegramNotifier = fn;
}

// ── Types ──

interface DatabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
}

// ── Helpers ──

function verifyWebhookSecret(req: Request): boolean {
  if (!config.webhookSecret) return true;

  const provided = req.headers["x-webhook-secret"] as string | undefined;
  if (!provided) return false;

  const aBuf = Buffer.from(provided);
  const bBuf = Buffer.from(config.webhookSecret);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// ── Database Webhook Handlers ──

const webhookHandlers: Record<string, (payload: DatabaseWebhookPayload) => void | Promise<void>> = {
  ea_tasks: async (payload) => {
    const { record } = payload;
    const title = record.title as string || "Untitled";
    const priority = record.priority as string || "medium";
    const description = record.description as string || "";

    console.log(`[blockdrive-ea] Webhook: new task "${title}" (priority: ${priority})`);

    if (telegramNotifier) {
      const msg = `📋 *New EA Task*\n\n*${title}*\nPriority: ${priority}${description ? `\n${description.slice(0, 200)}` : ""}`;
      await telegramNotifier(msg).catch((err) =>
        console.error("[blockdrive-ea] Telegram notification failed:", err),
      );
    }
  },
};

// ── Routes ──

/**
 * POST /webhook
 * Receives Supabase Database Webhook events via Edge Function.
 * Verified by X-Webhook-Secret header (timing-safe comparison).
 */
router.post("/webhook", (req: Request, res: Response) => {
  if (!verifyWebhookSecret(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = req.body as DatabaseWebhookPayload | undefined;
  if (!payload?.type || !payload?.table || !payload?.record) {
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }

  // Always return 200 immediately — handler runs async
  res.status(200).json({ received: true, table: payload.table });

  const handler = webhookHandlers[payload.table];
  if (handler) {
    Promise.resolve(handler(payload)).catch((err) => {
      console.error(`[blockdrive-ea] Webhook handler error for ${payload.table}:`, err);
    });
  } else {
    console.log(`[blockdrive-ea] No webhook handler for table: ${payload.table}`);
  }
});

export default router;
