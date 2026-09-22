import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";
import type { AppUIMessage, AppUIMessageChunk } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Фиксированный markdown-ответ, которым сервер отвечает в мок-режиме
 * (см. `env.mockResponse`). Это набор примеров разметки для проверки
 * рендерера на клиенте: заголовки, списки, таблицы, блоки кода, сноски,
 * алерты, математика и крайние случаи.
 *
 * Лежит отдельным `.md`-файлом, а не строкой в коде, чтобы его можно было
 * править как обычный markdown (внутри полно бэктиков и `${`, которые в
 * шаблонной строке пришлось бы экранировать). `npm run build` копирует его
 * в `dist/services/` — так же, как `schema.sql`.
 *
 * Файл можно подменить через `MOCK_RESPONSE_PATH` в .env
 * (см. `env.mockResponsePath`).
 */
export const MOCK_RESPONSE_MARKDOWN = readFileSync(
  env.mockResponsePath
    ? resolve(process.cwd(), env.mockResponsePath)
    : resolve(__dirname, "mockMarkdown.md"),
  "utf-8",
);

/** Размер одного `text-delta` в символах. */
const DELTA_SIZE = 60;

/** Пауза между `text-delta`, мс — имитация скорости генерации модели. */
const DELTA_DELAY_MS = 10;

/**
 * Режет текст на куски фиксированной длины, *не* уважая границы слов и
 * markdown-конструкций. Это намеренно: так мок регулярно разрывает `**`,
 * бэктики и строки таблиц посередине и проверяет, как клиент переживает
 * частичную разметку в стриме.
 */
function toDeltas(text: string): string[] {
  const deltas: string[] = [];
  for (let i = 0; i < text.length; i += DELTA_SIZE) {
    deltas.push(text.slice(i, i + DELTA_SIZE));
  }
  return deltas;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export interface MockStreamOptions {
  assistantMessageId: string;
  /** Метаданные для стартового чанка — те же, что в «настоящем» стриме. */
  messageMetadata: NonNullable<AppUIMessage["metadata"]>;
  abortSignal: AbortSignal;
}

export interface MockStream {
  stream: AsyncIterable<AppUIMessageChunk>;
  /**
   * Текст, реально ушедший в стрим. Совпадает с `MOCK_RESPONSE_MARKDOWN`,
   * если генерация дошла до конца, и обрывается на середине, если её
   * отменили — этот (возможно неполный) текст и сохраняется в БД.
   */
  getEmittedText(): string;
}

/**
 * Собирает поток UI-чанков с заранее заданным markdown-ответом вместо
 * обращения к LLM. Повторяет форму «настоящего» стрима из
 * `toUIMessageStream` — `start` → `start-step` → `text-*` → `finish-step`
 * → `finish` — поэтому всё, что навешано на стрим в `runGeneration`
 * (запись чанков для `/resume`, `data-custom-json` на `finish-step`,
 * сохранение в SQLite), работает без изменений.
 *
 * Reasoning-части не эмитятся: мокается только текстовая часть ответа.
 */
export function createMockStream(options: MockStreamOptions): MockStream {
  const { assistantMessageId, messageMetadata, abortSignal } = options;
  const textId = randomUUID();
  let emitted = "";

  async function* generate(): AsyncGenerator<AppUIMessageChunk> {
    yield { type: "start", messageId: assistantMessageId, messageMetadata };
    yield { type: "start-step" };
    yield { type: "text-start", id: textId };

    for (const delta of toDeltas(MOCK_RESPONSE_MARKDOWN)) {
      await delay(DELTA_DELAY_MS, abortSignal);
      if (abortSignal.aborted) break;
      emitted += delta;
      yield { type: "text-delta", id: textId, delta };
    }

    yield { type: "text-end", id: textId };

    if (abortSignal.aborted) {
      yield { type: "abort" };
      return;
    }

    yield { type: "finish-step" };
    yield { type: "finish" };
  }

  return { stream: generate(), getEmittedText: () => emitted };
}
