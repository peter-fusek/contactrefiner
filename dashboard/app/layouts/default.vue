<script setup lang="ts">
const route = useRoute()

const navItems = [
  { label: 'Status', icon: 'i-lucide-activity', to: '/' },
  { label: 'Changelog', icon: 'i-lucide-file-diff', to: '/changelog' },
  { label: 'Analytics', icon: 'i-lucide-bar-chart-3', to: '/analytics' },
  { label: 'Config', icon: 'i-lucide-settings', to: '/config' },
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <div class="flex min-h-screen bg-neutral-950">
    <!-- Sidebar -->
    <aside class="w-56 shrink-0 border-r border-neutral-800 bg-neutral-950 flex flex-col">
      <!-- Header -->
      <div class="flex items-center gap-2 p-4 border-b border-neutral-800/50">
        <div class="size-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
          <UIcon name="i-lucide-radar" class="size-5 text-primary-400" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-primary-400 truncate">
            Mission Control
          </p>
          <p class="text-[10px] text-neutral-500 truncate">
            Contacts Refiner
          </p>
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 p-3 space-y-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="isActive(item.to)
            ? 'bg-primary-500/15 text-primary-400'
            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'"
        >
          <UIcon :name="item.icon" class="size-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Footer -->
      <div class="p-4 border-t border-neutral-800/50 text-xs text-neutral-600">
        v{{ useRuntimeConfig().public.appVersion }}
      </div>
    </aside>

    <!-- Main -->
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-7xl mx-auto p-6">
        <slot />
      </div>
    </main>
  </div>
</template>
