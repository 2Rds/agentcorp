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
  // NextGenSwitch / telephony types
  NextGenSwitchConfig,
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
  CMA_CONFIG, COMPLIANCE_CONFIG, LEGAL_CONFIG, SALES_CONFIG,
  getAgentConfig, getDirectReports, getChainOfCommand,
} from "./agents.js";
export type { AgentId } from "./agents.js";

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

// Governance
export type {
  ApprovalCategory,
  ApprovalStatus,
  GovernanceConfig,
  PendingApproval,
  SpendEvent,
  GovernanceDecision,
} from "./governance/index.js";
export {
  isPendingApproval,
  BLOCKDRIVE_GOVERNANCE,
  validateGovernanceConfig,
  APPROVAL_TTL_SECONDS,
  APPROVAL_KEY_PREFIX,
  SPEND_KEY_PREFIX,
  APPROVAL_TIMEOUT_MS,
} from "./governance/index.js";

// Plugin mapping
export {
  PLUGIN_INVENTORY, AGENT_PLUGINS,
} from "./plugins.js";
export type { PluginName } from "./plugins.js";
