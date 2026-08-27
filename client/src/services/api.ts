import type { AppUIMessage } from "../types/chat";

const baseUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export const api = {
  baseUrl,

  async getMessages(chatId: string): Promise<AppUIMessage[]> {
    const res = await fetch(`${baseUrl}/api/chats/${chatId}/messages`);
    if (!res.ok) throw new Error(`Failed to load messages (${res.status})`);
    const data = (await res.json()) as { messages: AppUIMessage[] };
    return data.messages;
  },

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/chats/${chatId}/messages/${messageId}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Failed to delete message (${res.status})`);
    }
  },

  async cancelGeneration(chatId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/chats/${chatId}/cancel`, { method: "POST" });
    if (!res.ok) throw new Error(`Failed to cancel generation (${res.status})`);
  },
};
