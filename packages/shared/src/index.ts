// Core types
export type {
  ModelProvider,
  ModelCapability,
  ModelConfig,
  ModelStack,
  AgentTier,
  AgentConfig,
  AgentChannel,
  AccessLevel,
  ToolScope,
  MessagePriority,
  MessageType,
  AgentMessage,
  ChatMessage,
  CompletionOptions,
  RouterCompletionOptions,
  CompletionResult,
  UsageEvent,
  ProviderCredentials,
  BoardMember,
  BoardConfig,
  // Voice / ElevenLabs types
  VoiceModel,
  TranscriptionModel,
  VoiceMode,
  VoiceConfig,
  BatchCallRecipient,
  ConversationResult,
} from "./types.js";

// Model registry and stacks
export {
  MODEL_REGISTRY, OPUS, GEMINI, SONAR, SONAR_DEEP, COMMAND_A, GRANITE,
  GROK_FAST_REASONING, GROK_FAST,
  COHERE_EMBED, COHERE_RERANK,
  AGENT_STACKS,
  ModelRouter, AnthropicClient, OpenRouterClient, PerplexityClient, CohereDirectClient,
  DEFAULT_BOARD, HIGH_STAKES_BOARD, BoardSession,
} from "./models/index.js";
export type { ModelAlias, ProviderClient, EmbeddingResult, RerankResult, BoardDecision } from "./models/index.js";

// Namespace isolation
export {
  AGENT_SCOPES,
  ScopeEnforcer,
  ScopedRedisClient,
} from "./namespace/index.js";
export type { RedisClient } from "./namespace/index.js";

// Agent configurations
export {
  AGENT_REGISTRY,
  EA_CONFIG, COA_CONFIG, CFA_CONFIG, IR_CONFIG,
  getAgentConfig, getDirectReports, getChainOfCommand,
} from "./agents.js";

// Inter-agent messaging
export {
  MessageBus,
} from "./messaging/index.js";
export type {
  MessageTransport,
  TransportReceipt,
  InboundHandler,
  MessageDraft,
  DeliveryReceipt,
} from "./messaging/index.js";

// Plugin mapping
export {
  PLUGIN_INVENTORY, AGENT_PLUGINS,
} from "./plugins.js";
export type { PluginName } from "./plugins.js";
