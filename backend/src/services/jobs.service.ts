import { Prisma } from '@prisma/client'
import type { Job } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { emitToOrg } from '../websockets/index'
import { releaseJob, reserveForJob, settleJob, WalletError } from './wallet.service'

/**
 * Contrato universal de trabajo (docs/plataforma-abierta/02-FUNDAMENTOS.md §1).
 *
 * Este servicio es la única puerta de entrada y de salida del modelo `Job`:
 * los dominios registran ejecutores por `kind`, crean filas en `pending` y el
 * dispatcher (src/jobs/jobDispatcher.ts) las reclama con lease. Los trabajos
 * asíncronos en el proveedor se cierran por webhook vía `completeProviderJob`.
 */

export const JOB_STATUSES = [
  'pending',
  'running',
  'waiting_provider',
  'awaiting_approval',
  'succeeded',
  'failed',
  'cancel_requested',
  'canceled',
] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

// Estados desde los que un job ya no puede moverse. `awaiting_approval` no es
// terminal: espera decisión humana, y cancelarlo sí está permitido.
const TERMINAL_STATUSES: readonly JobStatus[] = ['succeeded', 'failed', 'canceled']

// Regla del repo (heredada de automations.service.ts): un fallo cuyo efecto
// externo es incierto nunca se reintenta en silencio. Queda `failed` con este
// código y solo cabe revisión humana, no `retryJob`.
export const UNCERTAIN_EXTERNAL_OUTCOME = 'UNCERTAIN_EXTERNAL_OUTCOME'

export type JobExecutorResult =
  // Trabajo síncrono: el ejecutor terminó y el dispatcher persiste el cierre.
  | { pending?: undefined; output?: unknown; costActualCents?: number }
  // Trabajo asíncrono en el proveedor: el job queda `running` sin lease con
  // este providerJobId y lo cierra el webhook (completeProviderJob).
  | { pending: true; providerJobId: string; provider?: string }

export type JobExecutor = (job: Job) => Promise<JobExecutorResult>

// Registro en memoria por proceso. Un deploy viejo que no conozca un `kind`
// simplemente no lo reclama: la fila espera en `pending` sin consumir intentos.
const executors = new Map<string, JobExecutor>()

export function registerJobExecutor(kind: string, executor: JobExecutor): void {
  // Dos dominios registrando el mismo kind es un bug de arranque, no una
  // condición operativa: mejor reventar en el import que pisarse en silencio.
  if (executors.has(kind)) throw new Error(`Ejecutor duplicado para kind "${kind}"`)
  executors.set(kind, executor)
}

export function hasJobExecutor(kind: string): boolean {
  return executors.has(kind)
}

export function getJobExecutor(kind: string): JobExecutor | undefined {
  return executors.get(kind)
}

/** Solo para tests: el registro es estado de módulo y debe poder resetearse. */
export function unregisterJobExecutor(kind: string): void {
  executors.delete(kind)
}

function errorCode(error: Prisma.JsonValue | null): string | null {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return null
  const code = (error as Record<string, unknown>).code
  return typeof code === 'string' ? code : null
}

/** Un job `failed` solo es reintentable si su efecto externo no quedó en duda. */
export function isRetryableJobError(error: Prisma.JsonValue | null): boolean {
  return ![UNCERTAIN_EXTERNAL_OUTCOME, 'PROVIDER_TIMEOUT'].includes(errorCode(error) ?? '')
}

/**
 * Proyección ligera para el socket y los listados: nunca incluye input/output
 * completos, que pueden pesar (prompts, referencias a assets, decisiones del
 * router) y no aportan nada a una fila de la cola.
 */
