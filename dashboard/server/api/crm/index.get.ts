import type { CRMContact, CRMResponse, CRMStage } from '../../utils/types'
import { getFollowUpScores, getLinkedInSignals, getCRMState } from '../../utils/gcs'
import { isDemoMode } from '../../utils/demo'

const ALL_STAGES: CRMStage[] = ['inbox', 'reached_out', 'in_conversation', 'opportunity', 'converted', 'dormant']

export default defineEventHandler(async (event): Promise<CRMResponse> => {
  const demo = await isDemoMode(event)
  if (demo) {
    return { contacts: [], stages: Object.fromEntries(ALL_STAGES.map(s => [s, 0])) as Record<CRMStage, number> }
  }

  const [followup, { signals }, crmState] = await Promise.all([
    getFollowUpScores(),
    getLinkedInSignals(),
    getCRMState(),
  ])

  // Build LinkedIn signal lookup
  const signalMap = new Map(signals.map(s => [s.resourceName, s]))

  // Merge followup scores with CRM state
  const contacts: CRMContact[] = []
  const scores = followup.scores ?? []

  for (const score of scores) {
    const state = crmState.contacts[score.resourceName]
    contacts.push({
      resourceName: score.resourceName,
      name: score.name,
      stage: state?.stage ?? 'inbox',
      stageChangedAt: state?.stageChangedAt ?? '',
      notes: state?.notes ?? '',
      tags: state?.tags ?? [],
      score_total: score.score_total,
      score_breakdown: score.score_breakdown,
      interaction: score.interaction,
      linkedin: score.linkedin,
      contact: score.contact,
      followup_prompt: score.followup_prompt,
    })
  }

  // Count per stage
  const stages = Object.fromEntries(ALL_STAGES.map(s => [s, 0])) as Record<CRMStage, number>
  for (const c of contacts) {
    stages[c.stage]++
  }

  return { contacts, stages }
})
