import { writeFileSync, existsSync } from 'node:fs'

const KEY_PATH = '/tmp/gcs-sa-key.json'

export default defineNitroPlugin(() => {
  // If GOOGLE_APPLICATION_CREDENTIALS is already set and file exists, skip
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    console.log('[GCS] Using existing GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS)
    return
  }

  // Read raw env var directly — Nuxt's useRuntimeConfig() auto-parses JSON
  // which can corrupt private_key newlines
  const raw = process.env.NUXT_GCS_SERVICE_ACCOUNT || process.env.GCS_SERVICE_ACCOUNT
  if (!raw) {
    console.warn('[GCS] No GCS_SERVICE_ACCOUNT env var set')
    return
  }

  try {
    // Validate it's valid JSON before writing
    const parsed = JSON.parse(raw)
    writeFileSync(KEY_PATH, raw, { mode: 0o600 })
    process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY_PATH
    console.log('[GCS] Wrote SA key to', KEY_PATH, '- project:', parsed.project_id)
  } catch (err) {
    console.error('[GCS] Failed to write SA key file:', (err as Error).message)
  }
})
