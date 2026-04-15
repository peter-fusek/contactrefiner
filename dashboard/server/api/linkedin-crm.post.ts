import type { LICRMData } from '../utils/types'
import { isDemoMode } from '../utils/demo'
import { getLinkedInCRMData, saveLinkedInCRMData } from '../utils/linkedin-crm-data'

export default defineEventHandler(async (event) => {
  if (await isDemoMode(event)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
  }

  const body = await readBody(event)
  const { action } = body

  const data = await getLinkedInCRMData()

  if (action === 'updateContactStatus') {
    const { contactId, status } = body
    if (!contactId || !status) {
      throw createError({ statusCode: 400, statusMessage: 'Missing contactId or status' })
    }
    const contact = data.contacts.find(c => c.id === contactId)
    if (!contact) {
      throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
    }
    contact.status = status
    if (status === 'DM_SENT') {
      contact.dmSentDate = new Date().toISOString().split('T')[0]
    }
  }
  else if (action === 'updateContactNotes') {
    const { contactId, notes } = body
    if (!contactId) {
      throw createError({ statusCode: 400, statusMessage: 'Missing contactId' })
    }
    const contact = data.contacts.find(c => c.id === contactId)
    if (!contact) {
      throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
    }
    contact.notes = notes ?? ''
  }
  else {
    throw createError({ statusCode: 400, statusMessage: 'Unknown action' })
  }

  data.updatedAt = new Date().toISOString()
  await saveLinkedInCRMData(data)

  return { success: true }
})
