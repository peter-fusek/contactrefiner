<script setup lang="ts">
useHead({
  title: 'Social Signals — Contact Refiner',
  meta: [
    { name: 'description', content: 'LinkedIn social signals: job changes, activity, and reconnection opportunities.' },
  ],
})

import type { LinkedInSignalsResponse, LinkedInSignal } from '~/server/utils/types'

const { data, status, refresh } = useFetch<LinkedInSignalsResponse>('/api/social-signals')

// Filter state
const filterType = ref<string>('all')
const searchQuery = ref('')
const sortBy = ref<'name' | 'date' | 'type'>('type')

const filteredSignals = computed(() => {
  let signals = data.value?.signals ?? []

  // Filter by signal type
  if (filterType.value !== 'all') {
    signals = signals.filter(s => s.signal_type === filterType.value)
  }

  // Search by name, headline, or signal text
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    signals = signals.filter(s =>
      s.name.toLowerCase().includes(q)
      || s.headline?.toLowerCase().includes(q)
      || s.signal_text?.toLowerCase().includes(q),
    )
  }

  // Sort
  if (sortBy.value === 'name') {
    signals = [...signals].sort((a, b) => a.name.localeCompare(b.name))
  } else if (sortBy.value === 'date') {
    signals = [...signals].sort((a, b) => b.scanned_at.localeCompare(a.scanned_at))
  } else {
    // Sort by type: job_change first, then active, then profile
    const typeOrder: Record<string, number> = { job_change: 0, active: 1, profile: 2, no_activity: 3 }
    signals = [...signals].sort((a, b) => (typeOrder[a.signal_type] ?? 9) - (typeOrder[b.signal_type] ?? 9))
  }

  return signals
})

const generatedDate = computed(() => {
  const gen = data.value?.stats.generated
  if (!gen) return null
  return new Date(gen).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
})

function signalBadge(type: string) {
  switch (type) {
    case 'job_change': return { label: 'Job Change', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' }
    case 'active': return { label: 'Active', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' }
    case 'profile': return { label: 'Profile', color: 'text-neutral-400', bg: 'bg-neutral-500/10 border-neutral-500/20' }
    default: return { label: 'Unknown', color: 'text-neutral-500', bg: 'bg-neutral-800 border-neutral-700' }
  }
}

</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-neutral-100">
          Social Signals
        </h1>
        <p v-if="generatedDate" class="text-xs text-neutral-500 mt-1">
          Last scan: {{ generatedDate }}
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="ghost"
        color="neutral"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </div>

    <!-- Loading -->
    <div v-if="status === 'pending' && !data" class="text-center py-16">
      <UIcon name="i-lucide-loader" class="size-8 text-neutral-500 mx-auto mb-3 animate-spin" />
      <p class="text-neutral-500">Loading social signals...</p>
    </div>

    <!-- Error -->
    <div v-else-if="status === 'error'" class="text-center py-16">
      <UIcon name="i-lucide-alert-triangle" class="size-8 text-red-500 mx-auto mb-3" />
      <p class="text-red-400">Failed to load data</p>
      <UButton label="Retry" size="sm" variant="soft" class="mt-3" @click="refresh()" />
    </div>

    <template v-else>
      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          label="Profiles Scanned"
          :value="data?.stats.total ?? 0"
          icon="i-lucide-scan-search"
          color="cyan"
        />
        <StatsCard
          label="Job Changes"
          :value="data?.stats.jobChanges ?? 0"
          icon="i-lucide-arrow-right-left"
          color="green"
        />
        <StatsCard
          label="Active Profiles"
          :value="data?.stats.active ?? 0"
          icon="i-lucide-message-circle"
          color="amber"
        />
        <StatsCard
          label="Change Rate"
          :value="data?.stats.total ? `${Math.round((data.stats.jobChanges / data.stats.total) * 100)}%` : '0%'"
          icon="i-lucide-trending-up"
          color="green"
        />
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-3 items-center">
        <!-- Search -->
        <div class="relative flex-1 min-w-48">
          <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by name, role, or signal..."
            class="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
          />
        </div>

        <!-- Type filter -->
        <div class="flex gap-1">
          <button
            v-for="opt in [
              { value: 'all', label: 'All' },
              { value: 'job_change', label: 'Job Changes' },
              { value: 'active', label: 'Active' },
              { value: 'profile', label: 'Profile' },
            ]"
            :key="opt.value"
            class="px-3 py-1.5 text-xs rounded-lg border transition-colors"
            :class="filterType === opt.value
              ? 'bg-primary-500/15 border-primary-500/30 text-primary-400'
              : 'border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700'"
            @click="filterType = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>

        <!-- Sort -->
        <select
          v-model="sortBy"
          class="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-400 focus:outline-none focus:border-neutral-600"
        >
          <option value="type">Sort: Signal Type</option>
          <option value="name">Sort: Name</option>
          <option value="date">Sort: Recent</option>
        </select>
      </div>

      <!-- Results count -->
      <p class="text-xs text-neutral-500">
        {{ filteredSignals.length }} of {{ data?.stats.total ?? 0 }} signals
      </p>

      <!-- Signal Cards -->
      <div class="space-y-3">
        <div
          v-for="signal in filteredSignals"
          :key="signal.resourceName"
          class="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 hover:border-neutral-700 card-hover"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-semibold text-neutral-100 truncate">{{ signal.name }}</h3>
                <span
                  class="shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium"
                  :class="signalBadge(signal.signal_type).bg + ' ' + signalBadge(signal.signal_type).color"
                >
                  {{ signalBadge(signal.signal_type).label }}
                </span>
              </div>
              <p class="text-sm text-neutral-400 truncate">{{ signal.headline }}</p>
              <p v-if="signal.signal_text" class="text-sm text-neutral-300 mt-2">
                <span class="text-neutral-500">Signal:</span> {{ signal.signal_text }}
              </p>
              <!-- Recent activity -->
              <div v-if="signal.recent_activity?.length" class="mt-2 space-y-1">
                <p
                  v-for="(activity, i) in signal.recent_activity.slice(0, 3)"
                  :key="i"
                  class="text-xs text-neutral-500 truncate pl-3 border-l border-neutral-800"
                >
                  {{ activity }}
                </p>
              </div>
            </div>
            <a
              v-if="signal.linkedin_url"
              :href="signal.linkedin_url"
              target="_blank"
              rel="noopener noreferrer"
              class="shrink-0 size-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors"
              title="View on LinkedIn"
            >
              <UIcon name="i-lucide-external-link" class="size-4" />
            </a>
          </div>
          <div class="mt-2 text-[10px] text-neutral-600">
            Scanned {{ new Date(signal.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!filteredSignals.length && data?.stats.total" class="text-center py-12">
        <UIcon name="i-lucide-search-x" class="size-8 text-neutral-600 mx-auto mb-3" />
        <p class="text-neutral-500">No signals match your filters</p>
      </div>

      <div v-if="!data?.stats.total" class="text-center py-16">
        <UIcon name="i-lucide-scan-search" class="size-8 text-neutral-600 mx-auto mb-3" />
        <p class="text-neutral-500">No LinkedIn signals yet</p>
        <p class="text-xs text-neutral-600 mt-1">Run the LinkedIn scanner to populate this data</p>
      </div>
    </template>
  </div>
</template>
