import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback: string = ""): string {
  return process.env[name] || fallback;
}

const providerKeysMode = !!process.env.CF_AIG_TOKEN;
const providerKey = providerKeysMode ? optional : required;

export const config = {
  anthropicApiKey: providerKey("ANTHROPIC_API_KEY"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  port: parseInt(process.env.PORT || "3005", 10),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8080").split(",").map(s => s.trim()),

  openRouterApiKey: providerKey("OPENROUTER_API_KEY"),

  cfAccountId: optional("CF_ACCOUNT_ID"),
  cfGatewayId: optional("CF_GATEWAY_ID"),
  cfApiToken: optional("CF_API_TOKEN"),
  cfAigToken: optional("CF_AIG_TOKEN"),

  redisUrl: optional("REDIS_URL"),
  cohereApiKey: optional("COHERE_API_KEY"),
  googleAiApiKey: optional("GOOGLE_AI_API_KEY"),

  notionApiKey: optional("NOTION_API_KEY"),
  notionEnabled: !!process.env.NOTION_API_KEY,

  telegramBotToken: optional("TELEGRAM_BOT_TOKEN"),
  telegramChatId: optional("TELEGRAM_CHAT_ID"),
  telegramEnabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
} as const;

if (providerKeysMode) {
  if (!process.env.CF_ACCOUNT_ID || !process.env.CF_GATEWAY_ID) {
    throw new Error(
      "CF_AIG_TOKEN is set (Provider Keys mode) but CF_ACCOUNT_ID and/or CF_GATEWAY_ID are missing."
    );
  }
}
