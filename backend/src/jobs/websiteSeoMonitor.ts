import { scheduleWebsiteAudits, registerWebsiteAuditExecutor } from '../services/websiteSeo.service'
import { startWorkerHeartbeat } from '../observability/workerHeartbeat'

registerWebsiteAuditExecutor()
let busy = false
async function tick() {
  if (busy) return
  busy = true
  try { await scheduleWebsiteAudits() }
  catch (error) { console.error('[WebsiteSeo] scheduler failed', error instanceof Error ? error.message : 'UNKNOWN') }
  finally { busy = false }
}
export async function startWebsiteSeoMonitor() {
  const stopHeartbeat = await startWorkerHeartbeat('website-seo')
  const timer = setInterval(() => void tick(), 60_000)
  timer.unref()
  void tick()
  const stop = () => { clearInterval(timer); stopHeartbeat?.() }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
