// Core runtime
export { AgentRuntime } from "./agent-runtime.js";
export type { AgentRuntimeConfig } from "./agent-runtime.js";

// Lib
export { Mem0Client } from "./lib/mem0-client.js";
export type { Mem0Config, Memory, MemoryEvent, GraphRelation, GraphMemoryResponse } from "./lib/mem0-client.js";
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

// Transport
export { TelegramTransport } from "./transport/telegram.js";
export type { TelegramTransportConfig } from "./transport/telegram.js";
