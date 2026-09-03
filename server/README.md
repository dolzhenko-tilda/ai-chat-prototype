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

- **`tokens`** — `token`, `created_at`. Минтится `GET /api/v1/init` (см. ниже); MVP-у достаточно одного неявного пользователя, поэтому токен ни к чему не привязан — он лишь подтверждает, что клиент прошёл `/init`.
- **`chats`** — `id`, `name` (nullable — auto-titled from the first user message, or explicit via `POST /chats/rename`), `created_at`, `updated_at`. Строка создаётся implicitly при первом обращении к чату (первом `POST /messages/create`) — отдельного эндпоинта создания чата нет, как и допускает ТЗ.
- **`messages`** — `id`, `chat_id`, `role`, `parts` (JSON-массив ai-sdk `UIMessage.parts`), `status` (`complete` | `streaming` | `aborted` | `error`), `seq` (порядок в чате), `created_at`, `rate`/`rated_at` (nullable — см. `POST /messages/rate`). Полю `status` соответствует `message.metadata.status`, а паре `rate`/`rated_at` — `message.metadata.rateInfo` в отдаваемом клиенту `UIMessage` — так фронт может показать бейдж "Stopped"/"Error" и подсветить оценку даже для сообщений, загруженных из истории.
- **`generation_state`** — по одной строке на чат: `message_id` активной/последней генерации, `accumulated_chunks` (JSON-массив уже отправленных `UIMessageChunk`, нужен для resume), `is_active`, `abort_requested`.

При старте сервер помечает все ещё «активные» на момент выключения генерации как `aborted` (см. `src/services/startup.ts`) — предыдущий процесс со `streamText` не переживает рестарт, поэтому такие генерации не могут быть продолжены, только корректно закрыты.

## API

Полный TypeScript-контракт запросов/ответов — [`ai-chat-contracts.ts`](../ai-chat-contracts.ts) в корне репозитория; здесь — как он реализован в этом сервере.

Префикс — `/api/v1`. Тело успешного JSON-ответа всегда обёрнуто как `{ "success": true, "result": ... }`, ошибки — как `{ "success": false, "error": "...", "errorCode"?: "..." }` (см. `ServerResponse<T>` в контракте). Исключение — генерация и resume, которые отдают **SSE** (`text/event-stream`) напрямую, без обёртки.

Каждый запрос, кроме `GET /init`, обязан передать `token`, полученный от `/init`: в query-строке для `GET`-эндпоинтов, в теле JSON — для `POST`. Отсутствующий/неизвестный токен → `401` с `errorCode: "UNAUTHORIZED"`.

### `GET /api/v1/init`

Имитация авторизации: минтит новый `token` и возвращает `chatId` — последний использованный чат, если такой есть, иначе только что созданный пустой. Клиент вызывает этот эндпоинт только если у него ещё нет токена в `localStorage` (см. `client/src/composables/useChatId.ts`); если токен уже сохранён — он переиспользуется без сетевого запроса.

```json
{ "success": true, "result": { "chatId": "...", "token": "..." } }
```

### `GET /api/v1/messages/list`

Возвращает полную историю сообщений чата, отсортированную по порядку (с опциональной пагинацией через `beforeId`/`limit`). Если чата ещё нет — возвращает пустой массив (в отличие от остальных эндпоинтов, чат implicitly не создаётся).

```json
{ "success": true, "result": { "chatId": "...", "messages": [ { "id": "...", "role": "user" | "assistant", "parts": [...], "metadata": { "status": "complete" } } ], "hasMore": false } }
```

### `POST /api/v1/messages/create`

Отправка нового сообщения пользователя. Тело — **только новое сообщение** (как обычный текст, см. `CreateMessageRequest`), клиент не пересылает историю:

```json
{
  "token": "...",
  "chatId": "...",
  "message": "...",
  "requireApproval": false,
  "reasoningEffort": "medium"
}
```

`requireApproval`/`reasoningEffort` — необязательное расширение сверх `ai-chat-contracts.ts` (нужны существующему UI настроек, см. `useChatSettings.ts`); любой клиент, следующий только документированному контракту, продолжит работать и без них. `requireApproval` (по умолчанию `false`): если `true`, вызовы "чувствительных" тулов (см. ниже про tool approval) потребуют явного подтверждения пользователя, прежде чем выполнятся. `reasoningEffort` — опциональный уровень "размышлений" модели: `"off" | "minimal" | "low" | "medium" | "high" | "xhigh"` (по умолчанию `"medium"`). Прокидывается в `streamText` как стандартизированная опция `reasoning` (`"off"` маппится на `"none"`, полностью отключая thinking у моделей, которые это поддерживают).

