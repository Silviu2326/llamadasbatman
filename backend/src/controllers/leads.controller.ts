import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as leadsService from '../services/leads.service'
import { OwnershipError, LeadNotFoundError } from '../services/leads.service'
import { enqueueLeadCall } from '../services/leadIngestion.service'
import { createNativeEmailDelivery, resolveNativeEmailDraft, sendNativeMarketingDelivery } from '../services/nativeMarketingEmail.service'
import * as outboundEmail from '../services/outboundEmail.service'
import { assertEmailSendAllowed } from '../lib/emailCompliance'
import { writeAuditLog } from '../lib/audit'
import { prisma } from '../lib/prisma'
import { parseRequest } from '../lib/validation'
import { parse } from 'csv-parse/sync'
import { LeadStatus } from '@prisma/client'

type JWTUser = { userId: string; orgId: string; role: string; email: string; workspaceScope?: 'own' | 'team' | 'org' }

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'] as const satisfies readonly LeadStatus[]

// La importación ya es asíncrona (createImportJob + importJobRunner), así que
// el tope solo protege el parseo en memoria antes de encolar: 25.000 filas son
// ~5 MB, holgado frente al bodyLimit de 15 MB de index.ts. Las semillas de
// registros públicos llegan en lotes de 10.000-20.000 y no deben partirse.
const MAX_IMPORT_ROWS = 25_000

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()

const emailSchema = z.string().trim().email('Email inválido').max(254)
const phoneSchema = z.string().trim().regex(/^[0-9+()\-.\s]{3,40}$/, 'Teléfono inválido').max(40)
const tagsSchema = z.array(z.string().trim().min(1).max(60)).max(50)
const customFieldsSchema = z.record(z.unknown())

// LE-101: campos/direcciones de orden permitidos vía querystring (?sort=campo:direccion).
const LEAD_SORT_OPTIONS = [
  'createdAt:asc', 'createdAt:desc',
  'updatedAt:asc', 'updatedAt:desc',
  'name:asc', 'name:desc',
] as const

const listQuerySchema = z.object({
  campaignId: z.string().trim().min(1).max(128).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().min(1).max(100).optional(),
  // LE-106: permite filtrar por propietario (p.ej. toggle "mis leads").
  ownerId: z.string().trim().min(1).max(128).optional(),
  sort: z.enum(LEAD_SORT_OPTIONS).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

const createLeadSchema = z.object({
  name: z.string().trim().min(1, 'name es requerido').max(160),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  company: z.string().trim().max(160).optional(),
  campaignId: z.string().trim().min(1).max(128).optional(),
  source: z.string().trim().max(80).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  tags: tagsSchema.optional(),
  customFields: customFieldsSchema.optional(),
  // Empresa (Account) vinculada al alta, opcional.
  accountId: z.string().trim().min(1).max(128).optional(),
}).strict()

const updateLeadSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  company: z.string().trim().max(160).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.string().trim().max(80).optional(),
  tags: tagsSchema.optional(),
  customFields: customFieldsSchema.optional(),
  campaignId: z.string().trim().min(1).max(128).optional().nullable(),
  // Empresa (Account) vinculada; también disponible vía POST /api/accounts/leads/:leadId/assign.
  accountId: z.string().trim().min(1).max(128).optional().nullable(),
}).strict().refine((value) => Object.values(value).some((item) => item !== undefined), 'Incluye al menos un campo para actualizar')

const importQuerySchema = z.object({
  campaignId: z.string().trim().min(1, 'campaignId es requerido').max(128),
  autoCall: z.enum(['true', 'false']).optional(),
}).strict()

const noteSchema = z.object({ text: z.string().trim().min(1, 'text es requerido').max(4_000) }).strict()

const fileUploadSchema = z.object({
  name: z.string().trim().min(1, 'name es requerido').max(255),
  contentBase64: z.string().min(1, 'contentBase64 es requerido').max(20_000_000),
  mimeType: z.string().trim().max(120).optional(),
}).strict()

const auditSchema = z.object({
  website: z.string().trim().max(2_048).optional(),
  sector: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
}).strict()

const sendEmailSchema = z.object({ emailDraftId: z.string().trim().min(1, 'emailDraftId es requerido').max(128) }).strict()

