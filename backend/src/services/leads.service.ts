import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { LeadStatus } from '@prisma/client'
import { auditBusiness } from './digitalAudit.service'
import { getPresignedUrl, putObject } from '../lib/s3'
import { syncContact } from './mauticSync.service'
import { writeAuditLog } from '../lib/audit'
import { logSalesActivity } from '../lib/salesActivity'
import { orchestrateNewLead, ChannelConsentInput } from './conversations.service'

/** LE-101: campos permitidos para ordenar server-side; 'campo:direccion'. */
const SORTABLE_LEAD_FIELDS = new Set(['createdAt', 'updatedAt', 'name'])

/**
 * LE-106: SLA de primera respuesta simplificado (horas reales, sin
 * calendario laboral). Un lead está "sin primera respuesta" cuando
 * `firstRespondedAt` es null y ya pasaron más de estas horas desde su alta.
 * No se persiste como `dueAt`: se deriva en cada lectura para no tener que
 * mantenerlo sincronizado.
 */
const FIRST_RESPONSE_SLA_HOURS = 4

function isFirstResponseOverdue(lead: { firstRespondedAt: Date | null; createdAt: Date }): boolean {
  if (lead.firstRespondedAt) return false
  const elapsedMs = Date.now() - lead.createdAt.getTime()
  return elapsedMs > FIRST_RESPONSE_SLA_HOURS * 60 * 60 * 1000
}

interface LeadFilters {
  campaignId?: string
  status?: LeadStatus
  search?: string
  source?: string
  /** LE-106: filtra por propietario, p.ej. para el toggle "mis leads". */
  ownerId?: string
  /** Formato 'campo:asc' | 'campo:desc', campo en SORTABLE_LEAD_FIELDS. */
  sort?: string
  page?: number
  limit?: number
}

/** Errores de dominio para que el controller pueda mapear a códigos HTTP (P0-01/P0-02). */
export class OwnershipError extends Error {
  constructor(public field: string) {
    super(`${field} no pertenece a la organización`)
    this.name = 'OwnershipError'
  }
}

export class LeadNotFoundError extends Error {
  constructor() {
    super('Lead not found')
    this.name = 'LeadNotFoundError'
  }
}

/**
 * Valida que una referencia externa recibida del cliente (campaignId) exista
 * y pertenezca a la organización antes de dejarla tocar la base (P0-01/VE-01).
 * `campaignId` ausente o vacío no es un error: la campaña es opcional.
 */
async function assertOwnedCampaign(orgId: string, campaignId?: string | null) {
  if (!campaignId) return
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId }, select: { id: true } })
  if (!campaign) throw new OwnershipError('campaignId')
}

/** Valida que la Account referenciada (accountId) pertenezca a la organización, mismo patrón que assertOwnedCampaign. */
async function assertOwnedAccount(orgId: string, accountId?: string | null) {
  if (!accountId) return
  const account = await prisma.account.findFirst({ where: { id: accountId, orgId }, select: { id: true } })
  if (!account) throw new OwnershipError('accountId')
}

/**
 * LE-101/LE-102: construye el `where`/`orderBy` de Prisma compartido entre
 * `listLeads()` (paginado) y `exportLeadsCsv()` (sin paginar) para que ambos
 * apliquen exactamente los mismos filtros sin duplicar la lógica.
 */
function buildLeadQuery(orgId: string, filters: Omit<LeadFilters, 'page' | 'limit'>) {
  const { campaignId, status, search, source, ownerId, sort } = filters

  const where: Record<string, unknown> = { orgId }
  if (campaignId) where.campaignId = campaignId
  if (status) where.status = status
  if (source) where.source = source
  if (ownerId) where.ownerId = ownerId
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
    ]
  }

  // 'campo:direccion' validado contra SORTABLE_LEAD_FIELDS; cualquier otra
  // cosa (incluido ausente) cae al orden por defecto.
  let orderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' }
  if (sort) {
    const [field, direction] = sort.split(':')
    if (SORTABLE_LEAD_FIELDS.has(field) && (direction === 'asc' || direction === 'desc')) {
      orderBy = { [field]: direction }
    }
  }

  return { where, orderBy }
}

