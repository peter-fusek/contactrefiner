import { writeFileSync, existsSync } from 'node:fs'

const KEY_PATH = '/tmp/gcs-sa-key.json'

export default defineNitroPlugin(() => {
  // If GOOGLE_APPLICATION_CREDENTIALS is already set and file exists, skip
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    console.log('[GCS] Using existing GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS)
    return
  }

  const config = useRuntimeConfig()
  const saKey = config.gcsServiceAccount

  if (!saKey) {
    console.warn('[GCS] No GCS_SERVICE_ACCOUNT env var set')
    return
  }

  try {
    // Nuxt may auto-parse JSON env vars into objects
    const json = typeof saKey === 'object' ? JSON.stringify(saKey) : saKey as string
    const parsed = typeof saKey === 'object' ? saKey : JSON.parse(saKey as string)
    writeFileSync(KEY_PATH, json, { mode: 0o600 })
    process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY_PATH
    console.log('[GCS] Wrote SA key to', KEY_PATH, '- project:', (parsed as Record<string, string>).project_id)
  } catch (err) {
    console.error('[GCS] Failed to write SA key file:', (err as Error).message)
  }
})
