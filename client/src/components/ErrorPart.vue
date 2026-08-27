<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<template>
  <div class="error-part" role="alert">
    <strong>Error:</strong> {{ message }}
  </div>
</template>

<style scoped>
.error-part {
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  color: var(--danger-text);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
}
</style>