// LE-106: ownerId nullable — null desasigna el lead.
const updateOwnerSchema = z.object({ ownerId: z.string().trim().min(1).max(128).nullable() }).strict()

// EM-110: purpose es la categoría del centro de preferencias (contact,
// newsletter, promotions, ...) — genérico, no hardcodea una lista cerrada.
const emailPreferenceSchema = z.object({
  purpose: z.string().trim().min(1).max(60).regex(/^[a-z0-9_-]+$/, 'purpose inválido'),
  status: z.enum(['granted', 'revoked']),
}).strict()

function ownershipStatus(err: unknown) {
  if (err instanceof OwnershipError) return { status: 404 as const, body: { error: `${err.field} no encontrado` } }
  return null
}

export async function list(
  request: FastifyRequest<{
    Querystring: {
      campaignId?: string
      status?: string
      search?: string
      source?: string
      ownerId?: string
      sort?: string
      page?: string
      limit?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const query = parseRequest(reply, listQuerySchema, request.query)
  if (!query) return
  const result = await leadsService.listLeads(orgId, { userId, role, workspaceScope }, query)
  return reply.send(result)
}

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role, workspaceScope } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const lead = await leadsService.getLead(orgId, { userId, role, workspaceScope }, params.id)
  if (!lead) return reply.status(404).send({ error: 'Not found' })
  return reply.send(lead)
}

export async function create(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, createLeadSchema, request.body)
  if (!body) return
  try {
    const lead = await leadsService.createLead(orgId, userId, body)
    return reply.status(201).send(lead)
  } catch (err) {
    const mapped = ownershipStatus(err)
    if (mapped) return reply.status(mapped.status).send(mapped.body)
    throw err
  }
}

/**
 * LE-103: parsea/normaliza el CSV igual que antes, pero ya no procesa las
 * filas en la propia petición HTTP — crea un ImportJob 'pending' que
 * importJobRunner.ts procesa en background y responde 202 de inmediato.
 */
