import { Queue, Worker } from 'bullmq'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { organizationsWithLandings, refreshLandingPerformance } from '../services/landingPerformance.service'

/**
 * Agregado diario de la telemetría de landings (docs/vendrava/landings.md §3.3).
 *
 * La página lee snapshots, nunca eventos brutos: sin este job, cada carga de
 * /landings recorrería la tabla de eventos entera. Recalcula los últimos 28
 * días —la ventana de línea base de §3.4— en vez de solo el día anterior,
 * porque los lotes de `sendBeacon` pueden llegar tarde.
 */
const QUEUE_NAME = 'landing-performance-rollup'
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000
const REPEATABLE_JOB_ID = 'landing-performance-rollup-tick'
const reportLandingError = reportQueueError('LandingPerformanceRollup')

let landingPerformanceQueue: Queue | null = null
let landingPerformanceWorker: Worker | null = null

void (async () => {
  const connection = await connectOptionalRedis('LandingPerformanceRollup')
  if (!connection) return

  try {
    landingPerformanceQueue = new Queue(QUEUE_NAME, { connection: connection as any })
    landingPerformanceQueue.on('error', reportLandingError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    try {
      await landingPerformanceQueue.add('tick', {}, { repeat: { every: SYNC_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID })
    } catch (error) {
      reportLandingError(error as Error)
    }

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        const orgIds = await organizationsWithLandings()
        for (const orgId of orgIds) {
          try {
            // Una organización con datos sucios no puede impedir que las demás
            // refresquen sus snapshots.
            await refreshLandingPerformance(orgId)
          } catch (error) {
            console.error(`[LandingPerformanceRollup] error en org ${orgId}:`, error)
          }
        }
      },
      { connection: connection as any, concurrency: 1 }
    )

    worker.on('failed', (job, error) => console.error(`[LandingPerformanceRollup] job ${job?.id} failed:`, error))
    worker.on('error', reportLandingError)
    landingPerformanceWorker = worker
  } catch (error) {
    reportLandingError(error as Error)
    connection.disconnect()
  }
})()

export { landingPerformanceQueue, landingPerformanceWorker }
