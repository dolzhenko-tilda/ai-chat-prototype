<script setup lang="ts">
import { ref } from "vue";
import type { ChatStatus, ReasoningEffort } from "../types/chat";
import { REASONING_EFFORT_LEVELS } from "../types/chat";

const props = defineProps<{
  status: ChatStatus;
  requireApproval: boolean;
  reasoningEffort: ReasoningEffort;
}>();

const emit = defineEmits<{
  send: [text: string];
  stop: [];
  "update:requireApproval": [value: boolean];
  "update:reasoningEffort": [value: ReasoningEffort];
}>();

const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
};

const text = ref("");

function submit() {
  const value = text.value.trim();
  if (!value || props.status === "streaming" || props.status === "submitted") return;
  emit("send", value);
  text.value = "";
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}
</script>

<template>
  <form class="chat-input" @submit.prevent="submit">
    <textarea
      v-model="text"
      class="chat-input__textarea"
      placeholder="Type a message… (Shift+Enter for newline)"
      rows="2"
      @keydown="onKeydown"
    />
    <div class="chat-input__row">
      <div class="chat-input__options">
        <label class="chat-input__approval">
          <input
            type="checkbox"
            :checked="requireApproval"
            @change="emit('update:requireApproval', ($event.target as HTMLInputElement).checked)"
          />
          Require approval for sensitive tools
        </label>

        <label class="chat-input__reasoning">
          Thinking:
          <select
            class="chat-input__reasoning-select"
            :value="reasoningEffort"
            @change="emit('update:reasoningEffort', ($event.target as HTMLSelectElement).value as ReasoningEffort)"
          >
            <option v-for="level in REASONING_EFFORT_LEVELS" :key="level" :value="level">
              {{ REASONING_EFFORT_LABELS[level] }}
            </option>
          </select>
        </label>
      </div>

      <div class="chat-input__actions">
        <button
          v-if="status === 'streaming' || status === 'submitted'"
          type="button"
          class="btn btn--danger btn--icon"
          title="Stop"
          aria-label="Stop"
          @click="emit('stop')"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </button>
        <button
          type="submit"
          class="btn btn--primary btn--icon"
          title="Send"
          aria-label="Send"
          :disabled="status === 'streaming' || status === 'submitted'"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4z" />
          </svg>
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.chat-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--border);
}
.chat-input__textarea {
  resize: vertical;
  font: inherit;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: inherit;
}
.chat-input__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.chat-input__options {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.chat-input__approval {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.chat-input__reasoning {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.chat-input__reasoning-select {
  font: inherit;
  font-size: 0.75rem;
  padding: 0.15rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: inherit;
}
.chat-input__actions {
  display: flex;
  gap: 0.5rem;
}
.btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem;
  line-height: 0;
}
</style>
