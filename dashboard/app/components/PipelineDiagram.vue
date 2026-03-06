<script setup lang="ts">
const props = defineProps<{
  phase: 'phase1' | 'phase2' | 'idle'
  status: 'running' | 'completed' | 'failed' | 'idle'
}>()

const steps = [
  { id: 'backup', label: 'Backup', phase: 'phase1' },
  { id: 'analyze', label: 'Analyze', phase: 'phase1' },
  { id: 'fix-high', label: 'Fix HIGH', phase: 'phase1' },
  { id: 'ai-review', label: 'AI Review', phase: 'phase2' },
  { id: 'fix-promoted', label: 'Fix Promoted', phase: 'phase2' },
]

function stepState(step: typeof steps[0]) {
  if (props.status === 'idle') return 'pending'
  if (props.status === 'completed') return 'done'

  const phaseNum = step.phase === 'phase1' ? 1 : 2
  const currentPhaseNum = props.phase === 'phase1' ? 1 : 2

  if (phaseNum < currentPhaseNum) return 'done'
  if (phaseNum > currentPhaseNum) return 'pending'

  // Same phase — show as active for running
  if (props.status === 'running') return 'active'
  if (props.status === 'failed') return 'failed'
  return 'done'
}
</script>

<template>
  <div class="flex items-center gap-1">
    <template v-for="(step, i) in steps" :key="step.id">
      <div
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
        :class="{
          'bg-primary-500/20 text-primary-400 ring-1 ring-primary-500/30': stepState(step) === 'active',
          'bg-neutral-800 text-neutral-300': stepState(step) === 'done',
          'bg-neutral-900 text-neutral-600': stepState(step) === 'pending',
          'bg-red-500/20 text-red-400 ring-1 ring-red-500/30': stepState(step) === 'failed',
        }"
      >
        <UIcon
          v-if="stepState(step) === 'active'"
          name="i-lucide-loader"
          class="size-3.5 animate-spin"
        />
        <UIcon
          v-else-if="stepState(step) === 'done'"
          name="i-lucide-check"
          class="size-3.5"
        />
        <UIcon
          v-else-if="stepState(step) === 'failed'"
          name="i-lucide-x"
          class="size-3.5"
        />
        <UIcon
          v-else
          name="i-lucide-circle"
          class="size-3.5"
        />
        {{ step.label }}
      </div>
      <UIcon
        v-if="i < steps.length - 1"
        name="i-lucide-chevron-right"
        class="size-4 text-neutral-700 shrink-0"
      />
    </template>
  </div>
</template>
