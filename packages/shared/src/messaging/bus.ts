/**
 * Inter-Agent Message Bus — Telegram Transport Layer
 *
 * The "phone system" for the C-Suite. Every agent gets a Telegram bot;
 * department groups host team communication. The MessageBus routes
 * messages between agents via Telegram, enforces namespace scoping,
 * and persists message history in Redis for thread reconstruction.
 *
 * Architecture:
 *   Agent → MessageBus.send() → scope check → MessageTransport.send() → Telegram Bot API
 *   Telegram webhook → MessageTransport.onMessage() → MessageBus handler → Agent
 *
 * Transport is injectable — Telegram is primary, but the interface
 * allows test doubles and future transports (Slack DMs, email).
 */

import type {
  AgentMessage,
  MessagePriority,
  MessageType,
} from "../types.js";
import type { ScopeEnforcer, RedisClient } from "../namespace/index.js";
import { getChainOfCommand } from "../agents.js";

// ─── Transport Interface ────────────────────────────────────────────────────

/**
 * Transport layer abstraction. The agent runtime package provides a
 * TelegramTransport that implements this using grammy/telegraf.
 */
export interface MessageTransport {
  /** Deliver a message to the recipient via the transport */
  send(message: AgentMessage): Promise<TransportReceipt>;
  /** Register a handler for messages arriving at an agent */
  onMessage(agentId: string, handler: InboundHandler): void;
  /** Remove a handler for an agent */
  offMessage(agentId: string): void;
}

/** What the transport returns after delivery */
export interface TransportReceipt {
  /** Transport-native message ID (e.g., Telegram message_id) */
  transportId: string;
  /** ISO timestamp of delivery */
  deliveredAt: string;
}

/** Inbound message handler — returns a reply or void */
export type InboundHandler = (message: AgentMessage) => Promise<AgentMessage | void>;

// ─── Message Draft ──────────────────────────────────────────────────────────

/** What a caller provides to send a message. Metadata is auto-generated. */
export interface MessageDraft {
  from: string;
  to: string;
  type: MessageType;
  priority?: MessagePriority;
  subject: string;
  body: string;
  context?: Record<string, unknown>;
  replyTo?: string;
  ttl?: number;
  requiresResponse?: boolean;
}

// ─── Delivery Receipt ───────────────────────────────────────────────────────

/** Full delivery receipt with both internal and transport IDs */
export interface DeliveryReceipt {
  /** Internal message ID (UUID) */
  messageId: string;
  /** ISO timestamp of delivery */
  deliveredAt: string;
  /** Transport-native ID (Telegram message_id, etc.) */
  transportId?: string;
}

// ─── Message Bus ────────────────────────────────────────────────────────────

/** Redis key prefixes for message storage */
const REDIS_PREFIX = {
  message: "blockdrive:msg:",
  inbox: "blockdrive:inbox:",
  thread: "blockdrive:thread:",
} as const;

/** Default TTL for stored messages (7 days) */
const DEFAULT_MESSAGE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Default timeout for request-response pattern (30 seconds) */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Max inbox size (capped via LTRIM) */
const MAX_INBOX_SIZE = 500;

