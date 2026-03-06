export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
  ],

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },

  runtimeConfig: {
    gcsBucket: process.env.GCS_BUCKET || 'contacts-refiner-data',
    gcsServiceAccount: process.env.GCS_SERVICE_ACCOUNT || '',
    public: {
      appVersion: process.env.npm_package_version || '0.1.0',
    },
  },

  ui: {
    colorMode: false,
    theme: {
      colors: ['primary', 'success', 'warning', 'error', 'info'],
    },
  },

  css: ['~/assets/css/main.css'],

  devtools: {
    enabled: process.env.NODE_ENV !== 'production',
  },

  compatibilityDate: '2025-01-15',
})
