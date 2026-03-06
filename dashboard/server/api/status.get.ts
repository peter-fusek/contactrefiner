import type { StatusResponse } from '../utils/types'
import {
  getCheckpoint,
  getAIReviewCheckpoint,
  getChangelogWithMarkers,
  isBatchMarker,
} from '../utils/gcs'

export default defineEventHandler(async (): Promise<StatusResponse> => {
  const [checkpoint, aiCheckpoint, changelog] = await Promise.all([
    getCheckpoint(),
    getAIReviewCheckpoint(),
    getChangelogWithMarkers(),
  ])

  // Determine phase and status
  let status: StatusResponse['status'] = 'idle'
  let phase: StatusResponse['phase'] = 'idle'

  if (checkpoint) {
    if (checkpoint.status === 'in_progress' || checkpoint.status === 'initialized') {
      status = 'running'
      phase = 'phase1'
    } else if (checkpoint.status === 'completed') {
      status = 'completed'
      phase = 'phase1'
    } else if (checkpoint.status === 'failed') {
      status = 'failed'
      phase = 'phase1'
    }
  }

  if (aiCheckpoint?.status === 'in_progress') {
    status = 'running'
    phase = 'phase2'
  }

  // Count successes/failures from batch markers
  let changesApplied = 0
  let changesFailed = 0
  for (const entry of changelog) {
    if (isBatchMarker(entry) && entry.type === 'batch_end') {
      changesApplied += entry.success ?? 0
      changesFailed += entry.failed ?? 0
    }
  }

  // Calculate duration
  let duration: number | null = null
  if (checkpoint?.started_at && checkpoint?.completed_at) {
    duration = Math.round(
      (new Date(checkpoint.completed_at).getTime() - new Date(checkpoint.started_at).getTime()) / 1000,
    )
  }

  // Estimate cost from AI review (Haiku: ~$0.80/1M input, $4/1M output)
  // Rough estimate: ~500 tokens per contact review
  const aiReviewed = aiCheckpoint?.last_reviewed ?? 0
  const estimatedCost = aiReviewed * 500 * (0.80 + 4.0) / 2 / 1_000_000

  return {
    status,
    phase,
    currentBatch: checkpoint?.last_completed_batch ?? 0,
    totalBatches: checkpoint?.total_batches ?? 0,
    contactsProcessed: checkpoint?.contacts_processed ?? 0,
    contactsTotal: checkpoint?.contacts_total ?? 0,
    eta: null, // Could calculate from batch timing
    lastRun: {
      startedAt: checkpoint?.started_at ?? null,
      completedAt: checkpoint?.completed_at ?? null,
      duration,
      changesApplied,
      changesFailed,
      cost: estimatedCost > 0 ? Math.round(estimatedCost * 100) / 100 : null,
    },
    aiReview: aiCheckpoint
      ? {
          reviewed: aiCheckpoint.last_reviewed,
          total: aiCheckpoint.total,
          promoted: aiCheckpoint.promoted,
          demoted: aiCheckpoint.demoted,
        }
      : null,
  }
})
