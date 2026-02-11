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

  // Multi-model API keys
  moonshotApiKey: optional("MOONSHOT_API_KEY"),
  geminiApiKey: optional("GEMINI_API_KEY"),
  mem0ApiKey: optional("MEM0_API_KEY"),

  // Feature flags
  useMem0: process.env.USE_MEM0 !== "false" && !!process.env.MEM0_API_KEY,
  useGeminiVision: process.env.USE_GEMINI_VISION !== "false" && !!process.env.GEMINI_API_KEY,
  useKimi: process.env.USE_KIMI !== "false" && !!process.env.MOONSHOT_API_KEY,
} as const;
