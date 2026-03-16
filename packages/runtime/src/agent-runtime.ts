/**
 * AgentRuntime — The Engine Behind Every Cognitive Agent
 *
 * Each C-Suite agent instantiates an AgentRuntime with its config,
 * system prompt, and MCP tools. The runtime handles everything else:
 *
 *   - Express server with health, chat, and custom routes
 *   - Claude Agent SDK query execution with SSE streaming
 *   - Persistent memory enrichment (org-scoped + session-scoped)
 *   - Redis connection (semantic cache, plugin vector search)
 *   - Plugin loader (knowledge-work-plugins skill resolution)
 *   - Auth middleware (Supabase JWT + org membership verification)
 *   - Telegram transport (MessageBus inter-agent communication)
 *   - Graceful shutdown (Redis disconnect, Telegram bot stop)
 *
 * Usage (in an agent's entry point):
 *
 *   const runtime = new AgentRuntime({
 *     config: CFA_CONFIG,
 *     systemPrompt: CFA_SYSTEM_PROMPT,
 *     createMcpServer: (orgId, userId) => createCfaMcpServer(orgId, userId),
 *     // ... other options
 *   });
 *   await runtime.start();
 */

import express, { type Express, type Router } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentConfig,
  GovernanceConfig,
  ModelRouter,
} from "@waas/shared";
import { ModelRouter as ModelRouterImpl, BLOCKDRIVE_GOVERNANCE } from "@waas/shared";
import { GovernanceEngine } from "./lib/governance.js";
import { getRedis, disconnectRedis } from "./lib/redis-client.js";
import { RedisMemoryClient, type MemoryClient } from "./lib/redis-memory.js";
import { SemanticCache } from "./lib/semantic-cache.js";
import { AgentMemoryServerClient } from "./lib/agent-memory-server.js";
import { FeatureStore } from "./lib/feature-store.js";
import { TelemetryClient } from "./lib/telemetry.js";
import { initSentry, initPostHog, shutdownObservability, Sentry } from "./lib/observability.js";
import { setPluginsDir, loadPluginRegistry } from "./lib/plugin-loader.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createChatRouter } from "./routes/chat.js";
import { TelegramTransport, type TelegramTransportConfig } from "./transport/telegram.js";
import { createWebhookRouter, type WebhookHandler } from "./routes/webhook.js";
import {
  MessageBus, ScopeEnforcer, AGENT_SCOPES,
  type AgentMessage, type InboundHandler,
  type RedisClient as SharedRedisClient,
} from "@waas/shared";

// ─── Configuration ─────────────────────────────────────────────────────────

export interface AgentRuntimeConfig {
  /** Agent configuration from the shared registry */
  config: AgentConfig;
  /** Base system prompt — the agent's personality and instructions */
  systemPrompt: string;
  /** Factory function that creates org-scoped MCP tools (via createSdkMcpServer) */
  createMcpServer: (orgId: string, userId: string) => McpSdkServerConfigWithInstance;

  /** Environment variables (pulled from process.env by the agent) */
  env: {
    port?: number;
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
    redisUrl?: string;
    pluginsDir?: string;

    /** CF Analytics Engine telemetry endpoint (optional — falls back to Supabase) */
    telemetryEndpoint?: string;
    /** Bearer token for the telemetry endpoint */
    telemetryApiKey?: string;

    /** Provider API keys for the model router */
    anthropicApiKey: string;
    openRouterApiKey?: string;
    perplexityApiKey?: string;
    cohereApiKey?: string;
    cfGatewayAccountId?: string;
    cfGatewayId?: string;
  };

  /** Telegram bot config for inter-agent messaging */
  telegram?: TelegramTransportConfig;

  /** Optional custom routes to mount on the Express app */
  customRoutes?: Array<{ path: string; router: Router }>;

  /** Optional post-response hook (knowledge extraction, etc.) */
  onResponse?: (agentId: string, orgId: string, userMessage: string, assistantText: string, conversationId: string) => void | Promise<void>;

