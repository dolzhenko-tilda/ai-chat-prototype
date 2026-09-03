<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { formatDurationMs } from "../utils/dateFormat";

const props = defineProps<{
  text: string;
  state?: "streaming" | "done";
  /** How long the model thought, in ms (see `MessageItem.vue`'s
   * `reasoningDurationMs`). Only available once the reasoning part is
   * `"done"` - measured server-side, since neither OpenAI's nor
   * Anthropic's API reports this itself. */
  durationMs?: number;
}>();

const thoughtLabel = computed(() =>
  props.durationMs !== undefined ? `Thought for ${formatDurationMs(props.durationMs)}` : null
);

// Collapsed by default once done, expanded automatically while streaming so
// the user can watch the model "think".
const expanded = ref(true);

watch(
  () => props.state,
  async (newState, oldState) => {
    if (newState !== oldState && newState === "done") {
      expanded.value = false;
    }
  },
  { immediate: true, flush: "post" }
);
</script>

<template>
  <details class="reasoning-part" :open="expanded" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
    <summary>
      Reasoning
      <span v-if="state === 'streaming'" class="reasoning-part__badge">thinking…</span>
      <span v-else-if="thoughtLabel" class="reasoning-part__badge">{{ thoughtLabel }}</span>
    </summary>
    <p class="reasoning-part__text">{{ text }}</p>
  </details>
</template>

<style scoped>
.reasoning-part {
  background: var(--surface-2);
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.reasoning-part summary {
  cursor: pointer;
  font-weight: 600;
  user-select: none;
}
.reasoning-part__badge {
  margin-left: 0.5rem;
  font-weight: 400;
  font-style: italic;
}
.reasoning-part__text {
  white-space: pre-wrap;
  margin: 0.5rem 0 0;
}
</style>
