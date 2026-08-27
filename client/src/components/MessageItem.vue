<script setup lang="ts">
import { computed } from "vue";
import { getToolOrDynamicToolName, isDynamicToolUIPart, isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import type { AppUIMessage } from "../types/chat";
import TextPart from "./TextPart.vue";
import ReasoningPart from "./ReasoningPart.vue";
import ToolPart from "./ToolPart.vue";
import ErrorPart from "./ErrorPart.vue";

const props = defineProps<{
  message: AppUIMessage;
  /** Whether this message's assistant response is the one currently streaming. */
  isStreamingThisMessage: boolean;
}>();

const emit = defineEmits<{
  delete: [messageId: string];
  regenerate: [messageId: string];
  approve: [approvalId: string];
  deny: [approvalId: string];
}>();

const isUser = computed(() => props.message.role === "user");
const isAssistant = computed(() => props.message.role === "assistant");

const statusBadge = computed(() => {
  const status = props.message.metadata?.status;
  if (status === "aborted") return "Stopped";
  if (status === "error") return "Error";
  return null;
});

const textContent = computed(() =>
  props.message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("\n")
);

async function copyText() {
  try {
    await navigator.clipboard.writeText(textContent.value);
  } catch {
    // Clipboard API can fail (permissions/insecure context); nothing to recover.
  }
}

function isToolOrDynamicPart(part: AppUIMessage["parts"][number]) {
  return isToolUIPart(part) || isDynamicToolUIPart(part);
}

function toolNameFor(part: AppUIMessage["parts"][number]): string {
  return isToolUIPart(part) || isDynamicToolUIPart(part) ? getToolOrDynamicToolName(part) : "";
}
</script>

<template>
  <div class="message" :class="[isUser ? 'message--user' : 'message--assistant']">
    <div class="message__role">{{ isUser ? "You" : "Assistant" }}</div>

    <div class="message__parts">
      <template v-for="(part, idx) in message.parts" :key="idx">
        <TextPart v-if="isTextUIPart(part)" :text="part.text" :state="isStreamingThisMessage ? part.state : 'done'" />
        <ReasoningPart
          v-else-if="isReasoningUIPart(part)"
          :text="part.text"
          :state="isStreamingThisMessage ? part.state : 'done'"
        />
        <ToolPart
          v-else-if="isToolOrDynamicPart(part)"
          :tool-name="toolNameFor(part)"
          :tool-call-id="part.toolCallId"
          :state="part.state"
          :input="'input' in part ? part.input : undefined"
          :output="'output' in part ? part.output : undefined"
          :error-text="'errorText' in part ? part.errorText : undefined"
          :approval="'approval' in part ? part.approval : undefined"
          @approve="(id) => emit('approve', id)"
          @deny="(id) => emit('deny', id)"
        />
        <ErrorPart v-else-if="part.type === 'data-error'" :message="part.data.message" />
      </template>
      <span v-if="isStreamingThisMessage && message.parts.length === 0" class="message__typing">Thinking…</span>
    </div>

    <div class="message__actions">
      <span v-if="statusBadge" class="message__badge">{{ statusBadge }}</span>
      <button type="button" class="btn btn--ghost" title="Copy" @click="copyText">Copy</button>
      <button type="button" class="btn btn--ghost" title="Delete" @click="emit('delete', message.id)">
        Delete
      </button>
      <button
        v-if="isAssistant"
        type="button"
        class="btn btn--ghost"
        title="Regenerate"
        @click="emit('regenerate', message.id)"
      >
        Regenerate
      </button>
    </div>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  max-width: 80%;
}
.message:first-child {
  margin-top: auto;
}
.message--user {
  align-self: flex-end;
  background: var(--accent-bg);
}
.message--assistant {
  align-self: flex-start;
  background: var(--surface-1);
}
.message__role {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.message__parts {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.message__typing {
  color: var(--text-muted);
  font-style: italic;
}
.message__actions {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.message__badge {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--danger-text);
  background: var(--danger-bg);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  margin-right: 0.25rem;
}
</style>
