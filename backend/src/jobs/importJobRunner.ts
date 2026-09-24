import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { createLead, ImportConsentDeclaration, ImportJobError, ImportJobRow, ImportJobRowsPayload, InvalidPhoneError, LeadDuplicateError } from '../services/leads.service'
import { enqueueCampaignLeadCall } from '../services/leadCallGate'
import { recordQueueEvent } from '../observability/metrics'
import { classifyOperationalError, logOperational } from '../observability/operationalLog'

/**
 * LE-103: procesa importaciones sin mantener un lock solo en memoria. Cada
 * proceso reclama una lease persistida y cualquier lease caducada se puede
 * recuperar después de una caída del worker.
 */
const POLL_MS = Number(process.env.IMPORT_JOB_POLL_MS ?? 3_000)
const BATCH_SIZE = 20
const LEASE_MS = Math.max(30_000, Number(process.env.IMPORT_JOB_LEASE_MS ?? 10 * 60_000))
const MAX_RETRIES = Math.max(1, Number(process.env.IMPORT_JOB_MAX_RETRIES ?? 8))
const MAX_BACKOFF_MINUTES = 60
const WORKER_ID = process.env.IMPORT_JOB_WORKER_ID?.trim() || `import-${process.pid}-${randomUUID()}`
let running = false

export function readRowsPayload(raw: unknown): ImportJobRowsPayload {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as any).items)) {
    const payload: ImportJobRowsPayload = { autoCall: Boolean((raw as any).autoCall), items: (raw as any).items as ImportJobRow[] }
    const consent = (raw as any).consent
    if (consent && typeof consent === 'object' && consent.voice === true) {
      payload.consent = {
        voice: true,
        source: typeof consent.source === 'string' ? consent.source : undefined,
        evidence: typeof consent.evidence === 'string' ? consent.evidence : undefined,
      }
    }
    if ((raw as any).attachExistingToCampaign === true) payload.attachExistingToCampaign = true
    return payload
  }
  return { autoCall: false, items: [] }
}

/**
 * Consentimiento de voz que se pasa a createLead para una fila: la columna
 * `consent_voice` de la fila manda; si no existe, se aplica la declaración
 * del lote (casilla del modal). Sin ninguna de las dos, no se registra nada.
 */
export function resolveRowConsent(item: ImportJobRow, batch?: ImportConsentDeclaration): { voice: true; source: string; evidence?: string } | undefined {
  if (item.consentVoice === true) {
    return {
      voice: true,
      source: item.consentSource || batch?.source || 'import_row',
      evidence: item.consentEvidence || batch?.evidence,
    }
  }
  if (item.consentVoice === false) return undefined
  if (batch?.voice) return { voice: true, source: batch.source || 'import_declaration', evidence: batch.evidence }
  return undefined
}

export type ImportRowOutcome = 'created' | 'replayed' | 'existing'

function readErrors(raw: unknown): ImportJobError[] {
  return Array.isArray(raw) ? (raw as ImportJobError[]) : []
}

function dueImportJobWhere(now: Date): Prisma.ImportJobWhereInput {
  return {
    OR: [
      { status: 'pending', availableAt: { lte: now } },
      // Null leases cover jobs started by versions deployed before this
      // migration; they are explicitly recoverable rather than stranded.
      { status: 'processing', OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }] },
    ],
  }
}

