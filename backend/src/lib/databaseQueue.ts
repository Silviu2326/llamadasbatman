import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

const DEFAULT_LEASE_MS = Math.max(30_000, Number(process.env.WORKER_QUEUE_LEASE_MS ?? 5 * 60_000))
const DEFAULT_MAX_ATTEMPTS = Math.max(1, Number(process.env.WORKER_QUEUE_MAX_ATTEMPTS ?? 5))

export type DatabaseQueuePayload = Prisma.InputJsonObject

/** Datos del trabajo reclamado que el handler puede usar para ser idempotente. */
export interface DatabaseQueueJobMeta { jobId: string; attempts: number; maxAttempts: number; kind: string }

type DatabaseQueueHandler = (payload: DatabaseQueuePayload, meta: DatabaseQueueJobMeta) => Promise<void>

/**
 * Error que pide a la cola reencolar el trabajo con un retraso concreto en vez
 * de aplicar el backoff exponencial. Con `countAttempt: false` el reintento no
 * gasta `attempts` ni puede llevar el trabajo a `failed`: es la forma de decir
 * "ahora no, pero no es culpa del trabajo" (capacidad de la pasarela, fuera
 * de horario...). El límite de reintentos lo pone entonces quien lanza.
 */
export class QueueRetryError extends Error {
  readonly retryable = true
  readonly delayMs: number
  readonly countAttempt: boolean
  readonly code: string
  constructor(code: string, options: { delayMs: number; countAttempt?: boolean; message?: string }) {
    super(options.message ?? code)
    this.name = 'QueueRetryError'
    this.code = code
    this.delayMs = Math.max(0, Math.floor(options.delayMs))
    this.countAttempt = options.countAttempt ?? true
  }
}

export function isQueueRetryError(error: unknown): error is QueueRetryError {
  return error instanceof QueueRetryError
    || (typeof error === 'object' && error !== null && (error as { retryable?: unknown }).retryable === true
      && typeof (error as { delayMs?: unknown }).delayMs === 'number')
}

/**
 * Encola un trabajo. `dedupeKey` es único por cola (`@@unique([queue, dedupeKey])`
 * en `WorkerQueueJob`): mientras exista un trabajo con esa clave, encolar otra
 * vez no crea un segundo trabajo. Como los trabajos terminados se conservan,
 * la clave sigue ocupada después de `completed`/`failed`; con
 * `onFinished: 'requeue'` un trabajo ya terminado con esa clave se reactiva
 * (vuelve a `pending` con los intentos a cero) en vez de ignorarse. La forma
 * `lead-call:<leadId>:<campaignId>` es la que usa el despacho de campañas.
 */
export async function enqueueDatabaseJob(input: {
  queue: string
  kind: string
  payload: DatabaseQueuePayload
  dedupeKey?: string
  delayMs?: number
  maxAttempts?: number
  priority?: number
  onFinished?: 'ignore' | 'requeue'
}): Promise<boolean> {
  const dedupeKey = input.dedupeKey?.trim() || randomUUID()
  const availableAt = new Date(Date.now() + Math.max(0, input.delayMs ?? 0))
  try {
    await prisma.workerQueueJob.create({
      data: {
        queue: input.queue,
        kind: input.kind,
        payload: input.payload,
        dedupeKey,
        availableAt,
        priority: input.priority ?? 0,
        maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      },
    })
    return true
  } catch (error) {
    // Idempotent enqueue: a duplicate dedupe key means the original job is
    // already present and must not create a second call/automation run.
    if ((error as { code?: string }).code !== 'P2002') throw error
    if (input.onFinished !== 'requeue') return true
    // Solo se reactiva un trabajo terminado: uno pendiente o en curso ya
    // representa esta misma intención y no debe duplicarse.
    await prisma.workerQueueJob.updateMany({
      where: { queue: input.queue, dedupeKey, status: { in: ['completed', 'failed'] } },
      data: {
        kind: input.kind, payload: input.payload, status: 'pending', attempts: 0, availableAt,
        priority: input.priority ?? 0, maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        lockedAt: null, leaseExpiresAt: null, workerId: null, lastError: null, processedAt: null,
      },
    })
    return true
  }
}

