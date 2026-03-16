/**
 * Voice Transport — WebSocket server for NextGenSwitch + outbound call API
 *
 * Handles WebSocket upgrade requests from NextGenSwitch (inbound calls)
 * and initiates outbound calls via the NextGenSwitch REST API.
 *
 * Layered on top of the Express HTTP server — shares the same port.
 */

import type { Server } from "http";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer } from "ws";
import { VoicePipeline, type VoicePipelineConfig } from "./voice-pipeline.js";
import { isAllowedUrl } from "../lib/tool-helpers.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VoiceTransportConfig extends VoicePipelineConfig {
  /** NextGenSwitch base URL for REST API calls */
  nextgenSwitchUrl?: string;
  /** NextGenSwitch API key for authentication */
  nextgenSwitchApiKey?: string;
  /** WebSocket path for NextGenSwitch connections (default: /voice/ws) */
  wsPath?: string;
}

export interface OutboundCallParams {
  /** Phone number to call (E.164 format) */
  phoneNumber: string;
  /** Custom parameters passed into the call context */
  params?: Record<string, string>;
}

// ─── Transport ───────────────────────────────────────────────────────────────

export class VoiceTransport {
  private wss: WebSocketServer;
  private pipeline: VoicePipeline;
  private config: VoiceTransportConfig;
  private wsPath: string;

  constructor(config: VoiceTransportConfig) {
    this.config = config;
    this.wsPath = config.wsPath ?? "/voice/ws";
    this.pipeline = new VoicePipeline(config);

    // Create WebSocket server (no standalone HTTP server — uses upgrade)
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on("connection", (ws) => {
      this.pipeline.handleConnection(ws);
    });
  }

  /**
   * Attach to an HTTP server to handle WebSocket upgrade requests.
   * Call this with the Express server instance after app.listen().
   */
  attachToServer(server: Server): void {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      if (url.pathname === this.wsPath) {
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss.emit("connection", ws, req);
        });
      }
      // Don't destroy socket for non-matching paths — other handlers may need it
    });

    console.log(`[${this.config.agentId}] Voice WebSocket listening on ${this.wsPath}`);
  }

  /**
   * Initiate an outbound call via NextGenSwitch REST API.
   */
  async initiateCall(params: OutboundCallParams): Promise<{ callId: string }> {
    const { nextgenSwitchUrl, nextgenSwitchApiKey, agentId } = this.config;

    if (!nextgenSwitchUrl || !nextgenSwitchApiKey) {
      throw new Error("NextGenSwitch URL and API key required for outbound calls");
    }

    // SSRF protection
    const urlCheck = isAllowedUrl(nextgenSwitchUrl);
    if (!urlCheck.allowed) {
      throw new Error(`Blocked NextGenSwitch URL: ${urlCheck.reason}`);
    }

    const response = await fetch(`${nextgenSwitchUrl}/api/v1/calls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${nextgenSwitchApiKey}`,
      },
      body: JSON.stringify({
        to: params.phoneNumber,
        agent_id: agentId,
        custom_params: params.params,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "(unreadable)");
      throw new Error(`NextGenSwitch call initiation failed: ${response.status} — ${body}`);
    }

    const data = await response.json() as { call_id: string };
    console.log(`[${agentId}] Outbound call initiated: ${data.call_id} → ${params.phoneNumber}`);

    return { callId: data.call_id };
  }

  /** Get current active call count */
  get activeCallCount(): number {
    return this.pipeline.activeCallCount;
  }

  /** Clean up WebSocket server */
  close(): void {
    this.wss.close();
  }
}
