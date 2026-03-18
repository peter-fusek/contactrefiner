<script setup lang="ts">
definePageMeta({ layout: false })

useHead({
  title: 'Contact Refiner — AI-Powered Google Contacts Cleanup',
  meta: [
    { name: 'description', content: 'Fix diacritics, formatting, and duplicates in Google Contacts. 26 rule categories, 22,000+ changes applied, daily automated pipeline, AI review, and a dashboard to approve every change.' },
    { property: 'og:title', content: 'Contact Refiner — AI-Powered Google Contacts Cleanup' },
    { property: 'og:description', content: 'Automatically fix diacritics, formatting, and duplicates in your Google Contacts. AI-powered analysis with human review.' },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: 'https://contactrefiner.com' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Contact Refiner — AI-Powered Google Contacts Cleanup' },
    { name: 'twitter:description', content: 'Automatically fix diacritics, formatting, and duplicates in your Google Contacts.' },
  ],
  link: [
    { rel: 'canonical', href: 'https://contactrefiner.com' },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        'name': 'Contact Refiner',
        'applicationCategory': 'BusinessApplication',
        'operatingSystem': 'Web',
        'url': 'https://contactrefiner.com',
        'description': 'Automatically fix diacritics, formatting, and duplicates in your Google Contacts. 22,000+ changes applied. AI-powered analysis with human review and daily email digest.',
        'offers': {
          '@type': 'Offer',
          'price': '0',
          'priceCurrency': 'USD',
        },
        'author': {
          '@type': 'Organization',
          'name': 'Instarea',
          'url': 'https://instarea.sk',
        },
      }),
    },
  ],
})

const features = [
  {
    icon: 'i-lucide-languages',
    title: 'Diacritics Restoration',
    description: 'Restores missing accents on Slovak and Czech names. Context-aware: only applies when the surname confirms SK/CZ origin.',
    color: 'text-primary-400',
  },
  {
    icon: 'i-lucide-scan-text',
    title: 'Smart Formatting',
    description: 'Normalizes phone numbers, titles, company names, and name casing across all contacts.',
    color: 'text-cyan-400',
  },
  {
    icon: 'i-lucide-trash-2',
    title: 'Contact Cleanup',
    description: 'Flags low-value one-off contacts — no full name, no email, no phone. Review and delete the clutter.',
    color: 'text-orange-400',
  },
  {
    icon: 'i-lucide-brain',
    title: 'AI Review',
    description: 'Claude AI catches edge cases that rules miss. You approve every change before it applies.',
    color: 'text-amber-400',
  },
  {
    icon: 'i-lucide-mail',
    title: 'Interaction Tracking',
    description: 'Scans Gmail and Calendar to tag contacts with activity year labels (Y2024, Y2025).',
    color: 'text-blue-400',
  },
  {
    icon: 'i-lucide-graduation-cap',
    title: 'Learning System',
    description: 'Remembers your review decisions. Rejected changes never come back. Confidence adjusts based on your feedback.',
    color: 'text-violet-400',
  },
  {
    icon: 'i-lucide-bell-ring',
    title: 'Daily Email Digest',
    description: 'Get a morning summary of what the pipeline fixed overnight. Changes applied, errors, queue status — all in one email.',
    color: 'text-rose-400',
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'Privacy First',
    description: 'Runs on your own infrastructure. Security audited. Your contacts never leave your Google account.',
    color: 'text-green-400',
  },
]

