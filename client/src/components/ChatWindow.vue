<script setup lang="ts">
import { computed, ref } from "vue";
import { useChatId } from "../composables/useChatId";
import { useAppChat } from "../composables/useAppChat";
import { useChatSettings } from "../composables/useChatSettings";
import { api } from "../services/api";
import type { Rate } from "../types/chat";
import MessageList from "./MessageList.vue";
import ChatInput from "./ChatInput.vue";
import ChatHistory from "./ChatHistory.vue";

const { chatId, newChat, openChat, isInitializing, initError } = useChatId();
const { requireApproval, reasoningEffort } = useChatSettings();
const { chat, isLoadingHistory, historyError, reload } = useAppChat(
  chatId,
  requireApproval,
  reasoningEffort,
);

const showHistory = ref(false);

// `chat.messages` is a shallowRef that ai-sdk mutates in place (push/replace by
// index) followed by `triggerRef` - the array reference itself never changes.
// If we passed `chat.messages.value` straight through as a prop, Vue's prop
// diffing (which compares by reference) would see the "same" array on every
// single chunk/new message and skip notifying MessageList, so its watcher
// (used for auto-scroll) would only fire when unrelated props (e.g. `status`)
// happened to change too. Spreading into a new array here guarantees the
// prop reference changes on every mutation, which this computed picks up
// because `triggerRef` still invalidates it (it depends on `chat.messages.value`).
const messages = computed(() => [...chat.messages.value]);

async function onSend(text: string) {
  // Guards against the brief window before `useChatId`'s init/auth call
  // resolves (see the "Connecting…" notice below).
  if (!chatId.value) return;
  // Stamp the optimistic local message with its creation time right away, so
  // it doesn't have to wait for a history reload to show/group correctly -
  // the server persists the same message with its own `createdAt` anyway.
  // `context.pageUrl` tells the server what page the user was on when they
  // sent this message (see `ai-chat-contracts.ts`'s `Context`); the
  // transport forwards it to `POST /messages/create`, which feeds it into
  // the model's system prompt for this generation.
  await chat.sendMessage({
    text,
    metadata: {
      status: "complete",
      createdAt: new Date().toISOString(),
      chatId: chatId.value,
      context: { pageUrl: window.location.href },
    },
  });
}

async function stopActiveGeneration() {
  // Section 7.4: abort on the client AND tell the server to stop the LLM call.
  await Promise.all([chat.stop(), api.cancelGeneration(chatId.value).catch(() => {})]);
}

async function onStop() {
  await stopActiveGeneration();
}

async function onDelete(messageId: string) {
  const isCurrentlyStreaming =
    (chat.status.value === "streaming" || chat.status.value === "submitted") &&
    messages.value[messages.value.length - 1]?.id === messageId;
  if (isCurrentlyStreaming) {
    // Stop consuming the client's own in-flight fetch *first*. Otherwise,
    // once we filter the message out below, any further chunk that still
    // arrives for it (even a graceful "abort" chunk) would call
    // `pushMessage` again (since it's no longer the "last message" to
    // replace), silently resurrecting the message we just asked the
    // server to delete.
    await chat.stop();
  }
  await api.deleteMessage(chatId.value, messageId);
  chat.messages.value = chat.messages.value.filter((m) => m.id !== messageId);
}

async function onRegenerate(messageId: string) {
  await chat.regenerate({ messageId });
}

async function onApprove(approvalId: string) {
  await chat.addToolApprovalResponse({ id: approvalId, approved: true });
}

async function onDeny(approvalId: string) {
  await chat.addToolApprovalResponse({ id: approvalId, approved: false });
}

async function onRate(messageId: string, rate: Rate) {
  const {messageId: _, ...rateInfo} = await api.rateMessage(chatId.value, messageId, rate);
  // Same reference-swap pattern as `onDelete`: assign a new array so the
  // `messages` computed (and MessageList's prop-change watcher) picks it up.
  chat.messages.value = chat.messages.value.map((m) =>
    m.id === messageId
      ? {
          ...m,
          metadata: {
            status: m.metadata?.status ?? "complete",
            createdAt: m.metadata?.createdAt,
            chatId: m.metadata?.chatId ?? chatId.value,
            rateInfo,
          },
        }
      : m
  );
}

async function onNewChat() {
  // `@ai-sdk/vue`'s useChat recreates its internal chat instance when `id`
  // changes, but the `messages`/`status` refs it exposes are shared across
  // instances. If a generation for the *current* chat were still running,
  // its chunks would keep writing into those shared refs even after we've
  // switched to the new (supposedly empty) chat, leaking old content into
  // the new interface. Stop it first so "New chat" really starts clean.
  if (chat.status.value === "streaming" || chat.status.value === "submitted") {
    await stopActiveGeneration();
  }
  newChat();
  showHistory.value = false;
}

async function onSelectChatFromHistory(id: string) {
  // Empty id means the chat open in the history view's parent was just
  // deleted there (see `ChatHistory.vue`'s `onDelete`) - start a fresh chat
  // instead of trying to reopen something that no longer exists.
  if (!id) {
    await onNewChat();
    return;
  }
  if (id !== chatId.value && (chat.status.value === "streaming" || chat.status.value === "submitted")) {
    await stopActiveGeneration();
  }
  openChat(id);
  showHistory.value = false;
}
</script>

<template>
  <div class="chat-window">
    <header class="chat-window__header">
      <h1>AI Chat Prototype</h1>
      <div class="chat-window__header-actions">
        <button type="button" class="btn" :disabled="isInitializing" @click="showHistory = true">
          History
        </button>
        <button type="button" class="btn" :disabled="isInitializing" @click="onNewChat">New chat</button>
      </div>
    </header>

    <ChatHistory
      v-if="showHistory"
      :active-chat-id="chatId"
      @back="showHistory = false"
      @select="onSelectChatFromHistory"
    />

    <template v-else>
      <p v-if="isInitializing" class="chat-window__notice">Connecting…</p>
      <p v-if="initError" class="chat-window__notice chat-window__notice--error">{{ initError }}</p>
      <p v-if="isLoadingHistory" class="chat-window__notice">Loading history…</p>
      <p v-if="historyError" class="chat-window__notice chat-window__notice--error">{{ historyError }}</p>
      <p v-if="chat.error.value" class="chat-window__notice chat-window__notice--error">
        {{ chat.error.value.message }}
        <button type="button" class="btn btn--ghost" @click="chat.clearError(); reload()">Dismiss</button>
      </p>

      <MessageList
        :messages="messages"
        :status="chat.status.value"
        @delete="onDelete"
        @regenerate="onRegenerate"
        @approve="onApprove"
        @deny="onDeny"
        @rate="onRate"
      />

      <ChatInput
        :status="chat.status.value"
        :require-approval="requireApproval"
        :reasoning-effort="reasoningEffort"
        @send="onSend"
        @stop="onStop"
        @update:require-approval="(v) => (requireApproval = v)"
        @update:reasoning-effort="(v) => (reasoningEffort = v)"
      />
    </template>
  </div>
</template>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
  background: var(--surface-0);
}
.chat-window__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}
.chat-window__header-actions {
  display: flex;
  gap: 0.5rem;
}
.chat-window__header h1 {
  font-size: 1.1rem;
  margin: 0;
}
.chat-window__notice {
  margin: 0;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.chat-window__notice--error {
  color: var(--danger-text);
  background: var(--danger-bg);
}
</style>
