// Core runtime
export { AgentRuntime } from "./agent-runtime.js";
export type { AgentRuntimeConfig } from "./agent-runtime.js";

// Memory
export { RedisMemoryClient } from "./lib/redis-memory.js";
export type { MemoryClient, Memory, MemoryEvent, MemoryCategory, GraphRelation, GraphMemoryResponse } from "./lib/redis-memory.js";
export { getRedis, isRedisAvailable, disconnectRedis, createIndex, vectorSearch } from "./lib/redis-client.js";
export type { VectorSearchResult, IndexFieldSchema } from "./lib/redis-client.js";
export { sdkMessageToSSE, extractAssistantText } from "./lib/stream-adapter.js";
export {
  setPluginsDir, loadPluginRegistry, resolveSkills,
  resolveSkillsForConversation, getSkillContext, clearSkillContext,
} from "./lib/plugin-loader.js";
export type { ResolvedSkill, SkillContext } from "./lib/plugin-loader.js";

// Middleware
export { createAuthMiddleware } from "./middleware/auth.js";
export type { AuthenticatedRequest } from "./middleware/auth.js";

// Routes
export { createHealthRouter } from "./routes/health.js";
export type { HealthDeps } from "./routes/health.js";
export { createChatRouter } from "./routes/chat.js";
export type { ChatRouteDeps } from "./routes/chat.js";
export { createWebhookRouter } from "./routes/webhook.js";
export type { WebhookPayload, WebhookHandler, WebhookRouteDeps } from "./routes/webhook.js";

// Tool helpers (shared across all agents)
export {
  isAllowedUrl, safeJsonParse, safeFetch, safeFetchText, stripHtml,
} from "./lib/tool-helpers.js";
export type { FetchResult, FetchError } from "./lib/tool-helpers.js";

// Transport
export { TelegramTransport } from "./transport/telegram.js";
export type { TelegramTransportConfig } from "./transport/telegram.js";

// Governance
export { GovernanceEngine } from "./lib/governance.js";
export type { GovernanceEngineConfig, ApprovalRequest } from "./lib/governance.js";

// Voice
export { VoicePipeline } from "./voice/index.js";
export type { VoicePipelineConfig, CallState, CallResult, TranscriptEntry } from "./voice/index.js";
export { VoiceTransport } from "./voice/index.js";
export type { VoiceTransportConfig, OutboundCallParams } from "./voice/index.js";

// ElevenLabs
export { ElevenLabsClient } from "./lib/elevenlabs-client.js";
export type { ElevenLabsConfig, STTSession, TranscriptEvent, Voice } from "./lib/elevenlabs-client.js";

// Telemetry
export { TelemetryClient } from "./lib/telemetry.js";
export type { TelemetryConfig, UsageEvent } from "./lib/telemetry.js";

// Observability
export { initSentry, initPostHog, shutdownObservability, getPostHog, Sentry } from "./lib/observability.js";