/** Atomic conditional claim: concurrent workers cannot own the same job. */
export async function claimImportJob(workerId = WORKER_ID) {
  const now = new Date()
  const candidate = await prisma.importJob.findFirst({
    where: dueImportJobWhere(now),
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!candidate) return null

  const claimed = await prisma.importJob.updateMany({
    where: { id: candidate.id, ...dueImportJobWhere(now) },
    data: {
      status: 'processing',
      startedAt: now,
      lockedAt: now,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      workerId,
    },
  })
  if (claimed.count !== 1) {
    recordQueueEvent({ queue: 'imports', outcome: 'claim_conflict' })
    return null
  }
  recordQueueEvent({ queue: 'imports', outcome: 'claimed' })
  return prisma.importJob.findUnique({ where: { id: candidate.id } })
}

async function renewImportJobLease(jobId: string, workerId: string): Promise<boolean> {
  const now = new Date()
  const renewed = await prisma.importJob.updateMany({
    where: { id: jobId, status: 'processing', workerId, leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  })
  return renewed.count === 1
}

async function withImportJobLease<T>(jobId: string, workerId: string, work: () => Promise<T>) {
  let leaseLost = false
  let renewal = Promise.resolve()
  const heartbeat = () => {
    renewal = renewal.then(async () => {
      try {
        if (!await renewImportJobLease(jobId, workerId)) leaseLost = true
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

function importRowExternalId(jobId: string, row: number) {
  // Lead.orgId + externalLeadId is unique. This turns a crash between
  // creating a lead and advancing processedRows into a harmless replay.
  return `import:${jobId}:row:${row}`
}

export async function importOneRow(
  job: { id: string; orgId: string; createdById: string | null; campaignId: string | null },
  item: ImportJobRow,
  autoCall: boolean,
  options: { consent?: ImportConsentDeclaration; attachExistingToCampaign?: boolean } = {},
): Promise<ImportRowOutcome> {
  if (!item.name) throw new Error('name es requerido')
  const externalLeadId = importRowExternalId(job.id, item.row)
  let lead = await prisma.lead.findUnique({
    where: { orgId_externalLeadId: { orgId: job.orgId, externalLeadId } },
    select: { id: true },
  })
  if (lead) return 'replayed'

  try {
    // strict: teléfono no interpretable → InvalidPhoneError; lead ya
    // existente por teléfono E.164 o email → LeadDuplicateError (se reporta
    // como «ya existía», no se crea otro).
    lead = await createLead(job.orgId, job.createdById, {
      name: item.name,
      phone: item.phone,
      email: item.email,
      company: item.company,
      campaignId: job.campaignId ?? undefined,
      source: 'import',
      externalLeadId,
      consent: resolveRowConsent(item, options.consent),
    }, { strict: true })
  } catch (error: any) {
    if (error instanceof InvalidPhoneError) throw new Error(`invalid_phone: ${error.phone}`)
    if (error instanceof LeadDuplicateError) {
      if (options.attachExistingToCampaign && job.campaignId) {
        const attached = await prisma.lead.updateMany({
          where: { id: error.existingLeadId, orgId: job.orgId, campaignId: null },
          data: { campaignId: job.campaignId },
        })
        if (attached.count) await prisma.campaign.updateMany({ where: { id: job.campaignId, orgId: job.orgId }, data: { totalLeads: { increment: 1 } } })
      }
      throw new ImportRowExistsError(error.existingLeadId, error.matchedBy)
    }
    // Another worker can only reach this branch after a lease expiry. The
    // database unique constraint is the final idempotency fence.
    if (error?.code !== 'P2002') throw error
    lead = await prisma.lead.findUnique({
      where: { orgId_externalLeadId: { orgId: job.orgId, externalLeadId } },
      select: { id: true },
    })
    if (!lead) throw error
    return 'replayed'
  }
  // Queue an automatic call only for the worker that created this exact lead.
  // A replay sees the same deterministic externalLeadId and never enqueues a
  // second call. Same gate and dedupeKey as the voice-consent path in
  // orchestrateNewLead: consent + autoCall on one row is still one job.
  if (autoCall) await enqueueCampaignLeadCall(job.orgId, lead.id).catch(() => {})
  return 'created'
}

/** Fila cuyo contacto ya existía en la organización: se cuenta como omitida, no como error. */
export class ImportRowExistsError extends Error {
  constructor(public existingLeadId: string, public matchedBy: 'phone' | 'email') {
    super(`already_exists: ${matchedBy === 'phone' ? 'mismo teléfono' : 'mismo email'} (lead ${existingLeadId})`)
    this.name = 'ImportRowExistsError'
  }
}

async function releaseImportJobForRetry(
  job: { id: string; retryCount: number },
  workerId: string,
  error: unknown
): Promise<void> {
  const message = (error as Error).message || 'Error desconocido procesando la importación'
  const classified = classifyOperationalError(error)
  const nextRetry = job.retryCount + 1
  if (nextRetry >= MAX_RETRIES) {
    await prisma.importJob.updateMany({
      where: { id: job.id, status: 'processing', workerId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errors: [{ row: 0, message: `WORKER_RETRIES_EXHAUSTED: ${classified.safeMessage}` }] as any,
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        retryCount: { increment: 1 },
      },
    })
    recordQueueEvent({ queue: 'imports', outcome: 'dead_letter' })
    logOperational('error', 'import.dead_letter', { queue: 'imports', jobId: job.id, attempt: nextRetry, errorCode: 'MAX_ATTEMPTS_EXCEEDED', remediation: classified.remediation })
    return
  }
  const delayMinutes = Math.min(MAX_BACKOFF_MINUTES, 2 ** Math.max(0, nextRetry - 1))
  await prisma.importJob.updateMany({
    where: { id: job.id, status: 'processing', workerId },
    data: {
      status: 'pending',
      availableAt: new Date(Date.now() + delayMinutes * 60_000),
      lockedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      retryCount: { increment: 1 },
    },
  })
  recordQueueEvent({ queue: 'imports', outcome: 'retry' })
  logOperational('warn', 'import.retry.scheduled', { queue: 'imports', jobId: job.id, attempt: nextRetry, errorCode: classified.code, remediation: classified.remediation })
}

async function processImportJobTick() {
  if (running) return
  running = true
  let job: Awaited<ReturnType<typeof claimImportJob>> = null
  try {
    job = await claimImportJob(WORKER_ID)
    if (!job) return

    const outcome = await withImportJobLease(job.id, WORKER_ID, async () => {
      const { autoCall, items, consent, attachExistingToCampaign } = readRowsPayload(job!.rows)
      const batch = items.slice(job!.processedRows, job!.processedRows + BATCH_SIZE)
      let importedDelta = 0
      let skippedDelta = 0
      const newErrors: ImportJobError[] = []

      for (const item of batch) {
        try {
          await importOneRow(job!, item, autoCall, { consent, attachExistingToCampaign })
          importedDelta++
        } catch (error) {
          // «Ya existía» se lista para que el usuario lo vea, pero cuenta como
          // omitido (igual que los duplicados dentro del archivo), no como error.
          if (error instanceof ImportRowExistsError) skippedDelta++
          newErrors.push({ row: item.row, message: (error as Error).message || 'Error al importar la fila' })
        }
      }

      const processedRows = job!.processedRows + batch.length
      const importedCount = job!.importedCount + importedDelta
      const skippedCount = job!.skippedCount + skippedDelta
      const errorCount = job!.errorCount + (newErrors.length - skippedDelta)
      const finished = processedRows >= job!.totalRows
      const status = finished
        ? (job!.totalRows > 0 && errorCount === job!.totalRows ? 'failed' : 'completed')
        : 'processing'
      return { processedRows, importedCount, skippedCount, errorCount, finished, status, newErrors }
    })

    if (outcome.leaseLost) {
      recordQueueEvent({ queue: 'imports', outcome: 'lease_lost' })
      logOperational('warn', 'import.lease.lost', { queue: 'imports', jobId: job.id, remediation: 'Esperar la recuperación condicional y comprobar latencia de PostgreSQL.' })
      console.warn(`[ImportJobRunner] lease perdida para ${job.id}; el siguiente worker reanudará filas idempotentemente`)
      return
    }

    const result = outcome.value
    const updated = await prisma.importJob.updateMany({
      where: { id: job.id, status: 'processing', workerId: WORKER_ID },
      data: {
        processedRows: result.processedRows,
        importedCount: result.importedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        errors: [...readErrors(job.errors), ...result.newErrors] as any,
        status: result.status,
        finishedAt: result.finished ? new Date() : null,
        availableAt: result.finished ? job.availableAt : new Date(),
        retryCount: 0,
        ...(result.finished ? { lockedAt: null, leaseExpiresAt: null, workerId: null } : {}),
      },
    })
    if (!updated.count || !result.finished) return

    await writeAuditLog({
      orgId: job.orgId,
      actorUserId: job.createdById,
      action: 'lead.import',
      entityType: 'ImportJob',
      entityId: job.id,
      after: { importedCount: result.importedCount, errorCount: result.errorCount, skippedCount: result.skippedCount, totalRows: job.totalRows, campaignId: job.campaignId },
    })
  } catch (error) {
    if (job) await releaseImportJobForRetry(job, WORKER_ID, error)
    recordQueueEvent({ queue: 'imports', outcome: 'tick_error' })
    const classified = classifyOperationalError(error)
    logOperational('error', 'import.tick.failed', { queue: 'imports', errorCode: classified.code, remediation: classified.remediation })
    console.error('[ImportJobRunner] tick failed:', (error as Error).message)
  } finally {
    running = false
  }
}

let importJobTimer: NodeJS.Timeout | null = null
if (process.env.BACKGROUND_WORKERS_ENABLED === 'true') {
  importJobTimer = setInterval(() => void processImportJobTick(), POLL_MS)
  importJobTimer.unref()
  void processImportJobTick()
}

export { processImportJobTick, importJobTimer }
