# client

Vue 3 + TypeScript фронтенд для `ai-chat-prototype`, собран через Vite.

## Запуск

```bash
cp .env.example .env   # VITE_SERVER_URL по умолчанию http://localhost:3001
npm install             # если не ставили из корня репозитория
npm run dev              # http://localhost:5173
```

```bash
npm run build       # vue-tsc -b && vite build -> dist/
npm run preview      # локальный просмотр собранного билда
npm run typecheck    # vue-tsc --noEmit
```

Требует запущенный [server](../server) (см. `VITE_SERVER_URL` в `.env`).

## Структура

```
src/
├── components/       # UI: ChatWindow, MessageList, MessageItem, части сообщений
│   ├── ChatWindow.vue     # корневой контейнер чата: заголовок, история, ввод
│   ├── MessageList.vue    # список сообщений + автоскролл к низу
│   ├── MessageItem.vue    # одно сообщение: рендерит его parts, кнопки действий
│   ├── ChatInput.vue      # поле ввода, кнопки Send/Stop, чекбокс tool-approval
│   ├── TextPart.vue       # текстовая часть сообщения
│   ├── ReasoningPart.vue  # "размышления" модели (свёрнутый блок)
│   ├── ToolPart.vue       # tool-call/tool-result, включая approval UI
│   └── ErrorPart.vue      # часть сообщения с ошибкой
├── composables/
│   ├── useChatId.ts       # генерация/восстановление chatId из localStorage
│   └── useAppChat.ts      # обвязка над `useChat` из `@ai-sdk/vue`: загрузка
│                          # истории, resume, автовыполнение клиентского tool'а
├── services/
│   ├── api.ts                 # обычные REST-вызовы (история, delete, cancel)
│   └── serverChatTransport.ts # кастомный ai-sdk `ChatTransport` под API сервера
├── types/chat.ts       # AppUIMessage/AppUITools - типы, зеркалящие серверные
└── style.css           # переменные темы + базовые стили
```

## Как это работает

- **`useAppChat`** оборачивает `@ai-sdk/vue`'s `useChat` с кастомным `ServerChatTransport` (см. `services/serverChatTransport.ts`), который реализует интерфейс `ChatTransport` вручную — потому что сервер использует несколько разных REST-маршрутов (`/messages`, `/regenerate`, `/continue`), а не единый `POST /api/chat`, как ожидает готовый `DefaultChatTransport`.
- При маунте `ChatWindow` дважды обращается к серверу (раздел 7.1 ТЗ): `GET /messages` (история) и отдельно `GET /resume` (SSE-проверка активной генерации) — если сервер начинает слать чанки, значит генерация уже шла, и `useChat` дорисовывает сообщение в стриминговом режиме.
- **Клиентский тул** `logToConsole` не имеет `execute` на сервере — `onToolCall` в `useAppChat` перехватывает такой вызов, делает `console.log`, и возвращает результат через `addToolOutput` (без `await`, иначе будет deadlock на внутренней очереди `ai-sdk`, обрабатывающей чанки один за другим).
- **Tool approval** (доп. фича, чекбокс "Require approval for sensitive tools" под полем ввода): при включении сервер требует одобрения для тула `calculate`; `ToolPart.vue` рисует кнопки Approve/Deny, которые вызывают `chat.addToolApprovalResponse(...)`.
- `sendAutomaticallyWhen` в `useAppChat` совмещает `lastAssistantMessageIsCompleteWithToolCalls` и `lastAssistantMessageIsCompleteWithApprovalResponses` — после того как все ожидающие tool-каллы/одобрения в последнем шаге разрешены, `ai-sdk` автоматически отправляет `POST /continue`, чтобы получить продолжение ответа от модели.
