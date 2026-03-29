<script setup lang="ts">
import type { PipelineRun } from '~/server/utils/gcs'

useHead({
  title: 'Pipeline Runs — Contact Refiner',
  meta: [
    { name: 'description', content: 'History of automated pipeline executions.' },
  ],
})

const { data, status, refresh } = useFetch<PipelineRun[]>('/api/pipeline-runs')

let interval: ReturnType<typeof setInterval> | undefined
onMounted(() => { interval = setInterval(refresh, 60_000) })
onUnmounted(() => { if (interval) clearInterval(interval) })
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold text-neutral-100">
      Pipeline Runs
    </h1>
    <RunHistoryTable :runs="data ?? []" :loading="status === 'pending'" />
  </div>
</template>
