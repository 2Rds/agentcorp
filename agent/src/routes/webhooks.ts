import { Router, Request, Response } from "express";

const router = Router();

/**
 * POST /api/webhooks/mem0
 * Receives Mem0 webhook events for memory_add, memory_update, memory_delete.
 * Can trigger downstream actions like dashboard refreshes or notifications.
 */
router.post("/api/webhooks/mem0", (req: Request, res: Response) => {
  const payload = req.body;

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