  /** CORS origins (defaults to ["http://localhost:5173", "http://localhost:3000"]) */
  corsOrigins?: string[];

  /** Rate limit per window (defaults to 100 requests per 15 minutes) */
  rateLimitMax?: number;

  /** Trust proxy setting for Express (defaults to 1 for single reverse proxy) */
  trustProxy?: boolean | number | string;

  /** Governance config override (defaults to BLOCKDRIVE_GOVERNANCE) */
  governance?: GovernanceConfig;

  /** Webhook secret for X-Webhook-Secret header verification */
  webhookSecret?: string;

  /** Handler for inbound inter-agent messages via MessageBus */
  onAgentMessage?: InboundHandler;

  /** Semantic cache config override (enabled by default when Redis is available) */
  semanticCache?: {
    enabled?: boolean;
    defaultTtlSeconds?: number;
    defaultThreshold?: number;
    crossAgentSharing?: boolean;
    skipModels?: Set<string>;
    cacheableModels?: Set<string>;
  };

  /** Agent Memory Server config (enables two-tier cognitive memory with auto-extraction) */
  agentMemoryServer?: {
    baseUrl: string;
    apiKey?: string;
    timeoutMs?: number;
  };

  /** Feature Store config (enables sub-ms feature serving for sales agents) */
  featureStore?: {
    enabled?: boolean;
  };
}

// ─── Runtime ───────────────────────────────────────────────────────────────

export class AgentRuntime {
  readonly app: Express;
  readonly config: AgentConfig;
  readonly supabaseAdmin: SupabaseClient;
  readonly router: ModelRouter;
  private _memory?: MemoryClient;
  private _semanticCache?: SemanticCache;
  private _featureStore?: FeatureStore;
  readonly governance: GovernanceEngine;
  readonly telemetry: TelemetryClient;

  private telegramTransport?: TelegramTransport;
  private messageBus?: MessageBus;
  private webhookHandlers = new Map<string, WebhookHandler>();
  private runtimeConfig: AgentRuntimeConfig;
  private server?: ReturnType<Express["listen"]>;
  private shutdownRegistered = false;