const steps = [
  { num: '01', title: 'Authenticate', description: 'Connect your Google account with OAuth2. Read-only access to Contacts, Gmail, and Calendar.' },
  { num: '02', title: 'Analyze', description: 'The pipeline scans all contacts with 26 rule categories — diacritics, formatting, cleanup — then AI reviews ambiguous cases.' },
  { num: '03', title: 'Review & Fix', description: 'Review changes on the dashboard. Approve, reject, or edit. Only approved changes are applied.' },
]
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-200">
    <!-- Nav -->
    <nav class="fixed top-0 inset-x-0 z-50 border-b border-neutral-800/50 bg-neutral-950/80 backdrop-blur-lg">
      <div class="max-w-5xl mx-auto flex items-center justify-between px-6 h-14">
        <div class="flex items-center gap-2">
          <div class="size-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
            <UIcon name="i-lucide-radar" class="size-5 text-primary-400" />
          </div>
          <span class="text-sm font-semibold text-primary-400">Contact Refiner</span>
        </div>
        <div class="flex items-center gap-4">
          <a
            href="https://github.com/instarea-sk/google-contacts-refiner"
            target="_blank"
            rel="noopener"
            class="text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <UIcon name="i-lucide-github" class="size-5" />
          </a>
          <NuxtLink
            to="/dashboard"
            class="text-xs px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors"
          >
            Dashboard
          </NuxtLink>
        </div>
      </div>
    </nav>

    <!-- Hero -->
    <section class="pt-32 pb-20 px-6">
      <div class="max-w-3xl mx-auto text-center space-y-6">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-800 bg-neutral-900/50 text-xs text-neutral-400">
          <span class="size-1.5 rounded-full bg-primary-400 animate-pulse-glow" />
          Open source · Security audited · 22,000+ changes applied
        </div>

        <h1 class="text-4xl md:text-5xl font-bold tracking-tight text-neutral-100 leading-tight">
          Your contacts are a mess.<br>
          <span class="text-primary-400">Let AI fix them.</span>
        </h1>

        <p class="text-lg text-neutral-400 max-w-xl mx-auto leading-relaxed">
          Contact Refiner automatically fixes diacritics, formatting, and duplicates
          in your Google Contacts. 26 rule categories + Claude AI review + daily email digest.
          You approve every change.
        </p>

        <div class="flex items-center justify-center gap-4 pt-2">
          <a
            href="https://github.com/instarea-sk/google-contacts-refiner"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            <UIcon name="i-lucide-github" class="size-4" />
            View on GitHub
          </a>
          <NuxtLink
            to="/dashboard"
            class="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-neutral-700 hover:border-neutral-600 text-neutral-300 text-sm font-medium transition-colors"
          >
            <UIcon name="i-lucide-layout-dashboard" class="size-4" />
            Try Dashboard
          </NuxtLink>
        </div>
      </div>

      <!-- Terminal preview -->
      <div class="max-w-2xl mx-auto mt-16">
        <div class="rounded-xl border border-neutral-800 bg-neutral-900/80 overflow-hidden">
          <div class="flex items-center gap-1.5 px-4 py-2.5 border-b border-neutral-800/50">
            <span class="size-2.5 rounded-full bg-red-500/60" />
            <span class="size-2.5 rounded-full bg-amber-500/60" />
            <span class="size-2.5 rounded-full bg-green-500/60" />
            <span class="ml-3 text-[11px] text-neutral-600">terminal</span>
          </div>
          <div class="p-5 text-sm leading-relaxed font-mono">
            <div class="text-neutral-500">$ python main.py analyze</div>
            <div class="mt-2">
              <span class="text-primary-400">Total contacts: 5,551</span>
            </div>
            <div>
              <span class="text-amber-400">  4,331 changes detected (26 rule categories)</span>
            </div>
            <div>
              <span class="text-cyan-400">  2,140 HIGH confidence → auto-fixed</span>
            </div>
            <div>
              <span class="text-neutral-400">  394 MEDIUM → queued for review</span>
            </div>
            <div class="mt-2 text-neutral-500">$ python main.py fix --auto</div>
            <div class="text-primary-400">  Applied 2,140 changes in 28s</div>
            <div class="mt-2 text-neutral-600">
              # Review remaining changes at<br>
              # https://contactrefiner.com/review
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="py-12 px-6 border-t border-neutral-800/50">
      <div class="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        <div>
          <div class="text-2xl md:text-3xl font-bold text-primary-400 tabular-nums">22,189</div>
          <div class="text-xs text-neutral-500 mt-1">Changes applied</div>
        </div>
        <div>
          <div class="text-2xl md:text-3xl font-bold text-neutral-100 tabular-nums">6,400+</div>
          <div class="text-xs text-neutral-500 mt-1">Review decisions</div>
        </div>
        <div>
          <div class="text-2xl md:text-3xl font-bold text-neutral-100 tabular-nums">5,551</div>
          <div class="text-xs text-neutral-500 mt-1">Contacts managed</div>
        </div>
        <div>
          <div class="text-2xl md:text-3xl font-bold text-neutral-100 tabular-nums">26</div>
          <div class="text-xs text-neutral-500 mt-1">Rule categories</div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section id="features" class="py-20 px-6 border-t border-neutral-800/50">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-2xl md:text-3xl font-bold text-neutral-100">
            What it fixes
          </h2>
          <p class="mt-3 text-neutral-400">
            Rule-based analysis catches the obvious. AI handles the rest.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 space-y-3 hover:border-neutral-700 transition-colors"
          >
            <UIcon :name="feature.icon" :class="['size-6', feature.color]" />
            <h3 class="text-sm font-semibold text-neutral-100">{{ feature.title }}</h3>
            <p class="text-sm text-neutral-400 leading-relaxed">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section class="py-20 px-6 border-t border-neutral-800/50">
      <div class="max-w-3xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-2xl md:text-3xl font-bold text-neutral-100">
            How it works
          </h2>
          <p class="mt-3 text-neutral-400">
            Three steps. You stay in control.
          </p>
        </div>

        <div class="space-y-8">
          <div
            v-for="step in steps"
            :key="step.num"
            class="flex items-start gap-5"
          >
            <div class="shrink-0 size-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-sm font-bold text-primary-400">
              {{ step.num }}
            </div>
            <div>
              <h3 class="text-sm font-semibold text-neutral-100">{{ step.title }}</h3>
              <p class="mt-1 text-sm text-neutral-400 leading-relaxed">{{ step.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-20 px-6 border-t border-neutral-800/50">
      <div class="max-w-2xl mx-auto text-center space-y-6">
        <h2 class="text-2xl md:text-3xl font-bold text-neutral-100">
          Clean up your contacts today
        </h2>
        <p class="text-neutral-400">
          Open source. Self-hosted. Your data stays yours.
        </p>
        <a
          href="https://github.com/instarea-sk/google-contacts-refiner"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
        >
          <UIcon name="i-lucide-github" class="size-4" />
          Get started on GitHub
        </a>
      </div>
    </section>

    <!-- Footer -->
    <footer class="py-8 px-6 border-t border-neutral-800/50">
      <div class="max-w-5xl mx-auto flex items-center justify-between text-xs text-neutral-600">
        <span>Contact Refiner by <a href="https://instarea.sk" target="_blank" rel="noopener" class="text-neutral-500 hover:text-neutral-400 transition-colors">Instarea</a></span>
        <div class="flex items-center gap-4">
          <NuxtLink to="/privacy" class="text-neutral-500 hover:text-neutral-400 transition-colors">Privacy</NuxtLink>
          <a
            href="https://github.com/instarea-sk/google-contacts-refiner"
            target="_blank"
            rel="noopener"
            class="text-neutral-500 hover:text-neutral-400 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>
