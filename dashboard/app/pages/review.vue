<script setup lang="ts">
import type { ReviewChange, ReviewDecision, ReviewSession } from '~/server/utils/types'

// Fetch review data
const { data, status, refresh } = useFetch('/api/review')

// Session state
const sessionId = ref('')
const decisions = ref<Record<string, ReviewDecision>>({})
const sessionStats = ref({ total: 0, approved: 0, rejected: 0, edited: 0, skipped: 0 })

// Filters
const fieldFilter = ref('')
const categoryFilter = ref('')
const hideDecided = ref(false)

// View mode
const viewMode = ref<'contact' | 'rule'>('contact')

// Focused contact index
const focusedIndex = ref(0)

// Saving state
const isSaving = ref(false)
const lastSaved = ref<string | null>(null)
let autoSaveTimer: ReturnType<typeof setTimeout> | undefined

// Initialize session
watch(data, (d) => {
  if (!d) return
  if (d.session) {
    sessionId.value = d.session.id
    decisions.value = { ...d.session.decisions }
    sessionStats.value = { ...d.session.stats }
  } else if (!sessionId.value) {
    sessionId.value = `review_${Date.now().toString(36)}`
  }

  // Restore from localStorage
  const saved = localStorage.getItem(`review_${sessionId.value}`)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Object.keys(parsed.decisions || {}).length > Object.keys(decisions.value).length) {
        decisions.value = parsed.decisions
        recomputeStats()
      }
    } catch { /* ignore */ }
  }
}, { immediate: true })

// All changes from API
const allChanges = computed(() => data.value?.changes ?? [])

// Filtered changes
const filteredChanges = computed(() => {
  let changes = allChanges.value
  if (fieldFilter.value) {
    changes = changes.filter(c => c.field.startsWith(fieldFilter.value))
  }
  if (categoryFilter.value) {
    changes = changes.filter(c => c.ruleCategory === categoryFilter.value)
  }
  if (hideDecided.value) {
    changes = changes.filter(c => !decisions.value[c.id])
  }
  return changes
})

// Group by contact
const contactGroups = computed(() => {
  const map = new Map<string, { displayName: string; resourceName: string; changes: ReviewChange[] }>()
  for (const c of filteredChanges.value) {
    let group = map.get(c.resourceName)
    if (!group) {
      group = { displayName: c.displayName, resourceName: c.resourceName, changes: [] }
      map.set(c.resourceName, group)
    }
    group.changes.push(c)
  }
  return [...map.values()]
})

// Group by rule category
const ruleGroups = computed(() => {
  const map = new Map<string, ReviewChange[]>()
  for (const c of filteredChanges.value) {
    let group = map.get(c.ruleCategory)
    if (!group) {
      group = []
      map.set(c.ruleCategory, group)
    }
    group.push(c)
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
})

// Filter options
const fieldOptions = computed(() => {
  const fields = data.value?.stats?.byField ?? {}
  return [
    { label: 'All fields', value: '' },
    ...Object.entries(fields)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: `${formatFieldName(k)} (${v})`, value: k })),
  ]
})

const categoryOptions = computed(() => {
  const cats = data.value?.stats?.byCategory ?? {}
  return [
    { label: 'All rules', value: '' },
    ...Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: `${k} (${v})`, value: k })),
  ]
})

// Editing state
const editingId = ref<string | null>(null)
const editValue = ref('')

function formatFieldName(field: string): string {
  return field
    .replace('phoneNumbers', 'phones')
    .replace('emailAddresses', 'emails')
    .replace('names', 'names')
    .replace('organizations', 'orgs')
    .replace('addresses', 'addr')
}

function formatField(field: string): string {
  return field
    .replace('phoneNumbers', 'phones')
    .replace('emailAddresses', 'emails')
    .replace('.value', '')
    .replace('.givenName', '.given')
    .replace('.familyName', '.family')
    .replace('.formattedValue', '')
}