export function jobSummary(job: Job) {
  return {
    id: job.id,
    orgId: job.orgId,
    kind: job.kind,
    status: job.status,
    priority: job.priority,
    provider: job.provider,
    providerJobId: job.providerJobId,
    costEstimateCents: job.costEstimateCents == null ? null : Number(job.costEstimateCents),
    costActualCents: job.costActualCents == null ? null : Number(job.costActualCents),
    error: job.error,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdById: job.createdById,
    microappId: job.microappId,
    flowRunId: job.flowRunId,
    parentJobId: job.parentJobId,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    submittedAt: job.submittedAt,
    nextPollAt: job.nextPollAt,
    progress: job.progress,
    cancelRequestedAt: job.cancelRequestedAt,
    canceledAt: job.canceledAt,
    finishedAt: job.finishedAt,
  }
}

/**
 * Notifica cada transición de estado a la sala org:<orgId>. Tolerante por
 * diseño: en el proceso worker el servidor de sockets no está inicializado y
 * emitToOrg ya es un no-op; cualquier otra sorpresa tampoco puede tumbar la
 * transición que la origina.
 */
export function emitJobUpdate(job: Job): void {
  try {
    emitToOrg(job.orgId, 'job:update', jobSummary(job))
  } catch (error) {
    console.warn('[Jobs] no se pudo emitir job:update:', (error as Error).message)
  }
}

export type CreateJobParams = {
  orgId: string
  kind: string
  input: Prisma.InputJsonValue
  createdById?: string
  microappId?: string
  flowRunId?: string
  parentJobId?: string
  priority?: number
  costEstimateCents?: number
  maxAttempts?: number
  idempotencyKey?: string
}

/**
 * Crea la fila en `pending`. Exigir ejecutor registrado en el proceso que crea
 * el job evita colas fantasma por un `kind` mal escrito; el caso legítimo de
 * "el worker nuevo lo conoce y la API vieja no" se resuelve desplegando la API
 * con el registro del kind (los registros viven en módulos compartidos).
 */
export async function createJob(params: CreateJobParams): Promise<Job> {
  if (!hasJobExecutor(params.kind)) {
    throw new Error(`No hay ejecutor registrado para kind "${params.kind}"`)
  }
  const idempotencyKey = params.idempotencyKey?.trim() || undefined
  if (idempotencyKey && idempotencyKey.length > 240) throw new Error('idempotencyKey de job demasiado larga')
  let job: Job
  try {
    job = await prisma.job.create({
      data: {
      orgId: params.orgId,
      kind: params.kind,
      status: 'pending',
      input: params.input,
      createdById: params.createdById,
      microappId: params.microappId,
      flowRunId: params.flowRunId,
      parentJobId: params.parentJobId,
      priority: params.priority ?? 0,
      costEstimateCents: params.costEstimateCents,
      idempotencyKey,
      ...(params.maxAttempts !== undefined ? { maxAttempts: Math.max(1, params.maxAttempts) } : {}),
      },
    })
  } catch (error) {
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.job.findUnique({
        where: { orgId_kind_idempotencyKey: { orgId: params.orgId, kind: params.kind, idempotencyKey } },
      })
      if (existing) return existing
    }
    throw error
  }
  emitJobUpdate(job)
  return job
}

export type CompleteProviderJobParams = {
  provider: string
  providerJobId: string
  output?: Prisma.InputJsonValue
  error?: { code: string; message: string }
  costActualCents?: number
}

function jobUsesManagedWallet(job: Job): boolean {
  if (process.env.WALLET_ENFORCEMENT?.trim().toLowerCase() !== 'on') return false
  if (!job.input || typeof job.input !== 'object' || Array.isArray(job.input)) return false
  const routing = (job.input as Record<string, unknown>)._routing
  return Boolean(routing && typeof routing === 'object' && !Array.isArray(routing)
    && (routing as Record<string, unknown>).billingMode === 'managed')
}

/**
 * Punto de entrada de los webhooks de proveedores (Runway, Magnific...).
 * Idempotente: los proveedores reenvían webhooks, así que solo la transición
 * condicional desde `running` escribe; un segundo aviso encuentra el job ya
 * terminado y no hace nada.
 */
