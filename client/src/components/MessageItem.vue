<script setup lang="ts">
import { computed } from "vue";
import { getToolOrDynamicToolName, isDynamicToolUIPart, isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import type { AppUIMessage, Rate } from "../types/chat";
import TextPart from "./TextPart.vue";
import ReasoningPart from "./ReasoningPart.vue";
import ToolPart from "./ToolPart.vue";
import ErrorPart from "./ErrorPart.vue";
import CustomJsonPart from "./CustomJsonPart.vue";
import { formatTime } from "../utils/dateFormat";

const props = defineProps<{
  message: AppUIMessage;
  /** Whether this message's assistant response is the one currently streaming. */
  isStreamingThisMessage: boolean;
  /** ISO timestamp to display for this message (resolved by `MessageList.vue`, falling back to "now" if the message isn't persisted with a `createdAt` yet). */
  createdAt: string;
}>();

const emit = defineEmits<{
  delete: [messageId: string];
  regenerate: [messageId: string];
  approve: [approvalId: string];
  deny: [approvalId: string];
  rate: [messageId: string, rate: Rate];
}>();

const isUser = computed(() => props.message.role === "user");
const isAssistant = computed(() => props.message.role === "assistant");

const formattedTime = computed(() => formatTime(props.createdAt));

const currentRate = computed(() => props.message.metadata?.rateInfo?.rate);

const statusBadge = computed(() => {
  const status = props.message.metadata?.status;
  if (status === "aborted") return "Stopped";
  if (status === "error") return "Error";
  return null;
});

const isStreaming = computed(
  () => props.message.metadata?.status === "streaming" || props.isStreamingThisMessage
);

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

/** Mock sources are now cited by the model itself as regular inline markdown
 * links (`[title](url "source:title")`) inside its text - see the system
 * prompt built in `generationService.ts`'s `buildSystemPrompt` - so `TextPart`
 * needs no extra `sources` data; it just renders the markdown and styles any
 * `a[title^="source:"]` anchor via CSS. */
</script>

<template>
  <div class="message" :class="[isUser ? 'message--user' : 'message--assistant']">
    <div class="message__role">
      {{ isUser ? "You" : "Assistant" }}
      <span class="message__time">{{ formattedTime }}</span>
    </div>

    <div class="message__parts">
      <template v-for="(part, idx) in message.parts" :key="idx">
        <TextPart
          v-if="isTextUIPart(part)"
          :text="part.text"
          :state="isStreamingThisMessage ? part.state : 'done'"
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
      </template>
      <span v-if="isStreamingThisMessage && message.parts.length === 0" class="message__typing">Thinking…</span>
    </div>

    <div v-if="!isStreaming" class="message__actions">
      <span v-if="statusBadge" class="message__badge">{{ statusBadge }}</span>
      <button type="button" class="btn btn--ghost btn--icon" title="Copy" aria-label="Copy" @click="copyText">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </svg>
      </button>
      <template v-if="isAssistant">
        <button
          type="button"
          class="btn btn--ghost btn--icon btn--like"
          :class="{ 'btn--active': currentRate === 'like' }"
          title="Like"
          aria-label="Like"
          @click="emit('rate', message.id, 'like')"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7 10v12" />
            <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
          </svg>
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--icon btn--dislike"
          :class="{ 'btn--active': currentRate === 'dislike' }"
          title="Dislike"
          aria-label="Dislike"
          @click="emit('rate', message.id, 'dislike')"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 14V2" />
            <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
          </svg>
        </button>
      </template>
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
.message--user {
  align-self: flex-end;
  background: var(--accent-bg);
}
.message--assistant {
  align-self: flex-start;
  background: var(--surface-1);
}
.message__role {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.message__time {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
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
.btn--active {
  color: var(--accent);
  background: var(--accent-bg);
}
.btn--dislike.btn--active {
  color: var(--danger-text);
}
</style>
