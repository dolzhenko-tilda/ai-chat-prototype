# ai-chat-prototype

Прототип веб-чата с LLM: фронтенд на **Vue 3 + TypeScript + `ai-sdk`** и бэкенд на **Node.js + Express + SQLite**, который проксирует запросы в локальную OpenAI-совместимую LLM (LM Studio, Ollama, vLLM, llama.cpp server и т.п.) и стримит ответы клиенту через SSE.

Это прототип: без авторизации и мультипользовательности, один "пользователь" на инстанс. Упор сделан на рабочий функционал, а не на дизайн.

## Структура репозитория

```
ai-chat-prototype/
├── client/          # Vue 3 + TS фронтенд (Vite, ai-sdk)
├── server/          # Node.js + TS бэкенд (Express, better-sqlite3, ai-sdk)
├── package.json     # корневой, с npm workspaces и общими dev-скриптами
└── README.md
```

`client` и `server` — самостоятельные npm-пакеты, объединённые в один репозиторий через **npm workspaces**. Каждый из них можно запускать отдельно (`npm run dev` внутри своей папки) или оба сразу из корня.

## Технологический стек

**Client:** Vue 3 (Composition API, `<script setup>`), TypeScript, Vite, `ai` + `@ai-sdk/vue` (кастомный `ChatTransport` под протокол сервера), обычный CSS (без UI-фреймворков).

**Server:** Node.js + TypeScript, **Express**, `ai` + `@ai-sdk/openai-compatible`, **better-sqlite3** для истории чатов, ручной SSE-стриминг в формате ai-sdk **UI Message Stream** протокола.

Подробности API и SSE-протокола — в [server/README.md](server/README.md).

## Быстрый старт

### 1. Требования

- Node.js **≥ 22** (используется в `ai@7`/`@ai-sdk/*@...`; проверялось на v24)
- Работающий OpenAI-совместимый LLM-сервер (например, [LM Studio](https://lmstudio.ai/), `ollama serve` с эндпоинтом `/v1`, vLLM, llama.cpp server). Для генерации нужна модель, поддерживающая **tool calling** (иначе секции 6/7.6/tool-approval из ТЗ не будут работать в полной мере). Рекомендуется, например, `qwen3` — она поддерживает tools и умеет отдавать "размышления" (reasoning), что удобно для проверки всех фич сразу.

### 2. Установка зависимостей

Из корня репозитория (ставит зависимости для обоих workspace-пакетов одной командой):

```bash
npm install
```

### 3. Установка LLM

Установите локальный LMM-сервер, например, Ollama, и запустите его

```bash
brew install ollama
```

Установите LLM, например, думающую модель `qwen3:4b`

```bash
ollama pull qwen3:4b
```

### 4. Настройка `.env`

Скопируйте примеры и подставьте свои значения:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env`:

```
LLM_BASE_URL=http://localhost:11434/v1   # адрес вашего OpenAI-совместимого сервера
LLM_API_KEY=not-needed                    # для локальных серверов обычно не нужен
LLM_MODEL_ID=qwen3:4b                     # id модели, которую отдаёт ваш LLM-сервер

PORT=3001
DB_PATH=./data/chat.sqlite
CORS_ORIGIN=http://localhost:5173
```

`client/.env`:

```
VITE_SERVER_URL=http://localhost:3001
```

### 5. Запуск

Из корня — поднимает и клиент, и сервер одновременно (через `concurrently`):

```bash
npm run dev
```

Либо по отдельности, каждый в своей папке:

```bash
cd server && npm run dev   # http://localhost:3001
cd client && npm run dev   # http://localhost:5173
```

Откройте `http://localhost:5173` — интерфейс чата.

### Прочие корневые скрипты

```bash
npm run build       # собирает сервер (tsc) и клиент (vite build) по очереди
npm run typecheck   # tsc --noEmit / vue-tsc --noEmit для обоих пакетов
```

## Что реализовано (по разделам ТЗ)

- **Хранение истории.** Чаты и сообщения хранятся в SQLite (`server/data/chat.sqlite` по умолчанию) и переживают перезапуск сервера.
- **Стриминг с resume/cancel.** Каждая генерация регистрируется в памяти сервера; чанки параллельно пишутся в `generation_state` в БД, поэтому клиент может "досоединиться" к уже идущей генерации через `GET /resume`, а `POST /cancel` реально прерывает вызов к LLM (не просто отключает клиента).
- **Инициализация чата на клиенте.** При маунте — отдельно `GET /messages` (история) и отдельно `GET /resume` (SSE, проверка активной генерации), как того требует раздел 7.5 ТЗ.
- **Части сообщений.** Текст, reasoning, tool-call/tool-result и ошибки рендерятся как визуально разные блоки (см. `client/src/components/*Part.vue`).
- **Действия над сообщениями.** Copy (Clipboard API, без запроса на сервер), Delete (`DELETE /messages/:id`), Regenerate (`POST /messages/:id/regenerate`).
- **Стоп.** Кнопка "Стоп" одновременно прерывает `fetch` на клиенте (`AbortController`) и шлёт `POST /cancel`, чтобы сервер остановил генерацию у LLM.
- **Новый чат.** Генерирует новый `chatId` (uuid) и сохраняет в `localStorage`; сервер создаёт запись чата implicitly при первом обращении.
- **Инструменты.** Серверные тулы `calculate` и `getCurrentTime` (выполняются на сервере), клиентский тул `logToConsole` (выполняется в браузере, результат отправляется обратно в модель).
- **Tool Approval (доп. фича).** В поле ввода есть чекбокс "Require approval for sensitive tools" — при включении вызовы `calculate` требуют явного одобрения пользователя (Approve/Deny) прежде чем выполнятся; реализовано через `toolApproval` (`streamText`) на сервере и `addToolApprovalResponse` на клиенте.

## Известные ограничения (сознательно, т.к. это прототип)

- Один активный "пользователь" на инстанс, авторизации нет.
- `generation_state.accumulated_chunks` хранит **все** чанки конкретной генерации целиком (для простоты кода), а не компактный diff — для прототипа с обычными по длине ответами это не проблема.
- При перезапуске сервера все генерации, которые были активны на момент выключения, помечаются как `aborted` (см. `server/src/services/startup.ts`) — сервер не переживает рестарт с продолжением стрима, только сама история сообщений переживает рестарт.
