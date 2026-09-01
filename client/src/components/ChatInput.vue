<script setup lang="ts">
import { ref } from "vue";
import type { ChatStatus, ReasoningEffort } from "../types/chat";
import { REASONING_EFFORT_LEVELS } from "../types/chat";

const props = defineProps<{
  status: ChatStatus;
  requireApproval: boolean;
  reasoningEffort: ReasoningEffort;
  sourceProbabilityPercent: number;
}>();

const emit = defineEmits<{
  send: [text: string];
  stop: [];
  "update:requireApproval": [value: boolean];
  "update:reasoningEffort": [value: ReasoningEffort];
  "update:sourceProbabilityPercent": [value: number];
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

        <label class="chat-input__source-probability">
          Sources:
          <input
            type="range"
            class="chat-input__source-probability-range"
            min="0"
            max="100"
            step="10"
            :value="sourceProbabilityPercent"
            @input="emit('update:sourceProbabilityPercent', Number(($event.target as HTMLInputElement).value))"
          />
          {{ sourceProbabilityPercent }}%
        </label>
      </div>

      <div class="chat-input__actions">
        <button
          v-if="status === 'streaming' || status === 'submitted'"
          type="button"
          class="btn btn--danger"
          @click="emit('stop')"
        >
          Stop
        </button>
        <button type="submit" class="btn btn--primary" :disabled="status === 'streaming' || status === 'submitted'">
          Send
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
.chat-input__source-probability {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.chat-input__source-probability-range {
  width: 80px;
  accent-color: var(--accent, currentColor);
}
.chat-input__actions {
  display: flex;
  gap: 0.5rem;
}
</style>
