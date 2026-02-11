import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback: string = ""): string {
  return process.env[name] || fallback;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  port: parseInt(process.env.PORT || "3001", 10),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8080").split(",").map(s => s.trim()),

  // Multi-model via OpenRouter (single key for all models)
  openRouterApiKey: required("OPENROUTER_API_KEY"),
  mem0ApiKey: required("MEM0_API_KEY"),

  // Gemini vision uses OpenRouter now; Kimi uses OpenRouter. Always available.
  useGeminiVision: true,
  useKimi: true,
} as const;