export async function listLeads(orgId: string, filters: LeadFilters = {}) {
  const { page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit
  const { where, orderBy } = buildLeadQuery(orgId, filters)

  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
      skip,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ])

  const data = rows.map((lead) => ({ ...lead, firstResponseOverdue: isFirstResponseOverdue(lead) }))

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/**
 * LE-102: export server-side del conjunto filtrado completo (sin la
 * paginación de listLeads). Se acota a MAX_EXPORT_ROWS como tope de
 * seguridad — a este volumen de datos no compensa la complejidad de un job
 * asíncrono como el de importación; se genera el CSV en memoria en el propio
 * handler.
 */
const MAX_EXPORT_ROWS = 10_000

export async function exportLeadsForCsv(orgId: string, filters: Omit<LeadFilters, 'page' | 'limit'> = {}) {
  const { where, orderBy } = buildLeadQuery(orgId, filters)
  const rows = await prisma.lead.findMany({
    where,
    orderBy,
    take: MAX_EXPORT_ROWS,
    include: {
      campaign: { select: { name: true } },
      owner: { select: { name: true } },
    },
  })
  return rows
}

export async function getLead(orgId: string, id: string) {
  const lead = await prisma.lead.findFirst({ where: { id, orgId } })
  if (!lead) return null
  return { ...lead, firstResponseOverdue: isFirstResponseOverdue(lead) }
}

/** LE-106: usuarios de la organización asignables como propietario de un lead. */
export async function listOwnerOptions(orgId: string) {
  return prisma.user.findMany({
    where: { orgId },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })
}

/**
 * LE-106: reasigna (o desasigna con `ownerId: null`) el propietario de un
 * lead. Valida que el nuevo owner pertenezca a la misma organización antes
 * de tocar la base (mismo patrón que assertOwnedCampaign).
 */
export async function assignOwner(orgId: string, actorUserId: string | null | undefined, leadId: string, ownerId: string | null) {
  if (ownerId) {
    const owner = await prisma.user.findFirst({ where: { id: ownerId, orgId }, select: { id: true } })
    if (!owner) throw new OwnershipError('ownerId')
  }

  const before = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
  if (!before) throw new LeadNotFoundError()

  const result = await prisma.lead.updateMany({
    where: { id: leadId, orgId },
    data: { ownerId },
  })
  if (result.count === 0) throw new LeadNotFoundError()

  const after = await prisma.lead.findFirst({ where: { id: leadId, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'lead.owner.changed',
    entityType: 'Lead',
    entityId: leadId,
    before,
    after: after ?? undefined,
  })

  await logSalesActivity({
    orgId,
    type: 'owner_changed',
    leadId,
    actorUserId,
    metadata: { from: before.ownerId, to: ownerId },
  })

  return after
}

/**
 * FND-05: punto único de creación de Lead para todas las fuentes (manual,
 * CSV, Meta, landing, API). Antes solo `ingestLead()` sincronizaba Mautic y
 * orquestaba la conversación/consentimiento/evento `lead.created`; un lead
 * dado de alta desde la UI o importado quedaba sin ninguno de esos efectos.
 * `orchestrateNewLead()` es idempotente (upsert de conversación + outbox
 * solo si es nueva), así que puede llamarse aquí para cualquier origen sin
 * riesgo de duplicar conversación o evento en reintentos.
 */
export async function createLead(orgId: string, actorUserId: string | null | undefined, data: {
  name: string
  phone?: string
  email?: string
  company?: string
  campaignId?: string
  source?: string
  externalLeadId?: string
  status?: LeadStatus
  tags?: string[]
  customFields?: Record<string, unknown>
  consent?: ChannelConsentInput
  accountId?: string
}) {
  await assertOwnedCampaign(orgId, data.campaignId)
  await assertOwnedAccount(orgId, data.accountId)

  const { consent, ...leadData } = data
  const lead = await prisma.lead.create({
    data: { orgId, ...leadData } as any,
  })

  // Update campaign totalLeads
  if (data.campaignId) {
    await prisma.campaign.updateMany({
      where: { id: data.campaignId, orgId },
      data: { totalLeads: { increment: 1 } },
    })
  }

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'lead.create',
    entityType: 'Lead',
    entityId: lead.id,
    after: lead,
  })

  await syncContact(lead).catch(() => {})
  await orchestrateNewLead(orgId, lead.id, consent).catch((error) => {
    console.error('[Leads] orchestration failed:', (error as Error).message)
  })

  return lead
}

