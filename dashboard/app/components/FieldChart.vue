<script setup lang="ts">
const props = defineProps<{
  data: Record<string, number>
}>()

const sorted = computed(() => {
  return Object.entries(props.data)
    .sort(([, a], [, b]) => b - a)
})

const max = computed(() => {
  const values = sorted.value.map(([, v]) => v)
  return Math.max(...values, 1)
})

const colors: Record<string, string> = {
  names: 'bg-primary-500',
  phones: 'bg-cyan-500',
  emails: 'bg-amber-500',
  addresses: 'bg-violet-500',
  organizations: 'bg-rose-500',
  urls: 'bg-blue-500',
  dates: 'bg-orange-500',
  other: 'bg-neutral-500',
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="[label, count] in sorted"
      :key="label"
      class="space-y-1"
    >
      <div class="flex justify-between text-xs">
        <span class="text-neutral-400 capitalize">{{ label }}</span>
        <span class="text-neutral-500 tabular-nums">{{ count }}</span>
      </div>
      <div class="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-700"
          :class="colors[label] || 'bg-neutral-500'"
          :style="{ width: `${(count / max) * 100}%` }"
        />
      </div>
    </div>
    <p v-if="sorted.length === 0" class="text-xs text-neutral-600 text-center py-4">
      No data
    </p>
  </div>
</template>
