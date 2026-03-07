// --- Workplan ---

export interface WorkplanMetadata {
  created_at: string
  version: string
}

export interface ChangeStats {
  high: number
  medium: number
  low: number
  total_changes: number
  contacts: number
}

export interface Change {
  field: string
  old: string
  new: string
  confidence: number
  reason: string
  extra?: Record<string, unknown>
}

export interface ContactAnalysis {
  resourceName: string
  displayName: string
  etag: string
  changes: Change[]
  info: Array<{ field: string; old?: string; new: string; reason: string }>
  stats: { high: number; medium: number; low: number; total: number }
}

export interface Batch {
  batch_num: number
  contacts: ContactAnalysis[]
  stats: ChangeStats
  status: 'pending' | 'completed' | 'failed'
}

export interface WorkplanSummary {
  total_contacts_with_changes: number
  total_changes: number
  by_confidence: { high: number; medium: number; low: number }
  by_field_type: Record<string, number>
  info_items: { duplicates?: number; invalid?: number }
  total_batches: number
  batch_size: number
}

export interface Workplan {
  metadata: WorkplanMetadata
  summary: WorkplanSummary
  batches: Batch[]
  duplicates: unknown[]
  labels: unknown
}

// --- Checkpoint ---

export interface Checkpoint {
  session_id: string
  started_at: string
  last_completed_batch: number
  total_batches: number
  contacts_processed: number
  contacts_total: number
  status: 'initialized' | 'in_progress' | 'completed' | 'failed'
  workplan_path: string
  changelog_path: string
  backup_path: string
  last_checkpoint_at?: string
  completed_at?: string
  failed_at?: string
  error?: string
}

// --- AI Review Checkpoint ---

export interface AIReviewCheckpoint {
  status: string
  workplan_path: string
  last_reviewed: number
  total: number
  promoted: number
  demoted: number
}

// --- Changelog ---

export interface ChangelogEntry {
  timestamp: string
  resourceName: string
  field: string
  old: string
  new: string
  reason: string
  confidence: string
  confidence_value: number
  batch: number
  session_id: string
}

export interface BatchMarker {
  timestamp: string
  type: 'batch_start' | 'batch_end'
  batch: number
  contact_count?: number
  success?: number
  failed?: number
  session_id: string
}

export type ChangelogLine = ChangelogEntry | BatchMarker

// --- Review ---

export interface ReviewChange {
  id: string // hash(resourceName + field + old + new)
  resourceName: string
  displayName: string
  field: string
  old: string
  new: string
  confidence: number
  reason: string
  ruleCategory: string
  extra?: Record<string, unknown>
}

export interface ReviewDecision {
  changeId: string
  decision: 'approved' | 'rejected' | 'edited' | 'skipped'
  editedValue?: string
  decidedAt: string
}

export interface ReviewSession {
  id: string
  reviewFilePath: string
  createdAt: string
  decisions: Record<string, ReviewDecision> // changeId -> decision
  stats: { total: number; approved: number; rejected: number; edited: number; skipped: number }
}

export interface FeedbackEntry {
  timestamp: string
  type: 'approval' | 'rejection' | 'edit'
  ruleCategory: string
  field: string
  old: string
  suggested: string
  finalValue: string
  confidence: number
}

// --- API Responses ---

export interface StatusResponse {
  status: 'running' | 'completed' | 'failed' | 'idle'
  phase: 'phase1' | 'phase2' | 'idle'
  currentBatch: number
  totalBatches: number
  contactsProcessed: number
  contactsTotal: number
  eta: string | null
  lastRun: {
    startedAt: string | null
    completedAt: string | null
    duration: number | null
    changesApplied: number
    changesFailed: number
    cost: number | null
  }
  aiReview: {
    reviewed: number
    total: number
    promoted: number
    demoted: number
  } | null
}

export interface ChangelogResponse {
  entries: ChangelogEntry[]
  total: number
  page: number
  pageSize: number
}

export interface AnalyticsResponse {
  byField: Record<string, number>
  byConfidence: { high: number; medium: number; low: number }
  successRate: number
  totalChanges: number
  totalFailed: number
  dailyRuns: Array<{ date: string; changes: number; failed: number }>
  topContacts: Array<{ name: string; changes: number }>
  estimatedCost: number
}

export interface ConfigResponse {
  batchSize: number
  confidenceHigh: number
  confidenceMedium: number
  aiModel: string
  aiCostLimit: number
  autoMaxChanges: number
  autoThreshold: number
  environment: string
  schedulerStatus: string
}
