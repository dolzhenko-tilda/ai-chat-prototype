import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  llmBaseUrl: required("LLM_BASE_URL", "http://localhost:1234/v1"),
  llmApiKey: process.env.LLM_API_KEY ?? "not-needed",
  llmModelId: required("LLM_MODEL_ID", "local-model"),
  port: Number(process.env.PORT ?? 3001),
  dbPath: required("DB_PATH", "./data/chat.sqlite"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
