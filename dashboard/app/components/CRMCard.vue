<script setup lang="ts">
import type { CRMContact } from '~/server/utils/types'

const props = defineProps<{
  contact: CRMContact
}>()

const emit = defineEmits<{
  select: [contact: CRMContact]
}>()

function signalColor(type: string | undefined): string {
  if (type === 'job_change') return 'text-green-400 bg-green-500/15'
  if (type === 'active') return 'text-yellow-400 bg-yellow-500/15'
  return 'text-neutral-500 bg-neutral-800'
}

function dragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', props.contact.resourceName)
}
</script>

<template>
  <div
    draggable="true"
    class="bg-neutral-900 border border-neutral-800 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-neutral-700 transition-colors group"
    @dragstart="dragStart"
    @click="emit('select', contact)"
  >
    <!-- Name + score -->
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="min-w-0">
        <p class="text-sm font-medium text-neutral-200 truncate">{{ contact.name }}</p>
        <p v-if="contact.contact.org" class="text-[11px] text-neutral-500 truncate">{{ contact.contact.org }}</p>
      </div>
      <span class="text-xs font-mono font-bold tabular-nums shrink-0" :class="contact.score_total >= 100 ? 'text-cyan-400' : contact.linkedin?.signal_type === 'job_change' ? 'text-green-400' : 'text-neutral-500'">
        {{ contact.score_total }}
      </span>
    </div>

    <!-- LinkedIn signal badge -->
    <div v-if="contact.linkedin" class="mb-2">
      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" :class="signalColor(contact.linkedin.signal_type)">
        <UIcon name="i-lucide-linkedin" class="size-3" />
        {{ contact.linkedin.signal_type?.replace('_', ' ') }}
      </span>
    </div>

    <!-- Meta line -->
    <div class="flex items-center gap-3 text-[10px] text-neutral-600">
      <span v-if="contact.interaction.months_gap" class="tabular-nums">{{ contact.interaction.months_gap }}mo gap</span>
      <span v-if="contact.notes" class="flex items-center gap-0.5">
        <UIcon name="i-lucide-sticky-note" class="size-2.5" />
        note
      </span>
      <span v-if="contact.tags.length" class="flex items-center gap-0.5">
        <UIcon name="i-lucide-tag" class="size-2.5" />
        {{ contact.tags.length }}
      </span>
    </div>
  </div>
</template>
