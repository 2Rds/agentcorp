/**
 * Telegram Transport — MessageBus Transport Layer
 *
 * Implements the MessageTransport interface from the shared package
 * using grammy (Telegram Bot API). Each agent gets its own Telegram bot;
 * inter-agent messages are sent via bot-to-bot DMs in department groups.
 *
 * Architecture:
 *   Agent → MessageBus.send() → TelegramTransport.send() → Bot API sendMessage
 *   Telegram webhook → bot.on("message") → TelegramTransport handler → MessageBus
 */

import { Bot } from "grammy";
import type {
  MessageTransport,
  TransportReceipt,
  InboundHandler,
  AgentMessage,
} from "@waas/shared";

// ─── Agent Bot Registry ──────────────────────────────────────────────────────

interface AgentBot {
  bot: Bot;
  chatId: string | number;
  handler?: InboundHandler;
}

// ─── Transport Implementation ──────────────────────────────────────────────

export interface TelegramTransportConfig {
  /** Map of agentId → { botToken, chatId } */
  agents: Record<string, { botToken: string; chatId: string | number }>;
}

export class TelegramTransport implements MessageTransport {
  private bots = new Map<string, AgentBot>();
  /** Set of registered chat IDs — messages from unknown chats are rejected */
  private allowedChatIds = new Set<string>();

  constructor(config: TelegramTransportConfig) {
    for (const [agentId, agentConfig] of Object.entries(config.agents)) {
      const bot = new Bot(agentConfig.botToken);
      this.bots.set(agentId, { bot, chatId: agentConfig.chatId });
      // Register this agent's chat ID as allowed
      this.allowedChatIds.add(String(agentConfig.chatId));
    }
  }

  /**
   * Start all bots (long polling). Call once at server startup.
   * For production, use webhooks instead via `setWebhook()`.
   */
  async startPolling(): Promise<void> {
    const startPromises: Promise<void>[] = [];

    for (const [agentId, agentBot] of this.bots) {
      agentBot.bot.on("message:text", async (ctx) => {
        // Security: reject messages from unregistered chat IDs
        if (!this.allowedChatIds.has(String(ctx.chat.id))) {
          console.warn(
            `[${agentId}] Rejected message from unregistered chat ${ctx.chat.id}`,
          );
          return;
        }

        if (!agentBot.handler) return;

        // Parse inbound message — expect JSON body in the text
        let message: AgentMessage;
        try {
          message = JSON.parse(ctx.message.text) as AgentMessage;
        } catch {
          // Non-JSON messages are human messages — could be forwarded to agent
          console.log(`[${agentId}] Non-JSON message from chat ${ctx.chat.id}: ${ctx.message.text.slice(0, 100)}`);
          return;
        }

        try {
          const reply = await agentBot.handler(message);
          if (reply) {
            await ctx.reply(JSON.stringify(reply));
          }
        } catch (err) {
          console.error(`[${agentId}] Handler error for message ${message.metadata.id}:`, err);
        }
      });

      // Catch bot.start() errors instead of fire-and-forget
      const startPromise = new Promise<void>((resolve) => {
        agentBot.bot.start({
          onStart: () => {
            console.log(`Telegram bot started for agent: ${agentId}`);
            resolve();
          },
        });

        // grammy bot.start() doesn't reject on polling errors — attach error handler
        agentBot.bot.catch((err) => {
          console.error(`[${agentId}] Telegram bot error:`, err);
        });

        // Resolve after a short delay if onStart hasn't fired (grammy quirk)
        setTimeout(resolve, 2000);
      });

      startPromises.push(startPromise);
    }

    await Promise.allSettled(startPromises);
  }

  /**
   * Stop all bots gracefully.
   */
  async stop(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.bots.entries()].map(async ([agentId, agentBot]) => {
        await agentBot.bot.stop();
        console.log(`Telegram bot stopped: ${agentId}`);
      }),
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "rejected") {
        const agentId = [...this.bots.keys()][i];
        console.error(`Failed to stop Telegram bot '${agentId}':`, (results[i] as PromiseRejectedResult).reason);
      }
    }
  }

  async send(message: AgentMessage): Promise<TransportReceipt> {
    const recipientBot = this.bots.get(message.to);
    if (!recipientBot) {
      throw new Error(
        `No Telegram bot registered for agent '${message.to}'. ` +
        `Available agents: ${[...this.bots.keys()].join(", ")}`,
      );
    }

    // Send the message as JSON to the recipient's chat
    const senderBot = this.bots.get(message.from);
    const bot = senderBot?.bot ?? recipientBot.bot;

    const sent = await bot.api.sendMessage(
      recipientBot.chatId,
      JSON.stringify(message),
    );

    return {
      transportId: String(sent.message_id),
      deliveredAt: new Date().toISOString(),
    };
  }

  onMessage(agentId: string, handler: InboundHandler): void {
    const agentBot = this.bots.get(agentId);
    if (!agentBot) {
      console.warn(`Cannot register handler: no bot for agent '${agentId}'`);
      return;
    }
    agentBot.handler = handler;
  }

  offMessage(agentId: string): void {
    const agentBot = this.bots.get(agentId);
    if (agentBot) {
      agentBot.handler = undefined;
    }
  }

  /**
   * Get the grammy Bot instance for an agent.
   * Used by GovernanceEngine to register callback handlers.
   */
  getBot(agentId: string): Bot {
    const agentBot = this.bots.get(agentId);
    if (!agentBot) {
      throw new Error(`No Telegram bot for agent '${agentId}'`);
    }
    return agentBot.bot;
  }
}
