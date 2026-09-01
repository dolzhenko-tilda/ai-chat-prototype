# server

Node.js + TypeScript бэкенд для `ai-chat-prototype`. Проксирует запросы в OpenAI-совместимую LLM (`ai` + `@ai-sdk/openai-compatible`), хранит историю чатов в SQLite (`better-sqlite3`) и стримит ответы клиенту через SSE в формате, совместимом с `ai-sdk` UI Message Stream.

Веб-фреймворк: **Express** (выбран за простоту ручного управления SSE-ответом; альтернатива из ТЗ — Fastify, не использовалась).

## Запуск

```bash
cp .env.example .env    # заполнить своими значениями
npm install              # если не ставили из корня репозитория
npm run dev               # tsx watch, слушает PORT (по умолчанию 3001)
```

```bash
npm run build   # tsc -> dist/, плюс копирует schema.sql в dist/db/
npm run start   # node dist/index.js (после build)
```

## Переменные окружения (`.env`)

| Переменная      | Назначение                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `LLM_BASE_URL`  | Базовый URL OpenAI-совместимого API (обычно оканчивается на `/v1`)       |
| `LLM_API_KEY`   | API-ключ, если требуется (для локальных серверов часто не нужен)         |
| `LLM_MODEL_ID`  | id модели, которую нужно запрашивать у LLM-сервера                       |
| `PORT`          | порт HTTP-сервера (по умолчанию `3001`)                                  |
| `DB_PATH`       | путь к файлу SQLite (по умолчанию `./data/chat.sqlite`, создаётся сам)   |
| `CORS_ORIGIN`   | origin, которому разрешён доступ к API (для дев-режима — адрес клиента) |

## Модель данных (SQLite)

См. точный DDL в [`src/db/schema.sql`](src/db/schema.sql). Кратко:

- **`chats`** — `id`, `created_at`, `updated_at`. Строка создаётся implicitly при первом обращении к чату (первом `GET /messages` или первом сообщении) — отдельного эндпоинта создания чата нет, как и допускает ТЗ.
- **`messages`** — `id`, `chat_id`, `role`, `parts` (JSON-массив ai-sdk `UIMessage.parts`), `status` (`complete` | `streaming` | `aborted` | `error`), `seq` (порядок в чате), `created_at`. Полю `status` соответствует `message.metadata.status` в отдаваемом клиенту `UIMessage` — так фронт может показать бейдж "Stopped"/"Error" даже для сообщений, загруженных из истории.
- **`generation_state`** — по одной строке на чат: `message_id` активной/последней генерации, `accumulated_chunks` (JSON-массив уже отправленных `UIMessageChunk`, нужен для resume), `is_active`, `abort_requested`.

При старте сервер помечает все ещё «активные» на момент выключения генерации как `aborted` (см. `src/services/startup.ts`) — предыдущий процесс со `streamText` не переживает рестарт, поэтому такие генерации не могут быть продолжены, только корректно закрыты.

## API

Префикс — `/api`. Тело запросов/ответов — JSON, кроме генерации и resume, которые отдают **SSE** (`text/event-stream`).

### `GET /api/chats/:chatId/messages`

Возвращает полную историю сообщений чата, отсортированную по порядку. Если чата ещё нет — создаёт пустую запись чата и возвращает пустой массив.

```json
{ "messages": [ { "id": "...", "role": "user" | "assistant", "parts": [...], "metadata": { "status": "complete" } } ] }
```

### `POST /api/chats/:chatId/messages`

Отправка нового сообщения пользователя. Тело — **только новое сообщение**, клиент не пересылает историю:

```json
{
  "message": { "role": "user", "parts": [{ "type": "text", "text": "..." }] },
  "requireApproval": false,
  "reasoningEffort": "medium"
}
```

`requireApproval` — опциональный флаг (по умолчанию `false`); если `true`, вызовы "чувствительных" тулов (см. ниже про tool approval) потребуют явного подтверждения пользователя, прежде чем выполнятся.

`reasoningEffort` — опциональный уровень "размышлений" модели: `"off" | "minimal" | "low" | "medium" | "high" | "xhigh"` (по умолчанию `"medium"`). Прокидывается в `streamText` как стандартизированная опция `reasoning` (`"off"` маппится на `"none"`, полностью отключая thinking у моделей, которые это поддерживают).

Мок-источники (см. `server/src/services/mockSources.ts`) передаются модели через системный промпт вместе с инструкцией цитировать их как можно чаще; саму ссылку в формате `[title](url "source:title")` вставляет в markdown-ответ сама LLM, а не бэкенд. Фронт стилизует такие ссылки по CSS-селектору `a[title^="source:"]`.

Сервер: сохраняет сообщение пользователя → достаёт всю предыдущую историю → отправляет всё в LLM → создаёт запись в `generation_state` и сообщение-ассистент со `status=streaming` → стримит ответ через SSE, попутно сохраняя чанки → по завершении помечает сообщение как `complete`/`aborted`/`error`.

Отвечает потоком SSE (см. "Формат SSE" ниже).

### `POST /api/chats/:chatId/messages/:messageId/regenerate`

