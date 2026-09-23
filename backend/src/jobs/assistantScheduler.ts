import { dispatchAssistantRoutines } from '../services/assistantRoutines'
let running = false
let timer: ReturnType<typeof setInterval> | null = null
export function assistantSchedulerEnabled() { return timer !== null }
export async function runAssistantScheduler() {
  if (running) return
  running = true
  try { await dispatchAssistantRoutines() } catch (error) { console.error('[AssistantScheduler] No se pudieron procesar las rutinas:', (error as Error).message) }
  finally { running = false }
}
export function startAssistantScheduler() {
  if (timer) return
  timer = setInterval(() => void runAssistantScheduler(), 60_000)
  timer.unref()
}
export function stopAssistantScheduler() { if (timer) clearInterval(timer); timer = null }
if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') startAssistantScheduler()
