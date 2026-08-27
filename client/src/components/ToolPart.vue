<script setup lang="ts">
import { computed } from "vue";

type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

const props = defineProps<{
  toolName: string;
  toolCallId: string;
  state: ToolPartState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: {
    id: string;
    approved?: boolean;
    requestReason?: string;
    reason?: string;
    isAutomatic?: boolean;
  };
}>();

const emit = defineEmits<{
  approve: [approvalId: string];
  deny: [approvalId: string];
}>();

const formattedInput = computed(() => (props.input === undefined ? "" : JSON.stringify(props.input)));
const formattedOutput = computed(() => (props.output === undefined ? "" : JSON.stringify(props.output)));
</script>

<template>
  <div class="tool-part">
    <div class="tool-part__header">
      🔧 <code>{{ toolName }}</code>
      <span class="tool-part__state">{{ state }}</span>
    </div>

    <div v-if="formattedInput" class="tool-part__row">
      <span class="tool-part__label">input:</span>
      <code>{{ formattedInput }}</code>
    </div>

    <div v-if="state === 'approval-requested'" class="tool-part__approval">
      <p v-if="approval?.requestReason">{{ approval.requestReason }}</p>
      <p v-if="approval?.isAutomatic">Automatically approved.</p>
      <div v-else class="tool-part__approval-actions">
        <button type="button" class="btn btn--primary" @click="emit('approve', approval!.id)">Approve</button>
        <button type="button" class="btn" @click="emit('deny', approval!.id)">Deny</button>
      </div>
    </div>

    <div v-else-if="state === 'approval-responded'" class="tool-part__row">
      Approval {{ approval?.approved ? "granted" : "denied" }}
      <span v-if="approval?.isAutomatic"> (automatically)</span>
      <span v-if="approval?.reason"> — {{ approval.reason }}</span>
    </div>

    <div v-if="state === 'output-available'" class="tool-part__row">
      <span class="tool-part__label">result:</span>
      <code>{{ formattedOutput }}</code>
    </div>

    <div v-else-if="state === 'output-error'" class="tool-part__row tool-part__row--error">
      <span class="tool-part__label">error:</span> {{ errorText }}
    </div>

    <div v-else-if="state === 'output-denied'" class="tool-part__row tool-part__row--muted">Tool call denied.</div>
  </div>
</template>

<style scoped>
.tool-part {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.tool-part__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}
.tool-part__state {
  margin-left: auto;
  font-weight: 400;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.tool-part__row {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.tool-part__row code {
  word-break: break-all;
}
.tool-part__row--error {
  color: var(--danger-text);
}
.tool-part__row--muted {
  color: var(--text-muted);
}
.tool-part__label {
  color: var(--text-muted);
}
.tool-part__approval {
  background: var(--surface-3);
  border-radius: 6px;
  padding: 0.5rem;
}
.tool-part__approval-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.35rem;
}
</style>
