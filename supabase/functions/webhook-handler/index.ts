/**
 * Database Webhook Handler
 *
 * Receives events from Supabase Database Webhooks (pg_net triggers)
 * and routes them to the appropriate agent server endpoint.
 *
 * This is an internal endpoint called by pg_net — not browser-facing.
 *
 * Events:
 *   - ea_tasks INSERT → notify EA agent
 *   - agent_messages INSERT → notify target agent (COA routes)
 *   - compliance_governance_log INSERT → notify CCA agent
 */

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

// Agent server base URL (DigitalOcean App Platform)
const AGENT_BASE_URL = Deno.env.get("AGENT_BASE_URL") || "";

/** Constant-time string comparison to prevent timing attacks on auth tokens */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  // crypto.subtle.timingSafeEqual is available in Deno
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

Deno.serve(async (req) => {
  // Internal endpoint — reject non-POST methods
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Verify Bearer token matches webhook secret (preferred) or service role key (fallback)
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authHeader || !webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token || !timingSafeEqual(token, webhookSecret)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate Content-Type
    const contentType = req.headers.get("Content-Type");
    if (!contentType || !contentType.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
        status: 415,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload: WebhookPayload = await req.json();
    const { type, table, record } = payload;

    console.log(`[webhook-handler] ${type} on ${table}`);

    const route = WEBHOOK_ROUTES[table];
    if (!route) {
      console.warn(`[webhook-handler] No route for table: ${table}`);
      return new Response(JSON.stringify({ status: "ignored", table }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!AGENT_BASE_URL) {
      console.warn("[webhook-handler] AGENT_BASE_URL not configured");
      return new Response(JSON.stringify({ status: "skipped", reason: "no_agent_url" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Forward the event to the agent server
    const agentUrl = `${AGENT_BASE_URL}${route}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const agentRes = await fetch(agentUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": Deno.env.get("WEBHOOK_SECRET") || "",
        },
        body: JSON.stringify({ type, table, record }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (agentRes.ok) {
        console.log(`[webhook-handler] Agent ${agentRes.status} from ${route}`);
      } else {
        const body = await agentRes.text().catch(() => "(unreadable)");
        console.warn(`[webhook-handler] Agent ${agentRes.status} from ${route}: ${body}`);
      }

      return new Response(JSON.stringify({
        status: agentRes.ok ? "forwarded" : "agent_error",
        table,
        route,
        agentStatus: agentRes.status,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`[webhook-handler] Agent unreachable: ${route} — ${errMsg}`);
      // Return 200 to prevent pg_net retries — agent being down is non-fatal
      return new Response(JSON.stringify({
        status: "agent_unreachable",
        table,
        route,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[webhook-handler] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
