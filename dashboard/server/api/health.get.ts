import { getPipelineRuns, getQueueStats, getLinkedInSignals, getFollowUpScores } from '../utils/gcs'

export default defineEventHandler(async () => {
  // No auth, no demo guard — returns only non-sensitive aggregate metrics
  const [pipelineRuns, queueStats, signals, followup] = await Promise.all([
    getPipelineRuns().catch(() => []),
    getQueueStats().catch(() => []),
    getLinkedInSignals().catch(() => ({ signals: [], generated: null })),
    getFollowUpScores().catch(() => ({ scores: [], generated: null, stats: null })),
  ])

  const config = useRuntimeConfig()
  const latestRun = pipelineRuns.length ? pipelineRuns[pipelineRuns.length - 1] : null
  const latestQueue = queueStats.length ? queueStats[queueStats.length - 1] : null

  // Compute total AI cost from latest run phases
  let aiCost: number | null = null
  if (latestRun?.phases) {
    let sum = 0
    for (const phase of Object.values(latestRun.phases)) {
      if (phase.ai_cost_usd) sum += phase.ai_cost_usd
    }
    if (sum > 0) aiCost = Math.round(sum * 1000) / 1000
  }

  return {
    status: 'ok',
    dashboard: {
      version: config.public.appVersion,
      buildDate: config.public.buildDate,
      gitSha: config.public.gitSha,
    },
    pipeline: {
      lastRunDate: latestRun?.date ?? null,
      lastRunDuration: latestRun?.duration_seconds ?? null,
      lastRunPhases: latestRun?.phases_completed ?? [],
      lastRunErrors: latestRun?.errors?.length ?? 0,
      lastRunChangesApplied: latestRun?.changes_applied ?? 0,
      lastRunChangesFailed: latestRun?.changes_failed ?? 0,
      lastRunAiCost: aiCost,
      totalRuns: pipelineRuns.length,
    },
    queue: {
      pendingChanges: latestQueue?.totalChanges ?? 0,
      lastQueueDate: latestQueue?.date ?? null,
      historyLength: queueStats.length,
    },
    signals: {
      linkedinSignalsCount: signals.signals.length,
      linkedinLastGenerated: signals.generated,
      followupCandidates: followup.scores.length,
      followupLastGenerated: followup.generated,
    },
  }
})
