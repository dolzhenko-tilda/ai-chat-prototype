import type { AppUIMessage, Chat, Rate, RateInfo, RateResult } from "../types/chat";

const baseUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

const TOKEN_STORAGE_KEY = "ai-chat-prototype:token";

type ServerResponse<T> =
  | { success: true; result: T }
  | { success: false; error?: string; errorCode?: string };

/** Unwraps the `ServerResponse<T>` envelope from `ai-chat-contracts.ts`, throwing on `success: false`. */
async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as ServerResponse<T> | null;
  if (!body || !res.ok || !body.success) {
    const error = body && !body.success ? body.error : undefined;
    throw new Error(error ?? `Request failed (${res.status})`);
  }
  return body.result;
}

export const api = {
  baseUrl,

  /** Reads the token minted by `init()`, if any (see `ensureAuth`). */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  },

  setToken(token: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  },

  /**
   * `GET /api/v1/init` (see `ai-chat-contracts.ts`): imitates authorization,
   * returning a fresh token (required by every other request) and the
   * chatId the client should open - the server's most recently used chat,
   * or a brand new one if none exists yet.
   */
  async init(): Promise<{ chatId: string; token: string }> {
    const res = await fetch(`${baseUrl}/api/v1/init`);
    return unwrap(res);
  },

  async getMessages(chatId: string): Promise<AppUIMessage[]> {
    const token = this.getToken();
    const params = new URLSearchParams({ token: token ?? "", chatId });
    const res = await fetch(`${baseUrl}/api/v1/messages/list?${params}`);
    const { messages } = await unwrap<{
      chatId: string;
      messages: AppUIMessage[];
      hasMore: boolean;
    }>(res);
    return messages;
  },

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    const token = this.getToken();
    const res = await fetch(`${baseUrl}/api/v1/messages/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, chatId, messageId }),
    });
    await unwrap(res);
  },

  async cancelGeneration(chatId: string): Promise<void> {
    const token = this.getToken();
    const res = await fetch(`${baseUrl}/api/v1/messages/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, chatId }),
    });
    await unwrap(res);
  },

  /** `POST /api/v1/messages/rate` - see `RateAnswerRequest`/`RateAnswerResponse`. */
  async rateMessage(
    chatId: string,
    messageId: string,
    rate: Rate,
  ): Promise<RateResult> {
    const token = this.getToken();
    const res = await fetch(`${baseUrl}/api/v1/messages/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, chatId, messageId, rate }),
    });
    return unwrap<RateResult>(res);
  },

  /** `GET /api/v1/chats/list` - see `GetChatsRequest`/`GetChatsResponse`. */
  async getChats(): Promise<Chat[]> {
    const token = this.getToken();
    const params = new URLSearchParams({ token: token ?? "" });
    const res = await fetch(`${baseUrl}/api/v1/chats/list?${params}`);
    const { chats } = await unwrap<{ chats: Chat[]; hasMore: boolean }>(res);
    return chats;
  },

  /** `POST /api/v1/chats/rename` - see `RenameChatRequest`/`RenameChatResponse`. */
  async renameChat(chatId: string, name: string): Promise<void> {
    const token = this.getToken();
    const res = await fetch(`${baseUrl}/api/v1/chats/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, chatId, name }),
    });
    await unwrap(res);
  },

  /** `POST /api/v1/chats/delete` - see `DeleteChatRequest`/`DeleteChatResponse`. */
  async deleteChat(chatId: string): Promise<void> {
    const token = this.getToken();
    const res = await fetch(`${baseUrl}/api/v1/chats/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, chatId }),
    });
    await unwrap(res);
  },
};

/**
 * Ensures the client has a token + chatId before anything else runs (see
 * `useAuth`): if both are already cached in localStorage, they're reused
 * as-is with no network round-trip; otherwise `init()` is called once and
 * its result is persisted.
 */
export async function ensureAuth(
  chatIdStorageKey: string,
): Promise<{ chatId: string; token: string }> {
  const storedToken = api.getToken();
  const storedChatId = localStorage.getItem(chatIdStorageKey);
  if (storedToken && storedChatId) {
    return { token: storedToken, chatId: storedChatId };
  }

  const { chatId, token } = await api.init();
  api.setToken(token);
  localStorage.setItem(chatIdStorageKey, chatId);
  return { chatId, token };
}
