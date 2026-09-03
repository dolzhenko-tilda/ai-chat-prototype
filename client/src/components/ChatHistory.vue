<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../services/api";
import type { Chat } from "../types/chat";

const props = defineProps<{
  /** Highlights the chat that's currently open in the main window. */
  activeChatId: string;
}>();

const emit = defineEmits<{
  back: [];
  select: [chatId: string];
}>();

const chats = ref<Chat[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const editingId = ref<string | null>(null);
const editingName = ref("");

async function load() {
  isLoading.value = true;
  error.value = null;
  try {
    chats.value = await api.getChats();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);

function startRename(chat: Chat) {
  editingId.value = chat.id;
  editingName.value = chat.name;
}

function cancelRename() {
  editingId.value = null;
  editingName.value = "";
}

async function confirmRename(chat: Chat) {
  const name = editingName.value.trim();
  editingId.value = null;
  if (!name || name === chat.name) return;
  // Optimistic update: renaming shouldn't feel like a network round-trip.
  chat.name = name;
  try {
    await api.renameChat(chat.id, name);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    await load();
  }
}

async function onDelete(chat: Chat) {
  try {
    await api.deleteChat(chat.id);
    chats.value = chats.value.filter((c) => c.id !== chat.id);
    if (chat.id === props.activeChatId) {
      // The chat currently open in the main window was just deleted -
      // nothing sensible to show there anymore, so start a fresh one.
      emit("select", "");
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Midnight of `date`'s calendar day, in local time - used both to group chats by day and to compare against "today"/"yesterday". */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatGroupLabel(day: Date): string {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === yesterday.getTime()) return "Yesterday";
  return `${pad(day.getDate())}.${pad(day.getMonth() + 1)}.${day.getFullYear()}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/**
 * Buckets `chats` (already sorted newest-first by the server) into
 * day-based sections with a "Today" / "Yesterday" / "DD.MM.YYYY" header,
 * mirroring how most chat history UIs are organized. Since the source list
 * is sorted strictly by `updatedAt` descending, same-day chats are always
 * contiguous, so a single pass is enough to build the groups.
 */
const groups = computed(() => {
  const result: { key: string; label: string; chats: Chat[] }[] = [];
  for (const chat of chats.value) {
    const day = startOfDay(new Date(chat.updatedAt));
    const key = day.toISOString();
    let group = result[result.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: formatGroupLabel(day), chats: [] };
      result.push(group);
    }
    group.chats.push(chat);
  }
  return result;
});
</script>

<template>
  <div class="chat-history">
    <header class="chat-history__header">
      <button type="button" class="btn btn--ghost" @click="emit('back')">← Back</button>
      <h2>Chat history</h2>
    </header>

    <p v-if="isLoading" class="chat-history__notice">Loading chats…</p>
    <p v-if="error" class="chat-history__notice chat-history__notice--error">{{ error }}</p>
    <p v-if="!isLoading && !error && chats.length === 0" class="chat-history__notice">No chats yet.</p>

    <ul class="chat-history__list">
      <template v-for="group in groups" :key="group.key">
        <li class="chat-history__group-label">{{ group.label }}</li>
        <li
          v-for="chat in group.chats"
          :key="chat.id"
          class="chat-history__item"
          :class="{ 'chat-history__item--active': chat.id === activeChatId }"
        >
          <form v-if="editingId === chat.id" class="chat-history__rename" @submit.prevent="confirmRename(chat)">
            <input
              v-model="editingName"
              class="chat-history__rename-input"
              autofocus
              @keydown.escape="cancelRename"
              @blur="confirmRename(chat)"
            />
          </form>
          <button
            v-else
            type="button"
            class="chat-history__open"
            @click="emit('select', chat.id)"
          >
            <span class="chat-history__name">{{ chat.name }}</span>
            <span class="chat-history__date">{{ formatTime(chat.updatedAt) }}</span>
          </button>

          <div class="chat-history__actions">
            <button
              type="button"
              class="btn btn--ghost btn--icon"
              title="Rename"
              aria-label="Rename"
              @click="startRename(chat)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
            <button
              type="button"
              class="btn btn--ghost btn--icon"
              title="Delete"
              aria-label="Delete"
              @click="onDelete(chat)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        </li>
      </template>
    </ul>
  </div>
</template>

<style scoped>
.chat-history {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.chat-history__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}
.chat-history__header h2 {
  font-size: 1rem;
  margin: 0;
}
.chat-history__notice {
  margin: 0;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.chat-history__notice--error {
  color: var(--danger-text);
  background: var(--danger-bg);
}
.chat-history__list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  list-style: none;
  margin: 0;
  padding: 0.5rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.chat-history__group-label {
  align-self: center;
  padding: 0.6rem 0.75rem 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.chat-history__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
}
.chat-history__item:hover {
  background: var(--surface-1);
}
.chat-history__item--active {
  background: var(--accent-bg);
}
.chat-history__open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.chat-history__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.chat-history__date {
  font-size: 0.75rem;
  color: var(--text-muted);
  flex-shrink: 0;
}
.chat-history__rename {
  flex: 1;
  min-width: 0;
}
.chat-history__rename-input {
  width: 100%;
  font: inherit;
  padding: 0.2rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: inherit;
}
.chat-history__actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}
.btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem;
  line-height: 0;
}
</style>
