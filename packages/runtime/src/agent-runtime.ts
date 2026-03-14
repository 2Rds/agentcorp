/**
 * AgentRuntime — The Engine Behind Every Cognitive Agent
 *
 * Each C-Suite agent instantiates an AgentRuntime with its config,
 * system prompt, and MCP tools. The runtime handles everything else:
 *
 *   - Express server with health, chat, and custom routes
 *   - Claude Agent SDK query execution with SSE streaming
 *   - mem0 memory enrichment (org-scoped + session-scoped)
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
import { Mem0Client } from "./lib/mem0-client.js";
import { initSentry, initPostHog, shutdownObservability, Sentry } from "./lib/observability.js";
import { setPluginsDir, loadPluginRegistry } from "./lib/plugin-loader.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createChatRouter } from "./routes/chat.js";
import { TelegramTransport, type TelegramTransportConfig } from "./transport/telegram.js";

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
    mem0ApiKey?: string;
    mem0OrgId?: string;
    mem0ProjectId?: string;
    pluginsDir?: string;

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
}

// ─── Runtime ───────────────────────────────────────────────────────────────

export class AgentRuntime {
  readonly app: Express;
  readonly config: AgentConfig;
  readonly supabaseAdmin: SupabaseClient;
  readonly router: ModelRouter;
  readonly mem0?: Mem0Client;
  readonly governance: GovernanceEngine;

  private telegramTransport?: TelegramTransport;
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

    // ── mem0 ──
    if (rtConfig.env.mem0ApiKey) {
      this.mem0 = new Mem0Client({
        apiKey: rtConfig.env.mem0ApiKey,
        organizationId: rtConfig.env.mem0OrgId,
        projectId: rtConfig.env.mem0ProjectId,
      });
    }

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
   * Start the agent runtime:
   *   1. Connect Redis
   *   2. Load plugin registry
   *   3. Start Telegram bots
   *   4. Start Express server
   *   5. Register graceful shutdown
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
    } else if (redisResult.status === "rejected") {
      console.error(`[${agentId}] Redis initialization failed:`, redisResult.reason);
    }
    if (pluginsResult.status === "rejected") {
      console.error(`[${agentId}] Plugin initialization failed:`, pluginsResult.reason);
    }
    if (telegramResult.status === "rejected") {
      console.error(`[${agentId}] Telegram initialization failed:`, telegramResult.reason);
    }

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

  private setupRoutes(rtConfig: AgentRuntimeConfig): void {
    // Instance-scoped token cache (not module-level singleton)
    const tokenCache = new Map<string, { userId: string; expiresAt: number }>();
    const authMiddleware = createAuthMiddleware(this.supabaseAdmin, { tokenCache });

    // Public routes
    this.app.use(createHealthRouter({
      agentId: this.config.id,
      agentName: this.config.name,
      version: "0.1.0",
      hasMem0: !!this.mem0,
      hasTelegram: !!rtConfig.telegram,
    }));

    // Protected routes
    this.app.use(authMiddleware, createChatRouter({
      agentId: this.config.id,
      systemPrompt: rtConfig.systemPrompt,
      createMcpServer: rtConfig.createMcpServer,
      mem0: this.mem0,
      router: this.router,
      getRedis: () => getRedis(rtConfig.env.redisUrl),
      onResponse: rtConfig.onResponse,
      governance: this.governance,
    }));

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
      this.governance.setupCallbackHandler(this.telegramTransport.getBot(this.config.id));
    }

    await this.telegramTransport.startPolling();
    console.log(`[${this.config.id}] Telegram transport started`);
  }
}