export async function importCsv(
  request: FastifyRequest<{
    Querystring: { campaignId: string; autoCall?: string }
    Body: string
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const query = parseRequest(reply, importQuerySchema, request.query)
  if (!query) return
  const { campaignId, autoCall } = query

  let rows: Array<{ name: string; phone?: string; email?: string; company?: string }>
  try {
    rows = parse(request.body, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
  } catch (err) {
    return reply.status(400).send({ error: 'Invalid CSV format' })
  }

  if (!rows.length) {
    return reply.status(400).send({ error: 'CSV is empty' })
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return reply.status(400).send({ error: `El CSV supera el máximo de ${MAX_IMPORT_ROWS} filas por importación` })
  }

  try {
    const job = await leadsService.createImportJob(orgId, userId, campaignId, rows, { autoCall: autoCall === 'true' })
    return reply.status(202).send({ id: job.id, status: job.status, totalRows: job.totalRows })
  } catch (err) {
    const mapped = ownershipStatus(err)
    if (mapped) return reply.status(mapped.status).send(mapped.body)
    throw err
  }
}

const importJobIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()

const importJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

/** LE-103: GET /api/leads/imports/:id — estado de un ImportJob para hacer polling desde el frontend. */
export async function getImportJob(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const params = parseRequest(reply, importJobIdParamsSchema, request.params)
  if (!params) return
  const job = await leadsService.getImportJob(orgId, params.id)
  if (!job) return reply.status(404).send({ error: 'Not found' })
  return reply.send(job)
}

/** LE-103: GET /api/leads/imports — lista paginada de ImportJob de la organización. */
export async function listImportJobs(
  request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const query = parseRequest(reply, importJobsQuerySchema, request.query)
  if (!query) return
  const result = await leadsService.listImportJobs(orgId, query)
  return reply.send(result)
}

const exportQuerySchema = listQuerySchema.omit({ page: true, limit: true })

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

/**
 * LE-102: export server-side del conjunto filtrado completo (mismos filtros
 * que list()), sin paginación — acotado a exportLeadsForCsv()'s
 * MAX_EXPORT_ROWS como tope de seguridad. Se genera el CSV en memoria: a
 * ese volumen de filas no compensa la complejidad de un job asíncrono.
 */
export async function exportCsv(
  request: FastifyRequest<{
    Querystring: {
      campaignId?: string
      status?: string
      search?: string
      source?: string
      ownerId?: string
      sort?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const query = parseRequest(reply, exportQuerySchema, request.query)
  if (!query) return

  const leads = await leadsService.exportLeadsForCsv(orgId, { userId, role }, query)

  const headers = ['id', 'nombre', 'email', 'telefono', 'empresa', 'estado', 'fuente', 'campaña', 'propietario', 'etiquetas', 'creado']
  const lines = [headers.join(',')]
  for (const lead of leads) {
    lines.push([
      lead.id,
      lead.name,
      lead.email ?? '',
      lead.phone ?? '',
      lead.company ?? '',
      lead.status,
      lead.source ?? '',
      lead.campaign?.name ?? '',
      lead.owner?.name ?? '',
      (lead.tags ?? []).join('; '),
      lead.createdAt.toISOString(),
    ].map(csvEscape).join(','))
  }

  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="leads-export-${Date.now()}.csv"`)
    .send('﻿' + lines.join('\n'))
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: unknown
  }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, updateLeadSchema, request.body)
  if (!params || !body) return
  try {
    await leadsService.updateLead(orgId, userId, role, params.id, body)
    return reply.send({ ok: true })
  } catch (err) {
    if (err instanceof LeadNotFoundError) return reply.status(404).send({ error: 'Not found' })
    const mapped = ownershipStatus(err)
    if (mapped) return reply.status(mapped.status).send(mapped.body)
    throw err
  }
}

/** LE-106: PUT /api/leads/:id/owner — reasigna (o desasigna con ownerId=null) el propietario. */
export async function updateOwner(
  request: FastifyRequest<{
    Params: { id: string }
    Body: unknown
  }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, updateOwnerSchema, request.body)
  if (!params || !body) return
  try {
    const lead = await leadsService.assignOwner(orgId, userId, role, params.id, body.ownerId)
    return reply.send(lead)
  } catch (err) {
    if (err instanceof LeadNotFoundError) return reply.status(404).send({ error: 'Not found' })
    const mapped = ownershipStatus(err)
    if (mapped) return reply.status(mapped.status).send(mapped.body)
    throw err
  }
}

/** LE-106: GET /api/leads/owners — usuarios de la organización asignables como owner. */
export async function listOwners(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const owners = await leadsService.listOwnerOptions(orgId)
  return reply.send(owners)
}

/** LE-107: GET /api/leads/:id/consent — estado de ContactConsent por canal. */
export async function getConsent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const result = await leadsService.getLeadConsent(orgId, params.id)
  if (result === null) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function callNow(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const lead = await leadsService.getLead(orgId, { userId, role }, params.id)
  if (!lead) return reply.status(404).send({ error: 'Not found' })
  // Fail fast with a stable error code: the worker would silently drop these.
  if (!lead.phone) return reply.status(422).send({ ok: false, queued: false, error: 'lead_without_phone' })
  if (!lead.campaignId) return reply.status(422).send({ ok: false, queued: false, error: 'lead_without_campaign' })
  const queued = await enqueueLeadCall(orgId, lead.id)
  if (!queued) return reply.status(503).send({ ok: false, queued: false, error: 'call_queue_unavailable' })
  return reply.send({ ok: true, queued })
}

const activitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

/** FND-02: GET /api/leads/:id/activities — timeline unificado (SalesActivity). */
export async function activities(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const query = parseRequest(reply, activitiesQuerySchema, request.query)
  if (!params || !query) return
  const lead = await leadsService.getLead(orgId, { userId, role }, params.id)
  if (!lead) return reply.status(404).send({ error: 'Not found' })
  const result = await leadsService.getLeadActivities(orgId, params.id, query)
  return reply.send(result)
}

export async function timeline(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const result = await leadsService.getLeadTimeline(orgId, params.id)
  if (!result.lead) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function audit(
  request: FastifyRequest<{
    Params: { id: string }
    Body: unknown
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, auditSchema, request.body ?? {})
  if (!params || !body) return
  const result = await leadsService.auditLead(orgId, params.id, body)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

const outboundDraftSchema = z.object({ tone: z.string().trim().min(3).max(80).optional() }).strict()

/** Redacta sin enviar: se puede pulsar tantas veces como haga falta. */
export async function draftOutboundEmail(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, outboundDraftSchema, request.body ?? {})
  if (!params || !body) return
  try {
    return reply.send(await outboundEmail.draftOutboundEmail(orgId, params.id, body))
  } catch (err) {
    if (err instanceof outboundEmail.OutboundEmailError) {
      return reply.status(err.statusCode).send({ error: err.message, code: err.code })
    }
    throw err
  }
}

const outboundSendSchema = z.object({
  // Se acepta el borrador editado a mano: si alguien reescribe el email en la
  // pantalla, se manda el suyo y no otro generado por detrás.
  subject: z.string().trim().min(3).max(120).optional(),
  body: z.string().trim().min(20).max(6_000).optional(),
}).strict()

export async function sendOutboundEmail(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, outboundSendSchema, request.body ?? {})
  if (!params || !body) return
  try {
    const draft = await outboundEmail.draftOutboundEmail(orgId, params.id)
    // La edición manual no salta el editor adversario: se vuelve a pasar por
    // él antes de salir, igual que el texto del modelo.
    const edited = body.subject || body.body
      ? await outboundEmail.reviewEditedDraft(orgId, draft, { subject: body.subject, body: body.body })
      : draft
    const result = await outboundEmail.sendOutboundEmail(orgId, params.id, { draft: edited, actorUserId: userId })
    await writeAuditLog({
      orgId,
      actorUserId: userId,
      action: 'lead.outbound_email.send',
      entityType: 'Lead',
      entityId: params.id,
      after: { deliveryId: result.deliveryId, subject: result.subject, status: result.status, edited: Boolean(body.subject || body.body) },
    })
    return reply.send(result)
  } catch (err) {
    if (err instanceof outboundEmail.OutboundEmailError) {
      return reply.status(err.statusCode).send({ error: err.message, code: err.code })
    }
    throw err
  }
}

export async function listFiles(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const files = await leadsService.listFiles(orgId, params.id)
  return reply.send(files)
}

export async function uploadFile(
  request: FastifyRequest<{
    Params: { id: string }
    Body: unknown
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, fileUploadSchema, request.body)
  if (!params || !body) return
  const buffer = Buffer.from(body.contentBase64, 'base64')
  const file = await leadsService.uploadFile(orgId, params.id, body.name, buffer, body.mimeType)
  if (!file) return reply.status(404).send({ error: 'Not found' })
  return reply.status(201).send(file)
}

export async function auditHistory(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const rows = await leadsService.getAuditHistory(orgId, params.id)
  return reply.send(rows)
}

export async function listNotes(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const notes = await leadsService.listNotes(orgId, params.id)
  return reply.send(notes)
}

export async function createNote(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, noteSchema, request.body)
  if (!params || !body) return
  const note = await leadsService.createNote(orgId, params.id, userId, body.text)
  if (!note) return reply.status(404).send({ error: 'Not found' })
  return reply.status(201).send(note)
}

/** Envía al lead un borrador local usando Resend y el ledger de entregas. */
export async function sendEmail(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, sendEmailSchema, request.body)
  if (!params || !body) return
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } })
  if (org?.plan !== 'completo') return reply.status(403).send({ error: 'Email marketing es una función del plan Completo. Mejora tu plan para activarlo.', code: 'PLAN_CAPABILITY_REQUIRED' })
  const lead = await prisma.lead.findFirst({ where: { id: params.id, orgId }, select: { id: true, email: true } })
  if (!lead) return reply.status(404).send({ error: 'Lead no encontrado' })
  if (!lead.email) return reply.status(409).send({ error: 'El lead no tiene email' })
  const content = await resolveNativeEmailDraft(orgId, body.emailDraftId)
  if (!content) return reply.status(404).send({ error: 'Borrador de email no encontrado' })
  const decision = await assertEmailSendAllowed(orgId, lead.id, 'contact')
  if (!decision.allowed) return reply.status(409).send({ error: 'Envío bloqueado por cumplimiento', reason: decision.reason })
  const delivery = await createNativeEmailDelivery({ orgId, leadId: lead.id, emailDraftId: content.emailDraftId, toAddress: lead.email, idempotencyScope: `manual-email:${userId}:${Date.now()}`, purpose: 'contact', content })
  const workerId = `lead-email-${process.pid}-${delivery.id}`
  const claimed = await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: 'queued' }, data: { status: 'processing', workerId, lockedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), providerAttemptedAt: new Date(), attempts: { increment: 1 } } })
  if (!claimed.count) return reply.status(409).send({ error: 'El envío ya está siendo procesado.' })
  const outcome = await sendNativeMarketingDelivery(delivery.id, workerId, 'contact')
  if (outcome !== 'accepted') return reply.status(outcome === 'uncertain' ? 202 : 502).send({ error: outcome === 'uncertain' ? 'Resend no confirmó si aceptó el email; comprueba el historial antes de reintentarlo.' : 'No se pudo enviar el email.' })
  const latest = await prisma.emailDelivery.findUnique({ where: { id: delivery.id }, select: { providerMessageId: true, subjectSnapshot: true, htmlSnapshot: true } })
  const conversation = await import('../services/conversations.service').then(module => module.ensureConversationForLead(orgId, lead.id))
  await prisma.message.create({ data: { orgId, conversationId: conversation.id, leadId: lead.id, authorUserId: userId, channel: 'email', provider: 'resend', address: lead.email, direction: 'outbound', contentType: 'html', body: `${latest?.subjectSnapshot ?? content.subject}\n\n${latest?.htmlSnapshot ?? content.html}`, status: 'sent', sentAt: new Date(), providerMessageId: latest?.providerMessageId ?? undefined, metadata: { emailDraftId: content.emailDraftId, deliveryId: delivery.id } } })
  return reply.send({ ok: true, deliveryId: delivery.id })
}
export async function getAudit(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const result = await leadsService.getLeadAudit(orgId, params.id)
  if (result === undefined) return reply.status(404).send({ error: 'Not found' })
  return reply.send({ audit: result })
}

/** EM-109: GET /api/leads/:id/email-history — historial de EmailDelivery + eventos del lead. */
export async function getEmailHistory(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const lead = await prisma.lead.findFirst({ where: { id: params.id, orgId }, select: { id: true } })
  if (!lead) return reply.status(404).send({ error: 'Not found' })

  const history = await prisma.emailDelivery.findMany({
    where: { orgId, leadId: lead.id },
    include: { events: { orderBy: { occurredAt: 'desc' } } },
    orderBy: { queuedAt: 'desc' },
  })
  return reply.send(history)
}

/** EM-110: GET /api/leads/:id/preferences — categorías de consentimiento de email (ContactConsent). */
export async function getPreferences(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const lead = await prisma.lead.findFirst({ where: { id: params.id, orgId }, select: { id: true } })
  if (!lead) return reply.status(404).send({ error: 'Not found' })

  const preferences = await prisma.contactConsent.findMany({
    where: { orgId, leadId: lead.id, channel: 'email' },
    orderBy: { purpose: 'asc' },
  })
  return reply.send(preferences)
}

/** EM-110: PUT /api/leads/:id/preferences — activa/desactiva una categoría de email (upsert). */
export async function updatePreferences(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, emailPreferenceSchema, request.body)
  if (!params || !body) return

  const lead = await prisma.lead.findFirst({ where: { id: params.id, orgId }, select: { id: true } })
  if (!lead) return reply.status(404).send({ error: 'Not found' })

  const before = await prisma.contactConsent.findFirst({
    where: { orgId, leadId: lead.id, channel: 'email', purpose: body.purpose },
  })

  const preference = await prisma.contactConsent.upsert({
    where: {
      orgId_leadId_channel_purpose: { orgId, leadId: lead.id, channel: 'email', purpose: body.purpose },
    },
    create: {
      orgId,
      leadId: lead.id,
      channel: 'email',
      purpose: body.purpose,
      status: body.status,
      source: 'preference_center',
    },
    update: { status: body.status, source: 'preference_center', occurredAt: new Date() },
  })

  await writeAuditLog({
    orgId,
    actorUserId: userId,
    action: 'lead.email_preference.update',
    entityType: 'ContactConsent',
    entityId: preference.id,
    before,
    after: preference,
  })

  return reply.send(preference)
}

