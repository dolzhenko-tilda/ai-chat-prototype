import { lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useChat } from "@ai-sdk/vue";
import { ref, watch, type Ref } from "vue";
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
 */
export function useAppChat(
  chatId: Ref<string>,
  requireApproval: Ref<boolean>,
  reasoningEffort: Ref<ReasoningEffort>,
) {
  const transport = new ServerChatTransport({
    baseUrl: api.baseUrl,
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

  async function loadChat(id: string) {
    // Empty id means auth/init (see `useChatId`) hasn't resolved yet - skip;
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
    reload: () => loadChat(chatId.value),
  };
}
