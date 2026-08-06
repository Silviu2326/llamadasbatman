import { Queue, Worker } from 'bullmq'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { runAutonomyPass } from '../services/landingAutonomy.service'
import { organizationsWithLandings } from '../services/landingPerformance.service'

/**
 * Pasada diaria de autonomía (docs/vendrava/landings.md §10).
 *
 * Hace dos cosas: propone (o registra en sombra) los cambios que N3 podría
 * hacer, y cierra el período de observación de los ya aplicados, revirtiendo
 * los que empeoraron la métrica de seguridad.
 *
 * Por defecto la organización está en N1 con modo sombra: este job escribe lo
 * que *haría* y no toca ninguna landing. Conceder autonomía es un acto
 * explícito, nunca el estado inicial.
 */
const QUEUE_NAME = 'landing-autonomy-pass'
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
const REPEATABLE_JOB_ID = 'landing-autonomy-pass-tick'
const reportAutonomyError = reportQueueError('LandingAutonomyPass')

let landingAutonomyQueue: Queue | null = null
let landingAutonomyWorker: Worker | null = null

void (async () => {
  const connection = await connectOptionalRedis('LandingAutonomyPass')
  if (!connection) return

  try {
    landingAutonomyQueue = new Queue(QUEUE_NAME, { connection: connection as any })
    landingAutonomyQueue.on('error', reportAutonomyError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    try {
      await landingAutonomyQueue.add('tick', {}, { repeat: { every: SYNC_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID })
    } catch (error) {
      reportAutonomyError(error as Error)
    }

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        const orgIds = await organizationsWithLandings()
        for (const orgId of orgIds) {
          try {
            await runAutonomyPass(orgId)
          } catch (error) {
            console.error(`[LandingAutonomyPass] error en org ${orgId}:`, error)
          }
        }
      },
      { connection: connection as any, concurrency: 1 }
    )

    worker.on('failed', (job, error) => console.error(`[LandingAutonomyPass] job ${job?.id} failed:`, error))
    worker.on('error', reportAutonomyError)
    landingAutonomyWorker = worker
  } catch (error) {
    reportAutonomyError(error as Error)
    connection.disconnect()
  }
})()

export { landingAutonomyQueue, landingAutonomyWorker }
