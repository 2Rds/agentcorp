/**
 * Voice Pipeline — NextGenSwitch ↔ ElevenLabs ↔ Claude Bridge
 *
 * The core real-time voice pipeline for cognitive sales agents:
 *
 *   NextGenSwitch WebSocket
 *     → media events (base64 G.711 u-law audio)
 *     → ElevenLabs STT (u-law 8kHz passthrough — zero conversion)
 *     → Claude Opus 4.6 (cognitive brain with full tool loop)
 *     → ElevenLabs TTS (u-law 8kHz output — zero conversion)
 *     → media events back to NextGenSwitch
 *
 * Each active call gets its own pipeline instance with:
 *   - STT session (streaming transcription)
 *   - Claude conversation context (message history + tools)
 *   - TTS streaming (chunked audio delivery)
 *   - Call state in Redis (survives restart)
 */

import type WebSocket from "ws";
import type { ElevenLabsClient, STTSession } from "../lib/elevenlabs-client.js";
import type { RedisClientType } from "redis";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VoicePipelineConfig {
  agentId: string;
  elevenlabs: ElevenLabsClient;
  voiceId: string;
  /** System prompt for voice conversations */
  systemPrompt: string;
  /** Anthropic API key for Claude calls */
  anthropicApiKey: string;
  /** Max call duration in seconds (default: 600 = 10 min) */
  maxCallDurationSecs?: number;
  /** First message the agent speaks when answering */
  firstMessage?: string;
  /** Redis client for call state persistence */
  redis?: RedisClientType;
  /** Callback when a call completes */
  onCallComplete?: (result: CallResult) => void | Promise<void>;
}

export interface CallState {
  callId: string;
  streamId: string;
  agentId: string;
  from: string;
  to: string;
  startTime: string;
  transcript: TranscriptEntry[];
  status: "active" | "completed" | "failed";
  customParams?: Record<string, string>;
}

export interface TranscriptEntry {
  role: "caller" | "agent";
  text: string;
  timestamp: string;
}

export interface CallResult {
  callId: string;
  agentId: string;
  from: string;
  to: string;
  durationSecs: number;
  transcript: TranscriptEntry[];
  successful: boolean;
  timestamp: string;
}

/** NextGenSwitch WebSocket event types */
interface NGSStartEvent {
  event: "start";
  streamId: string;
  callId: string;
  from: string;
  to: string;
  customParams?: Record<string, string>;
}

interface NGSMediaEvent {
  event: "media";
  streamId: string;
  media: {
    payload: string; // base64 G.711 u-law audio
  };
}

interface NGSStopEvent {
  event: "stop";
  streamId: string;
}

type NGSEvent = NGSStartEvent | NGSMediaEvent | NGSStopEvent;

// ─── Pipeline ────────────────────────────────────────────────────────────────

/** One pipeline instance per active call */
export class VoicePipeline {
  private config: VoicePipelineConfig;
  private activeCalls = new Map<string, ActiveCall>();

  constructor(config: VoicePipelineConfig) {
    this.config = config;
  }

  /**
   * Handle a new WebSocket connection from NextGenSwitch.
   * Each connection represents one phone call.
   */
  handleConnection(ws: WebSocket): void {
    let currentCall: ActiveCall | null = null;

    ws.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString()) as NGSEvent;

