import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { redactProviderError } from '../lib/integrationRuntime'
import { releaseJob as releaseWalletHold } from '../services/wallet.service'
import {
  UNCERTAIN_EXTERNAL_OUTCOME,
  emitJobUpdate,
  getJobExecutor,
  hasJobExecutor,
} from '../services/jobs.service'

/**
 * Dispatcher del contrato universal de trabajo (02-FUNDAMENTOS §1), calcado
 * del patrón de outboxDispatcher.ts: Postgres es la fuente durable de verdad,
 * el claim es un UPDATE condicional y el lease renovable delimita la propiedad
 * frente a workers muertos. No hay broker: réplicas concurrentes compiten por
 * fila y el UPDATE decide un único ganador.
 */

const POLL_MS = Number(process.env.JOB_DISPATCHER_POLL_MS ?? 5_000)
const BATCH_SIZE = Math.max(1, Number(process.env.JOB_DISPATCHER_BATCH_SIZE ?? 10))
const LEASE_MS = Math.max(30_000, Number(process.env.JOB_DISPATCHER_LEASE_MS ?? 5 * 60_000))
// Rescate de trabajos remotos: un providerJobId cuyo webhook nunca llega no
// puede dejar el job `running` para siempre en el Centro de trabajos.
const PROVIDER_TIMEOUT_MS = Math.max(60 * 60_000, Number(process.env.JOB_PROVIDER_TIMEOUT_HOURS ?? 6) * 60 * 60_000)
const MAX_BACKOFF_MINUTES = 60
const WORKER_ID = process.env.JOB_DISPATCHER_WORKER_ID?.trim() || `jobs-${process.pid}-${randomUUID()}`

let running = false

/**
 * El modelo Job no tiene columna availableAt: para el backoff se reutiliza
 * leaseExpiresAt como "no elegible antes de" mientras la fila está `pending`.
 * Un `running` con lease caducado es un worker muerto y se recupera; un
 * `running` con providerJobId no tiene lease y NUNCA se reclama aquí — lo
 * cierra el webhook (completeProviderJob) o el rescate por timeout.
 */
function dueJobWhere(now: Date): Prisma.JobWhereInput {
  return {
    OR: [
      { status: 'pending', OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] },
      { status: 'running', providerJobId: null, leaseExpiresAt: { lte: now } },
    ],
  }
}

/** UPDATE condicional: la primitiva de claim concurrente, como en el outbox. */
export async function claimJob(jobId: string, workerId = WORKER_ID) {
  const now = new Date()
  const claimed = await prisma.job.updateMany({
    where: { id: jobId, ...dueJobWhere(now) },
    data: {
      status: 'running',
      attempts: { increment: 1 },
      startedAt: now,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      workerId,
    },
  })
  if (claimed.count !== 1) return null
  return prisma.job.findUnique({ where: { id: jobId } })
}

async function claimDueJobs(workerId = WORKER_ID, kinds?: string[]) {
  const now = new Date()
  const candidates = await prisma.job.findMany({
    where: { ...dueJobWhere(now), ...(kinds ? { kind: { in: kinds } } : {}) },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: BATCH_SIZE * 2,
    select: { id: true, kind: true },
  })
  // Un deploy viejo sin el ejecutor de un kind nuevo no reclama la fila: se
  // queda `pending` sin consumir intentos hasta que un worker que lo conozca
  // la recoja. Por eso el filtro va ANTES del claim.
  const known = candidates.filter(candidate => hasJobExecutor(candidate.kind))
  const claimed = await Promise.all(known.slice(0, BATCH_SIZE).map(candidate => claimJob(candidate.id, workerId)))
  return claimed.filter((job): job is NonNullable<typeof job> => Boolean(job)).slice(0, BATCH_SIZE)
}

