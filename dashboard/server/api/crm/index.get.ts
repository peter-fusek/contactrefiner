import type { CRMContact, CRMResponse, CRMStage } from '../../utils/types'
import { getFollowUpScores, getLinkedInSignals, getCRMState, getContactNameMap } from '../../utils/gcs'
import { isDemoMode, maskFollowUpScore } from '../../utils/demo'

const ALL_STAGES: CRMStage[] = ['inbox', 'reached_out', 'in_conversation', 'opportunity', 'converted', 'dormant', 'unknown', 'ready_to_delete']

export default defineEventHandler(async (event): Promise<CRMResponse> => {
  const demo = await isDemoMode(event)

  const [followup, { signals }, crmState, nameMap] = await Promise.all([
    getFollowUpScores(),
    getLinkedInSignals(),
    getCRMState(),
    getContactNameMap(),
  ])

  // Build LinkedIn signal lookup
  const signalMap = new Map(signals.map(s => [s.resourceName, s]))

  // Merge followup scores with CRM state
  const contacts: CRMContact[] = []
  const scores = followup.scores ?? []

  for (const score of scores) {
    const state = demo ? undefined : crmState.contacts[score.resourceName]
    const masked = demo ? maskFollowUpScore(score) : score
    const resolvedName = masked.name || nameMap.get(score.resourceName) || score.resourceName.replace('people/', 'Contact ')
    contacts.push({
      resourceName: masked.resourceName,
      name: resolvedName,
      stage: state?.stage ?? 'inbox',
      stageChangedAt: state?.stageChangedAt ?? '',
      notes: demo ? '' : (state?.notes ?? ''),
      tags: demo ? [] : (state?.tags ?? []),
      score_total: masked.score_total,
      score_breakdown: masked.score_breakdown,
      interaction: masked.interaction,
      linkedin: masked.linkedin,
      contact: masked.contact,
      followup_prompt: masked.followup_prompt,
    })
  }

  // Count per stage
  const stages = Object.fromEntries(ALL_STAGES.map(s => [s, 0])) as Record<CRMStage, number>
  for (const c of contacts) {
    stages[c.stage]++
  }

  return { contacts, stages }
})
