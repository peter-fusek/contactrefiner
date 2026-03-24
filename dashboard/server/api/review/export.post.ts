import { getReviewSession, getLatestReviewFile, getReviewFile, saveReviewDecisions } from '../../utils/gcs'
import { parseReviewFile } from '../../utils/review-helpers'
import { isDemoMode } from '../../utils/demo'

interface ExportRequest {
  sessionId: string
}

export default defineEventHandler(async (event) => {
  if (await isDemoMode(event)) {
    throw createError({ statusCode: 403, message: 'Read-only demo mode' })
  }

  const body = await readBody<ExportRequest>(event)
  if (!body?.sessionId) {
    throw createError({ statusCode: 400, message: 'Missing sessionId' })
  }

  const session = await getReviewSession(body.sessionId)

  if (!session) {
    throw createError({ statusCode: 404, message: 'Session not found' })
  }

  // Use the session's own review file — NOT the latest one.
  // If a new pipeline run created a newer review file, the changeIds won't match
  // and all decisions would be silently dropped.
  if (!session.reviewFilePath) {
    console.warn(`[export] Session ${session.id} has no reviewFilePath — falling back to latest. Decisions may be mismatched.`)
  }
  const reviewFile = session.reviewFilePath
    ? await getReviewFile(session.reviewFilePath)
    : await getLatestReviewFile()

  // Build change lookup from review file
  const changeMap = new Map<string, { resourceName: string; displayName: string; field: string; old: string; new: string; confidence: number; reason: string }>()
  if (reviewFile) {
    for (const c of parseReviewFile(reviewFile.data)) {
      changeMap.set(c.id, {
        resourceName: c.resourceName,
        displayName: c.displayName,
        field: c.field,
        old: c.old,
        new: c.new,
        confidence: c.confidence,
        reason: c.reason,
      })
    }
  }

  // Export enriched decisions with full change metadata
  // Include rejections too so the learning loop can adjust confidence
  const enrichedChanges: Array<Record<string, unknown>> = []
  let totalDecisions = 0
  for (const [changeId, d] of Object.entries(session.decisions)) {
    totalDecisions++
    if (d.decision === 'approved' || d.decision === 'edited' || d.decision === 'rejected') {
      const meta = changeMap.get(changeId)
      enrichedChanges.push({
        changeId,
        decision: d.decision,
        editedValue: d.editedValue ?? null,
        decidedAt: d.decidedAt,
        resourceName: meta?.resourceName ?? null,
        displayName: meta?.displayName ?? null,
        field: meta?.field ?? null,
        old: meta?.old ?? null,
        new: meta?.new ?? null,
        confidence: meta?.confidence ?? null,
        reason: meta?.reason ?? null,
      })
    }
  }

  await saveReviewDecisions(session.id, enrichedChanges, reviewFile?.path ?? null)

  return {
    exported: enrichedChanges.length,
    total: totalDecisions,
  }
})