async function renewJobLease(jobId: string, workerId: string): Promise<boolean> {
  const now = new Date()
  const renewed = await prisma.job.updateMany({
    where: { id: jobId, status: 'running', workerId, leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  })
  return renewed.count === 1
}

/** Mantiene viva la propiedad durante un ejecutor lento (mismo patrón outbox). */
async function withJobLease<T>(jobId: string, workerId: string, work: () => Promise<T>) {
  let leaseLost = false
  let renewal = Promise.resolve()
  const heartbeat = () => {
    renewal = renewal.then(async () => {
      try {
        if (!await renewJobLease(jobId, workerId)) leaseLost = true
      } catch {
        leaseLost = true
      }
    })
  }
  const timer = setInterval(heartbeat, Math.max(1_000, Math.floor(LEASE_MS / 3)))
  timer.unref()
  try {
    const value = await work()
    clearInterval(timer)
    await renewal
    return { value, leaseLost }
  } catch (error) {
    clearInterval(timer)
    await renewal
    throw error
  }
}

async function emitJobById(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (job) emitJobUpdate(job)
}

async function markJobSucceeded(
  jobId: string,
  workerId: string,
  result: { output?: unknown; costActualCents?: number },
): Promise<boolean> {
  const updated = await prisma.job.updateMany({
    // Condicional sobre el workerId: si el job fue cancelado o el lease lo
    // recuperó otro worker, este resultado ya no es el dueño y no escribe.
    where: { id: jobId, status: 'running', workerId },
    data: {
      status: 'succeeded',
      output: result.output === undefined ? undefined : result.output as Prisma.InputJsonValue,
      costActualCents: result.costActualCents,
      finishedAt: new Date(),
      leaseExpiresAt: null,
      workerId: null,
      nextPollAt: null,
    },
  })
  if (updated.count === 1) await emitJobById(jobId)
  return updated.count === 1
}

/**
 * El ejecutor envió el trabajo al proveedor: el job sigue `running` pero SIN
 * lease, así ningún worker queda ocupado ni lo reclama mientras el proveedor
 * procesa. Lo cierra el webhook o el rescate por PROVIDER_TIMEOUT.
 */
async function markJobWaitingProvider(
  jobId: string,
  workerId: string,
  result: { providerJobId: string; provider?: string },
): Promise<boolean> {
  const updated = await prisma.job.updateMany({
    where: { id: jobId, status: 'running', workerId },
    data: {
      status: 'waiting_provider',
      providerJobId: result.providerJobId,
      ...(result.provider ? { provider: result.provider } : {}),
      leaseExpiresAt: null,
      workerId: null,
      submittedAt: new Date(),
      nextPollAt: new Date(Date.now() + 5 * 60_000),
    },
  })
  if (updated.count === 1) await emitJobById(jobId)
  else {
    // El submit externo ya ocurrió, pero perdimos la propiedad antes de
    // correlacionarlo. Bloquear cualquier reejecución es más seguro que
    // generar otro render/cargo.
    const quarantined = await prisma.job.updateMany({
      where: { id: jobId, status: 'running', providerJobId: null },
      data: {
        status: 'failed',
        error: {
          code: UNCERTAIN_EXTERNAL_OUTCOME,
          message: 'El proveedor aceptó el trabajo, pero no se pudo persistir su identificador remoto.',
        },
        finishedAt: new Date(),
        leaseExpiresAt: null,
        workerId: null,
      },
    })
    if (quarantined.count === 1) await emitJobById(jobId)
  }
  return updated.count === 1
}

function thrownErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as Record<string, unknown>).code
  return typeof code === 'string' && code.length <= 80 ? code : null
}

/** Un resultado externo incierto requiere conciliación; liberar su reserva
 * inmediatamente permitiría gastar el mismo saldo mientras el proveedor
 * todavía puede confirmar un cargo. */
export function shouldReleaseWalletHoldForFailure(code: string | null, jobKind?: string): boolean {
  // Un manifiesto puede completar varios nodos antes de fallar. El hold se
  // conserva hasta conciliar sus UsageRecord y evitar doble gasto de saldo.
  if (jobKind === 'marketplace.run') return false
  return code !== UNCERTAIN_EXTERNAL_OUTCOME && code !== 'PROVIDER_TIMEOUT'
}