Перегенерация ответа ассистента. **Семантика:** `:messageId` — id **сообщения ассистента**, которое нужно перегенерировать. Сервер берёт всю историю строго **до** этого сообщения (не включая), удаляет его и все более поздние сообщения, и создаёт **новое** сообщение ассистента (с новым `id`) взамен.

```json
{ "requireApproval": false, "reasoningEffort": "medium" }
```

Отвечает потоком SSE.

### `POST /api/chats/:chatId/messages/:messageId/continue`

Не из основного списка ТЗ, но нужен для двух функций из раздела 6/7.6/tool-approval:

- после того как **клиентский** тул (`logToConsole`) выполнился в браузере,
- после того как пользователь одобрил/отклонил вызов тула, требующего approval,

клиент отправляет обновлённое сообщение ассистента (то же `id`, но с дополненными/изменёнными частями инструментов) сюда, а сервер докармливает его в LLM и продолжает генерацию **того же** сообщения.

```json
{
  "message": { "role": "assistant", "parts": [ /* обновлённые tool-parts */ ] },
  "requireApproval": false,
  "reasoningEffort": "medium"
}
```

Отвечает потоком SSE.

### `DELETE /api/chats/:chatId/messages/:messageId`

Удаляет сообщение из истории. `204 No Content` при успехе, `404` если сообщения не существует.

### `POST /api/chats/:chatId/cancel`

Останавливает активную генерацию для чата, если она есть: выставляет `abort_requested`, прерывает вызов LLM (`AbortController` внутри `streamText`), сохраняет то, что успело сгенерироваться, с `status=aborted`, закрывает SSE-поток.

```json
{ "cancelled": true }
```

### `GET /api/chats/:chatId/resume` (SSE)

Вызывается клиентом при инициализации чата (например, после обновления страницы), отдельно от `GET /messages`.

- Если для чата есть активная генерация — сервер сразу шлёт уже накопленные чанки (`generation_state.accumulated_chunks`), а затем продолжает стримить новые чанки по мере их появления через тот же поток.
- Если активной генерации нет — отвечает `204 No Content` без тела (клиент интерпретирует это как "нечего резюмировать").

## Формат SSE (протокол стриминга)

Используется `ai-sdk` **UI Message Stream** протокол (data stream protocol), совместимый с `parseJsonEventStream` / `DefaultChatTransport` из пакета `ai`: каждое SSE-событие — это `data: <JSON>\n\n`, где JSON — один `UIMessageChunk` (`{"type":"text-delta",...}`, `{"type":"tool-input-available",...}`, `{"type":"error",...}` и т.д.), поток завершается кадром `data: [DONE]\n\n`. Заголовки ответа: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `x-vercel-ai-ui-message-stream: v1`.

Сервер собирает эти чанки через `toUIMessageStream()` (стандалон-функция `ai` v7) поверх `streamText().stream`, поэтому набор типов чанков — все, что поддерживает установленная версия `ai`: `start`, `start-step`, `text-start/delta/end`, `reasoning-start/delta/end`, `tool-input-start/delta/available`, `tool-output-available/error`, `tool-approval-request/response`, `finish-step`, `finish`, `error`, `abort`, плюс кастомный `data-error` (см. ниже).

Ошибки, которые прерывают генерацию целиком (сеть, исключение в `streamText`), дополнительно оборачиваются в кастомную data-часть `{"type":"data-error","data":{"message":"..."}}`, чтобы клиент мог отрисовать их как постоянную часть сообщения (а не только как временный баннер).

Клиент реализует `ChatTransport` из `ai` вручную (см. `client/src/services/serverChatTransport.ts`), а не использует готовый `DefaultChatTransport`, потому что API сервера — это несколько разных маршрутов (`/messages`, `/regenerate`, `/continue`, `/resume`), а не единая точка `POST /api/chat`.

## Инструменты (tools)

Определены в [`src/services/llm.ts`](src/services/llm.ts) и передаются в `streamText({ tools })`:

- **`calculate`** (серверный) — вычисляет арифметическое выражение. Единственный тул из списка `APPROVAL_GATED_TOOLS`, поэтому именно на нём проверяется tool-approval флоу.
- **`getCurrentTime`** (серверный) — возвращает текущее время сервера.
- **`logToConsole`** (без `execute`) — не выполняется на сервере: `ai-sdk` останавливает шаг на `tool-input-available` и отдаёт вызов клиенту как есть; браузер выполняет `console.log(...)` и присылает результат обратно через `POST /continue` (см. `client/src/composables/useAppChat.ts`, `onToolCall`).

## Tool Approval

Дополнительная фича поверх ТЗ: если клиент передаёт `requireApproval: true`, сервер конфигурирует `toolApproval: { calculate: "user-approval" }` в `streamText`. Модель, вызывая `calculate`, вместо немедленного выполнения получает статус `approval-requested` (см. `tool-approval-request` чанк); фронт показывает кнопки Approve/Deny, а результат выбора пользователя уходит на `POST /continue` в виде обновлённого `tool-*` части с полем `approval.approved`.
