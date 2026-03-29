import type { CRMStage } from '../../utils/types'
import { getCRMState, saveCRMState } from '../../utils/gcs'
import { isDemoMode } from '../../utils/demo'

const VALID_STAGES: CRMStage[] = ['inbox', 'reached_out', 'in_conversation', 'opportunity', 'converted', 'dormant']

export default defineEventHandler(async (event) => {
  if (await isDemoMode(event)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
  }

  const body = await readBody(event)
  const { resourceName, stage, notes, tags } = body ?? {}

  if (!resourceName || typeof resourceName !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'resourceName required' })
  }

  if (stage !== undefined && !VALID_STAGES.includes(stage)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  }

  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 10000)) {
    throw createError({ statusCode: 400, statusMessage: 'Notes must be string, max 10000 chars' })
  }

  if (tags !== undefined && (!Array.isArray(tags) || tags.some((t: unknown) => typeof t !== 'string'))) {
    throw createError({ statusCode: 400, statusMessage: 'Tags must be string array' })
  }

  const state = await getCRMState()
  const existing = state.contacts[resourceName] ?? {
    stage: 'inbox' as CRMStage,
    stageChangedAt: new Date().toISOString(),
    notes: '',
    tags: [],
  }

  if (stage !== undefined && stage !== existing.stage) {
    existing.stage = stage
    existing.stageChangedAt = new Date().toISOString()
  }
  if (notes !== undefined) existing.notes = notes
  if (tags !== undefined) existing.tags = tags

  state.contacts[resourceName] = existing
  await saveCRMState(state)

  return { ok: true }
})
