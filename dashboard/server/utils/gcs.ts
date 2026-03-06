import { Storage } from '@google-cloud/storage'
import type {
  Workplan,
  Checkpoint,
  AIReviewCheckpoint,
  ChangelogEntry,
  ChangelogLine,
  BatchMarker,
} from './types'

let storage: Storage | null = null

function getStorage(): Storage {
  if (storage) return storage

  const config = useRuntimeConfig()
  const saKey = config.gcsServiceAccount

  if (saKey) {
    const credentials = JSON.parse(saKey)
    storage = new Storage({ credentials })
  } else {
    // Falls back to ADC (local gcloud auth or GCE metadata)
    storage = new Storage()
  }

  return storage
}

function getBucket() {
  const config = useRuntimeConfig()
  return getStorage().bucket(config.gcsBucket)
}

// In-memory cache with TTL
const cache = new Map<string, { data: unknown; expires: number }>()
const CACHE_TTL = 10_000 // 10 seconds

async function cachedRead<T>(key: string, reader: () => Promise<T>): Promise<T> {
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) {
    return cached.data as T
  }

  const data = await reader()
  cache.set(key, { data, expires: Date.now() + CACHE_TTL })
  return data
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const [content] = await getBucket().file(path).download()
    return JSON.parse(content.toString('utf-8')) as T
  } catch {
    return null
  }
}

async function findLatestFile(prefix: string, extension: string): Promise<string | null> {
  try {
    const [files] = await getBucket().getFiles({ prefix })
    const matching = files
      .filter(f => f.name.endsWith(extension))
      .sort((a, b) => b.name.localeCompare(a.name))
    return matching[0]?.name ?? null
  } catch {
    return null
  }
}

// --- Public API ---

export async function getLatestWorkplan(): Promise<Workplan | null> {
  return cachedRead('workplan', async () => {
    const path = await findLatestFile('data/workplan_', '.json')
    if (!path) return null
    return readJson<Workplan>(path)
  })
}

export async function getCheckpoint(): Promise<Checkpoint | null> {
  return cachedRead('checkpoint', () => readJson<Checkpoint>('data/checkpoint.json'))
}

export async function getAIReviewCheckpoint(): Promise<AIReviewCheckpoint | null> {
  return cachedRead('ai_review_checkpoint', () =>
    readJson<AIReviewCheckpoint>('data/ai_review_checkpoint.json'),
  )
}

export async function getChangelog(): Promise<ChangelogEntry[]> {
  return cachedRead('changelog', async () => {
    const path = await findLatestFile('data/changelog_', '.jsonl')
    if (!path) return []

    try {
      const [content] = await getBucket().file(path).download()
      const lines = content.toString('utf-8').trim().split('\n')
      const entries: ChangelogEntry[] = []

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as ChangelogLine
          if (!('type' in parsed)) {
            entries.push(parsed as ChangelogEntry)
          }
        } catch {
          // Skip malformed lines (partial writes)
        }
      }

      return entries
    } catch {
      return []
    }
  })
}

export async function getChangelogWithMarkers(): Promise<ChangelogLine[]> {
  return cachedRead('changelog_full', async () => {
    const path = await findLatestFile('data/changelog_', '.jsonl')
    if (!path) return []

    try {
      const [content] = await getBucket().file(path).download()
      const lines = content.toString('utf-8').trim().split('\n')
      const entries: ChangelogLine[] = []

      for (const line of lines) {
        try {
          entries.push(JSON.parse(line) as ChangelogLine)
        } catch {
          // Skip malformed lines
        }
      }

      return entries
    } catch {
      return []
    }
  })
}

export function isBatchMarker(entry: ChangelogLine): entry is BatchMarker {
  return 'type' in entry
}