Мок-источники (см. `server/src/services/mockSources.ts`) передаются модели через системный промпт вместе с инструкцией цитировать их как можно чаще; саму ссылку в формате `[title](url "source:title")` вставляет в markdown-ответ сама LLM, а не бэкенд. Фронт стилизует такие ссылки по CSS-селектору `a[title^="source:"]`.

Сервер: сохраняет сообщение пользователя → достаёт всю предыдущую историю → отправляет всё в LLM → создаёт запись в `generation_state` и сообщение-ассистент со `status=streaming` → стримит ответ через SSE, попутно сохраняя чанки → по завершении помечает сообщение как `complete`/`aborted`/`error`.

Отвечает потоком SSE (см. "Формат SSE" ниже).

### `POST /api/v1/messages/regenerate`

Перегенерация ответа ассистента. **Семантика:** `messageId` — id **сообщения ассистента**, которое нужно перегенерировать. Сервер берёт всю историю строго **до** этого сообщения (не включая), удаляет его и все более поздние сообщения, и создаёт **новое** сообщение ассистента (с новым `id`) взамен.

```json
{ "token": "...", "chatId": "...", "messageId": "...", "requireApproval": false, "reasoningEffort": "medium" }
```

Отвечает потоком SSE.

### `POST /api/v1/messages/continue`

Не из основного списка ТЗ, но нужен для двух функций из раздела 6/7.6/tool-approval:

- после того как **клиентский** тул (`logToConsole`) выполнился в браузере,
- после того как пользователь одобрил/отклонил вызов тула, требующего approval,

клиент отправляет обновлённую часть инструмента (`toolPart`, см. `ContinueMessageRequest`) сюда; сервер вливает её в сохранённое сообщение-ассистент (сопоставляя по `toolCallId`) и докармливает результат в LLM, продолжая генерацию **того же** сообщения.

```json
{
  "token": "...",
  "chatId": "...",
  "messageId": "...",
  "toolPart": { "type": "tool-calculate", "toolCallId": "...", "state": "output-available", "output": { ... } },
  "requireApproval": false,
  "reasoningEffort": "medium"
}
```

Отвечает потоком SSE.

### `POST /api/v1/messages/delete`

Удаляет сообщение из истории.

```json
{ "token": "...", "chatId": "...", "messageId": "..." }
```

### `POST /api/v1/messages/cancel`

Останавливает активную генерацию для чата, если она есть: выставляет `abort_requested`, прерывает вызов LLM (`AbortController` внутри `streamText`), сохраняет то, что успело сгенерироваться, с `status=aborted`, закрывает SSE-поток.

```json
{ "success": true, "result": { "cancelled": true } }
```

### `GET /api/v1/messages/resume` (SSE)

Вызывается клиентом при инициализации чата (например, после обновления страницы), отдельно от `GET /messages/list`.

- Если для чата есть активная генерация — сервер сразу шлёт уже накопленные чанки (`generation_state.accumulated_chunks`), а затем продолжает стримить новые чанки по мере их появления через тот же поток.
- Если активной генерации нет — отвечает `204 No Content` без тела (клиент интерпретирует это как "нечего резюмировать"; контрактный тип `ReadableStream<MessageChunk> | null` не выразим как JSON-конверт, поэтому для `null`-случая используется HTTP-статус, а не `{success:false}`).

### `POST /api/v1/messages/rate`

Оценка ответа ассистента: лайк/дизлайк. Только сообщения с `role: "assistant"` можно оценивать (`400`, если `messageId` указывает на сообщение пользователя). Повторный вызов с другим значением `rate` перезаписывает предыдущую оценку.

```json
{ "token": "...", "chatId": "...", "messageId": "...", "rate": "like" }
```

```json
{ "success": true, "result": { "messageId": "...", "rate": "like", "ratedAt": "2026-09-03T10:00:00.000Z" } }
```

Оценка хранится в колонках `rate`/`rated_at` таблицы `messages` и возвращается клиенту как `message.metadata.rateInfo` в `GET /messages/list` — так фронт может подсветить нажатую кнопку (👍/👎) даже для сообщений, загруженных из истории.

### `GET /api/v1/chats/list`

Список всех чатов, отсортированный по `updated_at` (сначала недавно активные), с опциональной пагинацией через `beforeId`/`limit` (по аналогии с `GET /messages/list`, но т.к. список уже отсортирован от новых к старым, `beforeId` продолжает пагинацию *после* указанного чата в этом порядке — "следующая, более старая страница").

