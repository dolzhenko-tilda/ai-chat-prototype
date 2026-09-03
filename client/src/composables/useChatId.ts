import { ref } from "vue";
import { ensureAuth } from "../services/api";

const STORAGE_KEY = "ai-chat-prototype:chatId";

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
 *
 * chatId is *never* generated on the client - only the server is allowed to
 * mint one (see `ai-chat-contracts.ts`'s `POST /messages/create`). "New
 * chat" therefore just clears the current id; the next message is sent
 * without a `chatId`, and the server creates the chat row and picks its id.
 *
 * Crucially, this `chatId` ref is *only* ever written to by explicit user
 * actions (`newChat`/`openChat`) - never by `useAppChat` picking up the
 * server-minted id for a chat that's still being actively used. That's
 * because it's also what `useAppChat` feeds into `@ai-sdk/vue`'s `useChat`
 * as its `id` config, and *any* change to that (even to the "same" chat,
 * just filling in an id that used to be empty) makes `useChat` recreate its
 * internal chat instance and reset its (shared!) `messages`/`status` state -
 * catastrophic if done while a generation/tool-call exchange is still
 * in-flight for that instance (see `useAppChat.ts`'s `getChatId`/
 * `persistChatId` for how the resolved id is actually used/persisted
 * instead, without ever touching this ref mid-conversation).
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

  /** Clears the current chat id; the server mints a fresh one on the next sent message. */
  function newChat(): void {
    chatId.value = "";
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Switches to a chat (e.g. one picked from the history list) and persists it. */
  function openChat(id: string): void {
    chatId.value = id;
    localStorage.setItem(STORAGE_KEY, id);
  }

  /**
   * Persists a chatId to localStorage *without* touching the reactive
   * `chatId` ref - used by `useAppChat.ts` to remember an id the server just
   * minted for the still-open new chat (so a page reload picks it up via
   * `ensureAuth` above), without disturbing the live `useChat` instance.
   */
  function persistChatId(id: string): void {
    localStorage.setItem(STORAGE_KEY, id);
  }

  return { chatId, newChat, openChat, persistChatId, isInitializing, initError };
}