async function releaseJobForRetry(
  job: { id: string; orgId: string; kind: string; attempts: number; maxAttempts: number },
  workerId: string,
  error: unknown,
): Promise<void> {
  // Todo error de proveedor pasa por el redactor antes de persistirse: la
  // columna `error` llega tal cual a la UI y a los logs, nunca con secretos.
  const safeMessage = redactProviderError(error)
  const code = thrownErrorCode(error)

  // Regla del repo: efecto externo incierto → failed sin reintento automático,
  // sin importar cuántos intentos quedaran. Solo cabe revisión humana.
  const uncertain = code === UNCERTAIN_EXTERNAL_OUTCOME
  if (uncertain || job.attempts >= job.maxAttempts) {
    const failed = await prisma.job.updateMany({
      where: { id: job.id, status: 'running', workerId },
      data: {
        status: 'failed',
        error: { code: uncertain ? UNCERTAIN_EXTERNAL_OUTCOME : code ?? 'MAX_ATTEMPTS_EXCEEDED', message: safeMessage },
        finishedAt: new Date(),
        leaseExpiresAt: null,
        workerId: null,
      },
    })
    if (failed.count === 1) {
      if (shouldReleaseWalletHoldForFailure(uncertain ? UNCERTAIN_EXTERNAL_OUTCOME : code, job.kind)) {
        await releaseWalletHold({ orgId: job.orgId, jobId: job.id }).catch(() => undefined)
      }
      await emitJobById(job.id)
    }
    return
  }

  const delayMinutes = Math.min(MAX_BACKOFF_MINUTES, 2 ** Math.max(0, job.attempts - 1))
  const released = await prisma.job.updateMany({
    where: { id: job.id, status: 'running', workerId },
    data: {
      status: 'pending',
      // Sin columna availableAt: leaseExpiresAt hace de "no antes de" para
      // filas pending (ver dueJobWhere). El error se conserva como último
      // fallo visible mientras espera el reintento.
      leaseExpiresAt: new Date(Date.now() + delayMinutes * 60_000),
      error: { code: code ?? 'EXECUTOR_ERROR', message: safeMessage },
      startedAt: null,
      workerId: null,
    },
  })
  if (released.count === 1) await emitJobById(job.id)
}

/**
 * Rescate de trabajos remotos huérfanos: `running` con providerJobId cuyo
 * webhook no llegó en PROVIDER_TIMEOUT_MS. Se cierran como failed con código
 * propio; el resultado en el proveedor es incierto, así que el código NO es
 * reintentable en silencio desde la UI genérica.
 */
async function rescueTimedOutProviderJobs() {
  const threshold = new Date(Date.now() - PROVIDER_TIMEOUT_MS)
  const stale = await prisma.job.findMany({
    where: { status: { in: ['waiting_provider', 'cancel_requested'] }, providerJobId: { not: null }, submittedAt: { lt: threshold } },
    select: { id: true, orgId: true },
    take: BATCH_SIZE,
  })
  for (const job of stale) {
    const failed = await prisma.job.updateMany({
      where: { id: job.id, status: { in: ['waiting_provider', 'cancel_requested'] }, providerJobId: { not: null }, submittedAt: { lt: threshold } },
      data: {
        status: 'failed',
        error: { code: 'PROVIDER_TIMEOUT', message: 'El proveedor no confirmó el trabajo dentro del plazo esperado.' },
        finishedAt: new Date(),
        leaseExpiresAt: null,
        workerId: null,
      },
    })
    if (failed.count === 1) await emitJobById(job.id)
  }
}

async function dispatchPendingJobs(kinds?: string[]) {
  if (running) return
  running = true
  try {
    if (!kinds) await rescueTimedOutProviderJobs()
    const jobs = await claimDueJobs(WORKER_ID, kinds)
    for (const job of jobs) {
      emitJobUpdate(job)
      try {
        const executor = getJobExecutor(job.kind)
        // Entre el filtro y el claim no hay desregistro posible (el registro es
        // append-only por proceso), pero el tipo obliga a comprobarlo.
        if (!executor) continue
        const outcome = await withJobLease(job.id, WORKER_ID, () => executor(job))
        if (outcome.leaseLost) {
          // Otro worker ya es el dueño legítimo tras recuperar el lease: este
          // resultado se descarta y los UPDATE condicionales impiden pisarlo.
          console.warn(`[JobDispatcher] lease perdido en job ${job.id}; se descarta el resultado local`)
          continue
        }
        if (outcome.value.pending) {
          try {
            await markJobWaitingProvider(job.id, WORKER_ID, outcome.value)
          } catch (error) {
            // El proveedor ya aceptó el trabajo. Si falla la persistencia de
            // su id remoto, reintentar crearía otro efecto externo.
            const uncertain = new Error(`No se pudo persistir el trabajo remoto: ${redactProviderError(error)}`)
            ;(uncertain as Error & { code: string }).code = UNCERTAIN_EXTERNAL_OUTCOME
            throw uncertain
          }
        } else await markJobSucceeded(job.id, WORKER_ID, outcome.value)
      } catch (error) {
        await releaseJobForRetry(job, WORKER_ID, error)
      }
    }
  } catch (error) {
    console.error('[JobDispatcher] error en ciclo:', error)
  } finally {
    running = false
  }
}

let jobDispatcherTimer: NodeJS.Timeout | null = null
if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
  jobDispatcherTimer = setInterval(() => void dispatchPendingJobs(), POLL_MS)
  jobDispatcherTimer.unref()
  void dispatchPendingJobs()
}

export { dispatchPendingJobs, jobDispatcherTimer }
