<script setup lang="ts">
const props = defineProps<{
  current: number
  total: number
  label?: string
}>()

const percent = computed(() =>
  props.total > 0 ? Math.round((props.current / props.total) * 100) : 0,
)
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex justify-between text-xs text-neutral-400">
      <span>{{ label || 'Progress' }}</span>
      <span>{{ current }}/{{ total }} ({{ percent }}%)</span>
    </div>
    <div class="h-2 bg-neutral-800 rounded-full overflow-hidden">
      <div
        class="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all duration-500"
        :style="{ width: `${percent}%` }"
      />
    </div>
  </div>
</template>