function decide(changeId: string, decision: ReviewDecision['decision'], editedValue?: string) {
  decisions.value[changeId] = {
    changeId,
    decision,
    editedValue,
    decidedAt: new Date().toISOString(),
  }
  recomputeStats()
  saveToLocalStorage()
  scheduleAutoSave()

  if (editingId.value === changeId) {
    editingId.value = null
  }
}

function decideAllForContact(resourceName: string, decision: 'approved' | 'rejected') {
  const changes = allChanges.value.filter(c => c.resourceName === resourceName)
  for (const c of changes) {
    decisions.value[c.id] = {
      changeId: c.id,
      decision,
      decidedAt: new Date().toISOString(),
    }
  }
  recomputeStats()
  saveToLocalStorage()
  scheduleAutoSave()
}

function bulkDecide(decision: 'approved' | 'rejected') {
  for (const c of filteredChanges.value) {
    if (!decisions.value[c.id]) {
      decisions.value[c.id] = {
        changeId: c.id,
        decision,
        decidedAt: new Date().toISOString(),
      }
    }
  }
  recomputeStats()
  saveToLocalStorage()
  scheduleAutoSave()
}

function startEdit(change: ReviewChange) {
  editingId.value = change.id
  editValue.value = change.new
  nextTick(() => {
    const el = document.getElementById(`edit-${change.id}`)
    el?.focus()
  })
}

function submitEdit(changeId: string) {
  decide(changeId, 'edited', editValue.value)
}

function recomputeStats() {
  const s = { total: 0, approved: 0, rejected: 0, edited: 0, skipped: 0 }
  for (const d of Object.values(decisions.value)) {
    s[d.decision]++
    s.total++
  }
  sessionStats.value = s
}

function saveToLocalStorage() {
  localStorage.setItem(`review_${sessionId.value}`, JSON.stringify({
    decisions: decisions.value,
    savedAt: new Date().toISOString(),
  }))
}

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => saveToGCS(), 30_000)
}

async function saveToGCS() {
  if (isSaving.value || !Object.keys(decisions.value).length) return
  isSaving.value = true
  try {
    // Build change metadata for feedback
    const changeMeta: Record<string, { ruleCategory: string; field: string; old: string; suggested: string; confidence: number }> = {}
    for (const c of allChanges.value) {
      if (decisions.value[c.id]) {
        changeMeta[c.id] = {
          ruleCategory: c.ruleCategory,
          field: c.field,
          old: c.old,
          suggested: c.new,
          confidence: c.confidence,
        }
      }
    }

    const allDecisions = Object.values(decisions.value)
    await $fetch('/api/review/decide', {
      method: 'POST',
      body: {
        sessionId: sessionId.value,
        reviewFilePath: data.value?.reviewFilePath,
        decisions: allDecisions,
        changeMeta,
      },
    })
    lastSaved.value = new Date().toLocaleTimeString()
  } catch (err) {
    console.error('Failed to save to GCS:', err)
  } finally {
    isSaving.value = false
  }
}

async function exportDecisions() {
  await saveToGCS()
  try {
    const result = await $fetch('/api/review/export', {
      method: 'POST',
      body: { sessionId: sessionId.value },
    })
    alert(`Exported ${result.exported} approved/edited decisions for pipeline processing.`)
  } catch (err) {
    console.error('Export failed:', err)
  }
}

function getDecision(changeId: string): ReviewDecision | undefined {
  return decisions.value[changeId]
}

