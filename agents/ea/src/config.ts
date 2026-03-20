import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback: string = ""): string {
  return process.env[name] || fallback;
}

// When CF_AIG_TOKEN is set (Provider Keys), provider API keys become optional
// because the gateway injects them at the edge.
const providerKeysMode = !!process.env.CF_AIG_TOKEN;
const providerKey = providerKeysMode ? optional : required;

export const config = {
  anthropicApiKey: providerKey("ANTHROPIC_API_KEY"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  port: parseInt(process.env.PORT || "3002", 10),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8080").split(",").map(s => s.trim()),

  // @deprecated OpenRouter replaced by CF AI Gateway BYOK (v4.0). Kept for backward compat during migration.
  openRouterApiKey: optional("OPENROUTER_API_KEY"),

  // Cloudflare AI Gateway + Workers AI (optional — falls back to direct URLs)
  cfAccountId: optional("CF_ACCOUNT_ID"),
  cfGatewayId: optional("CF_GATEWAY_ID"),
  cfApiToken: optional("CF_API_TOKEN"),
  cfAigToken: optional("CF_AIG_TOKEN"),

  // Redis (optional — features degrade gracefully without it)
  redisUrl: optional("REDIS_URL"),

  // Cohere (Rerank for plugin resolution)
  cohereApiKey: optional("COHERE_API_KEY"),

  // Google AI Studio (Gemini Embedding 2 for vector search)
  googleAiApiKey: optional("GOOGLE_AI_API_KEY"),

  // Slack integration (optional)
  slackBotToken: optional("SLACK_BOT_TOKEN"),
  slackAppToken: optional("SLACK_APP_TOKEN"),
  slackSigningSecret: optional("SLACK_SIGNING_SECRET"),
  slackAppId: optional("SLACK_APP_ID"),
  slackEnabled: !!process.env.SLACK_BOT_TOKEN,

  // Telegram integration (optional)
  telegramBotToken: optional("TELEGRAM_BOT_TOKEN"),
  telegramWebhookSecret: optional("TELEGRAM_WEBHOOK_SECRET"),
  telegramEnabled: !!process.env.TELEGRAM_BOT_TOKEN,

  // Notion integration (optional — enables agent Notion tools when configured)
  notionApiKey: optional("NOTION_API_KEY"),
  notionEnabled: !!process.env.NOTION_API_KEY,

  // Organization context (required for Slack/Telegram transports to scope DB + memory queries)
  blockdriveOrgId: optional("BLOCKDRIVE_ORG_ID"),

  // Inter-agent messaging
  agentMessageSecret: optional("AGENT_MESSAGE_SECRET"),

  // Database webhooks (Supabase pg_net → Edge Function → EA)
  webhookSecret: optional("WEBHOOK_SECRET"),
} as const;

// ─── Startup validation ───────────────────────────────────────────────────────

if (providerKeysMode) {
  if (!process.env.CF_ACCOUNT_ID || !process.env.CF_GATEWAY_ID) {
    throw new Error(
      "CF_AIG_TOKEN is set (Provider Keys mode) but CF_ACCOUNT_ID and/or CF_GATEWAY_ID are missing. " +
      "Provider Keys requires a fully configured AI Gateway. Either set all three CF_ vars or remove CF_AIG_TOKEN."
    );
  }
}
