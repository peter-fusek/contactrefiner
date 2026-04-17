import type { LeadSignalsResponse } from '../../utils/types'
import { getFollowUpScores, getLeadSignalsState } from '../../utils/gcs'
import { toLeadSignal, splitByStage, countBySignalType, WEEKLY_CAP } from '../../utils/lead-signals'
import { isDemoMode } from '../../utils/demo'

export default defineEventHandler(async (event): Promise<LeadSignalsResponse> => {
  const demo = await isDemoMode(event)
  if (demo) {
    return {
      generated: null,
      total: 0,
      weeklyCap: WEEKLY_CAP,
      candidates: [],
      backlog: [],
      dismissed: [],
      stats: { candidates: 0, accepted: 0, dismissed: 0, bySignalType: {} },
    }
  }

  const [followup, state] = await Promise.all([
    getFollowUpScores(),
    getLeadSignalsState(),
  ])

  const all = (followup.scores ?? []).map(s => toLeadSignal(s, state))
  const { candidates, backlog, dismissed } = splitByStage(all, WEEKLY_CAP)

  const accepted = all.filter(s => s.stage === 'accepted').length

  return {
    generated: followup.generated,
    total: all.length,
    weeklyCap: WEEKLY_CAP,
    candidates,
    backlog,
    dismissed,
    stats: {
      candidates: candidates.length,
      accepted,
      dismissed: dismissed.length,
      bySignalType: countBySignalType(candidates),
    },
  }
})
