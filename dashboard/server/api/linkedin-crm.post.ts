import type { LICRMData, LIContactStatus, LITier } from '../utils/types'
import { isDemoMode } from '../utils/demo'
import { getLinkedInCRMData, saveLinkedInCRMData } from '../utils/linkedin-crm-data'

const VALID_STATUSES: LIContactStatus[] = ['PENDING', 'REQUEST_SENT', 'CREATOR_MODE', 'CONNECTED', 'DM_SENT', 'DM_SKIPPED', 'RESPONDED']
const VALID_TIERS: LITier[] = ['T0', 'T1', 'T2', 'T3']

function findContact(data: LICRMData, contactId: string) {
  if (!contactId || typeof contactId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing contactId' })
  }
  const contact = data.contacts.find(c => c.id === contactId)
  if (!contact) {
    throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  }
  return contact
}

export default defineEventHandler(async (event) => {
  if (await isDemoMode(event)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
  }

  const body = await readBody(event)
  const { action } = body

  const data = await getLinkedInCRMData()

  if (action === 'updateContactStatus') {
    const { contactId, status } = body
    if (!VALID_STATUSES.includes(status)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
    }
    const contact = findContact(data, contactId)
    contact.status = status
    if (status === 'DM_SENT') {
      contact.dmSentDate = new Date().toISOString().split('T')[0]
    }
  }
  else if (action === 'updateContactNotes') {
    const { contactId, notes } = body
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 5000)) {
      throw createError({ statusCode: 400, statusMessage: 'Notes must be string, max 5000 chars' })
    }
    const contact = findContact(data, contactId)
    contact.notes = notes ?? ''
  }
  else if (action === 'updateContactTier') {
    const { contactId, tier } = body
    if (!VALID_TIERS.includes(tier)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid tier' })
    }
    const contact = findContact(data, contactId)
    contact.tier = tier
  }
  else if (action === 'logDM') {
    const { contactId, template, dmStatus, skipReason } = body
    const contact = findContact(data, contactId)
    if (!['SENT', 'SKIPPED'].includes(dmStatus)) {
      throw createError({ statusCode: 400, statusMessage: 'dmStatus must be SENT or SKIPPED' })
    }
    if (template !== undefined && (typeof template !== 'string' || template.length > 200)) {
      throw createError({ statusCode: 400, statusMessage: 'Template must be string, max 200 chars' })
    }
    const today = new Date().toISOString().split('T')[0]!
    data.dmLog.push({
      date: today,
      contactName: contact.name,
      contactId: contact.id,
      tier: contact.tier,
      template: template || '',
      status: dmStatus,
      skipReason: dmStatus === 'SKIPPED' ? (skipReason || '') : undefined,
      followUpDate: dmStatus === 'SENT' ? new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] : undefined,
    })
    // Sync contact status
    contact.status = dmStatus === 'SENT' ? 'DM_SENT' : 'DM_SKIPPED'
    if (dmStatus === 'SENT') {
      contact.dmSentDate = today
      contact.dmTemplate = template || ''
    }
    if (dmStatus === 'SKIPPED') {
      contact.skipReason = skipReason || ''
    }
  }
  else if (action === 'addFollowerSnapshot') {
    const { followers, notes } = body
    if (typeof followers !== 'number' || followers < 0 || followers > 10000000) {
      throw createError({ statusCode: 400, statusMessage: 'followers must be a non-negative number' })
    }
    const prev = data.followerSnapshots[data.followerSnapshots.length - 1]
    data.followerSnapshots.push({
      date: new Date().toISOString().split('T')[0]!,
      followers,
      delta: prev ? followers - prev.followers : undefined,
      notes: notes || undefined,
    })
  }
  else {
    throw createError({ statusCode: 400, statusMessage: 'Unknown action' })
  }

  data.updatedAt = new Date().toISOString()
  await saveLinkedInCRMData(data)

  return { success: true }
})
