import { Queue, Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { runAutonomyPass } from '../services/organicAutonomy.service'
import { enforceAutonomyGuardrails } from '../services/adRuleAutonomy.service'

/**
 * Pasada diaria de autonomía orgánica — `docs/vendrava/organico.md` §9 y §11.
 *
 * Hace las dos mitades en el orden que importa:
 *
 * 1. **Primero degrada.** Si las fuentes están obsoletas, la cobertura de
 *    atribución cayó o alguien tiró del freno, las reglas vuelven a N1 *antes*
 *    de que la pasada decida nada. Al revés, la pasada actuaría con el nivel de
 *    ayer sobre los datos de hoy.
 * 2. **Después propone.** Con la organización en N1 (que es el estado por
 *    defecto y el que nadie ha cambiado) esto solo escribe observaciones: el
 *    job no toca nada hasta que una persona conceda N2 o N3 explícitamente.
 */
const QUEUE_NAME = 'organic-autonomy-pass'
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
const REPEATABLE_JOB_ID = 'organic-autonomy-pass-tick'
const reportAutonomyError = reportQueueError('OrganicAutonomyPass')

let organicAutonomyQueue: Queue | null = null
let organicAutonomyWorker: Worker | null = null

/** Organizaciones con proyecto orgánico: el resto no tiene nada que gobernar. */
async function organizationsWithOrganic(): Promise<string[]> {
  const projects = await prisma.organicProject.findMany({
    where: { isActive: true },
    select: { orgId: true },
  })
  return projects.map(project => project.orgId)
}

void (async () => {
  const connection = await connectOptionalRedis('OrganicAutonomyPass')
  if (!connection) return

  try {
    organicAutonomyQueue = new Queue(QUEUE_NAME, { connection: connection as any })
    organicAutonomyQueue.on('error', reportAutonomyError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    try {
      await organicAutonomyQueue.add('tick', {}, { repeat: { every: SYNC_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID })
    } catch (error) {
      reportAutonomyError(error as Error)
    }

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        for (const orgId of await organizationsWithOrganic()) {
          try {
            await enforceAutonomyGuardrails(orgId)
            await runAutonomyPass(orgId)
          } catch (error) {
            console.error(`[OrganicAutonomyPass] error en org ${orgId}:`, error)
          }
        }
      },
      { connection: connection as any, concurrency: 1 }
    )

    worker.on('failed', (job, error) => console.error(`[OrganicAutonomyPass] job ${job?.id} failed:`, error))
    worker.on('error', reportAutonomyError)
    organicAutonomyWorker = worker
  } catch (error) {
    reportAutonomyError(error as Error)
    connection.disconnect()
  }
})()

export { organicAutonomyQueue, organicAutonomyWorker }
