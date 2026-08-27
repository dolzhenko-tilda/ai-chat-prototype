<script setup lang="ts">
import { ref } from "vue";
import { useChatId } from "../composables/useChatId";
import { useAppChat } from "../composables/useAppChat";
import { api } from "../services/api";
import MessageList from "./MessageList.vue";
import ChatInput from "./ChatInput.vue";

const { chatId, newChat } = useChatId();
const requireApproval = ref(false);
const { chat, isLoadingHistory, historyError, reload } = useAppChat(chatId, requireApproval);

async function onSend(text: string) {
  await chat.sendMessage({ text });
}

async function onStop() {
  // Section 7.4: abort on the client AND tell the server to stop the LLM call.
  await Promise.all([chat.stop(), api.cancelGeneration(chatId.value).catch(() => {})]);
}

async function onDelete(messageId: string) {
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

function onNewChat() {
  newChat();
}
</script>

<template>
  <div class="chat-window">
    <header class="chat-window__header">
      <h1>AI Chat Prototype</h1>
      <button type="button" class="btn" @click="onNewChat">New chat</button>
    </header>

    <p v-if="isLoadingHistory" class="chat-window__notice">Loading history…</p>
    <p v-if="historyError" class="chat-window__notice chat-window__notice--error">{{ historyError }}</p>
    <p v-if="chat.error.value" class="chat-window__notice chat-window__notice--error">
      {{ chat.error.value.message }}
      <button type="button" class="btn btn--ghost" @click="chat.clearError(); reload()">Dismiss</button>
    </p>

    <MessageList
      :messages="chat.messages.value"
      :status="chat.status.value"
      @delete="onDelete"
      @regenerate="onRegenerate"
      @approve="onApprove"
      @deny="onDeny"
    />

    <ChatInput
      :status="chat.status.value"
      :require-approval="requireApproval"
      @send="onSend"
      @stop="onStop"
      @update:require-approval="(v) => (requireApproval = v)"
    />
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
