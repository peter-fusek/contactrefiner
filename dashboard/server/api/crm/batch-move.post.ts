import type { CRMStage } from '../../utils/types'
import { getCRMStateFresh, saveCRMState } from '../../utils/gcs'
import { isDemoMode } from '../../utils/demo'

const VALID_STAGES: CRMStage[] = ['inbox', 'reached_out', 'in_conversation', 'opportunity', 'converted', 'dormant', 'unknown', 'ready_to_delete']

export default defineEventHandler(async (event) => {
  if (await isDemoMode(event)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
  }

  const body = await readBody(event)
  const { resourceNames, stage } = body ?? {}

  if (!Array.isArray(resourceNames) || !resourceNames.length) {
    throw createError({ statusCode: 400, statusMessage: 'resourceNames array required' })
  }

  if (resourceNames.length > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Too many resourceNames (max 500)' })
  }

  if (!VALID_STAGES.includes(stage)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  }

  const state = await getCRMStateFresh()
  const now = new Date().toISOString()

  let moved = 0
  for (const rn of resourceNames) {
    if (typeof rn !== 'string' || !/^people\/c?\d+$/.test(rn)) continue
    const existing = state.contacts[rn] ?? { stage: 'inbox' as CRMStage, stageChangedAt: now, notes: '', tags: [] }
    existing.stage = stage
    existing.stageChangedAt = now
    state.contacts[rn] = existing
    moved++
  }

  await saveCRMState(state)
  return { ok: true, moved }
})
