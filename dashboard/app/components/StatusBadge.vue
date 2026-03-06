<script setup lang="ts">
const props = defineProps<{
  status: 'running' | 'completed' | 'failed' | 'idle'
}>()

const config = computed(() => {
  switch (props.status) {
    case 'running':
      return { label: 'RUNNING', color: 'success' as const, class: 'animate-pulse-glow' }
    case 'completed':
      return { label: 'COMPLETED', color: 'success' as const, class: '' }
    case 'failed':
      return { label: 'FAILED', color: 'error' as const, class: '' }
    default:
      return { label: 'IDLE', color: 'neutral' as const, class: '' }
  }
})
</script>

<template>
  <UBadge
    :label="config.label"
    :color="config.color"
    variant="subtle"
    size="lg"
    :class="config.class"
  />
</template>