async function claimDatabaseJob(queue: string, workerId: string, orgId?: string) {
  const now = new Date()
  const candidates = await prisma.workerQueueJob.findMany({
    where: {
      queue,
      ...(orgId ? { payload: { path: ['orgId'], equals: orgId } } : {}),
      OR: [
        { status: 'pending', availableAt: { lte: now } },
        { status: 'processing', leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 10,
  })

  for (const candidate of candidates) {
    const claimed = await prisma.workerQueueJob.updateMany({
      where: {
        id: candidate.id,
        ...(orgId ? { payload: { path: ['orgId'], equals: orgId } } : {}),
        OR: [
          { status: 'pending', availableAt: { lte: now } },
          { status: 'processing', leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: 'processing',
        attempts: { increment: 1 },
        lockedAt: now,
        leaseExpiresAt: new Date(now.getTime() + DEFAULT_LEASE_MS),
        workerId,
      },
    })
    if (claimed.count === 1) {
      return prisma.workerQueueJob.findUnique({ where: { id: candidate.id } })
    }
  }
  return null
}

async function finishDatabaseJob(id: string, workerId: string): Promise<void> {
  await prisma.workerQueueJob.updateMany({
    where: { id, status: 'processing', workerId },
    data: { status: 'completed', processedAt: new Date(), lockedAt: null, leaseExpiresAt: null, workerId: null, lastError: null },
  })
}

async function retryDatabaseJob(job: { id: string; attempts: number; maxAttempts: number }, workerId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 500) : 'Error desconocido en el worker'
  if (isQueueRetryError(error)) {
    // Reintento dirigido: el handler ya sabe cuándo volver a intentarlo. Si no
    // cuenta como intento, se devuelve el que consumió la reclamación.
    const countAttempt = error.countAttempt !== false
    const terminal = countAttempt && job.attempts >= job.maxAttempts
    await prisma.workerQueueJob.updateMany({
      where: { id: job.id, status: 'processing', workerId },
      data: {
        status: terminal ? 'failed' : 'pending',
        availableAt: terminal ? undefined : new Date(Date.now() + error.delayMs),
        ...(countAttempt ? {} : { attempts: { decrement: 1 } }),
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        lastError: message,
        processedAt: terminal ? new Date() : null,
      },
    })
    return
  }
  const terminal = job.attempts >= job.maxAttempts
  const delayMs = Math.min(60 * 60_000, 2 ** Math.max(0, job.attempts - 1) * 60_000)
  await prisma.workerQueueJob.updateMany({
    where: { id: job.id, status: 'processing', workerId },
    data: {
      status: terminal ? 'failed' : 'pending',
      availableAt: terminal ? undefined : new Date(Date.now() + delayMs),
      lockedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      lastError: message,
      processedAt: terminal ? new Date() : null,
    },
  })
}

/**
 * Consume la cola por sondeo. Un `tick` nunca se solapa con otro: mientras
 * haya `concurrency` trabajos en vuelo (uno por defecto: la pasarela de voz
 * admite una llamada), el sondeo no reclama nada más. Antes, cada intervalo
 * reclamaba otro trabajo aunque el anterior siguiera esperando a la pasarela,
 * y esa era la fuente de los rechazos por capacidad en cadena.
 */
export function startDatabaseQueueWorker(input: {
  queue: string
  handler: DatabaseQueueHandler
  pollMs?: number
  workerId?: string
  orgId?: string
  concurrency?: number
}): () => void {
  const workerId = input.workerId ?? `postgres-${input.queue}-${process.pid}`
  const concurrency = Math.max(1, Math.floor(input.concurrency ?? (Number(process.env.WORKER_QUEUE_CONCURRENCY ?? 1) || 1)))
  let inFlight = 0
  let claiming = false
  let stopped = false
  const run = async (job: NonNullable<Awaited<ReturnType<typeof claimDatabaseJob>>>) => {
    try {
      await input.handler(job.payload as DatabaseQueuePayload, { jobId: job.id, attempts: job.attempts, maxAttempts: job.maxAttempts, kind: job.kind })
      await finishDatabaseJob(job.id, workerId)
    } catch (error) {
      await retryDatabaseJob(job, workerId, error)
      const detail = error instanceof Error ? error.message : error
      if (isQueueRetryError(error)) console.warn(`[PostgresQueue:${input.queue}] job ${job.id} reencolado (${error.code}) en ${error.delayMs} ms`)
      else console.error(`[PostgresQueue:${input.queue}] job ${job.id} falló:`, detail)
    } finally { inFlight-- }
  }
  const tick = async () => {
    if (stopped || claiming || inFlight >= concurrency) return
    claiming = true
    try {
      while (!stopped && inFlight < concurrency) {
        const job = await claimDatabaseJob(input.queue, workerId, input.orgId)
        if (!job) return
        inFlight++
        void run(job).catch(error => console.error(`[PostgresQueue:${input.queue}] job ${job.id} no pudo cerrarse:`, error instanceof Error ? error.message : error))
      }
    } finally { claiming = false }
  }
  const timer = setInterval(() => { void tick().catch(error => console.error(`[PostgresQueue:${input.queue}] tick falló:`, error)) }, Math.max(500, input.pollMs ?? 5_000))
  timer.unref()
  void tick().catch(error => console.error(`[PostgresQueue:${input.queue}] primer tick falló:`, error))
  return () => { stopped = true; clearInterval(timer) }
}
