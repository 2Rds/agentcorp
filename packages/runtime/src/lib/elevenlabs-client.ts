/**
 * ElevenLabs Client — TTS + STT WebSocket streaming
 *
 * Zero-conversion audio pipeline: Both TTS output and STT input use
 * G.711 u-law 8kHz — direct match for NextGenSwitch telephony.
 * No audio format conversion = no added latency.
 *
 * TTS: Text → ElevenLabs WebSocket → u-law 8kHz audio chunks
 * STT: u-law 8kHz audio → ElevenLabs WebSocket → transcript events
 */

import WebSocket from "ws";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ElevenLabsConfig {
  apiKey: string;
  /** TTS model (default: eleven_flash_v2_5 for sub-75ms latency) */
  ttsModel?: string;
  /** TTS voice ID */
  voiceId: string;
  /** TTS stability (0-1, default 0.5) */
  stability?: number;
  /** TTS similarity boost (0-1, default 0.75) */
  similarityBoost?: number;
  /** TTS speed multiplier (0.5-2.0, default 1.0) */
  speed?: number;
}

export interface STTSession {
  /** Send raw audio data (u-law 8kHz) */
  sendAudio(audio: Buffer): void;
  /** Signal end of audio stream */
  endStream(): void;
  /** Close the STT session */
  close(): void;
  /** Whether the session is connected */
  readonly connected: boolean;
}

export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
}

export interface Voice {
  voice_id: string;
  name: string;
  category: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class ElevenLabsClient {
  private config: ElevenLabsConfig;
  private ttsModel: string;

  constructor(config: ElevenLabsConfig) {
    this.config = config;
    this.ttsModel = config.ttsModel ?? "eleven_flash_v2_5";
  }

  /**
   * Stream TTS via WebSocket. Yields u-law 8kHz audio chunks
   * that can be sent directly to NextGenSwitch without conversion.
   */
  async *streamTTS(text: string, voiceId?: string): AsyncIterable<Buffer> {
    const vid = voiceId ?? this.config.voiceId;
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${vid}/stream-input?model_id=${this.ttsModel}&output_format=ulaw_8000`;

    const ws = new WebSocket(wsUrl, {
      headers: { "xi-api-key": this.config.apiKey },
    });

    // Queue for audio chunks
    const chunks: Buffer[] = [];
    let done = false;
    let error: Error | null = null;
    let resolver: (() => void) | null = null;

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.audio) {
          chunks.push(Buffer.from(msg.audio, "base64"));
          resolver?.();
          resolver = null;
        }
        if (msg.isFinal) {
          done = true;
          resolver?.();
          resolver = null;
        }
      } catch {
        // Non-JSON message, ignore
      }
    });

    ws.on("error", (err) => {
      error = err instanceof Error ? err : new Error(String(err));
      resolver?.();
      resolver = null;
    });

    ws.on("close", () => {
      done = true;
      resolver?.();
      resolver = null;
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        // Send initial config + text
        ws.send(JSON.stringify({
          text: " ",
          voice_settings: {
            stability: this.config.stability ?? 0.5,
            similarity_boost: this.config.similarityBoost ?? 0.75,
            speed: this.config.speed ?? 1.0,
          },
          generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
        }));
        // Send the actual text
        ws.send(JSON.stringify({ text, try_trigger_generation: true }));
        // Signal end of text input
        ws.send(JSON.stringify({ text: "" }));
        resolve();
      });
      ws.on("error", reject);
    });

    // Yield audio chunks as they arrive
    while (!done && !error) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else {
        await new Promise<void>((r) => { resolver = r; });
      }
    }

    // Yield remaining chunks
    while (chunks.length > 0) {
      yield chunks.shift()!;
    }

    if (error) throw error;

    // Clean up
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }

  /**
   * Create a real-time STT session via WebSocket.
   * Accepts u-law 8kHz audio — direct passthrough from NextGenSwitch.
   */
  createSTTSession(onTranscript: (event: TranscriptEvent) => void): STTSession {
    const wsUrl = "wss://api.elevenlabs.io/v1/speech-to-text/ws";

    const ws = new WebSocket(wsUrl, {
      headers: { "xi-api-key": this.config.apiKey },
    });

    let connected = false;

    ws.on("open", () => {
      connected = true;
      // Send initial config
      ws.send(JSON.stringify({
        type: "config",
        encoding: "ulaw",
        sample_rate: 8000,
        model: "scribe_v2_realtime",
        language: "en",
        vad: {
          use_vad: true,
          silence_threshold_secs: 1.0,
        },
      }));
    });

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "transcript") {
          onTranscript({
            text: msg.text ?? "",
            isFinal: msg.is_final ?? false,
          });
        }
      } catch {
        // Non-JSON, ignore
      }
    });

    ws.on("error", (err) => {
      console.error("[ElevenLabs STT] WebSocket error:", err);
      connected = false;
    });

    ws.on("close", () => {
      connected = false;
    });

    return {
      sendAudio(audio: Buffer) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "audio",
            data: audio.toString("base64"),
          }));
        }
      },
      endStream() {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "end_of_stream" }));
        }
      },
      close() {
        connected = false;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      },
      get connected() {
        return connected;
      },
    };
  }

  /**
   * List available voices from ElevenLabs.
   */
  async listVoices(): Promise<Voice[]> {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": this.config.apiKey },
    });
    if (!res.ok) throw new Error(`ElevenLabs voices API error: ${res.status}`);
    const data = await res.json() as { voices: Voice[] };
    return data.voices;
  }
}