function decisionColor(decision?: string) {
  switch (decision) {
    case 'approved': return 'success'
    case 'rejected': return 'error'
    case 'edited': return 'warning'
    case 'skipped': return 'neutral'
    default: return undefined
  }
}

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  if (editingId.value) return // Don't intercept when editing
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

  const group = contactGroups.value[focusedIndex.value]
  if (!group) return

  const undecidedChanges = group.changes.filter(c => !decisions.value[c.id])
  const firstUndecided = undecidedChanges[0]

  switch (e.key) {
    case 'j':
      e.preventDefault()
      focusedIndex.value = Math.min(focusedIndex.value + 1, contactGroups.value.length - 1)
      break
    case 'k':
      e.preventDefault()
      focusedIndex.value = Math.max(focusedIndex.value - 1, 0)
      break
    case 'a':
      e.preventDefault()
      if (firstUndecided) decide(firstUndecided.id, 'approved')
      break
    case 'r':
      e.preventDefault()
      if (firstUndecided) decide(firstUndecided.id, 'rejected')
      break
    case 's':
      e.preventDefault()
      if (firstUndecided) decide(firstUndecided.id, 'skipped')
      break
    case 'e':
      e.preventDefault()
      if (firstUndecided) startEdit(allChanges.value.find(c => c.id === firstUndecided.id)!)
      break
    case 'A':
      e.preventDefault()
      decideAllForContact(group.resourceName, 'approved')
      break
    case 'R':
      e.preventDefault()
      decideAllForContact(group.resourceName, 'rejected')
      break
    case 'S':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        saveToGCS()
      }
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
})

const undecidedCount = computed(() => {
  return allChanges.value.filter(c => !decisions.value[c.id]).length
})

