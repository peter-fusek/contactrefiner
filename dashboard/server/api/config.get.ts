import type { ConfigResponse } from '../utils/types'

export default defineEventHandler((): ConfigResponse => {
  // These mirror the Python pipeline config.py values
  // In the future, could read from GCS or a config file
  return {
    batchSize: 50,
    confidenceHigh: 0.90,
    confidenceMedium: 0.60,
    aiModel: 'claude-haiku-4-5-20251001',
    aiCostLimit: 3.00,
    autoMaxChanges: 200,
    autoThreshold: 0.90,
    environment: 'cloud',
    schedulerStatus: 'paused',
  }
})
