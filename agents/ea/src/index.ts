import { initSentry, initPostHog, shutdownObservability, Sentry } from "./lib/observability.js";

initSentry();
initPostHog();

import express from "express";
import { config } from "./config.js";
import { corsMiddleware } from "./middleware/cors.js";
import { initializeMem0Project } from "./lib/mem0-setup.js";
import { initializeRedisIndexes, disconnectRedis } from "./lib/redis-client.js";
import { loadPluginRegistry } from "./lib/plugin-loader.js";
import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import knowledgeRouter from "./routes/knowledge.js";
import webhooksRouter from "./routes/webhooks.js";
import { createAgentQuery } from "./agent/ea-agent.js";
import { startSlackBot, stopSlackBot } from "./transport/slack.js";

const app = express();

app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));

// Public endpoints
app.use(healthRouter);

// Authenticated routes
app.use(chatRouter);
app.use(knowledgeRouter);
app.use(webhooksRouter);

// Sentry error handler (must be after all routes)
Sentry.setupExpressErrorHandler(app);

// ─── Telegram Bot (direct user chat) ────────────────────────────────────────

let telegramBot: import("grammy").Bot | undefined;

async function startTelegramBot() {
  if (!config.telegramBotToken) return;
  const { Bot } = await import("grammy");
  const bot = new Bot(config.telegramBotToken);
  const allowedChatId = process.env.TELEGRAM_CHAT_ID;

  // Track conversation history per chat
  const chatHistory = new Map<number, Array<{ role: string; content: string }>>();

  bot.on("message:text", async (ctx) => {
    // Security: only respond to allowed chat
    if (allowedChatId && String(ctx.chat.id) !== allowedChatId) return;

    const userMessage = ctx.message.text;
    const chatId = ctx.chat.id;

    // Get or create conversation history
    const messages = chatHistory.get(chatId) || [];
    messages.push({ role: "user", content: userMessage });

    // Keep last 20 messages for context
    if (messages.length > 20) messages.splice(0, messages.length - 20);
    chatHistory.set(chatId, messages);

    try {
      await ctx.replyWithChatAction("typing");

      // Use the EA agent directly (returns string)
      const fullResponse = await createAgentQuery({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        organizationId: "telegram-direct",
        userId: `telegram-${chatId}`,
        conversationId: `tg-${chatId}`,
      });

      if (fullResponse) {
        messages.push({ role: "assistant", content: fullResponse });
        chatHistory.set(chatId, messages);
        // Telegram has 4096 char limit — split if needed
        for (let i = 0; i < fullResponse.length; i += 4000) {
          await ctx.reply(fullResponse.slice(i, i + 4000), { parse_mode: "Markdown" }).catch(() =>
            ctx.reply(fullResponse.slice(i, i + 4000))
          );
        }
      }
    } catch (err) {
      console.error("Telegram handler error:", err);
      Sentry.captureException(err);
      await ctx.reply("Sorry, I encountered an error processing your message.").catch(() => {});
    }
  });

  bot.start({ onStart: () => console.log("Telegram bot started: @alex_executive_assistant_bot") });
  telegramBot = bot;
}

// ─── Server Start ────────────────────────────────────────────────────────────

app.listen(config.port, async () => {
  console.log(`EA Agent (Alex) server listening on port ${config.port}`);
  loadPluginRegistry();
  const results = await Promise.allSettled([
    initializeMem0Project(),
    initializeRedisIndexes(),
    startTelegramBot(),
    startSlackBot(),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Startup initialization failed (non-fatal):", result.reason);
    }
  }
});

// Unhandled errors → Sentry
process.on("unhandledRejection", (reason) => {
  Sentry.captureException(reason);
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  Sentry.captureException(err);
  console.error("Uncaught exception:", err);
  Sentry.close(2000).finally(() => process.exit(1));
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down...");
  telegramBot?.stop();
  await Promise.allSettled([stopSlackBot(), disconnectRedis(), shutdownObservability()]);
  process.exit(0);
});
