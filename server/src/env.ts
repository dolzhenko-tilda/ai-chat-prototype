import "dotenv/config";

/**
 * Читает булев флаг из окружения. Выключенным считается только явное
 * "0" / "false" / "off" / "no" — всё остальное (включая пустую строку)
 * трактуется как включённый флаг.
 */
function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

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
  /**
   * Мок-режим: вместо запроса в LLM сервер стримит фиксированный
   * markdown-ответ из `services/mockMarkdown.md` (см. `createMockStream`).
   * Нужен для проверки рендеринга разметки на клиенте без живой модели.
   * Выключается через `MOCK_RESPONSE=off` в .env.
   */
  mockResponse: flag("MOCK_RESPONSE", true),
  /**
   * Путь к markdown-файлу с мок-ответом. Относительные пути считаются
   * от рабочей директории сервера (папка `server`), как и `DB_PATH`.
   * Пустое значение означает файл `mockMarkdown.md` рядом с кодом сервиса.
   */
  mockResponsePath: process.env.MOCK_RESPONSE_PATH?.trim() || "",
};
