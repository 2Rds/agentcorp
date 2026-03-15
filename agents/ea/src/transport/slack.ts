/**
 * Slack Transport — Channel-aware EA Slack integration.
 *
 * Three-tier communication pyramid:
 *   Telegram (top)  → Personal/push between Sean and EA
 *   Slack (middle)  → Day-to-day business operations, communications
 *   corp.blockdrive.co (base) → Full agent workspace with all tools
 *
 * The BlockDrive Bot (EA agent) has admin access to ALL channels.
 * Department agents operate in their dedicated #workforce-* channels.
 * The EA routes, monitors, and responds across the entire workspace.
 */

import { App } from "@slack/bolt";
import { config } from "../config.js";
import { createAgentQuery } from "../agent/ea-agent.js";
import { Sentry } from "../lib/observability.js";
import { WORKFORCE_CHANNELS, FEED_CHANNELS, classifyChannel, buildSlackContext } from "./channel-config.js";
export { classifyChannel, buildSlackContext } from "./channel-config.js";

let slackApp: App | undefined;

// ─── Runtime State ──────────────────────────────────────────────────────────

/** Channel ID → channel name mapping (resolved at startup) */
const channelIdToName = new Map<string, string>();
const channelNameToId = new Map<string, string>();

/** Conversation history per channel/thread (capped at MAX_THREADS to prevent memory leaks) */
const MAX_THREADS = 500;
const threadHistory = new Map<string, Array<{ role: string; content: string }>>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function threadKey(channel: string, ts?: string): string {
  return ts ? `${channel}:${ts}` : channel;
}

/** Evict oldest thread entries when the map exceeds MAX_THREADS */
function evictOldThreads(): void {
  if (threadHistory.size <= MAX_THREADS) return;
  const excess = threadHistory.size - MAX_THREADS;
  const keys = threadHistory.keys();
  for (let i = 0; i < excess; i++) {
    const { value } = keys.next();
    if (value) threadHistory.delete(value);
  }
}

function getChannelName(channelId: string): string {
  return channelIdToName.get(channelId) || channelId;
}

// ─── Slack Bot Lifecycle ────────────────────────────────────────────────────

