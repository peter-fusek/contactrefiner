import { getReviewSession, saveReviewDecisions } from '../../utils/gcs'

interface ExportRequest {
  sessionId: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ExportRequest>(event)
  if (!body?.sessionId) {
    throw createError({ statusCode: 400, message: 'Missing sessionId' })
  }

  const session = await getReviewSession(body.sessionId)
  if (!session) {
    throw createError({ statusCode: 404, message: 'Session not found' })
  }

  // Export approved/edited decisions for the pipeline to consume
  const actionable: Record<string, unknown> = {}
  for (const [changeId, d] of Object.entries(session.decisions)) {
    if (d.decision === 'approved' || d.decision === 'edited') {
      actionable[changeId] = d
    }
  }

  await saveReviewDecisions(session.id, actionable)

  return {
    exported: Object.keys(actionable).length,
    total: Object.keys(session.decisions).length,
  }
})
