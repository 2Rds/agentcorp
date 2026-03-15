/**
 * @waas/shared — Core Type Definitions
 *
 * Shared types for the WaaS cognitive agent orchestration system.
 * All agents import these types for model routing, namespace
 * isolation, and inter-agent communication.
 */

import type { PluginName } from "./plugins.js";

// ─── Model Types ────────────────────────────────────────────────────────────

/** Provider that hosts a model — determines routing and credential logic */
export type ModelProvider =
  | "anthropic"     // Claude models via direct Anthropic API
  | "openrouter"    // Aggregator (Gemini, Grok, Granite) via OpenRouter
  | "perplexity"    // Sonar models via direct Perplexity API
  | "cohere";       // Command A + Rerank + Embed via direct Cohere API

/** What a model is good at — used for capability-based routing */
export type ModelCapability =
  | "reasoning"          // Complex multi-step reasoning
  | "web-search"         // Real-time web access with inline citations
  | "rag"                // Document retrieval, reranking, structured extraction
  | "multimodal"         // Vision, audio, document analysis
  | "compliance"         // Regulatory/governance analysis (ISO 42001)
  | "embedding"          // Text → vector embedding generation
  | "reranking"          // Search result quality reranking
  | "code"               // Code generation, analysis, debugging
  | "search-grounding";  // Native search engine grounding (Google)

/** Single model configuration */
export interface ModelConfig {
  /** Provider-specific model ID (e.g., "claude-opus-4-6-20250929") */
  id: string;
  /** Which provider hosts this model */
  provider: ModelProvider;
  /** Human-readable short name for logs and config */
  alias: string;
  /** What this model can do */
  capabilities: ModelCapability[];
  /** Pricing per 1M tokens in USD */
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Maximum output tokens (if different from context window) */
  maxOutput?: number;
}

/** An agent's complete model configuration */
export interface ModelStack {
  /** Primary brain — always Opus 4.6 */
  primary: ModelConfig;
  /** Domain-specific support models (0-3) */
  support: ModelConfig[];
  /** Embedding model for RAG/memory operations */
  embedding?: ModelConfig;
  /** Reranking model for search result quality */
  reranker?: ModelConfig;
}

// ─── Agent Types ────────────────────────────────────────────────────────────

/** Agent tier in the org hierarchy */
export type AgentTier = "executive" | "department-head" | "junior";

/** Common fields shared by all agent tiers (exported for declaration emit) */
export interface AgentConfigBase {
  /** Unique agent identifier (e.g., "blockdrive-ea") */
  id: string;
  /** Display name (e.g., "Executive Assistant") */
  name: string;
  /** C-Suite title (e.g., "Chief Financial Agent") */
  title: string;
  /** Department namespace (e.g., "cfa", "ea", "coa") */
  namespace: string;
  /** This agent's model stack */
  modelStack: ModelStack;
  /** Namespace isolation scope */
  scope: ToolScope;
  /** Communication channels this agent operates on */
  channels: AgentChannel[];
  /** Knowledge-work-plugins installed for this agent */
  plugins: PluginName[];
  /** Voice configuration for dual-mode agents (undefined = cognitive-only) */
  voice?: VoiceConfig;
}

/** Agent identity and configuration — discriminated on tier */
export type AgentConfig = AgentConfigBase & (
  | { tier: "executive"; reportsTo: null }
  | { tier: "department-head" | "junior"; reportsTo: string }
);

// ─── Board of Directors (LLM Council) Types ─────────────────────────────────

/** A seat on the board — one model providing its generalized perspective */
export interface BoardMember {
  /** Seat label (e.g., "chairman", "member-gemini", "member-sonar") */
  role: string;
  /** The model occupying this seat */
  model: ModelConfig;
  /** System prompt framing this member's perspective (broad, not domain-specific) */
  perspective: string;
}