export async function completeProviderJob(params: CompleteProviderJobParams): Promise<Job | null> {
  const job = await prisma.job.findFirst({
    where: { provider: params.provider, providerJobId: params.providerJobId },
  })
  if (!job) return null
  if (TERMINAL_STATUSES.includes(job.status as JobStatus)) return job

  const failed = Boolean(params.error)
  const updated = await prisma.job.updateMany({
    // La condición sobre `running` es la barrera de idempotencia real frente a
    // dos webhooks concurrentes: solo uno gana el UPDATE.
    where: { id: job.id, status: { in: ['running', 'waiting_provider', 'cancel_requested'] } },
    data: {
      status: failed ? 'failed' : 'succeeded',
      output: params.output,
      error: failed ? params.error : undefined,
      costActualCents: params.costActualCents,
      finishedAt: new Date(),
      leaseExpiresAt: null,
      workerId: null,
      nextPollAt: null,
    },
  })
  if (updated.count !== 1) return job

  const closed = await prisma.job.findUnique({ where: { id: job.id } })
  if (closed) {
    if (jobUsesManagedWallet(closed)) {
      try {
        if (failed) {
          await releaseJob({ orgId: closed.orgId, jobId: closed.id })
        } else {
          const actual = params.costActualCents
            ?? (closed.costEstimateCents == null ? 0 : Number(closed.costEstimateCents))
          await settleJob({ orgId: closed.orgId, jobId: closed.id, actualCents: Math.ceil(actual) })
        }
      } catch (error) {
        // El efecto externo ya terminó: nunca se reabre/repite por un fallo
        // contable. El hold/transacción quedan visibles para conciliación.
        if (!(error instanceof WalletError && error.code === 'WALLET_HOLD_NOT_FOUND')) {
          console.error(`[Jobs] no se pudo liquidar wallet del job remoto ${closed.id}:`, (error as Error).message)
        }
      }
    }
    emitJobUpdate(closed)
  }
  return closed
}

/** Confirma una cancelación solicitada después de que el proveedor la acepte. */
export async function confirmProviderJobCanceled(provider: string, providerJobId: string): Promise<Job | null> {
  const candidate = await prisma.job.findFirst({
    where: { provider, providerJobId, status: 'cancel_requested' },
  })
  if (!candidate) return null
  const now = new Date()
  const changed = await prisma.job.updateMany({
    where: { id: candidate.id, orgId: candidate.orgId, provider, providerJobId, status: 'cancel_requested' },
    data: { status: 'canceled', canceledAt: now, finishedAt: now, nextPollAt: null, leaseExpiresAt: null, workerId: null },
  })
  if (changed.count !== 1) return prisma.job.findUnique({ where: { id: candidate.id } })
  const canceled = await prisma.job.findUnique({ where: { id: candidate.id } })
  if (canceled) {
    if (jobUsesManagedWallet(canceled)) await releaseJob({ orgId: canceled.orgId, jobId: canceled.id }).catch(() => undefined)
    emitJobUpdate(canceled)
  }
  return canceled
}

/**
 * Cancelación best effort: solo aborta lo que aún no terminó. Un job `running`
 * puede estar ejecutándose en este mismo instante; el dispatcher detecta al
 * persistir el resultado que perdió la fila (UPDATE condicional) y no pisa la
 * cancelación. Lo ya enviado a un proveedor externo no se aborta remotamente.
 */
