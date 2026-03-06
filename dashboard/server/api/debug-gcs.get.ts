// Temporary debug endpoint — remove after fixing GCS auth
export default defineEventHandler(async () => {
  const raw = process.env.NUXT_GCS_SERVICE_ACCOUNT || process.env.GCS_SERVICE_ACCOUNT || ''

  let parsed: Record<string, unknown> | null = null
  let parseError: string | null = null
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>
  } catch (e) {
    parseError = (e as Error).message
  }

  const pk = parsed?.private_key as string | undefined

  return {
    envVarLength: raw.length,
    envVarType: typeof raw,
    envVarFirst80: typeof raw === 'string' ? raw.slice(0, 80) : '[object]',
    parseError,
    projectId: parsed?.project_id,
    clientEmail: parsed?.client_email,
    privateKeyLength: pk?.length,
    privateKeyStart: pk?.slice(0, 40),
    privateKeyEnd: pk?.slice(-40),
    hasRealNewlines: pk?.includes('\n'),
    hasLiteralBackslashN: pk?.includes('\\n'),
    googleAppCreds: process.env.GOOGLE_APPLICATION_CREDENTIALS || null,
    nodeVersion: process.version,
  }
})
