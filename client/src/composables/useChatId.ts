import { ref } from "vue";
import { ensureAuth } from "../services/api";

const STORAGE_KEY = "ai-chat-prototype:chatId";

function generateChatId(): string {
  return crypto.randomUUID();
}

/**
 * Manages the client's current chatId, bootstrapped via the mock-auth
 * `init()` flow (see `ai-chat-contracts.ts`'s `GET /api/v1/init`):
 * - If a token (and this chatId) are already cached in localStorage, they're
 *   reused as-is with no network call.
 * - Otherwise `init()` is called once to mint a token and resolve the
 *   chatId to open (the server's last chat, or a fresh one); both are then
 *   persisted to localStorage.
 * `chatId` starts out empty and only becomes truthy once this resolves -
 * `useAppChat` treats an empty id as "not ready yet" and skips loading.
 * "New chat" simply swaps in a fresh, locally generated id and persists it -
 * the server creates the chat row implicitly on first use (see
 * server/README.md).
 */
export function useChatId() {
  const chatId = ref<string>("");
  const isInitializing = ref(true);
  const initError = ref<string | null>(null);

  void ensureAuth(STORAGE_KEY)
    .then((result) => {
      chatId.value = result.chatId;
    })
    .catch((e) => {
      initError.value = e instanceof Error ? e.message : String(e);
    })
    .finally(() => {
      isInitializing.value = false;
    });

  function newChat(): string {
    const id = generateChatId();
    chatId.value = id;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  }

  return { chatId, newChat, isInitializing, initError };
}
