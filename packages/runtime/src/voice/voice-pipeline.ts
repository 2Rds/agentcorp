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
import { Sentry } from "../lib/observability.js";

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
  /** Tool definitions for the agentic voice loop (Anthropic tool format) */
  tools?: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>;
  /** Tool execution handlers (keyed by tool name) */
  toolHandlers?: Map<string, (args: Record<string, unknown>) => Promise<string>>;
  /** Max tool turns per utterance in the agentic loop (default: 2) */
  maxToolTurnsPerUtterance?: number;
  /** SemanticCache instance for caching LLM responses (optional) */
  semanticCache?: import("../lib/semantic-cache.js").SemanticCache;
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
      Sentry.captureException(err);
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

    // Build per-call system prompt with context from customParams
    let callSystemPrompt = this.config.systemPrompt;
    if (event.customParams && Object.keys(event.customParams).length > 0) {
      const contextLines: string[] = [];
      for (const [key, value] of Object.entries(event.customParams)) {
        if (value) {
          // Convert snake_case/camelCase keys to readable labels
          const label = key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          contextLines.push(`- **${label}**: ${value}`);
        }
      }
      if (contextLines.length > 0) {
        callSystemPrompt = `${this.config.systemPrompt}\n\n## Call Context\n${contextLines.join("\n")}`;
      }
    }

    // Max call duration timeout
    const timeout = setTimeout(() => {
      console.log(`[${agentId}] Call ${event.callId} hit max duration (${maxCallDurationSecs}s)`);
      this.endCall(call);
      ws.close();
    }, maxCallDurationSecs * 1000);

    const call: ActiveCall = { ws, state, sttSession, timeout, systemPrompt: callSystemPrompt, conversationHistory: [] };
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
    const { agentId, anthropicApiKey, tools, toolHandlers, semanticCache } = this.config;
    const maxToolTurns = this.config.maxToolTurnsPerUtterance ?? 2;
    const hasTools = tools && tools.length > 0 && toolHandlers;

    try {
      // Build conversation for Claude
      call.conversationHistory.push({ role: "user" as const, content: text });

      // ── Cache check — ONLY for simple (no-tools) path ──
      // When tools are configured, responses depend on real-time data.
      if (semanticCache && !hasTools) {
        try {
          const cached = await semanticCache.get(text, "claude-opus-4-6");
          if (cached) {
            console.log(`[${agentId}] Voice cache HIT (similarity: ${cached.similarity.toFixed(3)})`);
            call.conversationHistory.push({ role: "assistant" as const, content: cached.response });
            this.speakToCallerAndRecord(call, cached.response);
            return;
          }
        } catch (cacheErr) {
          // Cache failure is non-fatal — proceed to Claude
          console.error(`[${agentId}] Voice cache lookup failed:`, cacheErr);
        }
      }

      // ── Simple path (no tools configured) — single Claude call ──
      if (!hasTools) {
        const responseText = await this.callClaude(call, anthropicApiKey);
        if (responseText) {
          call.conversationHistory.push({ role: "assistant" as const, content: responseText });
          // Cache fire-and-forget
          if (semanticCache) {
            semanticCache.set(text, responseText, "claude-opus-4-6").catch((e) => console.warn(`[${agentId}] Voice cache write failed:`, e));
          }
          this.speakToCallerAndRecord(call, responseText);
        }
        return;
      }

      // ── Agentic loop (tools configured) — EA bridge pattern ──
      let turns = 0;
      while (turns < maxToolTurns) {
        turns++;

        const data = await this.callClaudeWithTools(call, anthropicApiKey, tools!);
        if (!data) return;

        // Check for tool_use blocks
        const toolUseBlocks = data.content.filter(
          (c: Record<string, unknown>) => c.type === "tool_use",
        );

        if (toolUseBlocks.length === 0 || data.stop_reason !== "tool_use") {
          // No tools called or end_turn — extract text and speak
          const responseText = data.content
            .filter((c: Record<string, unknown>) => c.type === "text" && c.text)
            .map((c: Record<string, unknown>) => c.text as string)
            .join(" ");

          if (responseText) {
            call.conversationHistory.push({ role: "assistant" as const, content: responseText });
            // Cache fire-and-forget
            if (semanticCache) {
              semanticCache.set(text, responseText, "claude-opus-4-6").catch((e) => console.warn(`[${agentId}] Voice cache write failed:`, e));
            }
            this.speakToCallerAndRecord(call, responseText);
          }
          return;
        }

        // Assistant message with tool_use blocks → push full content array
        call.conversationHistory.push({
          role: "assistant" as const,
          content: data.content as Array<Record<string, unknown>>,
        });

        // Execute each tool and collect results
        const toolResults: Array<Record<string, unknown>> = [];
        for (const block of toolUseBlocks) {
          const handler = toolHandlers!.get(block.name as string);
          let resultContent: string;
          if (handler) {
            try {
              resultContent = await handler((block.input as Record<string, unknown>) ?? {});
            } catch (toolErr) {
              resultContent = `Tool error: ${toolErr instanceof Error ? toolErr.message : String(toolErr)}`;
              console.error(`[${agentId}] Tool ${block.name} failed:`, toolErr);
            }
          } else {
            resultContent = `Unknown tool: ${block.name}`;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultContent,
          });
        }

        // Feed tool results back as user message
        call.conversationHistory.push({
          role: "user" as const,
          content: toolResults,
        });
      }

      // If we exhausted max turns, do one final call without tools to get a text response
      const finalText = await this.callClaude(call, anthropicApiKey);
      if (finalText) {
        call.conversationHistory.push({ role: "assistant" as const, content: finalText });
        if (semanticCache) {
          semanticCache.set(text, finalText, "claude-opus-4-6").catch((e) => console.warn(`[${agentId}] Voice cache write failed:`, e));
        }
        this.speakToCallerAndRecord(call, finalText);
      }
    } catch (err) {
      Sentry.captureException(err);
      console.error(`[${agentId}] Error processing utterance:`, err);
      this.speakToCallerAndRecord(call, "I apologize, I'm having a brief technical issue. Could you repeat that?");
    }
  }

  /**
   * Single Claude call without tools (simple path + final fallback).
   * Returns extracted text or null.
   */
  private async callClaude(call: ActiveCall, anthropicApiKey: string): Promise<string | null> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 300,
        system: call.systemPrompt,
        messages: call.conversationHistory,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Claude API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    return data.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join(" ") || null;
  }

  /**
   * Claude call with tools (agentic loop path).
   * Returns the full response data or null on error.
   */
  private async callClaudeWithTools(
    call: ActiveCall,
    anthropicApiKey: string,
    tools: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>,
  ): Promise<{ content: Array<Record<string, unknown>>; stop_reason: string } | null> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: call.systemPrompt,
        messages: call.conversationHistory,
        tools,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Claude API ${response.status}: ${body.slice(0, 200)}`);
    }

    return await response.json() as { content: Array<Record<string, unknown>>; stop_reason: string };
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
      Sentry.captureException(err);
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
      Sentry.captureException(err);
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
      Sentry.captureException(err);
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
  /** Per-call system prompt (base prompt + call context from customParams) */
  systemPrompt: string;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string | Array<Record<string, unknown>>;
  }>;
}
