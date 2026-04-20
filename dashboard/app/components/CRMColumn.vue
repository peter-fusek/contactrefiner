<script setup lang="ts">
import type { CRMContact, CRMStage } from '~/server/utils/types'

const props = defineProps<{
  stage: CRMStage
  label: string
  contacts: CRMContact[]
  color: string
}>()

const emit = defineEmits<{
  drop: [resourceName: string, stage: CRMStage]
  select: [contact: CRMContact]
  'reach-out': [resourceName: string]
}>()

const dragOver = ref(false)
const columnEl = ref<HTMLElement | null>(null)

// Use currentTarget.contains(relatedTarget) as primary check; fall back to a
// counter for Chrome where relatedTarget is sometimes null. Both dragenter and
// dragover must preventDefault for the column to be a valid drop target.
let dragCounter = 0

function onDragEnter(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  dragCounter++
  dragOver.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDragOver(e: DragEvent) {
  // Must preventDefault so the column is a valid drop target. Do NOT
  // stopPropagation — the parent kanban's auto-scroll handler needs this event.
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Node | null
  // If we know the destination AND it's outside the column, we truly left.
  if (related && !columnEl.value?.contains(related)) {
    dragCounter = 0
    dragOver.value = false
    return
  }
  // Chrome: relatedTarget is null during drag — fall back to counter.
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    dragOver.value = false
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  dragCounter = 0
  dragOver.value = false
  const resourceName = e.dataTransfer?.getData('text/plain')
  if (resourceName) emit('drop', resourceName, props.stage)
}

// Reset state if a drag ends anywhere (e.g. cancelled with Esc or dropped
// on a non-target) — prevents stale highlight/counter from breaking the
// next drag.
function resetDragState() {
  dragCounter = 0
  dragOver.value = false
}

onMounted(() => {
  document.addEventListener('dragend', resetDragState)
})
onBeforeUnmount(() => {
  document.removeEventListener('dragend', resetDragState)
})
</script>

<template>
  <div
    ref="columnEl"
    class="flex flex-col min-w-[80vw] sm:min-w-[260px] max-w-[300px] shrink-0 rounded-xl border transition-colors snap-center"
    :class="dragOver ? 'border-primary-500/50 bg-primary-500/5' : 'border-neutral-800 bg-neutral-900/30'"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800/50">
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full" :class="color" />
        <span class="text-xs font-semibold text-neutral-300 uppercase tracking-wider">{{ label }}</span>
      </div>
      <span class="text-[10px] text-neutral-600 font-mono tabular-nums">{{ contacts.length }}</span>
    </div>

    <!-- Cards -->
    <div class="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)]">
      <CRMCard
        v-for="c in contacts"
        :key="c.resourceName"
        :contact="c"
        @select="emit('select', $event)"
        @reach-out="emit('reach-out', $event)"
      />
      <p v-if="!contacts.length" class="text-center text-[10px] text-neutral-700 py-4">
        Drop contacts here
      </p>
    </div>
  </div>
</template>
