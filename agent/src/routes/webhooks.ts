import { Router, Request, Response } from "express";
import crypto from "crypto";
import { config } from "../config.js";

const router = Router();

interface Mem0WebhookPayload {
  event_details: {
    id: string;
    event: string;
    data?: { memory?: string };
  };
}

function verifyWebhookSignature(req: Request): boolean {
  if (!config.mem0WebhookSecret) return true; // No secret configured — allow (dev mode)

  const signature = req.headers["x-mem0-signature"] as string | undefined;
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", config.mem0WebhookSecret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * POST /api/webhooks/mem0
 * Receives Mem0 webhook events for memory_add, memory_update, memory_delete.
 * Can trigger downstream actions like dashboard refreshes or notifications.
 */
router.post("/api/webhooks/mem0", (req: Request, res: Response) => {
  if (!verifyWebhookSignature(req)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const payload = req.body as Mem0WebhookPayload | undefined;

  if (!payload?.event_details) {
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }

  const { id, event, data } = payload.event_details;
  console.log(`Mem0 webhook: ${event} on memory ${id}${data?.memory ? ` — "${data.memory.slice(0, 80)}"` : ""}`);

  // Future: dispatch actions based on event type
  // - memory_add with category "fundraising" → notify investor relations
  // - memory_update on financial_metrics → trigger derived metrics recalculation
  // - memory_delete → audit log entry

  res.status(200).json({ received: true });
});

export default router;
