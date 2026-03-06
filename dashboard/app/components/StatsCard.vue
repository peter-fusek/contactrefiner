<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  icon?: string
  color?: 'green' | 'amber' | 'cyan' | 'red'
}>()
</script>

<template>
  <div
    class="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 relative overflow-hidden scanlines"
    :class="{
      'glow-green': color === 'green',
      'glow-amber': color === 'amber',
      'glow-cyan': color === 'cyan',
      'glow-red': color === 'red',
    }"
  >
    <div class="flex items-start justify-between relative z-10">
      <div>
        <p class="text-xs uppercase tracking-wider text-neutral-500 mb-1">
          {{ label }}
        </p>
        <p class="text-2xl font-bold text-neutral-100 tabular-nums">
          {{ value }}
        </p>
      </div>
      <div
        v-if="icon"
        class="size-10 rounded-lg flex items-center justify-center"
        :class="{
          'bg-primary-500/10 text-primary-400': color === 'green',
          'bg-amber-500/10 text-amber-400': color === 'amber',
          'bg-cyan-500/10 text-cyan-400': color === 'cyan',
          'bg-red-500/10 text-red-400': color === 'red',
          'bg-neutral-800 text-neutral-400': !color,
        }"
      >
        <UIcon :name="icon" class="size-5" />
      </div>
    </div>
    <slot />
  </div>
</template>
