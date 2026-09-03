import { lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useChat } from "@ai-sdk/vue";
import { computed, ref, watch, type Ref } from "vue";
import { ServerChatTransport } from "../services/serverChatTransport";
import { api } from "../services/api";
import type { AppUIMessage, ReasoningEffort } from "../types/chat";

/**
 * Wires up `@ai-sdk/vue`'s `useChat` against our server transport, and adds
 * the two behaviours the spec requires on top of it that ai-sdk doesn't do
 * automatically:
 *  - loading full history via GET /messages/list on (re)init (section 7.1.2)
 *  - separately trying to resume an in-flight generation via GET /resume,
 *    but only when the last loaded message is an assistant message still
 *    `streaming` (section 7.1.3 / `ai-chat-contracts.ts`'s
 *    `ResumeGenerationRequest`)
 *  - auto-executing the client-side `logToConsole` tool (section 7.6)
 *
 * It also handles a chatId the *server* just minted for a brand new chat
 * (see `useChatId.ts`'s `newChat()`): `chatId` starts out empty,
 * `/messages/create` is sent without one, and the server echoes back the id
 * it picked on the assistant reply's `start` chunk (see
 * `AppUIMessageMetadata.chatId`, populated by `generationService.ts`'s
 * `messageMetadata`).
 *
 * Importantly, that resolved id is *never* written into the `chatId` ref
 * itself while this conversation is still ongoing - only `persistChatId` is
 * called (a localStorage-only write, see `useChatId.ts`). Writing it into
 * `chatId` (which feeds `useChat`'s `id` config below) would make ai-sdk
 * recreate its internal chat instance and reset its `messages`/`status`
 * state - and since that instance's own `id` is frozen at construction time
 * and reused for the *whole* exchange (including any automatic tool-call/
 * approval continuations - see `AbstractChat.addToolOutput`/
 * `addToolApprovalResponse` in ai-sdk), that reset can never even retroactively
 * fix the frozen id in time for those continuations; it can only corrupt
 * still-in-flight state (e.g. an unresolved tool call). Instead,
 * `effectiveChatId` is fed straight into the transport (`getChatId`), which
 * overrides whatever stale/empty id ai-sdk itself would otherwise send.
 */
export function useAppChat(
  chatId: Ref<string>,
  persistChatId: (id: string) => void,
  requireApproval: Ref<boolean>,
  reasoningEffort: Ref<ReasoningEffort>,
) {
  /**
   * The chatId the server minted for the current chat, learned from a
   * message's metadata once `chatId` itself is (still) empty - i.e. only
   * relevant for a chat started via `newChat()` whose first message hasn't
   * come back yet. Reset whenever `chatId` changes for real (see below).
   */
  const resolvedChatId = ref<string | null>(null);

  /** The id every API call for the current chat should actually use. */
  const effectiveChatId = computed(() => chatId.value || resolvedChatId.value || "");

  const transport = new ServerChatTransport({
    baseUrl: api.baseUrl,
    getChatId: () => effectiveChatId.value,
    requireApproval: () => requireApproval.value,
    reasoningEffort: () => reasoningEffort.value,
  });

  const isLoadingHistory = ref(false);
  const historyError = ref<string | null>(null);

  const chat = useChat<AppUIMessage>(() => ({
    id: chatId.value,
    transport,
    // Auto re-submit once every tool call in the last assistant step has
    // been resolved (client tool output) or every approval has a response.
    sendAutomaticallyWhen: (opts) =>
      lastAssistantMessageIsCompleteWithToolCalls(opts) ||
      lastAssistantMessageIsCompleteWithApprovalResponses(opts),
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === "logToConsole") {
        const input = toolCall.input as { message: string };
        // eslint-disable-next-line no-console -- this IS the feature being demonstrated
        console.log("[logToConsole tool]", input.message);
        // Must NOT be awaited here: `addToolOutput` enqueues a job on the same
        // serial job queue that is currently running this very `onToolCall`
        // callback. Awaiting it would deadlock (the queue can't start the new
        // job until the current one - this callback - finishes).
        void chat.addToolOutput({
          tool: "logToConsole",
          toolCallId: toolCall.toolCallId,
          output: { logged: true },
        });
      }
    },
  }));

  // Detect the server-minted id as soon as it shows up on any message's
  // metadata (in practice: the assistant reply's `start` chunk, the very
  // first chunk of the stream - see `generationService.ts`) and persist it
  // right away (to localStorage only - see the big comment above for why).
  watch(chat.messages, (messages) => {
    if (chatId.value || resolvedChatId.value) return;
    const found = messages.find((m) => m.metadata?.chatId)?.metadata?.chatId;
    if (found) {
      resolvedChatId.value = found;
      persistChatId(found);
    }
  });

  // If `chatId` changes for a real reason (the user hit "New chat" again, or
  // opened a different chat from history) before the above ever resolved,
  // drop the stale pending id - otherwise it could leak into whatever
  // unrelated chat is now open.
  watch(chatId, () => {
    resolvedChatId.value = null;
  });

  async function loadChat(id: string) {
    // Empty id means auth/init (see `useChatId`) hasn't resolved yet, or
    // this is a brand new chat that hasn't been assigned an id yet - skip;
    // the `watch` below re-fires once `chatId` becomes truthy.
    if (!id) return;
    isLoadingHistory.value = true;
    historyError.value = null;
    let history: AppUIMessage[] = [];
    try {
      history = await api.getMessages(id);
      chat.messages.value = history;
    } catch (e) {
      historyError.value = e instanceof Error ? e.message : String(e);
    } finally {
      isLoadingHistory.value = false;
    }

    // Section 7.1.3: separate request to check for/resume an active
    // generation - only worth it if the last message we just loaded is an
    // assistant message still in "streaming" state (per `ai-chat-contracts.ts`'s
    // `ResumeGenerationRequest` comment), otherwise there's nothing to resume.
    const last = history[history.length - 1];
    if (last?.role === "assistant" && last.metadata?.status === "streaming") {
      try {
        await chat.resumeStream();
      } catch {
        // A failed resume shouldn't break the UI (section 8: edge cases).
      }
    }
  }

  watch(chatId, (id) => void loadChat(id), { immediate: true });

  return {
    chat,
    isLoadingHistory,
    historyError,
    effectiveChatId,
    reload: () => loadChat(chatId.value),
  };
}
