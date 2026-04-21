import { getHarvestRuns } from '../utils/gcs'
import { isDemoMode } from '../utils/demo'

// Read by the CRM / operator dashboards to answer "when did the harvest last
// run, and is the data fresh enough to trust?" Without this surface the
// Option-D session-start pattern is invisible — a 3-week gap looks identical
// to "just ran, nothing new" from the outside.

export interface HarvestStatusResponse {
  lastRun: {
    timestamp: string
    mode: string
    chats: number
    recordsNew: number
    uploadStatus: string
    errors: string[]
  } | null
  staleness: 'fresh' | 'hours' | 'days' | 'stale' | 'missing'
  hoursSinceLastRun: number | null
  last7dRuns: number
  recentErrors: number
}

function classifyStaleness(hours: number | null): HarvestStatusResponse['staleness'] {
  if (hours === null) return 'missing'
  if (hours < 12) return 'fresh'
  if (hours < 48) return 'hours'
  if (hours < 14 * 24) return 'days'
  return 'stale'
}

export default defineEventHandler(async (event): Promise<HarvestStatusResponse> => {
  // Non-PII aggregates only — fine to expose even in demo mode.
  await isDemoMode(event)

  const { runs } = await getHarvestRuns()
  if (!runs.length) {
    return {
      lastRun: null,
      staleness: 'missing',
      hoursSinceLastRun: null,
      last7dRuns: 0,
      recentErrors: 0,
    }
  }

  // Runs are appended in order; the last entry is the most recent.
  const last = runs[runs.length - 1]!
  const lastTs = new Date(last.timestamp).getTime()
  const now = Date.now()
  const hoursSince = (now - lastTs) / (1000 * 60 * 60)

  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const last7d = runs.filter(r => new Date(r.timestamp).getTime() >= sevenDaysAgo)
  const recentErrors = last7d.filter(r =>
    r.upload_status === 'auth_error' || r.upload_status === 'transient_error'
    || (r.errors && r.errors.length > 0),
  ).length

  return {
    lastRun: {
      timestamp: last.timestamp,
      mode: last.mode,
      chats: last.chats,
      recordsNew: last.records_new,
      uploadStatus: last.upload_status ?? 'unknown',
      errors: last.errors ?? [],
    },
    staleness: classifyStaleness(hoursSince),
    hoursSinceLastRun: Math.round(hoursSince * 10) / 10,
    last7dRuns: last7d.length,
    recentErrors,
  }
})
