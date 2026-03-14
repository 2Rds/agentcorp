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
const providerKeysMode = !!process.env.CF_AIG_TOKEN;
const providerKey = providerKeysMode ? optional : required;

export const config = {
  anthropicApiKey: providerKey("ANTHROPIC_API_KEY"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  port: parseInt(process.env.PORT || "3004", 10),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8080").split(",").map(s => s.trim()),

  openRouterApiKey: providerKey("OPENROUTER_API_KEY"),
  mem0ApiKey: required("MEM0_API_KEY"),

  // Cloudflare AI Gateway (optional)
  cfAccountId: optional("CF_ACCOUNT_ID"),
  cfGatewayId: optional("CF_GATEWAY_ID"),
  cfApiToken: optional("CF_API_TOKEN"),
  cfAigToken: optional("CF_AIG_TOKEN"),

  // Redis (optional)
  redisUrl: optional("REDIS_URL"),

  // Cohere (Rerank for plugin resolution)
  cohereApiKey: optional("COHERE_API_KEY"),

  // Notion integration (optional)
  notionApiKey: optional("NOTION_API_KEY"),
  notionEnabled: !!process.env.NOTION_API_KEY,

  // Telegram (optional)
  telegramBotToken: optional("TELEGRAM_BOT_TOKEN"),
  telegramChatId: optional("TELEGRAM_CHAT_ID"),
  telegramEnabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,

  // Perplexity (optional)
  perplexityApiKey: optional("PERPLEXITY_API_KEY"),
} as const;

// Startup validation
if (providerKeysMode) {
  if (!process.env.CF_ACCOUNT_ID || !process.env.CF_GATEWAY_ID) {
    throw new Error(
      "CF_AIG_TOKEN is set (Provider Keys mode) but CF_ACCOUNT_ID and/or CF_GATEWAY_ID are missing."
    );
  }
}
