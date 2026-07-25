import { randomUUID } from 'node:crypto'
import { processSalesSequenceTick } from '../services/salesSequence.service'

const POLL_MS = Math.max(2_000, Number(process.env.SALES_SEQUENCE_POLL_MS ?? 10_000))
const WORKER_ID = process.env.SALES_SEQUENCE_WORKER_ID?.trim() || `sales-sequence-${process.pid}-${randomUUID()}`
let running = false

export async function processSalesSequenceRunnerTick() {
  if (running) return { candidates: 0, claimed: 0, skipped: true }
  running = true
  try {
    return await processSalesSequenceTick(25, WORKER_ID)
  } catch (error) {
    console.error('[SalesSequenceRunner] tick failed:', error instanceof Error ? error.message : error)
    return { candidates: 0, claimed: 0, skipped: false, error: true }
  } finally {
    running = false
  }
}

let salesSequenceTimer: NodeJS.Timeout | null = null
if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
  salesSequenceTimer = setInterval(() => void processSalesSequenceRunnerTick(), POLL_MS)
  salesSequenceTimer.unref()
  void processSalesSequenceRunnerTick()
}

export { salesSequenceTimer }