/** LE-103: forma de una fila de CSV ya parseada/normalizada. */
export interface ImportCsvRow {
  name: string
  phone?: string
  email?: string
  company?: string
}

/** Una fila deduplicada conserva su número original (1-based, +1 por cabecera) para poder señalarla en `errors`. */
export interface ImportJobRow extends ImportCsvRow {
  row: number
}

export interface ImportJobError {
  row: number
  message: string
}

/** Forma persistida en `ImportJob.rows` (Json): filas a procesar + flags de la corrida. */
export interface ImportJobRowsPayload {
  autoCall: boolean
  items: ImportJobRow[]
}

/**
 * LE-103: deduplica por email/teléfono dentro del propio archivo — si dos
 * filas comparten email o teléfono, solo la primera se conserva; el resto se
 * reporta en `errors` con motivo 'duplicate_in_file' y no llega a crear un
 * Lead. `row` es 1-based e incluye la cabecera (fila 1), igual que vería el
 * usuario al abrir el CSV en una hoja de cálculo.
 */
function dedupeImportRows(rows: ImportCsvRow[]): { items: ImportJobRow[]; duplicates: ImportJobError[] } {
  const seenEmails = new Set<string>()
  const seenPhones = new Set<string>()
  const items: ImportJobRow[] = []
  const duplicates: ImportJobError[] = []

  rows.forEach((raw, index) => {
    const row = index + 2
    const email = raw.email?.trim().toLowerCase() || undefined
    const phone = raw.phone?.trim() || undefined
    const isDuplicate = (email && seenEmails.has(email)) || (phone && seenPhones.has(phone))
    if (isDuplicate) {
      duplicates.push({ row, message: 'duplicate_in_file' })
      return
    }
    if (email) seenEmails.add(email)
    if (phone) seenPhones.add(phone)
    items.push({ row, name: raw.name, phone: raw.phone, email: raw.email, company: raw.company })
  })

  return { items, duplicates }
}

/**
 * LE-103: reemplaza el importLeads() síncrono. Deduplica dentro del archivo
 * y encola un ImportJob 'pending' para que importJobRunner.ts lo procese
 * fila a fila en background, en vez de bloquear la petición HTTP con
 * importaciones grandes (LE-06/P1).
 */
export async function createImportJob(
  orgId: string,
  actorUserId: string | null | undefined,
  campaignId: string,
  rows: ImportCsvRow[],
  opts: { autoCall?: boolean; fileName?: string } = {}
) {
  await assertOwnedCampaign(orgId, campaignId)

  const { items, duplicates } = dedupeImportRows(rows)
  const rowsPayload: ImportJobRowsPayload = { autoCall: Boolean(opts.autoCall), items }

  return prisma.importJob.create({
    data: {
      orgId,
      campaignId,
      createdById: actorUserId ?? null,
      fileName: opts.fileName,
      status: 'pending',
      totalRows: items.length,
      skippedCount: duplicates.length,
      errors: duplicates as any,
      rows: rowsPayload as any,
    },
  })
}

export async function getImportJob(orgId: string, id: string) {
  return prisma.importJob.findFirst({ where: { id, orgId } })
}