export async function cancelJob(orgId: string, jobId: string): Promise<Job | null> {
  const now = new Date()
  const canceled = await prisma.job.updateMany({
    where: { id: jobId, orgId, status: { in: ['pending', 'running', 'awaiting_approval'] }, providerJobId: null },
    data: { status: 'canceled', canceledAt: now, finishedAt: now, leaseExpiresAt: null, workerId: null },
  })
  if (canceled.count !== 1) {
    // Un trabajo ya enviado no se finge cancelado: queda solicitado hasta que
    // el adapter confirme la cancelación o llegue el resultado real.
    const requested = await prisma.job.updateMany({
      where: { id: jobId, orgId, status: 'waiting_provider', providerJobId: { not: null } },
      data: { status: 'cancel_requested', cancelRequestedAt: now },
    })
    if (requested.count !== 1) return null
  }

  let job = await prisma.job.findUnique({ where: { id: jobId } })
  if (job?.status === 'cancel_requested' && job.provider === 'runway' && job.providerJobId) {
    try {
      const [{ cancelRunwayTask }, { resolveProviderCredential }] = await Promise.all([
        import('../providers/adapters/runway'),
        import('../providers/credentials'),
      ])
      const credential = await resolveProviderCredential(orgId, 'runway')
      const key = credential?.secret?.apiKey?.trim() || process.env.RUNWAYML_API_SECRET?.trim()
      if (key) {
        await cancelRunwayTask(key, job.providerJobId)
        job = await confirmProviderJobCanceled('runway', job.providerJobId) ?? job
      }
    } catch (error) {
      // Best effort real: el estado cancel_requested conserva el hold y el
      // poller seguirá observando el task. Nunca fingimos cancelación remota.
      console.warn(`[Jobs] Runway no confirmó la cancelación del job ${jobId}:`, (error as Error).message)
    }
  }
  if (job) {
    if (job.status === 'canceled' && jobUsesManagedWallet(job)) {
      await releaseJob({ orgId, jobId }).catch(error => {
        console.error(`[Jobs] no se pudo liberar wallet del job cancelado ${jobId}:`, (error as Error).message)
      })
    }
    emitJobUpdate(job)
  }
  return job
}

/**
 * Reintento manual de un job `failed`. Los intentos automáticos los contabiliza
 * el dispatcher; aquí solo se devuelve la fila a `pending` con el contador tal
 * cual (el humano ya decidió que merece otra ronda). Un fallo con efecto
 * externo incierto no pasa por aquí jamás: repetirlo podría duplicar el efecto.
 */
export async function retryJob(orgId: string, jobId: string): Promise<Job | null> {
  const job = await prisma.job.findFirst({ where: { id: jobId, orgId } })
  if (!job || job.status !== 'failed') return null
  // Las recetas marketplace pueden haber producido efectos/coste entre el
  // callback del proveedor y el último checkpoint. Nunca se reejecutan sobre
  // el mismo Job; el usuario puede iniciar una ejecución nueva y explícita.
  if (job.kind === 'marketplace.run') return null
  if (!isRetryableJobError(job.error)) return null

  const previousHold = await prisma.walletHold.findUnique({ where: { jobId } })
  if (previousHold && previousHold.status !== 'captured') {
    await reserveForJob({ orgId, jobId, amountCents: previousHold.amountCents })
  } else if (jobUsesManagedWallet(job) && job.costEstimateCents != null) {
    await reserveForJob({ orgId, jobId, amountCents: Math.ceil(Number(job.costEstimateCents)) })
  }

  const retried = await prisma.job.updateMany({
    // Condicional sobre `failed`: dos clics de reintento concurrentes solo
    // producen una vuelta a la cola.
    where: { id: jobId, orgId, status: 'failed' },
    data: {
      status: 'pending',
      error: Prisma.JsonNull,
      output: Prisma.JsonNull,
      providerJobId: null,
      submittedAt: null,
      nextPollAt: null,
      progress: null,
      cancelRequestedAt: null,
      canceledAt: null,
      startedAt: null,
      finishedAt: null,
      leaseExpiresAt: null,
      workerId: null,
    },
  })
  if (retried.count !== 1) return null

  const pending = await prisma.job.findUnique({ where: { id: jobId } })
  if (pending) emitJobUpdate(pending)
  return pending
}
