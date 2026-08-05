import { Queue, Worker } from 'bullmq'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { runWeeklyContentCadence } from '../services/contentCadence.service'

/**
 * Cadencia semanal del Radar — `docs/xarly/roadmap.md` fase 3.
 *
 * Los lunes por la mañana se regeneran las oportunidades y el perfil de voz de
 * cada organización con material, y se avisa de lo que hay. Hasta aquí el
 * refresco era manual desde la pantalla (`semana.md`: "no hay cadencia
 * automática").
 *
 * Va con patrón cron y no con `every`, a diferencia de los demás jobs de este
 * directorio: "cada 7 días" contado desde el arranque cae en el día en que se
 * desplegó el worker, y lo que pide el documento es **el lunes**.
 */
const QUEUE_NAME = 'content-weekly-refresh'
/** Lunes a las 7:00 de la mañana en la zona del negocio. */
const CRON_PATTERN = '0 7 * * 1'
const TIMEZONE = process.env.CONTENT_CADENCE_TZ ?? 'Europe/Madrid'
const REPEATABLE_JOB_ID = 'content-weekly-refresh-tick'
const reportCadenceError = reportQueueError('ContentWeeklyRefresh')

let contentWeeklyQueue: Queue | null = null
let contentWeeklyWorker: Worker | null = null

void (async () => {
  const connection = await connectOptionalRedis('ContentWeeklyRefresh')
  if (!connection) return

  try {
    contentWeeklyQueue = new Queue(QUEUE_NAME, { connection: connection as any })
    contentWeeklyQueue.on('error', reportCadenceError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    try {
      await contentWeeklyQueue.add('tick', {}, {
        repeat: { pattern: CRON_PATTERN, tz: TIMEZONE },
        jobId: REPEATABLE_JOB_ID,
      })
    } catch (error) {
      reportCadenceError(error as Error)
    }

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        const results = await runWeeklyContentCadence()
        const created = results.reduce((total, result) => total + result.created, 0)
        console.log(`[ContentWeeklyRefresh] ${results.length} organizaciones, ${created} oportunidades nuevas`)
        for (const result of results.filter(item => item.error)) {
          console.warn(`[ContentWeeklyRefresh] org ${result.orgId}: ${result.error}`)
        }
      },
      // Concurrencia 1: cada pasada llama al modelo por organización, y
      // paralelizarlo solo adelantaría el límite de la API del proveedor.
      { connection: connection as any, concurrency: 1 },
    )

    worker.on('completed', job => console.log(`[ContentWeeklyRefresh] job ${job.id} completed`))
    worker.on('failed', (job, error) => console.error(`[ContentWeeklyRefresh] job ${job?.id} failed:`, error))
    worker.on('error', reportCadenceError)
    contentWeeklyWorker = worker
  } catch (error) {
    reportCadenceError(error as Error)
    connection.disconnect()
  }
})()

export { contentWeeklyQueue, contentWeeklyWorker }