export async function listImportJobs(orgId: string, opts: { page?: number; limit?: number } = {}) {
  const { page = 1, limit = 20 } = opts
  const skip = (page - 1) * limit
  const where = { orgId }
  const [data, total] = await Promise.all([
    prisma.importJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.importJob.count({ where }),
  ])
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function updateLead(orgId: string, actorUserId: string | null | undefined, id: string, data: {
  name?: string
  phone?: string
  email?: string
  company?: string
  status?: LeadStatus
  source?: string
  tags?: string[]
  customFields?: Record<string, unknown>
  campaignId?: string | null
  accountId?: string | null
}) {
  await assertOwnedCampaign(orgId, data.campaignId)
  await assertOwnedAccount(orgId, data.accountId)

  const before = await prisma.lead.findFirst({ where: { id, orgId } })
  if (!before) throw new LeadNotFoundError()

  // LE-106: la primera vez que un lead sale de 'new' se marca firstRespondedAt,
  // que es lo que apaga la alerta de SLA de primera respuesta. No se
  // sobreescribe si ya tenía una respuesta previa registrada.
  const updateData: Record<string, unknown> = { ...data }
  if (data.status && data.status !== 'new' && before.status === 'new' && !before.firstRespondedAt) {
    updateData.firstRespondedAt = new Date()
  }

  const result = await prisma.lead.updateMany({
    where: { id, orgId },
    data: updateData as any,
  })
  if (result.count === 0) throw new LeadNotFoundError()

  const after = await prisma.lead.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'lead.update',
    entityType: 'Lead',
    entityId: id,
    before,
    after: after ?? undefined,
  })

  // Solo re-sincroniza si cambió el estado (el segmento de Mautic depende
  // de eso) — evita un fetch a Mautic en cada edición de nombre/tags.
  if (data.status && after) {
    await syncContact(after).catch(() => {})
  }

  if (data.status && after && data.status !== before.status) {
    await logSalesActivity({
      orgId,
      type: 'status_change',
      leadId: id,
      actorUserId,
      metadata: { from: before.status, to: after.status },
    })
  }

  return after
}

export async function auditLead(
  orgId: string,
  id: string,
  opts: { website?: string; sector?: string; city?: string } = {}
) {
  const lead = await prisma.lead.findFirst({ where: { id, orgId } })
  if (!lead) return null

  const customFields = (lead.customFields as Record<string, unknown>) ?? {}
  const website = opts.website ?? (customFields.website as string | undefined)
  const sector = opts.sector ?? (customFields.sector as string | undefined)
  const city = opts.city ?? (customFields.city as string | undefined)

  const result = await auditBusiness({
    name: lead.name,
    website,
    sector,
    city,
    gbpRating: customFields.rating as number | undefined,
    gbpReviews: customFields.userRatingCount as number | undefined,
    gbpPhotosCount: customFields.photosCount as number | undefined,
  })

  await prisma.lead.update({
    where: { id },
    data: { customFields: { ...customFields, website: website ?? null, digitalAudit: result } as any },
  })
  await prisma.leadAudit.create({ data: { orgId, leadId: id, result: result as any } })

  return result
}

export async function getLeadAudit(orgId: string, id: string) {
  const lead = await prisma.lead.findFirst({ where: { id, orgId } })
  if (!lead) return undefined
  const customFields = (lead.customFields as Record<string, unknown>) ?? {}
  return customFields.digitalAudit ?? null
}

export async function getAuditHistory(orgId: string, leadId: string) {
  return prisma.leadAudit.findMany({ where: { orgId, leadId }, orderBy: { createdAt: 'desc' } })
}

/**
 * Audita en bloque los leads de una campaña que tienen web pero todavía no
 * fueron auditados. Secuencial (cada auditoría hace un fetch externo) y
 * acotado a `limit` por corrida — el frontend puede volver a llamar si queda
 * `remaining`.
 */
export async function auditBulk(orgId: string, campaignId: string, opts: { force?: boolean; limit?: number } = {}) {
  const limit = opts.limit ?? 50
  const leads = await prisma.lead.findMany({ where: { orgId, campaignId }, select: { id: true, customFields: true } })

  const candidates = leads.filter((l) => {
    const cf = (l.customFields as Record<string, unknown>) ?? {}
    if (!cf.website) return false
    if (!opts.force && cf.digitalAudit) return false
    return true
  })
  const toRun = candidates.slice(0, limit)

  let audited = 0
  for (const lead of toRun) {
    await auditLead(orgId, lead.id, {}).catch(() => null)
    audited++
  }

  return {
    audited,
    skipped: leads.length - candidates.length,
    remaining: candidates.length - toRun.length,
  }
}