/** Board of Directors configuration — LLM Council pattern */
export interface BoardConfig {
  /** Chairman model — synthesizes all perspectives into final output */
  chairman: ModelConfig;
  /** Board members — each provides independent analysis in parallel */
  members: BoardMember[];
  /** Whether to run anonymized peer review (Stage 2) before synthesis */
  enablePeerReview: boolean;
  /** Minimum members that must respond before chairman synthesizes */
  quorum: number;
  /** Max time (ms) to wait for all member responses before proceeding with quorum */
  timeoutMs: number;
  /** Governance advisor model — reviews member analyses for compliance/risk before chairman synthesis */
  governanceAdvisor?: ModelConfig;
}

/** Communication channel for an agent */
export interface AgentChannel {
  type: "web" | "slack" | "telegram" | "email" | "voice";
  /** Channel-specific identifier (Slack channel ID, email address, phone number, etc.) */
  channelId: string;
  /** Whether this agent can send on this channel (vs. receive-only) */
  canSend: boolean;
}

// ─── Namespace Isolation Types ──────────────────────────────────────────────

/** Access level for a resource */
export type AccessLevel = "read" | "readwrite";

/** Scoped access configuration for an agent */
export interface ToolScope {
  /** Supabase tables this agent can query */
  tables: { name: string; access: AccessLevel }[];
  /** Notion databases this agent can access */
  notionDatabases: { id: string; access: AccessLevel }[];
  /** Redis key prefixes this agent can access */
  redisNamespaces: { prefix: string; access: AccessLevel }[];
  /** mem0 agent_ids this agent can query ("*" = all, for executives) */
  mem0Namespaces: { agentId: string; access: AccessLevel }[];
  /** External APIs this agent can call */
  externalApis: string[];
  /** Other agent IDs this agent can directly message */
  canMessage: string[];
}

// ─── Inter-Agent Communication Types ────────────────────────────────────────

/** Message priority levels */
export type MessagePriority = "low" | "normal" | "high" | "urgent";

/** Message types for inter-agent communication */
export type MessageType = "request" | "response" | "notification" | "escalation";

/** Inter-agent message */
export interface AgentMessage {
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID */
  to: string;
  /** Message classification */
  type: MessageType;
  /** Priority level */
  priority: MessagePriority;
  /** Message content */
  payload: {
    subject: string;
    body: string;
    context?: Record<string, unknown>;
    /** Message ID for threaded replies */
    replyTo?: string;
  };
  /** System metadata */
  metadata: {
    id: string;
    timestamp: string;
    /** Seconds until message expires */
    ttl?: number;
    /** Whether sender expects a reply */
    requiresResponse?: boolean;
  };
}

// ─── Model Router Types ─────────────────────────────────────────────────────

/** Chat message format (OpenAI-compatible) */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Options for a model completion call */
export interface CompletionOptions {
  /** Temperature (0-1) */
  temperature?: number;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string[];
  /** Response format */
  responseFormat?: { type: "text" | "json_object" };
  /** Streaming callback */
  onToken?: (token: string) => void;
  /**
   * Enable Anthropic prompt caching. Marks the system prompt (and optionally
   * the first N conversation messages) as cacheable with a 5-minute TTL.
   * Cache reads are 90% cheaper; cache writes cost 25% more (one-time).
   * Only affects Anthropic provider — ignored by other providers.
   */
  cacheControl?: {
    /** Cache the system prompt (default: true when cacheControl is set) */
    system?: boolean;
    /** Number of leading conversation messages to include in cached prefix (0 = none) */
    prefixMessages?: number;
  };
}

/** Router-level completion options with agent tracking */
export interface RouterCompletionOptions extends CompletionOptions {
  /** Agent ID for usage tracking */
  agentId?: string;
}

/** Result from a model completion call */
export interface CompletionResult {
  content: string;
  model: string;
  provider: ModelProvider;
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Tokens written to cache this request (25% surcharge on input price) */
    cacheCreationTokens?: number;
    /** Tokens read from cache this request (90% discount on input price) */
    cacheReadTokens?: number;
  };
  latencyMs: number;
  /** Whether this result came from cache */
  cached: boolean;
}

/** Usage event for cost tracking */
export interface UsageEvent {
  agentId: string;
  modelAlias: string;
  provider: ModelProvider;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  timestamp: string;
  capability: ModelCapability;
  cached: boolean;
}

