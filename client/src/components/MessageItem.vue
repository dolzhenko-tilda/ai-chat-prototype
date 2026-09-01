<script setup lang="ts">
import { computed } from "vue";
import { getToolOrDynamicToolName, isDynamicToolUIPart, isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import type { AppUIMessage } from "../types/chat";
import TextPart from "./TextPart.vue";
import ReasoningPart from "./ReasoningPart.vue";
import ToolPart from "./ToolPart.vue";
import ErrorPart from "./ErrorPart.vue";
import CustomJsonPart from "./CustomJsonPart.vue";

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

/** Mock sources are appended by the server as `data-source` parts (see
 * `emitSourcesForCompletedUnits` in generationService.ts), one per paragraph
 * - or, for a markdown list, one per list item - of assistant text that
 * wasn't randomly skipped. Emitted live as paragraphs/items complete during
 * streaming, and persisted with the message afterwards, so they're
 * available both mid-stream and on history reload. */
const sourceParts = computed(() =>
  props.message.parts.filter(
    (part): part is Extract<AppUIMessage["parts"][number], { type: "data-source" }> => part.type === "data-source"
  )
);

/** This text part's ordinal among all "text" parts in the message
 * (0-based) - matches `SourcePartMessage.textPartIndex` so sources can be
 * attached to the right text part even if a message has several. */
function textPartIndex(part: AppUIMessage["parts"][number]): number {
  return props.message.parts.filter(isTextUIPart).indexOf(part as never);
}

function sourcesForTextPart(index: number) {
  return sourceParts.value.filter((part) => part.data.textPartIndex === index).map((part) => part.data);
}
</script>

<template>
  <div class="message" :class="[isUser ? 'message--user' : 'message--assistant']">
    <div class="message__role">{{ isUser ? "You" : "Assistant" }}</div>

    <div class="message__parts">
      <template v-for="(part, idx) in message.parts" :key="idx">
        <TextPart
          v-if="isTextUIPart(part)"
          :text="part.text"
          :state="isStreamingThisMessage ? part.state : 'done'"
          :sources="sourcesForTextPart(textPartIndex(part))"
        />
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
        <CustomJsonPart v-else-if="part.type === 'data-custom-json'" :title="part.data.title" :count="part.data.count" />
        <!-- data-source parts are rendered inline inside TextPart, not standalone -->

      </template>
      <span v-if="isStreamingThisMessage && message.parts.length === 0" class="message__typing">Thinking…</span>
    </div>

    <div class="message__actions">
      <span v-if="statusBadge" class="message__badge">{{ statusBadge }}</span>
      <button type="button" class="btn btn--ghost btn--icon" title="Copy" aria-label="Copy" @click="copyText">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </svg>
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--icon"
        title="Delete"
        aria-label="Delete"
        @click="emit('delete', message.id)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
          <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
      <button
        v-if="isAssistant"
        type="button"
        class="btn btn--ghost btn--icon"
        title="Regenerate"
        aria-label="Regenerate"
        @click="emit('regenerate', message.id)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
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
.btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem;
  line-height: 0;
}
</style>
