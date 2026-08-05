import { Queue, Worker } from 'bullmq'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { checkOrganizationLandings } from '../services/landingHealth.service'
import { organizationsWithLandings } from '../services/landingPerformance.service'

/**
 * Chequeo diario de salud técnica por landing (docs/xarly/landings.md §7.3).
 *
 * Su valor no es el informe de velocidad: es que el diagnóstico de mensaje (§6)
 * pueda descartar antes las causas técnicas. Sin esto, Xarly recomendaría
 * reescribir un hero que en realidad tarda seis segundos en pintarse.
 */
const QUEUE_NAME = 'landing-health-check'
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
const REPEATABLE_JOB_ID = 'landing-health-check-tick'
const reportHealthError = reportQueueError('LandingHealthCheck')

let landingHealthQueue: Queue | null = null
let landingHealthWorker: Worker | null = null

void (async () => {
  const connection = await connectOptionalRedis('LandingHealthCheck')
  if (!connection) return

  try {
    landingHealthQueue = new Queue(QUEUE_NAME, { connection: connection as any })
    landingHealthQueue.on('error', reportHealthError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    try {
      await landingHealthQueue.add('tick', {}, { repeat: { every: SYNC_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID })
    } catch (error) {
      reportHealthError(error as Error)
    }

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        const orgIds = await organizationsWithLandings()
        for (const orgId of orgIds) {
          try {
            await checkOrganizationLandings(orgId)
          } catch (error) {
            console.error(`[LandingHealthCheck] error en org ${orgId}:`, error)
          }
        }
      },
      { connection: connection as any, concurrency: 1 }
    )

    worker.on('failed', (job, error) => console.error(`[LandingHealthCheck] job ${job?.id} failed:`, error))
    worker.on('error', reportHealthError)
    landingHealthWorker = worker
  } catch (error) {
    reportHealthError(error as Error)
    connection.disconnect()
  }
})()

export { landingHealthQueue, landingHealthWorker }
