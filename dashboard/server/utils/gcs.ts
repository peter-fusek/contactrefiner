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
  // Auth handled by GOOGLE_APPLICATION_CREDENTIALS (set by server plugin or .env)
  storage = new Storage()
  return storage
}

function getBucket() {
  const config = useRuntimeConfig()
  const bucket = String(config.gcsBucket)
  return getStorage().bucket(bucket)
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
  } catch (err) {
    console.error(`[GCS] readJson(${path}) failed:`, (err as Error).message)
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
  } catch (err) {
    console.error(`[GCS] findLatestFile(${prefix}) failed:`, (err as Error).message)
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

async function findAllFiles(prefix: string, extension: string): Promise<string[]> {
  try {
    const [files] = await getBucket().getFiles({ prefix })
    return files
      .filter(f => f.name.endsWith(extension))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => f.name)
  } catch (err) {
    console.error(`[GCS] findAllFiles(${prefix}) failed:`, (err as Error).message)
    return []
  }
}

async function readAllChangelogs(): Promise<ChangelogLine[]> {
  const paths = await findAllFiles('data/changelog_', '.jsonl')
  if (!paths.length) return []

  const all: ChangelogLine[] = []
  for (const path of paths) {
    try {
      const [content] = await getBucket().file(path).download()
      const text = content.toString('utf-8').trim()
      if (!text) continue
      for (const line of text.split('\n')) {
        try {
          all.push(JSON.parse(line) as ChangelogLine)
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Skip unreadable files
    }
  }
  return all
}

export async function getChangelog(): Promise<ChangelogEntry[]> {
  return cachedRead('changelog', async () => {
    const all = await readAllChangelogs()
    return all.filter((e): e is ChangelogEntry => !('type' in e))
  })
}

export async function getChangelogWithMarkers(): Promise<ChangelogLine[]> {
  return cachedRead('changelog_full', readAllChangelogs)
}

export function isBatchMarker(entry: ChangelogLine): entry is BatchMarker {
  return 'type' in entry
}
