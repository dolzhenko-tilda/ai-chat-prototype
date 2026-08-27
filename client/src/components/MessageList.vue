<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { AppUIMessage, ChatStatus } from "../types/chat";
import MessageItem from "./MessageItem.vue";

const props = defineProps<{
  messages: AppUIMessage[];
  status: ChatStatus;
}>();

const emit = defineEmits<{
  delete: [messageId: string];
  regenerate: [messageId: string];
  approve: [approvalId: string];
  deny: [approvalId: string];
}>();

const streamingMessageId = computed(() => {
  if (props.status !== "streaming" && props.status !== "submitted") return null;
  const last = props.messages[props.messages.length - 1];
  return last?.role === "assistant" ? last.id : null;
});

const containerRef = ref<HTMLDivElement | null>(null);
// Keep the view pinned to the newest message (as in any chat app), but stop
// fighting the user if they scroll up to read earlier history.
const stickToBottom = ref(true);
const SCROLL_BOTTOM_THRESHOLD_PX = 5;

function scrollToBottom() {
  const el = containerRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function onScroll() {
  const el = containerRef.value;
  if (!el) return;
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

watch(
  () => props.messages,
  async (newMessages, oldMessages) => {
    // A brand new conversation (chat switch / history reload) should always
    // start pinned to the bottom, regardless of previous scroll position.
    if (newMessages[0]?.id !== oldMessages?.[0]?.id) {
      stickToBottom.value = true;
    }
    if (!stickToBottom.value) return;
    await nextTick();
    scrollToBottom();
  },
  // No `deep` needed: the parent (ChatWindow) always hands us a freshly
  // spread array whenever anything in `chat.messages` changes, so a plain
  // reference watch is enough (and much cheaper than deep-diffing every
  // message's parts on every streamed chunk).
  { immediate: true, flush: "post" }
);
</script>

<template>
  <div class="message-list" ref="containerRef" @scroll="onScroll">
    <p v-if="messages.length === 0" class="message-list__empty">Say hello to start the conversation.</p>
    <MessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      :is-streaming-this-message="message.id === streamingMessageId"
      @delete="(id) => emit('delete', id)"
      @regenerate="(id) => emit('regenerate', id)"
      @approve="(id) => emit('approve', id)"
      @deny="(id) => emit('deny', id)"
    />
  </div>
</template>

<style scoped>
.message-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  overflow-y: auto;
  flex: 1;
}
.message-list__empty {
  color: var(--text-muted);
  text-align: center;
  margin-top: 2rem;
}
</style>
