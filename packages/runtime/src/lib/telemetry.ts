/**
 * Telemetry Client — Agent Usage Event Tracking
 *
 * Sends usage events (token counts, cost, latency) to either:
 *   1. CF Analytics Engine via a Workers endpoint (preferred — unlimited cardinality)
 *   2. Supabase agent_usage_events table (fallback — current behavior)
 *
 * All writes are fire-and-forget — telemetry never blocks the response.
 *
 * Configure via env:
 *   TELEMETRY_ENDPOINT — CF Worker URL (e.g., https://telemetry.blockdrive.workers.dev)
 *   TELEMETRY_API_KEY — Bearer token for the Worker endpoint
 *   If unset, falls back to Supabase INSERT.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UsageEvent {
  orgId: string;
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  timestamp?: string;
}

export interface TelemetryConfig {
  /** CF Worker endpoint for Analytics Engine writes */
  endpoint?: string;
  /** Bearer token for the Worker endpoint */
  apiKey?: string;
  /** Supabase client for fallback writes */
  supabase?: SupabaseClient;
  /** Agent ID for logging */
  agentId: string;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class TelemetryClient {
  private endpoint?: string;
  private apiKey?: string;
  private supabase?: SupabaseClient;
  private agentId: string;

  constructor(config: TelemetryConfig) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.supabase = config.supabase;
    this.agentId = config.agentId;
  }

  /**
   * Record a usage event. Fire-and-forget — never throws.
   * Tries CF Analytics Engine first, falls back to Supabase.
   */
  async record(event: UsageEvent): Promise<void> {
    const ts = event.timestamp ?? new Date().toISOString();

    // Primary: CF Analytics Engine via Worker
    if (this.endpoint) {
      try {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.apiKey ? { "Authorization": `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            org_id: event.orgId,
            agent_id: event.agentId,
            model: event.model,
            input_tokens: event.inputTokens,
            output_tokens: event.outputTokens,
            cost_usd: event.costUsd,
            latency_ms: event.latencyMs,
            timestamp: ts,
          }),
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) return; // Success — skip fallback
        console.error(`[${this.agentId}] Telemetry endpoint returned ${res.status}`);
      } catch (err) {
        console.error(`[${this.agentId}] Telemetry endpoint failed:`, err);
      }
    }

    // Fallback: Supabase INSERT
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from("agent_usage_events")
          .insert({
            org_id: event.orgId,
            agent_id: event.agentId,
            model: event.model,
            input_tokens: event.inputTokens,
            output_tokens: event.outputTokens,
            cost_usd: event.costUsd,
            latency_ms: event.latencyMs,
          });
        if (error) {
          console.error(`[${this.agentId}] Telemetry Supabase fallback failed:`, error.message);
        }
      } catch (err) {
        console.error(`[${this.agentId}] Telemetry Supabase fallback error:`, err);
      }
    }
  }
}