export async function startSlackBot(): Promise<void> {
  if (!config.slackBotToken) return;

  const useSocketMode = !!config.slackAppToken;

  const app = new App({
    token: config.slackBotToken,
    signingSecret: config.slackSigningSecret || undefined,
    socketMode: useSocketMode,
    appToken: useSocketMode ? config.slackAppToken : undefined,
  });

  if (!useSocketMode) {
    console.log("[Slack] Bot initialized (proactive messaging only — set SLACK_APP_TOKEN for event listening)");
    slackApp = app;
    return;
  }

  // ─── Channel Discovery ──────────────────────────────────────────────────
  try {
    let cursor: string | undefined;
    do {
      const result = await app.client.conversations.list({
        types: "public_channel,private_channel,im,mpim",
        limit: 200,
        cursor,
      });
      for (const ch of result.channels || []) {
        if (ch.id && ch.name) {
          channelIdToName.set(ch.id, ch.name);
          channelNameToId.set(ch.name, ch.id);
        }
      }
      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    console.log(`[Slack] Discovered ${channelIdToName.size} channels`);

    // Log workforce channel discovery status
    for (const [name, cfg] of Object.entries(WORKFORCE_CHANNELS)) {
      const id = channelNameToId.get(name);
      console.log(`[Slack]   #${name} (${cfg.department}): ${id ? `OK ${id}` : "NOT FOUND"}`);
    }
  } catch (err) {
    console.warn("[Slack] Channel discovery failed (non-fatal):", err);
  }

  // ─── Direct Message Handler ─────────────────────────────────────────────
  app.message(async ({ message, say, client }) => {
    const msg = message as Record<string, any>;

    // Ignore bot messages (prevents loops)
    if (msg.bot_id || msg.subtype) return;
    if (!msg.text) return;

    const channelName = getChannelName(msg.channel);
    const classification = classifyChannel(channelName);

    // Don't respond in feed channels (notification-only)
    if (classification.type === "feed") return;

    const key = threadKey(msg.channel, msg.thread_ts);
    const messages = threadHistory.get(key) || [];
    messages.push({ role: "user", content: msg.text });

    // Keep last 20 messages for context
    if (messages.length > 20) messages.splice(0, messages.length - 20);
    threadHistory.set(key, messages);
    evictOldThreads();

    try {
      // Resolve user name for context
      let userName = "Slack User";
      try {
        const userInfo = await client.users.info({ user: msg.user! });
        userName = userInfo.user?.real_name || userInfo.user?.name || userName;
      } catch {
        // Non-critical
      }

      // Build channel-aware context and prepend to the latest user message
      const slackContext = buildSlackContext(channelName, userName);
      const enrichedMessages = [...messages];
      const lastIdx = enrichedMessages.length - 1;
      enrichedMessages[lastIdx] = {
        role: "user",
        content: `${slackContext}\n\n${enrichedMessages[lastIdx].content}`,
      };

      const fullResponse = await createAgentQuery({
        messages: enrichedMessages,
        organizationId: config.blockdriveOrgId || "slack-workspace",
        userId: `slack-${msg.user}`,
        conversationId: `slack-${channelName}-${key}`,
      });

      if (fullResponse) {
        messages.push({ role: "assistant", content: fullResponse });
        threadHistory.set(key, messages);

        const replyTs = msg.thread_ts || msg.ts;

        // Slack 40,000 char limit — split if needed
        for (let i = 0; i < fullResponse.length; i += 39000) {
          await say({
            text: fullResponse.slice(i, i + 39000),
            thread_ts: replyTs,
          });
        }
      }
    } catch (err) {
      console.error(`[Slack] Handler error in #${channelName}:`, err);
      Sentry.captureException(err);
      await say({
        text: "Sorry, I encountered an error processing your message.",
        thread_ts: msg.thread_ts || msg.ts,
      }).catch(() => {});
    }
  });

  // ─── @Mention Handler ───────────────────────────────────────────────────
  // When @BlockDrive Bot is mentioned in any channel, EA responds with
  // full channel context awareness. This is the primary way agents get
  // "paged" across channels they don't normally monitor.
  app.event("app_mention", async ({ event, say, client }) => {
    const channelName = getChannelName(event.channel);
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    if (!text) return;

    const key = threadKey(event.channel, event.thread_ts);
    const messages = threadHistory.get(key) || [];
    messages.push({ role: "user", content: text });
    if (messages.length > 20) messages.splice(0, messages.length - 20);
    threadHistory.set(key, messages);
    evictOldThreads();

    try {
      let userName = "Slack User";
      try {
        const userInfo = await client.users.info({ user: event.user! });
        userName = userInfo.user?.real_name || userInfo.user?.name || userName;
      } catch {
        // Non-critical
      }

      const slackContext = buildSlackContext(channelName, userName);
      const enrichedMessages = [...messages];
      const lastIdx = enrichedMessages.length - 1;
      enrichedMessages[lastIdx] = {
        role: "user",
        content: `${slackContext}\n\n${enrichedMessages[lastIdx].content}`,
      };

      const fullResponse = await createAgentQuery({
        messages: enrichedMessages,
        organizationId: config.blockdriveOrgId || "slack-workspace",
        userId: `slack-${event.user}`,
        conversationId: `slack-${channelName}-${key}`,
      });

      if (fullResponse) {
        messages.push({ role: "assistant", content: fullResponse });
        threadHistory.set(key, messages);

        const replyTs = event.thread_ts || event.ts;
        for (let i = 0; i < fullResponse.length; i += 39000) {
          await say({
            text: fullResponse.slice(i, i + 39000),
            thread_ts: replyTs,
          });
        }
      }
    } catch (err) {
      console.error(`[Slack] app_mention error in #${channelName}:`, err);
      Sentry.captureException(err);
      await say({
        text: "Sorry, I encountered an error processing your message.",
        thread_ts: event.thread_ts || event.ts,
      }).catch(() => {});
    }
  });

  await app.start();
  console.log("[Slack] EA Bot started in Socket Mode (admin access — all channels)");
  slackApp = app;
}

export function getSlackApp(): App | undefined {
  return slackApp;
}

export async function stopSlackBot(): Promise<void> {
  if (slackApp) {
    await slackApp.stop();
    slackApp = undefined;
  }
}

// ─── Proactive Messaging ────────────────────────────────────────────────────

/**
 * Send a proactive message to a Slack channel.
 * Used for agent notifications, inter-agent messaging, alerts, and feed posts.
 * Accepts channel name (e.g., "workforce-finance") or channel ID.
 */
export async function sendSlackMessage(channel: string, text: string, threadTs?: string): Promise<void> {
  if (!slackApp || !config.slackBotToken) {
    throw new Error("Slack bot not initialized — cannot send message");
  }

  // Resolve channel name to ID if needed
  const channelId = channelNameToId.get(channel) || channel;

  await slackApp.client.chat.postMessage({
    channel: channelId,
    text,
    thread_ts: threadTs,
  });
}

/**
 * Read recent messages from a Slack channel.
 * EA uses this for monitoring and cross-department awareness.
 */
export async function readSlackChannel(channel: string, limit: number = 10): Promise<Array<{ user: string; text: string; ts: string }>> {
  if (!slackApp || !config.slackBotToken) {
    throw new Error("Slack bot not initialized — cannot read channel");
  }

  const channelId = channelNameToId.get(channel) || channel;

  try {
    const result = await slackApp.client.conversations.history({
      channel: channelId,
      limit,
    });

    return (result.messages || []).map((m) => ({
      user: m.user || "unknown",
      text: m.text || "",
      ts: m.ts || "",
    }));
  } catch (err) {
    console.error(`[Slack] Error reading #${channel}:`, err);
    return [];
  }
}

/**
 * List all channels the bot has access to, with classification.
 */
export function listChannels(): Array<{ name: string; id: string; type: string; description?: string }> {
  const channels: Array<{ name: string; id: string; type: string; description?: string }> = [];

  for (const [id, name] of channelIdToName) {
    const classification = classifyChannel(name);
    channels.push({
      name,
      id,
      type: classification.type,
      description: classification.config?.description || classification.description,
    });
  }

  return channels;
}

/**
 * Resolve a user ID to a display name.
 */
export async function resolveUserName(userId: string): Promise<string> {
  if (!slackApp) return userId;

  try {
    const result = await slackApp.client.users.info({ user: userId });
    return result.user?.real_name || result.user?.name || userId;
  } catch {
    return userId;
  }
}

/**
 * Get the channel ID for a known channel name.
 */
export function getChannelId(channelName: string): string | undefined {
  return channelNameToId.get(channelName);
}
