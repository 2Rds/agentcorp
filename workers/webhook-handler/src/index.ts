/**
 * Database Webhook Handler — CF Worker
 *
 * Replaces supabase/functions/webhook-handler/ (Deno runtime).
 * Receives events from Supabase Database Webhooks (pg_net triggers)
 * and routes them to the appropriate agent server endpoint.
 * Auth uses WEBHOOK_SECRET env var directly (no Vault lookup).
 *
 * Deploy: wrangler deploy
 */

export interface Env {
  AGENT_BASE_URL: string;
  WEBHOOK_SECRET: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

/** Constant-time string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  let result = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    result |= aBuf[i]! ^ bBuf[i]!;
  }
  return result === 0;
}

// Route table events to agent webhook endpoints
const WEBHOOK_ROUTES: Record<string, string> = {
  ea_tasks: "/ea/webhook",
  agent_messages: "/coa/webhook",
  compliance_governance_log: "/compliance/webhook",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      // Verify Bearer token
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !env.WEBHOOK_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token || !timingSafeEqual(token, env.WEBHOOK_SECRET)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const contentType = request.headers.get("Content-Type");
      if (!contentType || !contentType.includes("application/json")) {
        return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
      }

      const payload: WebhookPayload = await request.json();
      const { type, table, record } = payload;

      console.log(`[webhook-handler] ${type} on ${table}`);

      const route = WEBHOOK_ROUTES[table];
      if (!route) {
        return Response.json({ status: "ignored", table }, { status: 200 });
      }

      if (!env.AGENT_BASE_URL) {
        console.warn(`[webhook-handler] AGENT_BASE_URL not configured — event for ${table} dropped`);
        return Response.json({ status: "skipped", reason: "no_agent_url" }, { status: 200 });
      }

      // Forward the event to the agent server
      const agentUrl = `${env.AGENT_BASE_URL}${route}`;

      try {
        const agentRes = await fetch(agentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": env.WEBHOOK_SECRET,
          },
          body: JSON.stringify({ type, table, record }),
          signal: AbortSignal.timeout(5000),
        });

        if (!agentRes.ok) {
          const body = await agentRes.text().catch(() => "(unreadable)");
          console.warn(`[webhook-handler] Agent ${agentRes.status} from ${route}: ${body}`);
        }

        return Response.json({
          status: agentRes.ok ? "forwarded" : "agent_error",
          table,
          route,
          agentStatus: agentRes.status,
        });
      } catch (fetchErr) {
        console.error(`[webhook-handler] Agent unreachable: ${route}:`, fetchErr);
        // Return 200 to prevent pg_net retries
        return Response.json({ status: "agent_unreachable", table, route, error: String(fetchErr) });
      }
    } catch (err) {
      console.error("[webhook-handler] Error:", err);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  },
};
