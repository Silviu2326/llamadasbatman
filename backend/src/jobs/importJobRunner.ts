import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { createLead, ImportJobError, ImportJobRow, ImportJobRowsPayload } from '../services/leads.service'
import { enqueueLeadCall } from '../services/leadIngestion.service'

/**
 * LE-103: procesador en background de ImportJob (mismo patrón que
 * outboxDispatcher.ts — poll + claim atómico vía updateMany). BATCH_SIZE
 * acota cuántas filas se procesan por tick para no bloquear el worker mucho
 * tiempo en un solo ImportJob grande; un job con más filas que BATCH_SIZE
 * simplemente sigue 'processing' y se retoma en el siguiente tick.
 */
const POLL_MS = Number(process.env.IMPORT_JOB_POLL_MS ?? 3_000)
const BATCH_SIZE = 20
let running = false

function readRowsPayload(raw: unknown): ImportJobRowsPayload {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as any).items)) {
    return { autoCall: Boolean((raw as any).autoCall), items: (raw as any).items as ImportJobRow[] }
  }
  return { autoCall: false, items: [] }
}

function readErrors(raw: unknown): ImportJobError[] {
  return Array.isArray(raw) ? (raw as ImportJobError[]) : []
}

/** Reclama el ImportJob 'processing' en curso, o toma el siguiente 'pending' (claim atómico). */
async function claimImportJob() {
  const inProgress = await prisma.importJob.findFirst({
    where: { status: 'processing' },
    orderBy: { createdAt: 'asc' },
  })
  if (inProgress) return inProgress

  const pending = await prisma.importJob.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })
  if (!pending) return null

  const claimed = await prisma.importJob.updateMany({
    where: { id: pending.id, status: 'pending' },
    data: { status: 'processing', startedAt: new Date() },
  })
  if (!claimed.count) return null
  return prisma.importJob.findUnique({ where: { id: pending.id } })
}

async function processImportJobTick() {
  if (running) return
  running = true
  try {
    const job = await claimImportJob()
    if (!job) return

    const { autoCall, items } = readRowsPayload(job.rows)
    const batch = items.slice(job.processedRows, job.processedRows + BATCH_SIZE)

    let importedDelta = 0
    const newErrors: ImportJobError[] = []

    for (const item of batch) {
      try {
        if (!item.name) throw new Error('name es requerido')
        const lead = await createLead(job.orgId, job.createdById, {
          name: item.name,
          phone: item.phone,
          email: item.email,
          company: item.company,
          campaignId: job.campaignId ?? undefined,
          source: 'import',
        })
        importedDelta++
        if (autoCall) await enqueueLeadCall(job.orgId, lead.id).catch(() => {})
      } catch (error) {
        newErrors.push({ row: item.row, message: (error as Error).message || 'Error al importar la fila' })
      }
    }

    const processedRows = job.processedRows + batch.length
    const importedCount = job.importedCount + importedDelta
    const errorCount = job.errorCount + newErrors.length
    const finished = processedRows >= job.totalRows
    // errorCount solo cuenta fallos de procesamiento (no los duplicados de
    // archivo, ya contados en skippedCount) — si todas las filas a procesar
    // fallaron, el job se marca 'failed' en vez de 'completed'.
    const status = finished
      ? (job.totalRows > 0 && errorCount === job.totalRows ? 'failed' : 'completed')
      : 'processing'

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        processedRows,
        importedCount,
        errorCount,
        errors: [...readErrors(job.errors), ...newErrors] as any,
        status,
        finishedAt: finished ? new Date() : null,
      },
    })

    if (finished) {
      await writeAuditLog({
        orgId: job.orgId,
        actorUserId: job.createdById,
        action: 'lead.import',
        entityType: 'ImportJob',
        entityId: job.id,
        after: { importedCount, errorCount, skippedCount: job.skippedCount, totalRows: job.totalRows, campaignId: job.campaignId },
      })
    }
  } catch (error) {
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
