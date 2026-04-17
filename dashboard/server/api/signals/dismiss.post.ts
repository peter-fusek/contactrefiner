import type { LeadDismissalReason } from '../../utils/types'
import { getLeadSignalsStateFresh, saveLeadSignalsState } from '../../utils/gcs'
import { isDemoMode } from '../../utils/demo'

const RESOURCE_RE = /^people\/c?\d+$/
const VALID_REASONS: LeadDismissalReason[] = [
  'not_a_fit', 'already_talked', 'stale_signal', 'wrong_geo', 'other',
]

export default defineEventHandler(async (event) => {
  if (await isDemoMode(event)) {
    throw createError({ statusCode: 403, statusMessage: 'Demo mode: writes disabled' })
  }

  const body = await readBody<{ resourceName?: string; reason?: LeadDismissalReason; note?: string }>(event)
  const resourceName = body?.resourceName?.trim() || ''
  if (!RESOURCE_RE.test(resourceName)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid resourceName' })
  }
  const reason = body?.reason
  if (!reason || !VALID_REASONS.includes(reason)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid reason' })
  }

  const now = new Date().toISOString()
  const state = await getLeadSignalsStateFresh()
  state.contacts[resourceName] = {
    stage: 'dismissed',
    stageAt: now,
    dismissal: {
      reason,
      note: (body?.note || '').slice(0, 500),
      dismissedAt: now,
    },
  }
  await saveLeadSignalsState(state)

  return { ok: true, resourceName, stage: 'dismissed' }
})