  constructor(rtConfig: AgentRuntimeConfig) {
    // Initialize observability FIRST — before anything that could fail
    initSentry(rtConfig.config.id);
    initPostHog();

    this.runtimeConfig = rtConfig;
    this.config = rtConfig.config;

    // ── Supabase ──
    this.supabaseAdmin = createClient(
      rtConfig.env.supabaseUrl,
      rtConfig.env.supabaseServiceRoleKey,
    );

    // ── Model Router ──
    const creds = {
      anthropicApiKey: rtConfig.env.anthropicApiKey,
      openRouterApiKey: rtConfig.env.openRouterApiKey ?? "",
      perplexityApiKey: rtConfig.env.perplexityApiKey ?? "",
      cohereApiKey: rtConfig.env.cohereApiKey ?? "",
      cfGateway: rtConfig.env.cfGatewayAccountId && rtConfig.env.cfGatewayId
        ? { accountId: rtConfig.env.cfGatewayAccountId, gatewayId: rtConfig.env.cfGatewayId }
        : undefined,
    };
    this.router = new ModelRouterImpl(rtConfig.config.modelStack, creds);

    // ── Memory (RedisMemoryClient created in start() after Redis connects) ──

    // ── Telemetry ──
    this.telemetry = new TelemetryClient({
      agentId: rtConfig.config.id,
      endpoint: rtConfig.env.telemetryEndpoint,
      apiKey: rtConfig.env.telemetryApiKey,
      supabase: this.supabaseAdmin,
    });

    // ── Governance ──
    const govConfig = rtConfig.governance ?? structuredClone(BLOCKDRIVE_GOVERNANCE);
    // Inject C-Suite group chat ID from env if not already set
    if (!govConfig.csuiteGroupChatId && process.env.CSUITE_TELEGRAM_CHAT_ID) {
      govConfig.csuiteGroupChatId = process.env.CSUITE_TELEGRAM_CHAT_ID;
    }
    // Inject authorized approver IDs from env (comma-separated Telegram user IDs)
    if (govConfig.authorizedApproverIds.length === 0 && process.env.GOVERNANCE_APPROVER_IDS) {
      govConfig.authorizedApproverIds = process.env.GOVERNANCE_APPROVER_IDS
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));
    }
    this.governance = new GovernanceEngine({
      governance: govConfig,
      agentId: rtConfig.config.id,
      agentName: rtConfig.config.name,
      getRedis: () => getRedis(rtConfig.env.redisUrl),
    });

    // ── Express App ──
    this.app = express();
    this.setupMiddleware(rtConfig);
    this.setupRoutes(rtConfig);
  }

  /**
   * Register a webhook handler for a Supabase table.
   * Called before start() by agent entry points.
   */
  onWebhook(table: string, handler: WebhookHandler): void {
    this.webhookHandlers.set(table, handler);
  }

  /**
   * Get the MessageBus instance for inter-agent communication.
   * Available after start() completes. Returns undefined if Redis is not configured.
   */
  getMessageBus(): MessageBus | undefined {
    return this.messageBus;
  }

  /**
   * Start the agent runtime:
   *   1. Connect Redis
   *   2. Load plugin registry
   *   3. Start Telegram bots
   *   4. Initialize MessageBus
   *   5. Start Express server
   *   6. Register graceful shutdown
   */
  async start(): Promise<void> {
    const agentId = this.config.id;
    const port = this.runtimeConfig.env.port ?? 3001;

    // Parallel initialization
    const [redisResult, pluginsResult, telegramResult] = await Promise.allSettled([
      this.runtimeConfig.env.redisUrl
        ? getRedis(this.runtimeConfig.env.redisUrl)
        : Promise.resolve(null),
      this.initializePlugins(),
      this.initializeTelegram(),
    ]);

    if (redisResult.status === "fulfilled" && redisResult.value) {
      console.log(`[${agentId}] Redis connected`);

      // Initialize memory backend — AMS if configured + healthy, else RedisMemoryClient
      const amsConfig = this.runtimeConfig.agentMemoryServer;
      if (amsConfig) {
        try {
          const amsClient = new AgentMemoryServerClient({
            baseUrl: amsConfig.baseUrl,
            agentId,
            orgId: undefined, // Set per-request via the MemoryClient methods
            timeoutMs: amsConfig.timeoutMs,
            apiKey: amsConfig.apiKey,
          });
          const healthy = await amsClient.isHealthy();
          if (healthy) {
            this._memory = amsClient;
            console.log(`[${agentId}] AgentMemoryServer initialized (healthy)`);
          } else {
            console.warn(`[${agentId}] AgentMemoryServer unhealthy, falling back to RedisMemoryClient`);
          }
        } catch (amsErr) {
          console.error(`[${agentId}] AgentMemoryServer failed, falling back to RedisMemoryClient:`, amsErr);
          Sentry.captureException(amsErr);
        }
      }

      // RedisMemoryClient: primary (no AMS configured) or fallback (AMS failed)
      if (!this._memory) {
        try {
          this._memory = new RedisMemoryClient({ redis: redisResult.value, router: this.router });
          console.log(`[${agentId}] RedisMemoryClient initialized${amsConfig ? " (AMS fallback)" : ""}`);
        } catch (memErr) {
          console.error(`[${agentId}] RedisMemoryClient creation failed:`, memErr);
        }
      }

      // Initialize Semantic Cache (enabled by default when Redis is available)
      const cacheConfig = this.runtimeConfig.semanticCache;
      if (cacheConfig?.enabled !== false) {
        try {
          this._semanticCache = new SemanticCache({
            redis: redisResult.value,
            router: this.router,
            agentId,
            defaultTtlSeconds: cacheConfig?.defaultTtlSeconds,
            defaultThreshold: cacheConfig?.defaultThreshold,
            crossAgentSharing: cacheConfig?.crossAgentSharing,
            skipModels: cacheConfig?.skipModels,
            cacheableModels: cacheConfig?.cacheableModels,
          });
          await this._semanticCache.ensureIndex();
          console.log(`[${agentId}] SemanticCache initialized`);
        } catch (cacheErr) {
          console.error(`[${agentId}] SemanticCache creation failed (non-fatal):`, cacheErr);
          this._semanticCache = undefined;
        }
      }

      // Initialize Feature Store (only when explicitly enabled)
      if (this.runtimeConfig.featureStore?.enabled) {
        try {
          this._featureStore = new FeatureStore({
            redis: redisResult.value,
            router: this.router,
            orgId: "", // Org ID set per-request via tool closures
          });
          await this._featureStore.initializeIndexes();
          console.log(`[${agentId}] FeatureStore initialized`);
        } catch (fsErr) {
          console.error(`[${agentId}] FeatureStore creation failed (non-fatal):`, fsErr);
          this._featureStore = undefined;
        }
      }
    } else if (redisResult.status === "rejected") {
      console.error(`[${agentId}] Redis initialization failed:`, redisResult.reason);
    }
    if (pluginsResult.status === "rejected") {
      console.error(`[${agentId}] Plugin initialization failed:`, pluginsResult.reason);
    }
    if (telegramResult.status === "rejected") {
      console.error(`[${agentId}] Telegram initialization failed:`, telegramResult.reason);
    }

    // Initialize MessageBus (requires Telegram transport + Redis)
    await this.initializeMessageBus();

    // Start Express
    this.server = this.app.listen(port, () => {
      console.log(`[${agentId}] Agent runtime listening on port ${port}`);
      console.log(`[${agentId}] Health: http://localhost:${port}/health`);
    });

    // Graceful shutdown (register only once — prevents handler leak on restart)
    if (!this.shutdownRegistered) {
      this.shutdownRegistered = true;
      const shutdown = async () => {
        console.log(`\n[${agentId}] Shutting down...`);
        try {
          await this.stop();
        } catch (err) {
          console.error(`[${agentId}] Shutdown error:`, err);
        }
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      process.on("unhandledRejection", (reason) => {
        Sentry.captureException(reason);
        console.error(`[${agentId}] Unhandled rejection:`, reason);
      });
      process.on("uncaughtException", (err) => {
        Sentry.captureException(err);
        console.error(`[${agentId}] Uncaught exception:`, err);
        Sentry.close(2000).finally(() => process.exit(1));
      });
    }
  }

  /**
   * Stop the runtime cleanly.
   */
  async stop(): Promise<void> {
    const stops: Promise<void>[] = [disconnectRedis(), shutdownObservability()];
    if (this.telegramTransport) {
      stops.push(this.telegramTransport.stop());
    }
    if (this.server) {
      stops.push(new Promise<void>((resolve, reject) => {
        // Set a timeout to force-close if connections are hanging (SSE)
        const forceClose = setTimeout(() => {
          console.warn(`[${this.config.id}] Force-closing server after timeout`);
          resolve();
        }, 5_000);

        this.server!.close((err) => {
          clearTimeout(forceClose);
          if (err) reject(err);
          else resolve();
        });
      }));
    }
    await Promise.allSettled(stops);
    console.log(`[${this.config.id}] Shutdown complete`);
  }

  // ─── Internal Setup ──────────────────────────────────────────────────────

  private setupMiddleware(rtConfig: AgentRuntimeConfig): void {
    // Trust proxy (required for rate limiting behind Cloudflare/nginx/etc.)
    if (rtConfig.trustProxy !== undefined) {
      this.app.set("trust proxy", rtConfig.trustProxy);
    } else {
      this.app.set("trust proxy", 1);
    }

    // CORS
    this.app.use(cors({
      origin: rtConfig.corsOrigins ?? ["http://localhost:5173", "http://localhost:3000"],
      credentials: true,
    }));

    // Body parsing
    this.app.use(express.json({ limit: "10mb" }));

    // Rate limiting (skip /health to avoid breaking monitoring probes)
    this.app.use(rateLimit({
      windowMs: 15 * 60 * 1000,
      max: rtConfig.rateLimitMax ?? 100,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === "/health",
    }));
  }

  /** Public accessor — returns current memory client (upgrades to RedisMemoryClient after start()) */
  get memory(): MemoryClient | undefined {
    return this._memory;
  }

  /** Public accessor — returns semantic cache (available after start() if Redis connected) */
  get semanticCache(): SemanticCache | undefined {
    return this._semanticCache;
  }

  /** Public accessor — returns feature store (available after start() if Redis connected + enabled) */
  get featureStore(): FeatureStore | undefined {
    return this._featureStore;
  }

  private setupRoutes(rtConfig: AgentRuntimeConfig): void {
    // Instance-scoped token cache (not module-level singleton)
    const tokenCache = new Map<string, { userId: string; expiresAt: number }>();
    const authMiddleware = createAuthMiddleware(this.supabaseAdmin, { tokenCache });
    // Capture `this` for closures inside object literals
    const runtime = this;

    // Public routes (use getter for hasMemory — _memory is set in start(), not constructor)
    this.app.use(createHealthRouter({
      agentId: this.config.id,
      agentName: this.config.name,
      version: "0.1.0",
      get hasMemory() { return !!runtime._memory; },
      hasTelegram: !!rtConfig.telegram,
    }));

    // Protected routes (memory + cache use getters so they pick up instances after start())
    this.app.use(authMiddleware, createChatRouter({
      agentId: this.config.id,
      systemPrompt: rtConfig.systemPrompt,
      createMcpServer: rtConfig.createMcpServer,
      get memory() { return runtime._memory; },
      get semanticCache() { return runtime._semanticCache; },
      router: this.router,
      getRedis: () => getRedis(rtConfig.env.redisUrl),
      onResponse: rtConfig.onResponse,
      governance: this.governance,
      telemetry: this.telemetry,
      supabase: this.supabaseAdmin,
    }));

    // Webhook route (public — verified by X-Webhook-Secret header, not auth middleware)
    this.app.use(createWebhookRouter(
      { agentId: this.config.id, webhookSecret: rtConfig.webhookSecret ?? process.env.WEBHOOK_SECRET },
      this.webhookHandlers,
    ));

    // Custom routes (each agent adds its own)
    if (rtConfig.customRoutes) {
      for (const { path, router } of rtConfig.customRoutes) {
        this.app.use(path, authMiddleware, router);
      }
    }

    // Sentry error handler (must be after all routes, before 404)
    Sentry.setupExpressErrorHandler(this.app);

    // 404 handler (must be last)
    this.app.use((_req, res) => {
      res.status(404).json({ error: "Not found" });
    });
  }

  private async initializePlugins(): Promise<void> {
    if (this.runtimeConfig.env.pluginsDir) {
      setPluginsDir(this.runtimeConfig.env.pluginsDir);
      loadPluginRegistry();
    }
  }

  private async initializeTelegram(): Promise<void> {
    if (!this.runtimeConfig.telegram) return;

    this.telegramTransport = new TelegramTransport(this.runtimeConfig.telegram);

    // Register governance callback handler on this agent's bot BEFORE polling starts
    const agentBotConfig = this.runtimeConfig.telegram.agents[this.config.id];
    if (agentBotConfig) {
      try {
        this.governance.setupCallbackHandler(this.telegramTransport.getBot(this.config.id));
      } catch (botErr) {
        console.error(`[${this.config.id}] Failed to set up governance callback handler:`, botErr);
        Sentry.captureException(botErr);
      }
    }

    await this.telegramTransport.startPolling();
    console.log(`[${this.config.id}] Telegram transport started`);
  }

  private async initializeMessageBus(): Promise<void> {
    if (!this.telegramTransport) return;

    const agentId = this.config.id;

    try {
      // Get Redis client (may be null if not configured)
      const redisRaw = this.runtimeConfig.env.redisUrl
        ? await getRedis(this.runtimeConfig.env.redisUrl)
        : undefined;

      // Adapt redis npm client (v4+ PascalCase: rPush, lRange, xAdd, xRange) to
      // @waas/shared RedisClient interface (lowercase: rpush, lrange, xadd, xrange).
      // Return types adapted: set/del → void, rpush wraps rest args as array,
      // xRange maps entries to { id, message } shape. All methods MUST be awaited.
      const redis: SharedRedisClient | undefined = redisRaw ? {
        get: (k: string) => redisRaw.get(k),
        set: (k: string, v: string, opts?: { ex?: number }) =>
          opts?.ex ? redisRaw.set(k, v, { EX: opts.ex }).then(() => {}) : redisRaw.set(k, v).then(() => {}),
        del: (k: string) => redisRaw.del(k).then(() => {}),
        keys: (p: string) => redisRaw.keys(p),
        rpush: (k: string, ...vals: string[]) => redisRaw.rPush(k, vals),
        lrange: (k: string, s: number, e: number) => redisRaw.lRange(k, s, e),
        ltrim: (k: string, s: number, e: number) => redisRaw.lTrim(k, s, e).then(() => {}),
        expire: (k: string, secs: number) => redisRaw.expire(k, secs).then(() => {}),
        // Stream operations for MessageBus
        xadd: (k: string, id: string, fields: Record<string, string>, maxlen?: number) =>
          redisRaw.xAdd(k, id, fields, maxlen ? { TRIM: { strategy: "MAXLEN", threshold: maxlen } } : undefined) as Promise<string>,
        xrange: async (k: string, start: string, end: string, count?: number) => {
          const entries = await redisRaw.xRange(k, start, end, count ? { COUNT: count } : undefined);
          return entries.map(e => ({ id: e.id, message: e.message }));
        },
        xlen: (k: string) => redisRaw.xLen(k),
        xtrim: (k: string, maxlen: number) => redisRaw.xTrim(k, "MAXLEN", maxlen),
      } : undefined;

      // Create MessageBus with Telegram transport + Redis for persistence
      this.messageBus = new MessageBus(this.telegramTransport, { redis });

      // Get this agent's scope and create enforcer
      const scope = AGENT_SCOPES[agentId];
      if (scope) {
        const enforcer = new ScopeEnforcer(agentId, scope);
        this.messageBus.registerAgent(agentId, enforcer);
      }

      // Register app-level inbound message handler
      const appHandler = this.runtimeConfig.onAgentMessage;
      if (appHandler) {
        this.messageBus.onMessage(agentId, appHandler);
      } else {
        // Default handler: log + save to memory as cross-department context
        this.messageBus.onMessage(agentId, async (message: AgentMessage) => {
          console.log(
            `[${agentId}] Inbound message from ${message.from}: ${message.payload.subject}`,
          );

          // Persist to memory as cross-department knowledge
          if (this._memory) {
            try {
              await this._memory.addMemory(
                `Inter-agent message from ${message.from}: ${message.payload.subject} — ${message.payload.body}`,
                agentId,
                { metadata: { category: "inter_agent", from: message.from, messageId: message.metadata.id } },
              );
            } catch (memErr) {
              console.error(`[${agentId}] Failed to persist inbound message to memory:`, memErr);
            }
          }

          // Write audit log to agent_messages table
          try {
            const { error: dbError } = await this.supabaseAdmin.from("agent_messages").insert({
              sender_id: message.from,
              target_id: message.to,
              message: `${message.payload.subject}: ${message.payload.body}`,
              priority: message.priority,
              status: "delivered",
            });
            if (dbError) {
              console.error(`[${agentId}] Failed to write audit log: ${dbError.message}`);
            }
          } catch (dbErr) {
            console.error(`[${agentId}] Failed to write audit log:`, dbErr);
          }
        });
      }

      console.log(`[${agentId}] MessageBus initialized`);
    } catch (err) {
      console.error(`[${agentId}] MessageBus initialization failed:`, err);
      Sentry.captureException(err);
    }
  }
}
