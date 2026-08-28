<script setup lang="ts">
const props = defineProps<{
  title: string;
  count: number;
}>();
</script>

<template>
  <em class="custom-json-part">
    {{ title }}: {{ count }}
  </em>
</template>

<style scoped>
.custom-json-part {
  font-size: 0.625rem;
  color: var(--text-muted);
}
</style>