export class MessageBus {
  private transport: MessageTransport;
  private scopeEnforcers = new Map<string, ScopeEnforcer>();
  private appHandlers = new Map<string, InboundHandler>();
  private redis?: RedisClient;
  private pendingRequests = new Map<string, {
    resolve: (msg: AgentMessage) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(transport: MessageTransport, opts?: { redis?: RedisClient }) {
    this.transport = transport;
    this.redis = opts?.redis;
  }

  /** Register an agent with its scope enforcer so the bus can check permissions */
  registerAgent(agentId: string, enforcer: ScopeEnforcer): void {
    this.scopeEnforcers.set(agentId, enforcer);
    this.wireTransportHandler(agentId);
  }

  /** Unregister an agent from the bus */
  unregisterAgent(agentId: string): void {
    this.scopeEnforcers.delete(agentId);
    this.appHandlers.delete(agentId);
    this.transport.offMessage(agentId);
  }

  /**
   * Send a message. Scope-checked against sender's canMessage permissions.
   * Auto-generates message ID and timestamp.
   * Fail-closed: unregistered senders are denied.
   */
  async send(draft: MessageDraft): Promise<DeliveryReceipt> {
    // Fail-closed: sender MUST be registered with a scope enforcer
    const enforcer = this.scopeEnforcers.get(draft.from);
    if (!enforcer) {
      throw new Error(
        `Access denied: agent '${draft.from}' is not registered with the message bus.`,
      );
    }

    // Scope check: can sender message recipient?
    if (!enforcer.checkMessageAccess(draft.to)) {
      throw new Error(
        `Access denied: agent '${draft.from}' cannot message '${draft.to}'. ` +
        `Check canMessage in scope config.`,
      );
    }

    const message = this.draftToMessage(draft);

    // Persist before sending (at-least-once delivery)
    await this.persistMessage(message);

    // Send via transport (Telegram)
    const receipt = await this.transport.send(message);

    return {
      messageId: message.metadata.id,
      deliveredAt: receipt.deliveredAt,
      transportId: receipt.transportId,
    };
  }

  /**
   * Request-response pattern. Sends a message and waits for a reply
   * with matching replyTo. Used for synchronous inter-agent queries.
   *
   * Example: CFA asks IR to research a company, waits for the response.
   */
  async request(
    draft: Omit<MessageDraft, "requiresResponse">,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<AgentMessage> {
    const fullDraft: MessageDraft = { ...draft, requiresResponse: true };
    const message = this.draftToMessage(fullDraft);

    // Fail-closed: sender MUST be registered
    const enforcer = this.scopeEnforcers.get(draft.from);
    if (!enforcer) {
      throw new Error(
        `Access denied: agent '${draft.from}' is not registered with the message bus.`,
      );
    }

    // Scope check
    if (!enforcer.checkMessageAccess(draft.to)) {
      throw new Error(
        `Access denied: agent '${draft.from}' cannot message '${draft.to}'.`,
      );
    }

    // Create pending request promise
    const responsePromise = new Promise<AgentMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.metadata.id);
        reject(new Error(
          `Request timeout: no response from '${draft.to}' within ${timeoutMs}ms. ` +
          `Message: ${draft.subject}`,
        ));
      }, timeoutMs);

