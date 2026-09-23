import { dispatchRadarSchedules } from '../services/radarSchedules.service'
let running = false
export async function runRadarScheduler() {
  if (running) return
  running = true
  try { await dispatchRadarSchedules() } catch (error) { console.error('[RadarScheduler] No se pudieron consultar las programaciones:', (error as Error).message) }
  finally { running = false }
}
if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
  const timer = setInterval(() => void runRadarScheduler(), 60_000)
  timer.unref()
  void runRadarScheduler()
}
