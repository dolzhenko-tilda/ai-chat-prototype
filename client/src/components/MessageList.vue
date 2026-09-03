<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { AppUIMessage, ChatStatus, Rate } from "../types/chat";
import MessageItem from "./MessageItem.vue";
import { formatDayLabel, startOfDay } from "../utils/dateFormat";

const props = defineProps<{
  messages: AppUIMessage[];
  status: ChatStatus;
}>();

const emit = defineEmits<{
  delete: [messageId: string];
  regenerate: [messageId: string];
  approve: [approvalId: string];
  deny: [approvalId: string];
  rate: [messageId: string, rate: Rate];
}>();

const streamingMessageId = computed(() => {
  if (props.status !== "streaming" && props.status !== "submitted") return null;
  const last = props.messages[props.messages.length - 1];
  return last?.role === "assistant" ? last.id : null;
});

// Fallback creation timestamps for messages that don't carry `metadata.createdAt`
// yet (an assistant reply still streaming, or right before its history reload) -
// captured the first time each message is seen so its displayed time/day stays
// stable across re-renders instead of drifting towards "now". Cleared on chat
// switch below, alongside `stickToBottom`.
let fallbackCreatedAt = new Map<string, string>();
function createdAtFor(message: AppUIMessage): string {
  const createdAt = message.metadata?.createdAt;
  if (createdAt) return createdAt;
  let fallback = fallbackCreatedAt.get(message.id);
  if (!fallback) {
    fallback = new Date().toISOString();
    fallbackCreatedAt.set(message.id, fallback);
  }
  return fallback;
}

/**
 * Buckets `messages` into day-based sections with a "Today" / "Yesterday" /
 * "DD.MM.YYYY" header, mirroring `ChatHistory.vue`'s grouping of chats. Since
 * messages are already ordered chronologically, same-day messages are always
 * contiguous, so a single pass is enough to build the groups.
 */
const groups = computed(() => {
  const result: { key: string; label: string; messages: AppUIMessage[] }[] = [];
  for (const message of props.messages) {
    const day = startOfDay(new Date(createdAtFor(message)));
    const key = day.toISOString();
    let group = result[result.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: formatDayLabel(day), messages: [] };
      result.push(group);
    }
    group.messages.push(message);
  }
  return result;
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
      fallbackCreatedAt = new Map();
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
    <template v-for="group in groups" :key="group.key">
      <div class="message-list__group-label">{{ group.label }}</div>
      <MessageItem
        v-for="message in group.messages"
        :key="message.id"
        :message="message"
        :created-at="createdAtFor(message)"
        :is-streaming-this-message="message.id === streamingMessageId"
        @delete="(id) => emit('delete', id)"
        @regenerate="(id) => emit('regenerate', id)"
        @approve="(id) => emit('approve', id)"
        @deny="(id) => emit('deny', id)"
        @rate="(id, rate) => emit('rate', id, rate)"
      />
    </template>
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
.message-list__group-label {
  align-self: center;
  padding: 0.3rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
/* Whichever element renders first (a group label or a message) absorbs the
   leftover flex space above it, keeping a short conversation pinned to the
   bottom of the scroll area instead of stuck at the top. */
.message-list > :first-child {
  margin-top: auto;
}
</style>
