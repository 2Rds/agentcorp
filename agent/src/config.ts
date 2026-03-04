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
  port: parseInt(process.env.PORT || "3001", 10),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8080").split(",").map(s => s.trim()),

  // Multi-model via OpenRouter (single key for all models)
  openRouterApiKey: providerKey("OPENROUTER_API_KEY"),
  mem0ApiKey: required("MEM0_API_KEY"),

  // Moonshot direct API (optional — falls back to OpenRouter K2.5)
  moonshotApiKey: optional("MOONSHOT_API_KEY"),

  // Cloudflare AI Gateway + Workers AI (optional — falls back to direct URLs)
  cfAccountId: optional("CF_ACCOUNT_ID"),
  cfGatewayId: optional("CF_GATEWAY_ID"),
  cfApiToken: optional("CF_API_TOKEN"),
  cfAigToken: optional("CF_AIG_TOKEN"), // Gateway auth token (Provider Keys inject provider API keys)

  // Redis (optional — features degrade gracefully without it)
  redisUrl: optional("REDIS_URL"),

  // Cohere (Rerank for plugin resolution + document RAG)
  cohereApiKey: optional("COHERE_API_KEY"),

  // Webhook secrets
  mem0WebhookSecret: optional("MEM0_WEBHOOK_SECRET"),

  // Google Sheets integration via OAuth 2.0 (optional — gracefully disabled if not configured)
  googleClientId: optional("GOOGLE_CLIENT_ID"),
  googleClientSecret: optional("GOOGLE_CLIENT_SECRET"),
  googleRefreshToken: optional("GOOGLE_REFRESH_TOKEN"),
  googleSheetsEnabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.GOOGLE_REFRESH_TOKEN,

  // Financial system integrations (all optional — each enabled when client ID/secret are set)
  quickbooksClientId: optional("QUICKBOOKS_CLIENT_ID"),
  quickbooksClientSecret: optional("QUICKBOOKS_CLIENT_SECRET"),
  xeroClientId: optional("XERO_CLIENT_ID"),
  xeroClientSecret: optional("XERO_CLIENT_SECRET"),
  stripeClientId: optional("STRIPE_CLIENT_ID"),
  stripeClientSecret: optional("STRIPE_CLIENT_SECRET"),
  integrationEncryptionKey: optional("INTEGRATION_ENCRYPTION_KEY"),

  quickbooksEnabled: !!process.env.QUICKBOOKS_CLIENT_ID && !!process.env.QUICKBOOKS_CLIENT_SECRET,
  xeroEnabled: !!process.env.XERO_CLIENT_ID && !!process.env.XERO_CLIENT_SECRET,
  stripeIntegrationEnabled: !!process.env.STRIPE_CLIENT_ID && !!process.env.STRIPE_CLIENT_SECRET,

  // Gemini vision uses OpenRouter now; Kimi uses OpenRouter. Always available.
  useGeminiVision: true,
  useKimi: true,
} as const;

// ─── Startup validation ───────────────────────────────────────────────────────

// Provider Keys mode requires AI Gateway to be fully configured
if (providerKeysMode) {
  if (!process.env.CF_ACCOUNT_ID || !process.env.CF_GATEWAY_ID) {
    throw new Error(
      "CF_AIG_TOKEN is set (Provider Keys mode) but CF_ACCOUNT_ID and/or CF_GATEWAY_ID are missing. " +
      "Provider Keys requires a fully configured AI Gateway. Either set all three CF_ vars or remove CF_AIG_TOKEN."
    );
  }
}

