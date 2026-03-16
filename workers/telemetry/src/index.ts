/**
 * Telemetry Worker — CF Analytics Engine event ingestion
 *
 * Receives POST requests with agent usage events and writes them
 * to a Cloudflare Analytics Engine dataset.
 *
 * Deploy: wrangler deploy
 * Dataset: TELEMETRY (configured in wrangler.toml)
 *
 * Events are written with blobs (strings) and doubles (numbers)
 * for SQL querying via CF Analytics Engine SQL API.
 *
 * Auth: TELEMETRY_API_KEY must be set — endpoint rejects all requests when unset.
 */

export interface Env {
  TELEMETRY: AnalyticsEngineDataset;
  TELEMETRY_API_KEY: string;
}

interface UsageEvent {
  org_id: string;
  agent_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  timestamp?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Fail-closed: reject all requests when API key is not configured
    if (!env.TELEMETRY_API_KEY) {
      return new Response("Server misconfigured: no API key", { status: 500 });
    }

    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${env.TELEMETRY_API_KEY}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse request body
    let event: UsageEvent;
    try {
      event = (await request.json()) as UsageEvent;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Invalid JSON: ${String(err)}` }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // Write to Analytics Engine
    try {
      env.TELEMETRY.writeDataPoint({
        blobs: [
          event.org_id,
          event.agent_id,
          event.model,
          event.timestamp ?? new Date().toISOString(),
        ],
        doubles: [
          event.input_tokens,
          event.output_tokens,
          event.cost_usd,
          event.latency_ms,
        ],
        indexes: [event.agent_id],
      });

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Write failed: ${String(err)}` }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
  },
};