```json
{ "success": true, "result": { "chats": [ { "id": "...", "name": "...", "updatedAt": "2026-09-03T10:00:00.000Z" } ], "hasMore": false } }
```

`name` автоматически проставляется при первом сообщении пользователя в чате (обрезка первых ~60 символов, см. `deriveChatName` в `routes/messages.ts`) — если ещё не проставлено (т.е. в чате пока нет сообщений), возвращается `"New chat"`. Явное имя, заданное через `POST /chats/rename`, никогда не перезаписывается автоматически.

`updatedAt` отражает только активность сообщений в чате (обновляется при каждом новом сообщении пользователя) и используется для сортировки списка и как "дата последнего изменения" на фронте — переименование чата на это поле не влияет.

### `POST /api/v1/chats/rename`

Переименовывает чат. `404`, если `chatId` не существует. Не меняет `updatedAt` чата (см. выше) — только имя.

```json
{ "token": "...", "chatId": "...", "name": "..." }
```

### `POST /api/v1/chats/delete`

Удаляет чат вместе со всеми его сообщениями (`ON DELETE CASCADE` в схеме БД). `404`, если `chatId` не существует. Если у чата в момент удаления была активная генерация — она сначала отменяется (`cancelGeneration`), чтобы не пытаться дописать сообщение в уже удалённый чат.

```json
{ "token": "...", "chatId": "..." }
```

## Формат SSE (протокол стриминга)

Используется `ai-sdk` **UI Message Stream** протокол (data stream protocol), совместимый с `parseJsonEventStream` / `DefaultChatTransport` из пакета `ai`: каждое SSE-событие — это `data: <JSON>\n\n`, где JSON — один `UIMessageChunk` (`{"type":"text-delta",...}`, `{"type":"tool-input-available",...}`, `{"type":"error",...}` и т.д.), поток завершается кадром `data: [DONE]\n\n`. Заголовки ответа: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `x-vercel-ai-ui-message-stream: v1`.

Сервер собирает эти чанки через `toUIMessageStream()` (стандалон-функция `ai` v7) поверх `streamText().stream`, поэтому набор типов чанков — все, что поддерживает установленная версия `ai`: `start`, `start-step`, `text-start/delta/end`, `reasoning-start/delta/end`, `tool-input-start/delta/available`, `tool-output-available/error`, `tool-approval-request/response`, `finish-step`, `finish`, `error`, `abort`, плюс кастомный `data-error` (см. ниже).

Ошибки, которые прерывают генерацию целиком (сеть, исключение в `streamText`), дополнительно оборачиваются в кастомную data-часть `{"type":"data-error","data":{"message":"..."}}`, чтобы клиент мог отрисовать их как постоянную часть сообщения (а не только как временный баннер).

Клиент реализует `ChatTransport` из `ai` вручную (см. `client/src/services/serverChatTransport.ts`), а не использует готовый `DefaultChatTransport`, потому что API сервера — это несколько разных маршрутов (`/messages/create`, `/messages/regenerate`, `/messages/continue`, `/messages/resume`), а не единая точка `POST /api/chat`.

## Инструменты (tools)

Определены в [`src/services/llm.ts`](src/services/llm.ts) и передаются в `streamText({ tools })`:

- **`calculate`** (серверный) — вычисляет арифметическое выражение. Единственный тул из списка `APPROVAL_GATED_TOOLS`, поэтому именно на нём проверяется tool-approval флоу.
- **`getCurrentTime`** (серверный) — возвращает текущее время сервера.
- **`logToConsole`** (без `execute`) — не выполняется на сервере: `ai-sdk` останавливает шаг на `tool-input-available` и отдаёт вызов клиенту как есть; браузер выполняет `console.log(...)` и присылает результат обратно через `POST /messages/continue` (см. `client/src/composables/useAppChat.ts`, `onToolCall`).

## Tool Approval

Дополнительная фича поверх ТЗ: если клиент передаёт `requireApproval: true`, сервер конфигурирует `toolApproval: { calculate: "user-approval" }` в `streamText`. Модель, вызывая `calculate`, вместо немедленного выполнения получает статус `approval-requested` (см. `tool-approval-request` чанк); фронт показывает кнопки Approve/Deny, а результат выбора пользователя уходит на `POST /messages/continue` в виде обновлённой `tool-*` части с полем `approval.approved`.
