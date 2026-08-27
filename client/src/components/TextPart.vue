<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  text: string;
  state?: "streaming" | "done";
}>();

const isStreaming = computed(() => props.state === "streaming");
</script>

<template>
  <p class="text-part" :class="{ 'text-part--streaming': isStreaming }">{{ text }}<span v-if="isStreaming" class="cursor">▍</span></p>
</template>

<style scoped>
.text-part {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  line-height: 1.5;
}
.cursor {
  display: inline-block;
  animation: blink 1s step-start infinite;
  color: var(--accent);
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