// ─── Voice / ElevenLabs Types ───────────────────────────────────────────────

/** TTS model for voice synthesis — Flash for low-latency conversations, Turbo for quality */
export type VoiceModel =
  | "eleven_flash_v2_5"     // Sub-75ms latency, ideal for real-time conversation
  | "eleven_turbo_v2"       // Higher quality, ~150ms latency
  | "eleven_multilingual_v2"; // Highest quality, multi-language

/** STT model for speech recognition */
export type TranscriptionModel =
  | "scribe_v2_realtime"    // Real-time streaming transcription
  | "scribe_v1";            // File-based transcription (async)

/** How an agent uses voice — determines runtime behavior */
export type VoiceMode =
  | "conversational"   // Full ElevenLabs Conversational AI agent (phone calls, real-time voice)
  | "tts-only"         // Text-to-speech output only (voice messages in Slack/Telegram)
  | "stt-only";        // Speech-to-text input only (accept voice, reply as text)

/** Voice configuration for dual-mode agents */
export interface VoiceConfig {
  /** ElevenLabs voice ID (from voice library or custom clone) */
  voiceId: string;
  /** ElevenLabs Conversational AI agent ID (created via API or dashboard) */
  agentId?: string;
  /** Twilio/SIP phone number ID for inbound/outbound calls */
  phoneNumberId?: string;
  /** How this agent uses voice */
  mode: VoiceMode;
  /** TTS model — Flash for conversation, Turbo/Multilingual for quality */
  ttsModel: VoiceModel;
  /** STT model — realtime for live, v1 for file uploads */
  sttModel: TranscriptionModel;
  /** TTS parameters */
  ttsParams?: {
    /** Voice stability (0-1, higher = more consistent) */
    stability?: number;
    /** Speech speed multiplier (0.5-2.0, default 1.0) */
    speed?: number;
    /** Similarity boost (0-1, higher = closer to original voice) */
    similarityBoost?: number;
  };
  /** First message the agent speaks when answering a call */
  firstMessage?: string;
  /** Max call duration in seconds (default: 600 = 10 min) */
  maxCallDurationSecs?: number;
}

/** Batch call recipient for outbound calling campaigns */
export interface BatchCallRecipient {
  /** Phone number to call (E.164 format) */
  phoneNumber: string;
  /** Dynamic variables passed into the call prompt */
  dynamicVariables?: Record<string, string>;
}

/** Result of a completed voice conversation */
export interface ConversationResult {
  /** ElevenLabs conversation ID */
  conversationId: string;
  /** Agent that handled the conversation */
  agentId: string;
  /** Full transcript */
  transcript: string;
  /** Call duration in seconds */
  durationSecs: number;
  /** Whether the call was successful (connected + spoke) */
  successful: boolean;
  /** Timestamp */
  timestamp: string;
}

// ─── NextGenSwitch / Telephony Types ─────────────────────────────────────

/** NextGenSwitch PBX configuration for voice telephony */
export interface NextGenSwitchConfig {
  /** NextGenSwitch base URL (e.g., https://sales.blockdrive.co) */
  baseUrl: string;
  /** API key for NextGenSwitch REST API authentication */
  apiKey: string;
  /** AI Assistant ID for inbound call routing */
  assistantId?: string;
  /** Campaign ID for outbound calling */
  campaignId?: string;
  /** WebSocket path for media streams (default: /voice/ws) */
  wsPath?: string;
}

// ─── Provider Credentials ───────────────────────────────────────────────────

/** All provider API credentials */
export interface ProviderCredentials {
  anthropicApiKey: string;
  openRouterApiKey: string;
  perplexityApiKey: string;
  cohereApiKey: string;
  /** ElevenLabs API key for voice transport (TTS, STT, Conversational AI) */
  elevenlabsApiKey?: string;
  /** Optional Cloudflare AI Gateway for caching/logging/rate-limiting */
  cfGateway?: {
    accountId: string;
    gatewayId: string;
  };
}
