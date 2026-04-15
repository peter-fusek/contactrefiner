import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LICRMData } from './types'

export async function getLinkedInCRMData(): Promise<LICRMData> {
  // In production, Nitro bundles server assets via useStorage
  const storage = useStorage('assets:data')
  const data = await storage.getItem<LICRMData>('linkedin-crm.json')
  if (data) return data

  // Fallback for dev mode: read from filesystem
  const filePath = resolve(process.cwd(), 'server/data/linkedin-crm.json')
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw)
}

export async function saveLinkedInCRMData(data: LICRMData): Promise<void> {
  const storage = useStorage('assets:data')
  await storage.setItem('linkedin-crm.json', data)
}
