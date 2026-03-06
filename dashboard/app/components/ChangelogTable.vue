<script setup lang="ts">
import type { ChangelogEntry } from '~/server/utils/types'

const search = ref('')
const fieldFilter = ref('')
const confidenceFilter = ref('')
const page = ref(1)
const pageSize = 50

const fieldOptions = [
  { label: 'All fields', value: '' },
  { label: 'Names', value: 'names' },
  { label: 'Phones', value: 'phoneNumbers' },
  { label: 'Emails', value: 'emailAddresses' },
  { label: 'Addresses', value: 'addresses' },
  { label: 'Organizations', value: 'organizations' },
  { label: 'URLs', value: 'urls' },
  { label: 'Dates', value: 'birthdays' },
]

const confidenceOptions = [
  { label: 'All', value: '' },
  { label: 'HIGH', value: 'high' },
  { label: 'MEDIUM', value: 'medium' },
  { label: 'LOW', value: 'low' },
]

const { data, status } = useFetch('/api/changelog', {
  query: computed(() => ({
    page: page.value,
    pageSize,
    search: search.value,
    field: fieldFilter.value,
    confidence: confidenceFilter.value,
  })),
  watch: [page, search, fieldFilter, confidenceFilter],
})

const entries = computed(() => data.value?.entries ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.ceil(total.value / pageSize))

// Debounce search
let searchTimeout: ReturnType<typeof setTimeout>
function onSearchInput(val: string) {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    search.value = val
    page.value = 1
  }, 300)
}

function confidenceColor(c: string) {
  switch (c?.toLowerCase()) {
    case 'high': return 'success'
    case 'medium': return 'warning'
    case 'low': return 'error'
    default: return 'neutral'
  }
}

function formatField(field: string) {
  // "phoneNumbers[0].value" -> "phones[0]"
  return field
    .replace('phoneNumbers', 'phones')
    .replace('emailAddresses', 'emails')
    .replace('.value', '')
    .replace('.givenName', '.given')
    .replace('.familyName', '.family')
    .replace('.formattedValue', '')
}
</script>

<template>
  <div class="space-y-4">
    <!-- Filters -->
    <div class="flex flex-wrap gap-3">
      <UInput
        :model-value="search"
        placeholder="Search changes..."
        icon="i-lucide-search"
        class="w-64"
        @update:model-value="onSearchInput"
      />
      <USelect
        v-model="fieldFilter"
        :items="fieldOptions"
        value-key="value"
        class="w-40"
        @update:model-value="page = 1"
      />
      <USelect
        v-model="confidenceFilter"
        :items="confidenceOptions"
        value-key="value"
        class="w-32"
        @update:model-value="page = 1"
      />
      <div class="ml-auto text-xs text-neutral-500 self-center tabular-nums">
        {{ total }} changes
      </div>
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-neutral-800 overflow-hidden">
      <table class="w-full text-xs">
        <thead class="bg-neutral-900/80">
          <tr class="text-left text-neutral-500 uppercase tracking-wider">
            <th class="px-4 py-3 font-medium">Field</th>
            <th class="px-4 py-3 font-medium">Change</th>
            <th class="px-4 py-3 font-medium">Confidence</th>
            <th class="px-4 py-3 font-medium">Reason</th>
            <th class="px-4 py-3 font-medium">Time</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-800/50">
          <tr
            v-for="entry in entries"
            :key="`${entry.resourceName}-${entry.field}-${entry.timestamp}`"
            class="hover:bg-neutral-800/30 transition-colors"
          >
            <td class="px-4 py-3 text-neutral-300 font-mono">
              {{ formatField(entry.field) }}
            </td>
            <td class="px-4 py-3">
              <DiffDisplay :old-value="entry.old" :new-value="entry.new" />
            </td>
            <td class="px-4 py-3">
              <UBadge
                :label="entry.confidence?.toUpperCase()"
                :color="confidenceColor(entry.confidence)"
                variant="subtle"
                size="xs"
              />
            </td>
            <td class="px-4 py-3 text-neutral-400 max-w-xs truncate">
              {{ entry.reason }}
            </td>
            <td class="px-4 py-3 text-neutral-500 tabular-nums whitespace-nowrap">
              {{ entry.timestamp?.slice(11, 19) }}
            </td>
          </tr>
          <tr v-if="entries.length === 0 && status !== 'pending'">
            <td colspan="5" class="px-4 py-8 text-center text-neutral-600">
              No changes found
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-center">
      <UPagination
        v-model="page"
        :total="total"
        :items-per-page="pageSize"
      />
    </div>
  </div>
</template>
