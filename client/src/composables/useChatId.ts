import { ref } from "vue";

const STORAGE_KEY = "ai-chat-prototype:chatId";

function generateChatId(): string {
  return crypto.randomUUID();
}

/**
 * Manages the client's current chatId (section 7.1 / 7.5): restored from
 * localStorage on load, or freshly generated. "New chat" simply swaps in a
 * new id and persists it - the server creates the chat row implicitly on
 * first use (see server/README.md).
 */
export function useChatId() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const chatId = ref<string>(stored ?? generateChatId());
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, chatId.value);
  }

  function newChat(): string {
    const id = generateChatId();
    chatId.value = id;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  }

  return { chatId, newChat };
}
