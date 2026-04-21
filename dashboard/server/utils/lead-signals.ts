import type {
  FollowUpScore,
  LeadSignal,
  LeadSignalType,
  LeadSignalsState,
} from './types'

export const WEEKLY_CAP = 100

const EXEC_KEYWORDS = [
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo', 'ciso', 'cro',
  'founder', 'co-founder', 'cofounder', 'owner', 'president',
  'managing director', 'managing partner', 'partner',
  'head of', 'vp ', 'vice president', 'director',
  'zakladatel', 'majitel', 'spolumajitel', 'riaditel', 'konatel',
]

const CEO_KEYWORDS = ['ceo', 'chief executive', 'founder', 'owner', 'president', 'majitel', 'zakladatel']

const BANK_FINANCE_KEYWORDS = [
  'bank', 'banka', 'poistovna', 'poistovňa', 'insurance', 'sporiteln',
  'slsp', 'vub', 'vúb', 'pps', 'unicredit', 'tatra', 'csob', 'čsob',
  'kb ', 'komercni', 'komerční', 'raiffeisen', 'intesa', 'erste',
  'finance', 'financ', 'bcpb', 'burza', 'capital',
]

const IT_MODERNISATION_KEYWORDS = [
  'ai transformation', 'ai-transformation', 'modernis', 'legacy', 'rebuild',
  'replatform', 're-platform', 'digital transformation', 'cloud migration',
]

const VIBECODING_KEYWORDS = [
  'claude code', 'cursor', 'copilot', 'agentic', 'vibecoding', 'vibe coding',
  'claude', 'gpt', 'llm',
]

function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase()
  return needles.some(n => lower.includes(n))
}

export function deriveSignalTypes(score: FollowUpScore): LeadSignalType[] {
  const types: LeadSignalType[] = []
  const title = (score.contact.title || '').toLowerCase()
  const org = (score.contact.org || '').toLowerCase()
  const li = score.linkedin
  const headline = (li?.headline || '').toLowerCase()
  const currentRole = (li?.current_role || '').toLowerCase()
  const roleText = `${title} ${headline} ${currentRole}`
  const orgText = `${org} ${headline}`

  const isJobChange = li?.signal_type === 'job_change'
  if (isJobChange) types.push('recent_job_change')

  if (containsAny(roleText, CEO_KEYWORDS)) {
    if (isJobChange) types.push('promoted_ceo')
    else types.push('exec_title')
  } else if (containsAny(roleText, EXEC_KEYWORDS)) {
    if (isJobChange) types.push('new_c_level')
    else types.push('exec_title')
  }

  if (containsAny(orgText, BANK_FINANCE_KEYWORDS)) types.push('bank_finance')
  if (containsAny(roleText + ' ' + headline, IT_MODERNISATION_KEYWORDS)) types.push('it_modernisation')
  if (containsAny(headline, VIBECODING_KEYWORDS)) types.push('vibecoding_agentic')

  // Beeper-derived signal: a warm lead where Peter hasn't replied yet has
  // higher outreach urgency than a cold profile match — surface it so the
  // /signals "Action" column can flag it independently of LinkedIn state.
  if (score.beeper?.awaiting_reply_side === 'mine') types.push('dm_awaiting_reply')

  return Array.from(new Set(types))
}

export function toLeadSignal(score: FollowUpScore, state: LeadSignalsState): LeadSignal {
  const record = state.contacts[score.resourceName]
  const stage = record?.stage ?? 'candidate'
  const signalTypes = deriveSignalTypes(score)

  return {
    resourceName: score.resourceName,
    name: score.name,
    score: score.score_total,
    rank: score.rank,
    stage,
    signalTypes,
    org: score.contact.org || '',
    title: score.contact.title || '',
    lastDetected: score.linkedin?.scanned_at || score.interaction?.last_date || null,
    linkedinHeadline: score.linkedin?.headline || null,
    linkedinUrl: score.linkedin?.url || null,
    monthsSinceContact: score.interaction?.months_gap ?? null,
    dismissal: record?.dismissal ?? null,
  }
}

export function splitByStage(signals: LeadSignal[], cap: number = WEEKLY_CAP): {
  candidates: LeadSignal[]
  backlog: LeadSignal[]
  dismissed: LeadSignal[]
} {
  const dismissed = signals.filter(s => s.stage === 'dismissed')
  const active = signals.filter(s => s.stage !== 'dismissed')
    .sort((a, b) => b.score - a.score)

  return {
    candidates: active.slice(0, cap),
    backlog: active.slice(cap),
    dismissed,
  }
}

export function countBySignalType(signals: LeadSignal[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of signals) {
    for (const t of s.signalTypes) {
      counts[t] = (counts[t] || 0) + 1
    }
  }
  return counts
}
