import { getQueueStats } from '../utils/gcs'

export default defineEventHandler(async () => {
  return await getQueueStats()
})
