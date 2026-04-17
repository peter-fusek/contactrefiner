import {
  getLeadSignalsStateFresh,
  saveLeadSignalsState,
  getCRMStateFresh,
  saveCRMState,
} from '../../utils/gcs'
import { isDemoMode } from '../../utils/demo'

const RESOURCE_RE = /^people\/c?\d+$/

export default defineEventHandler(async (event) => {
  if (await isDemoMode(event)) {
    throw createError({ statusCode: 403, statusMessage: 'Demo mode: writes disabled' })
  }

  const body = await readBody<{ resourceName?: string; name?: string }>(event)
  const resourceName = body?.resourceName?.trim() || ''
  if (!RESOURCE_RE.test(resourceName)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid resourceName' })
  }

  const now = new Date().toISOString()
  const [leadState, crmState] = await Promise.all([
    getLeadSignalsStateFresh(),
    getCRMStateFresh(),
  ])

  leadState.contacts[resourceName] = {
    stage: 'accepted',
    stageAt: now,
  }

  if (!crmState.contacts[resourceName]) {
    crmState.contacts[resourceName] = {
      stage: 'inbox',
      stageChangedAt: now,
      notes: '',
      tags: [],
      name: body?.name?.slice(0, 120) || undefined,
    }
  }

  await Promise.all([
    saveLeadSignalsState(leadState),
    saveCRMState(crmState),
  ])

  return { ok: true, resourceName, stage: 'accepted' }
})
