<script setup lang="ts">
import type { AnalyticsResponse } from '~/server/utils/types'

const { data } = useFetch<AnalyticsResponse>('/api/analytics')
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold text-neutral-100">
      Analytics
    </h1>

    <!-- Top Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatsCard
        label="Total Applied"
        :value="data?.totalChanges ?? 0"
        icon="i-lucide-check-circle"
        color="green"
      />
      <StatsCard
        label="Total Failed"
        :value="data?.totalFailed ?? 0"
        icon="i-lucide-x-circle"
        color="red"
      />
      <StatsCard
        label="Success Rate"
        :value="`${data?.successRate ?? 0}%`"
        icon="i-lucide-trending-up"
        color="cyan"
      />
      <StatsCard
        label="AI Cost"
        :value="`$${data?.estimatedCost ?? 0}`"
        icon="i-lucide-dollar-sign"
        color="amber"
      />
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Changes by Field -->
      <div class="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <p class="text-xs uppercase tracking-wider text-neutral-500 mb-4">
          Changes by Field
        </p>
        <FieldChart :data="data?.byField ?? {}" />
      </div>

      <!-- Confidence Distribution -->
      <div class="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <p class="text-xs uppercase tracking-wider text-neutral-500 mb-4">
          Confidence Distribution
        </p>
        <div class="space-y-4">
          <div v-for="(count, label) in data?.byConfidence" :key="label" class="space-y-1">
            <div class="flex justify-between text-xs">
              <span class="uppercase" :class="{
                'text-primary-400': label === 'high',
                'text-amber-400': label === 'medium',
                'text-red-400': label === 'low',
              }">
                {{ label }}
              </span>
              <span class="text-neutral-500 tabular-nums">{{ count }}</span>
            </div>
            <div class="h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-700"
                :class="{
                  'bg-primary-500': label === 'high',
                  'bg-amber-500': label === 'medium',
                  'bg-red-500': label === 'low',
                }"
                :style="{ width: `${(data?.byConfidence ? count / Math.max(data.byConfidence.high, data.byConfidence.medium, data.byConfidence.low, 1) * 100 : 0)}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Daily Runs Timeline -->
    <div class="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <p class="text-xs uppercase tracking-wider text-neutral-500 mb-4">
        Daily Run History
      </p>
      <div v-if="data?.dailyRuns?.length" class="space-y-2">
        <div
          v-for="run in data.dailyRuns"
          :key="run.date"
          class="flex items-center gap-3 text-xs"
        >
          <span class="text-neutral-500 w-20 tabular-nums">{{ run.date }}</span>
          <div class="flex-1 flex gap-1 h-4">
            <div
              class="bg-primary-500/80 rounded-sm h-full"
              :style="{ width: `${run.changes}px`, minWidth: run.changes > 0 ? '2px' : '0' }"
              :title="`${run.changes} applied`"
            />
            <div
              v-if="run.failed > 0"
              class="bg-red-500/80 rounded-sm h-full"
              :style="{ width: `${run.failed * 3}px`, minWidth: '2px' }"
              :title="`${run.failed} failed`"
            />
          </div>
          <span class="text-neutral-400 tabular-nums w-16 text-right">{{ run.changes }} ok</span>
          <span class="text-red-400/60 tabular-nums w-16 text-right">{{ run.failed }} fail</span>
        </div>
      </div>
      <p v-else class="text-xs text-neutral-600 text-center py-4">
        No run history
      </p>
    </div>

    <!-- Top Contacts -->
    <div class="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <p class="text-xs uppercase tracking-wider text-neutral-500 mb-4">
        Top Changed Contacts
      </p>
      <div v-if="data?.topContacts?.length" class="space-y-2">
        <div
          v-for="(contact, i) in data.topContacts"
          :key="contact.name"
          class="flex items-center gap-3 text-xs"
        >
          <span class="text-neutral-600 w-5 text-right tabular-nums">{{ i + 1 }}.</span>
          <span class="text-neutral-300 flex-1 truncate font-mono">{{ contact.name }}</span>
          <span class="text-neutral-500 tabular-nums">{{ contact.changes }} changes</span>
        </div>
      </div>
      <p v-else class="text-xs text-neutral-600 text-center py-4">
        No data
      </p>
    </div>
  </div>
</template>