      this.pendingRequests.set(message.metadata.id, { resolve, reject, timer });
    });

    // Persist + send
    await this.persistMessage(message);
    await this.transport.send(message);

    return responsePromise;
  }

  /**
   * Register an application-level handler for an agent's incoming messages.
   * This is called AFTER the bus's internal handler (persistence, request resolution).
   * Safe to call multiple times — replaces the previous app handler without
   * losing the bus's internal persistence/resolution logic.
   */
  onMessage(agentId: string, handler: InboundHandler): void {
    this.appHandlers.set(agentId, handler);
    this.wireTransportHandler(agentId);
  }

  /**
   * Escalate an issue up the chain of command. Sends an escalation message
   * to the sender's immediate superior (reportsTo).
   *
   * Example: IR escalates to CFA, CFA escalates to COA.
   */
  async escalate(
    from: string,
    subject: string,
    body: string,
    context?: Record<string, unknown>,
  ): Promise<DeliveryReceipt> {
    const chain = getChainOfCommand(from);
    if (chain.length < 2) {
      throw new Error(
        `Cannot escalate: agent '${from}' has no superior in the chain of command.`,
      );
    }

    // chain[0] is the agent itself, chain[1] is its direct report-to
    const superior = chain[1];

    // Escalation bypasses canMessage scope (by design — upward escalation
    // is always permitted along the chain of command). We skip send() and
    // go through transport directly after persist.
    const message = this.draftToMessage({
      from,
      to: superior.id,
      type: "escalation",
      priority: "high",
      subject,
      body,
      context,
      requiresResponse: true,
    });

    await this.persistMessage(message);
    const receipt = await this.transport.send(message);

    return {
      messageId: message.metadata.id,
      deliveredAt: receipt.deliveredAt,
      transportId: receipt.transportId,
    };
  }

  /**
   * Broadcast a message to multiple recipients. Each send is scope-checked
   * independently. Returns receipts for successful deliveries.
   */
  async broadcast(
    from: string,
    targets: string[],
    subject: string,
    body: string,
    opts?: { priority?: MessagePriority; context?: Record<string, unknown> },
  ): Promise<DeliveryReceipt[]> {
    const results = await Promise.allSettled(
      targets.map(to =>
        this.send({
          from,
          to,
          type: "notification",
          priority: opts?.priority ?? "normal",
          subject,
          body,
          context: opts?.context,
        }),
      ),
    );

    const receipts: DeliveryReceipt[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        receipts.push(result.value);
      } else {
        console.error(`Broadcast to '${targets[i]}' failed:`, result.reason);
      }
    }
    return receipts;
  }

  /**
   * Get a full message thread (all messages in a reply chain).
   * Requires Redis for persistence. Uses LIST-based thread tracking.
   */
  async getThread(messageId: string): Promise<AgentMessage[]> {
    if (!this.redis) return [];

    const threadKey = `${REDIS_PREFIX.thread}${messageId}`;
    // Thread members stored in a Redis list
    const threadMsgIds = await this.redis.lrange(threadKey, 0, -1);

    if (threadMsgIds.length === 0) {
      // Try loading the root message directly
      const rootRaw = await this.redis.get(`${REDIS_PREFIX.message}${messageId}`);
      return rootRaw ? [JSON.parse(rootRaw) as AgentMessage] : [];
    }

    const messages: AgentMessage[] = [];
    for (const id of threadMsgIds) {
      const raw = await this.redis.get(`${REDIS_PREFIX.message}${id}`);
      if (raw) messages.push(JSON.parse(raw) as AgentMessage);
    }

    // Sort by timestamp
    messages.sort((a, b) =>
      new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime(),
    );
    return messages;
  }

  /**
   * Get recent messages for an agent (inbox).
   * Requires Redis for persistence. Uses LIST-based inbox (atomic RPUSH).
   */
  async getInbox(agentId: string, limit = 50): Promise<AgentMessage[]> {
    if (!this.redis) return [];

    const inboxKey = `${REDIS_PREFIX.inbox}${agentId}`;
    // Read the most recent `limit` message IDs from the list
    const messageIds = await this.redis.lrange(inboxKey, -limit, -1);
    if (messageIds.length === 0) return [];

    const messages: AgentMessage[] = [];
    for (const id of messageIds) {
      const msgRaw = await this.redis.get(`${REDIS_PREFIX.message}${id}`);
      if (msgRaw) messages.push(JSON.parse(msgRaw) as AgentMessage);
    }

    return messages;
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  /** Convert a MessageDraft to a fully-formed AgentMessage */
  private draftToMessage(draft: MessageDraft): AgentMessage {
    return {
      from: draft.from,
      to: draft.to,
      type: draft.type,
      priority: draft.priority ?? "normal",
      payload: {
        subject: draft.subject,
        body: draft.body,
        context: draft.context,
        replyTo: draft.replyTo,
      },
      metadata: {
        id: generateMessageId(),
        timestamp: new Date().toISOString(),
        ttl: draft.ttl,
        requiresResponse: draft.requiresResponse,
      },
    };
  }

  /**
   * Wire the transport handler for an agent. Composes internal bus logic
   * (persistence, request resolution) with the app-level handler if set.
   */
  private wireTransportHandler(agentId: string): void {
    this.transport.onMessage(agentId, async (message) => {
      await this.persistMessage(message);
      this.resolvePendingRequest(message);

      const appHandler = this.appHandlers.get(agentId);
      if (appHandler) {
        try {
          return await appHandler(message);
        } catch (err) {
          console.error(`[${agentId}] App handler error for message ${message.metadata.id}:`, err);
        }
      }
      return undefined;
    });
  }

  /**
   * Persist a message to Redis (inbox + thread tracking).
   * Uses atomic LIST operations (RPUSH + LTRIM) to prevent inbox race conditions.
   */
  private async persistMessage(message: AgentMessage): Promise<void> {
    if (!this.redis) return;

    try {
      const ttl = message.metadata.ttl ?? DEFAULT_MESSAGE_TTL_SECONDS;

      // Store the message itself
      await this.redis.set(
        `${REDIS_PREFIX.message}${message.metadata.id}`,
        JSON.stringify(message),
        { ex: ttl },
      );

      // Atomic append to recipient's inbox list (no read-modify-write race)
      const inboxKey = `${REDIS_PREFIX.inbox}${message.to}`;
      await this.redis.rpush(inboxKey, message.metadata.id);
      await this.redis.ltrim(inboxKey, -MAX_INBOX_SIZE, -1);
      await this.redis.expire(inboxKey, ttl);

      // Thread tracking: if this is a reply, add to root thread's member list
      if (message.payload.replyTo) {
        const threadKey = `${REDIS_PREFIX.thread}${message.payload.replyTo}`;
        await this.redis.rpush(threadKey, message.metadata.id);
        await this.redis.expire(threadKey, ttl);
      }
    } catch (err) {
      console.error(`Failed to persist message ${message.metadata.id}:`, err);
    }
  }

  /** Check if an inbound message resolves a pending request */
  private resolvePendingRequest(message: AgentMessage): void {
    if (!message.payload.replyTo) return;

    const pending = this.pendingRequests.get(message.payload.replyTo);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(message.payload.replyTo);
      pending.resolve(message);
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Generate a unique message ID (timestamp prefix for sortability) */
function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `msg-${timestamp}-${random}`;
}