/**
 * Claves ya presentes en la organización para deduplicar importaciones de
 * prospección (por placeId o teléfono). Solo mira leads con
 * source="prospecting" — un lead manual con el mismo teléfono no bloquea la
 * importación, la prospección solo evita duplicarse a sí misma.
 */
export async function getExistingProspectKeys(orgId: string): Promise<{ placeIds: Set<string>; phones: Set<string> }> {
  const existing = await prisma.lead.findMany({
    where: { orgId, source: 'prospecting' },
    select: { phone: true, customFields: true },
  })
  const placeIds = new Set<string>()
  const phones = new Set<string>()
  for (const lead of existing) {
    const cf = (lead.customFields as Record<string, unknown>) ?? {}
    if (typeof cf.placeId === 'string') placeIds.add(cf.placeId)
    if (lead.phone) phones.add(lead.phone)
  }
  return { placeIds, phones }
}

export async function listFiles(orgId: string, leadId: string) {
  const files = await prisma.leadFile.findMany({ where: { orgId, leadId }, orderBy: { createdAt: 'desc' } })
  return Promise.all(files.map(async (f) => ({ ...f, url: await getPresignedUrl(f.storageKey) })))
}

export async function uploadFile(orgId: string, leadId: string, name: string, buffer: Buffer, mimeType?: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } })
  if (!lead) return null

  const storageKey = `leads/${leadId}/${randomUUID()}-${name}`
  await putObject(storageKey, buffer, mimeType)
  const file = await prisma.leadFile.create({ data: { orgId, leadId, name, sizeBytes: buffer.length, storageKey } })

  await logSalesActivity({ orgId, type: 'file', leadId, subject: name })

  return file
}

export async function listNotes(orgId: string, leadId: string) {
  return prisma.leadNote.findMany({ where: { orgId, leadId }, orderBy: { createdAt: 'desc' } })
}

export async function createNote(orgId: string, leadId: string, authorId: string, text: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } })
  if (!lead) return null

  const user = await prisma.user.findUnique({ where: { id: authorId }, select: { name: true } })
  const note = await prisma.leadNote.create({
    data: { orgId, leadId, authorName: user?.name ?? 'Usuario', text },
  })

  await logSalesActivity({ orgId, type: 'note', leadId, actorUserId: authorId, body: text })

  return note
}

/**
 * FND-02: timeline unificado del lead (SalesActivity), paginado igual que
 * listLeads (page/limit → skip) para ser consistente con el resto del
 * controller de leads.
 */
export async function getLeadActivities(orgId: string, leadId: string, opts: { page?: number; limit?: number } = {}) {
  const { page = 1, limit = 50 } = opts
  const skip = (page - 1) * limit

  const where = { orgId, leadId }
  const [data, total] = await Promise.all([
    prisma.salesActivity.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.salesActivity.count({ where }),
  ])

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/** LE-107: consentimiento de contacto del lead por canal (email/whatsapp/voice). */
export async function getLeadConsent(orgId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } })
  if (!lead) return null
  return prisma.contactConsent.findMany({ where: { orgId, leadId }, orderBy: { channel: 'asc' } })
}

export async function getLeadTimeline(orgId: string, id: string) {
  const [rawLead, calls, meetings, opportunities] = await Promise.all([
    prisma.lead.findFirst({
      where: { id, orgId },
      include: { owner: { select: { id: true, name: true, email: true } } },
    }),
    prisma.call.findMany({
      where: { leadId: id, orgId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.meeting.findMany({
      where: { leadId: id, orgId },
      orderBy: { scheduledAt: 'desc' },
    }),
    prisma.opportunity.findMany({
      where: { leadId: id, orgId },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const lead = rawLead ? { ...rawLead, firstResponseOverdue: isFirstResponseOverdue(rawLead) } : null

  return { lead, calls, meetings, opportunities }
}