const progressPercent = computed(() => {
  if (!allChanges.value.length) return 0
  return Math.round((sessionStats.value.total / allChanges.value.length) * 100)
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-neutral-100">
          Review MEDIUM Changes
        </h1>
        <p class="text-xs text-neutral-500 mt-1">
          {{ allChanges.length }} changes from {{ contactGroups.length }} contacts
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="lastSaved" class="text-xs text-neutral-600">
          Saved {{ lastSaved }}
        </span>
        <UButton
          label="Save"
          icon="i-lucide-save"
          size="sm"
          variant="soft"
          :loading="isSaving"
          @click="saveToGCS()"
        />
        <UButton
          label="Export for Pipeline"
          icon="i-lucide-upload"
          size="sm"
          color="primary"
          :disabled="!sessionStats.approved && !sessionStats.edited"
          @click="exportDecisions()"
        />
      </div>
    </div>

    <!-- Progress -->
    <div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <div class="flex items-center justify-between text-xs mb-2">
        <span class="text-neutral-400">
          {{ sessionStats.total }}/{{ allChanges.length }} reviewed ({{ progressPercent }}%)
        </span>
        <div class="flex gap-3">
          <span class="text-green-400">{{ sessionStats.approved }} approved</span>
          <span class="text-red-400">{{ sessionStats.rejected }} rejected</span>
          <span class="text-amber-400">{{ sessionStats.edited }} edited</span>
          <span class="text-neutral-500">{{ sessionStats.skipped }} skipped</span>
        </div>
      </div>
      <div class="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-primary-500 transition-all duration-300"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="status === 'success' && !allChanges.length" class="text-center py-16">
      <UIcon name="i-lucide-check-circle" class="size-12 text-green-500 mx-auto mb-3" />
      <p class="text-neutral-400">No pending review changes</p>
      <p class="text-xs text-neutral-600 mt-1">Changes appear here after the pipeline runs with MEDIUM confidence items</p>
    </div>

    <!-- Loading -->
    <div v-else-if="status === 'pending'" class="text-center py-16">
      <UIcon name="i-lucide-loader" class="size-8 text-neutral-500 mx-auto mb-3 animate-spin" />
      <p class="text-neutral-500">Loading review data...</p>
    </div>

    <template v-else>
      <!-- Filters + Controls -->
      <div class="flex flex-wrap items-center gap-3">
        <USelect
          v-model="fieldFilter"
          :items="fieldOptions"
          value-key="value"
          class="w-48"
          placeholder="Field"
        />
        <USelect
          v-model="categoryFilter"
          :items="categoryOptions"
          value-key="value"
          class="w-48"
          placeholder="Rule"
        />
        <label class="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
          <input v-model="hideDecided" type="checkbox" class="rounded border-neutral-700 bg-neutral-800" />
          Hide decided
        </label>

        <div class="ml-auto flex items-center gap-2">
          <UButtonGroup size="xs">
            <UButton
              label="Contact"
              :variant="viewMode === 'contact' ? 'solid' : 'ghost'"
              @click="viewMode = 'contact'"
            />
            <UButton
              label="Rule"
              :variant="viewMode === 'rule' ? 'solid' : 'ghost'"
              @click="viewMode = 'rule'"
            />
          </UButtonGroup>

          <UButton
            v-if="filteredChanges.length"
            size="xs"
            variant="soft"
            color="success"
            :label="`Approve all (${filteredChanges.filter(c => !decisions[c.id]).length})`"
            @click="bulkDecide('approved')"
          />
          <UButton
            v-if="filteredChanges.length"
            size="xs"
            variant="soft"
            color="error"
            :label="`Reject all (${filteredChanges.filter(c => !decisions[c.id]).length})`"
            @click="bulkDecide('rejected')"
          />
        </div>
      </div>

      <!-- Contact View -->
      <div v-if="viewMode === 'contact'" class="space-y-3">
        <div
          v-for="(group, idx) in contactGroups"
          :key="group.resourceName"
          class="rounded-xl border transition-colors"
          :class="idx === focusedIndex
            ? 'border-primary-500/50 bg-neutral-900/80'
            : 'border-neutral-800 bg-neutral-900/30'"
          @click="focusedIndex = idx"
        >
          <!-- Contact header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800/50">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-neutral-200">{{ group.displayName }}</span>
              <span class="text-[10px] text-neutral-600 font-mono">{{ group.resourceName.replace('people/', '') }}</span>
              <UBadge :label="`${group.changes.length} changes`" variant="subtle" size="xs" color="neutral" />
            </div>
            <div class="flex gap-1">
              <UButton size="xs" variant="ghost" color="success" label="All" icon="i-lucide-check" @click.stop="decideAllForContact(group.resourceName, 'approved')" />
              <UButton size="xs" variant="ghost" color="error" label="All" icon="i-lucide-x" @click.stop="decideAllForContact(group.resourceName, 'rejected')" />
            </div>
          </div>

          <!-- Changes -->
          <div class="divide-y divide-neutral-800/30">
            <div
              v-for="change in group.changes"
              :key="change.id"
              class="px-4 py-2.5 flex items-center gap-3"
              :class="{ 'opacity-40': getDecision(change.id) }"
            >
              <!-- Field -->
              <span class="text-xs font-mono text-neutral-500 w-32 shrink-0 truncate">
                {{ formatField(change.field) }}
              </span>

              <!-- Diff -->
              <div class="flex-1 min-w-0">
                <DiffDisplay :old-value="change.old" :new-value="change.new" />
                <!-- Edit input -->
                <div v-if="editingId === change.id" class="mt-1.5 flex gap-2">
                  <input
                    :id="`edit-${change.id}`"
                    v-model="editValue"
                    class="flex-1 px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded text-neutral-200 focus:outline-none focus:border-primary-500"
                    @keydown.enter="submitEdit(change.id)"
                    @keydown.escape="editingId = null"
                  />
                  <UButton size="xs" color="primary" label="Save" @click="submitEdit(change.id)" />
                  <UButton size="xs" variant="ghost" label="Cancel" @click="editingId = null" />
                </div>
              </div>

              <!-- Confidence -->
              <span class="text-[10px] text-neutral-600 tabular-nums w-10 text-right shrink-0">
                {{ (change.confidence * 100).toFixed(0) }}%
              </span>

              <!-- Rule category -->
              <span class="text-[10px] text-neutral-600 w-24 shrink-0 truncate" :title="change.reason">
                {{ change.ruleCategory }}
              </span>

              <!-- Decision badge or action buttons -->
              <div class="flex items-center gap-1 shrink-0 w-36 justify-end">
                <template v-if="getDecision(change.id)">
                  <UBadge
                    :label="getDecision(change.id)!.decision"
                    :color="decisionColor(getDecision(change.id)!.decision)"
                    variant="subtle"
                    size="xs"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-undo-2"
                    color="neutral"
                    @click.stop="delete decisions[change.id]; recomputeStats(); saveToLocalStorage()"
                  />
                </template>
                <template v-else>
                  <UButton size="xs" variant="ghost" color="success" icon="i-lucide-check" title="Approve (a)" @click.stop="decide(change.id, 'approved')" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" title="Reject (r)" @click.stop="decide(change.id, 'rejected')" />
                  <UButton size="xs" variant="ghost" color="warning" icon="i-lucide-pencil" title="Edit (e)" @click.stop="startEdit(change)" />
                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-skip-forward" title="Skip (s)" @click.stop="decide(change.id, 'skipped')" />
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Rule View -->
      <div v-if="viewMode === 'rule'" class="space-y-3">
        <div
          v-for="[category, changes] in ruleGroups"
          :key="category"
          class="rounded-xl border border-neutral-800 bg-neutral-900/30"
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800/50">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-neutral-200">{{ category }}</span>
              <UBadge :label="`${changes.length} changes`" variant="subtle" size="xs" color="neutral" />
              <span class="text-[10px] text-neutral-600">
                {{ changes.filter(c => decisions[c.id]).length }} decided
              </span>
            </div>
            <div class="flex gap-1">
              <UButton size="xs" variant="soft" color="success" label="Approve all" @click="changes.forEach(c => { if (!decisions[c.id]) decide(c.id, 'approved') })" />
              <UButton size="xs" variant="soft" color="error" label="Reject all" @click="changes.forEach(c => { if (!decisions[c.id]) decide(c.id, 'rejected') })" />
            </div>
          </div>

          <div class="divide-y divide-neutral-800/30 max-h-80 overflow-y-auto">
            <div
              v-for="change in changes"
              :key="change.id"
              class="px-4 py-2 flex items-center gap-3"
              :class="{ 'opacity-40': getDecision(change.id) }"
            >
              <span class="text-xs text-neutral-400 w-32 shrink-0 truncate">{{ change.displayName }}</span>
              <span class="text-xs font-mono text-neutral-500 w-28 shrink-0 truncate">{{ formatField(change.field) }}</span>
              <div class="flex-1 min-w-0">
                <DiffDisplay :old-value="change.old" :new-value="change.new" />
              </div>
              <span class="text-[10px] text-neutral-600 tabular-nums w-10 text-right shrink-0">{{ (change.confidence * 100).toFixed(0) }}%</span>
              <div class="flex items-center gap-1 shrink-0">
                <template v-if="getDecision(change.id)">
                  <UBadge :label="getDecision(change.id)!.decision" :color="decisionColor(getDecision(change.id)!.decision)" variant="subtle" size="xs" />
                  <UButton size="xs" variant="ghost" icon="i-lucide-undo-2" color="neutral" @click.stop="delete decisions[change.id]; recomputeStats(); saveToLocalStorage()" />
                </template>
                <template v-else>
                  <UButton size="xs" variant="ghost" color="success" icon="i-lucide-check" @click.stop="decide(change.id, 'approved')" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" @click.stop="decide(change.id, 'rejected')" />
                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-skip-forward" @click.stop="decide(change.id, 'skipped')" />
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Keyboard help -->
    <div class="text-[10px] text-neutral-700 flex gap-4 justify-center pt-2">
      <span><kbd class="px-1 py-0.5 bg-neutral-800 rounded">a</kbd> approve</span>
      <span><kbd class="px-1 py-0.5 bg-neutral-800 rounded">r</kbd> reject</span>
      <span><kbd class="px-1 py-0.5 bg-neutral-800 rounded">e</kbd> edit</span>
      <span><kbd class="px-1 py-0.5 bg-neutral-800 rounded">s</kbd> skip</span>
      <span><kbd class="px-1 py-0.5 bg-neutral-800 rounded">j</kbd>/<kbd class="px-1 py-0.5 bg-neutral-800 rounded">k</kbd> nav</span>
      <span><kbd class="px-1 py-0.5 bg-neutral-800 rounded">Shift+A</kbd> approve all</span>
      <span><kbd class="px-1 py-0.5 bg-neutral-800 rounded">Ctrl+S</kbd> save</span>
    </div>
  </div>
</template>
