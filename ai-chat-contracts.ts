/**
 * REST/SSE API контракт между client и server в ai-chat-prototype.
 * Базовый URL: import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001"
 * Префикс всех путей: /api
 *
 * Источники:
 * - client/src/services/api.ts
 * - client/src/services/serverChatTransport.ts
 * - server/src/routes/chats.ts
 * - server/README.md
 * - client/src/types/chat.ts
 * - server/src/services/llm.ts
 */

// ===================== Общие типы =====================

type ClientRequest<T = {}> = T & {
  token: string;
};

type ServerResponse<T = undefined> = T extends undefined
  ? {
      success: boolean;
    }
  : {
      success: boolean;
      result: T;
    };

// ===================== Общие типы для сообщений =====================

type MessageRole = "user" | "assistant";
type MessageStatus = "complete" | "streaming" | "aborted" | "error";
type ToolStatus =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";
type RateId = 1 | 2;

/** Инструменты (tools), доступные ассистенту. */
type Tools = {
  /** клиентский тул: спрашивает пользователя и получает ответ */
  askUser: {
    input: { question: string; answers: string[] };
    output: { answer: string | null };
  };
};

/** Кастомные data-parts, которые сервер может добавить в message.parts. */
type CustomParts = {
  source: { title: string; url: string };
  checkList: { title: string; items: string[] };
  image: { url: string; title?: string; description?: string };
  video: { url: string; title?: string; description?: string };
};

type MessageMetadata = {
  status: MessageStatus;
};

/** Часть сообщения, описывающая вызов тула. */
type ToolPart<TName extends keyof Tools = keyof Tools> = {
  type: `tool-${TName}`;
  toolCallId: string;
  state: ToolStatus;
  input?: Tools[TName]["input"];
  output?: Tools[TName]["output"];
  errorText?: string;
};

/** Часть сообщения, описывающая кастомные данные. */
type CustomPart<TName extends keyof CustomParts = keyof CustomParts> = {
  type: `data-${TName}`;
  id?: string;
  data: CustomParts[TName];
};

/** Часть сообщения (ai-sdk MessagePart); перечислены реально используемые варианты. */
type MessagePart =
  | { type: "text"; text: string; state?: "streaming" | "done" }
  | { type: "reasoning"; text: string; state?: "streaming" | "done" }
  | { type: "step-start" }
  | CustomPart
  | ToolPart;

/** Сообщение чата — используется в ответах. */
type Message = {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  metadata: MessageMetadata;
};

/**
 * Один чанк SSE-потока (`data: <JSON>\n\n`); поток завершается кадром `data: [DONE]\n\n`.
 * Заголовки ответа: Content-Type: text/event-stream, x-vercel-ai-ui-message-stream: v1.
 * Используется как тип элемента ReadableStream<MessageChunk> во всех SSE-эндпоинтах.
 */
type MessageChunk =
  | { type: "start"; messageId?: string }
  | { type: "start-step" }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | {
      type: "tool-input-start";
      toolCallId: string;
      toolName: keyof Tools;
    }
  | { type: "tool-input-delta"; toolCallId: string; inputTextDelta: string }
  | {
      type: "tool-input-available";
      toolCallId: string;
      toolName: keyof Tools;
      input: unknown;
    }
  | { type: "tool-output-available"; toolCallId: string; output: unknown }
  | { type: "tool-output-error"; toolCallId: string; errorText: string }
  | { type: "finish-step" }
  | { type: "finish" }
  | { type: "error"; errorText: string }
  | { type: "abort" }
  | {
      type: `data-${keyof CustomParts}`;
      id?: string;
      data: CustomParts[keyof CustomParts];
    };

// ===================== Общие типы для истории =====================

type ChatStatus = "complete" | "streaming" | "waiting" | "aborted" | "error";

type Chat = {
  id: string;
  name: string;
  scope: string;
  state: ChatStatus;
  updatedAt: string;
};

// ===================== 1. POST /api/v1/messages/list =====================
// Полная история сообщений чата. Если чата ещё нет — возвращает пустой массив.

type GetMessagesRequest = ClientRequest<{
  chatId: string;
  beforeId?: string;
  limit?: number;
}>;

type GetMessagesResponse = ServerResponse<{
  chatId: string;
  messages: Message[];
  hasMore: boolean;
}>;

// ===================== 2. POST /api/v1/messages/create =====================
// Отправка нового сообщения пользователя или перегенерация ответа ассистента.
// message - текст нового сообщения пользователя для отправки в чат.
// messageId — id сообщения-ассистента, которое нужно перегенерировать.
// Клиент не пересылает историю. Ответ — SSE-поток чанков ассистента.

type CreateMessageRequest = ClientRequest<
  | {
      chatId: string;
      message: string;
    }
  | {
      chatId: string;
      messageId: string;
    }
>;

/** Ответ — SSE-поток */
type CreateMessageResponse = ReadableStream<MessageChunk>;

// ============= 4. POST /api/v1/messages/continue =============
// Используется после выполнения клиентского тула (askUser) в браузере
// флоу: клиент шлёт обновлённый tool-part.

type ContinueMessageRequest = ClientRequest<{
  chatId: string;
  messageId: string;
  toolPart: ToolPart;
}>;

/** Ответ — SSE-поток */
type ContinueMessageResponse = ReadableStream<MessageChunk>;

// ===================== 5. POST /api/v1/messages/delete =====================
// Удаляет сообщение из истории.

type DeleteMessageRequest = ClientRequest<{
  chatId: string;
  messageId: string;
}>;

type DeleteMessageResponse = ServerResponse;

// ===================== 6. POST /api/v1/messages/cancel =====================
// Останавливает активную генерацию для чата, если она есть.

type CancelGenerationRequest = ClientRequest<{
  chatId: string;
}>;

type CancelGenerationResponse = ServerResponse<{
  /** true, если генерация действительно была активна и была прервана */
  cancelled: boolean;
}>;

// ===================== 7. POST /api/v1/messages/resume =====================
// Подключение к незавершённой генерации (например, после reload страницы).
// Если активной генерации нет — 204 No Content без тела (клиент трактует как null).

type ResumeGenerationRequest = ClientRequest<{
  chatId: string;
}>;

/** ReadableStream чанков, если генерация активна; null при 204 No Content. */
type ResumeGenerationResponse = ReadableStream<MessageChunk> | null;

// ===================== 7. POST /api/v1/messages/rate =====================
// Оценка ответа.

type RateAnswerRequest = ClientRequest<{
  chatId: string;
  messageId: string;
  rateId: RateId;
}>;

type RateAnswerResponse = ServerResponse<{
  messageId: string;
  rateId: RateId;
  ratedAt: string;
}>;

// ===================== 8. POST /api/v1/chats/list =====================
// Получение списка всех чатов.

type GetChatsRequest = ClientRequest<{
  beforeId?: string;
  limit?: number;
}>;

type GetChatsResponse = ServerResponse<{
  chats: Chat[];
  hasMore: boolean;
}>;

// ===================== 9. POST /api/v1/chats/rename =====================
// Переименование чата

type RenameChatRequest = ClientRequest<{
  chatId: string;
  name: string;
}>;

type RenameChatResponse = ServerResponse;

// ===================== 10. POST /api/v1/chats/delete =====================
// Удаление чата

type DeleteChatRequest = ClientRequest<{
  chatId: string;
}>;

type DeleteChatResponse = ServerResponse;