        switch (event.event) {
          case "start":
            currentCall = this.startCall(ws, event);
            break;
          case "media":
            if (currentCall) {
              this.handleMedia(currentCall, event);
            }
            break;
          case "stop":
            if (currentCall) {
              this.endCall(currentCall);
              currentCall = null;
            }
            break;
        }
      } catch (err) {
        console.error(`[${this.config.agentId}] Voice pipeline parse error:`, err);
      }
    });

    ws.on("close", () => {
      if (currentCall) {
        this.endCall(currentCall);
      }
    });

    ws.on("error", (err) => {
      console.error(`[${this.config.agentId}] Voice pipeline WebSocket error:`, err);
      if (currentCall) {
        this.endCall(currentCall);
      }
    });
  }

  /** Get the number of active calls */
  get activeCallCount(): number {
    return this.activeCalls.size;
  }

  /** Get an active call by ID */
  getCall(callId: string): CallState | null {
    const call = this.activeCalls.get(callId);
    return call?.state ?? null;
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private startCall(ws: WebSocket, event: NGSStartEvent): ActiveCall {
    const { agentId, elevenlabs, maxCallDurationSecs = 600 } = this.config;

    const state: CallState = {
      callId: event.callId,
      streamId: event.streamId,
      agentId,
      from: event.from,
      to: event.to,
      startTime: new Date().toISOString(),
      transcript: [],
      status: "active",
      customParams: event.customParams,
    };

    // Create STT session — receives u-law 8kHz audio directly
    const sttSession = elevenlabs.createSTTSession((transcript) => {
      if (transcript.isFinal && transcript.text.trim()) {
        state.transcript.push({
          role: "caller",
          text: transcript.text,
          timestamp: new Date().toISOString(),
        });

        // Feed to Claude for response
        this.processCallerUtterance(call, transcript.text);
      }
    });

    // Max call duration timeout
    const timeout = setTimeout(() => {
      console.log(`[${agentId}] Call ${event.callId} hit max duration (${maxCallDurationSecs}s)`);
      this.endCall(call);
      ws.close();
    }, maxCallDurationSecs * 1000);

    const call: ActiveCall = { ws, state, sttSession, timeout, conversationHistory: [] };
    this.activeCalls.set(event.callId, call);

    // Persist call state to Redis
    this.persistCallState(state);

    console.log(`[${agentId}] Call started: ${event.callId} from ${event.from} to ${event.to}`);

    // Send first message if configured
    if (this.config.firstMessage) {
      this.speakToCallerAndRecord(call, this.config.firstMessage);
    }

    return call;
  }

  private handleMedia(call: ActiveCall, event: NGSMediaEvent): void {
    // Forward raw G.711 u-law audio directly to ElevenLabs STT
    // Zero conversion — both use u-law 8kHz natively
    const audioBuffer = Buffer.from(event.media.payload, "base64");
    call.sttSession.sendAudio(audioBuffer);
  }

  private async processCallerUtterance(call: ActiveCall, text: string): Promise<void> {
    const { agentId, systemPrompt, anthropicApiKey } = this.config;

    try {
      // Build conversation for Claude
      call.conversationHistory.push({ role: "user" as const, content: text });

      // Call Claude (Anthropic Messages API directly — same as EA bridge pattern)
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicApiKey,
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 300, // Keep voice responses concise
          system: systemPrompt,
          messages: call.conversationHistory,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        console.error(`[${agentId}] Claude API error: ${response.status}`);
        return;
      }

      const data = await response.json() as {
        content: Array<{ type: string; text?: string }>;
      };

      const responseText = data.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join(" ");

      if (responseText) {
        call.conversationHistory.push({ role: "assistant" as const, content: responseText });
        this.speakToCallerAndRecord(call, responseText);
      }
    } catch (err) {
      console.error(`[${agentId}] Error processing utterance:`, err);
    }
  }

  private async speakToCallerAndRecord(call: ActiveCall, text: string): Promise<void> {
    const { agentId, elevenlabs, voiceId } = this.config;

    // Record in transcript
    call.state.transcript.push({
      role: "agent",
      text,
      timestamp: new Date().toISOString(),
    });

    try {
      // Stream TTS audio back to NextGenSwitch
      for await (const chunk of elevenlabs.streamTTS(text, voiceId)) {
        if (call.ws.readyState === 1) { // WebSocket.OPEN
          call.ws.send(JSON.stringify({
            event: "media",
            streamId: call.state.streamId,
            media: {
              payload: chunk.toString("base64"),
            },
          }));
        }
      }
    } catch (err) {
      console.error(`[${agentId}] TTS streaming error:`, err);
    }
  }

  private async endCall(call: ActiveCall): Promise<void> {
    const { agentId } = this.config;

    clearTimeout(call.timeout);
    call.sttSession.close();
    call.state.status = "completed";

    this.activeCalls.delete(call.state.callId);

    const durationSecs = Math.round(
      (Date.now() - new Date(call.state.startTime).getTime()) / 1000,
    );

    const result: CallResult = {
      callId: call.state.callId,
      agentId,
      from: call.state.from,
      to: call.state.to,
      durationSecs,
      transcript: call.state.transcript,
      successful: call.state.transcript.length > 1,
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[${agentId}] Call ended: ${call.state.callId} (${durationSecs}s, ${call.state.transcript.length} turns)`,
    );

    // Persist final state + notify
    await Promise.allSettled([
      this.persistCallState(call.state),
      this.persistCallResult(result),
      this.config.onCallComplete?.(result),
    ]);
  }

  private async persistCallState(state: CallState): Promise<void> {
    if (!this.config.redis) return;
    try {
      const key = `voice:${state.agentId}:call:${state.callId}`;
      await this.config.redis.set(key, JSON.stringify(state), { EX: 3600 }); // 1hr TTL
    } catch (err) {
      console.error(`[${state.agentId}] Failed to persist call state:`, err);
    }
  }

  private async persistCallResult(result: CallResult): Promise<void> {
    if (!this.config.redis) return;
    try {
      const listKey = `voice:${result.agentId}:calls`;
      await this.config.redis.rPush(listKey, JSON.stringify(result));
      // Bound the list at 100 entries
      await this.config.redis.lTrim(listKey, -100, -1);
      await this.config.redis.expire(listKey, 7 * 24 * 60 * 60); // 7 days
    } catch (err) {
      console.error(`[${result.agentId}] Failed to persist call result:`, err);
    }
  }
}

// ─── Internal Types ──────────────────────────────────────────────────────────

interface ActiveCall {
  ws: WebSocket;
  state: CallState;
  sttSession: STTSession;
  timeout: ReturnType<typeof setTimeout>;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}
