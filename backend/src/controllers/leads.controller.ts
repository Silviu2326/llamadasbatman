import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as leadsService from '../services/leads.service'
import { OwnershipError, LeadNotFoundError } from '../services/leads.service'
import { enqueueLeadCall } from '../services/leadIngestion.service'
import { sendEmailToLead, isTemplateOwnedByOrg } from '../services/mauticSync.service'
import { assertEmailSendAllowed } from '../lib/emailCompliance'
import { prisma } from '../lib/prisma'
import { parseRequest } from '../lib/validation'
import { parse } from 'csv-parse/sync'
import { LeadStatus } from '@prisma/client'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'] as const satisfies readonly LeadStatus[]

// Importaciones muy grandes deben pasar por un flujo asíncrono (LE-06, P1);
// mientras tanto se acota el tamaño de una importación síncrona.
const MAX_IMPORT_ROWS = 2000

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

const sendEmailSchema = z.object({ mauticEmailId: z.string().trim().min(1, 'mauticEmailId es requerido').max(128) }).strict()

// LE-106: ownerId nullable — null desasigna el lead.
const updateOwnerSchema = z.object({ ownerId: z.string().trim().min(1).max(128).nullable() }).strict()

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
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listQuerySchema, request.query)
  if (!query) return
  const result = await leadsService.listLeads(orgId, query)
  return reply.send(result)
}

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const lead = await leadsService.getLead(orgId, params.id)
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
    const result = await leadsService.importLeads(orgId, userId, campaignId, rows)

    if (autoCall === 'true') {
      for (const lead of result.leads) await enqueueLeadCall(orgId, lead.id)
    }

    return reply.send({ imported: result.imported })
  } catch (err) {
    const mapped = ownershipStatus(err)
    if (mapped) return reply.status(mapped.status).send(mapped.body)
    throw err
  }
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: unknown
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, updateLeadSchema, request.body)
  if (!params || !body) return
  try {
    await leadsService.updateLead(orgId, userId, params.id, body)
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
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, updateOwnerSchema, request.body)
  if (!params || !body) return
  try {
    const lead = await leadsService.assignOwner(orgId, userId, params.id, body.ownerId)
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
  const { orgId } = request.user as JWTUser
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
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const lead = await leadsService.getLead(orgId, params.id)
  if (!lead) return reply.status(404).send({ error: 'Not found' })
  const queued = await enqueueLeadCall(orgId, lead.id)
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
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const query = parseRequest(reply, activitiesQuerySchema, request.query)
  if (!params || !query) return
  const lead = await leadsService.getLead(orgId, params.id)
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

/** Botón "Enviar plantilla" de la ficha del lead (sección 4 punto 6/7.3 del plan). */
export async function sendEmail(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, sendEmailSchema, request.body)
  if (!params || !body) return

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, mauticEnabled: true } })
  if (org?.plan !== 'completo' || !org.mauticEnabled) {
    return reply.status(403).send({ error: 'Email marketing no está incluido en tu plan' })
  }

  const lead = await prisma.lead.findFirst({ where: { id: params.id, orgId }, select: { id: true } })
  if (!lead) return reply.status(404).send({ error: 'Lead no encontrado' })

  // P0-04/EM-01: el mauticEmailId lo manda el navegador — nunca confiar en él
  // sin comprobar antes que la plantilla está vinculada a esta organización.
  if (!(await isTemplateOwnedByOrg(orgId, body.mauticEmailId))) {
    return reply.status(404).send({ error: 'Plantilla no encontrada' })
  }

  // P0-05/EM-02: barrera única de consentimiento antes de cualquier envío.
  const decision = await assertEmailSendAllowed(orgId, lead.id, 'contact')
  if (!decision.allowed) {
    return reply.status(409).send({ error: 'Envío bloqueado por cumplimiento', reason: decision.reason })
  }

  const sent = await sendEmailToLead(lead.id, body.mauticEmailId, orgId)
  if (!sent) return reply.status(502).send({ error: 'No se pudo enviar el email (contacto no sincronizado o Mautic no disponible)' })
  return reply.send({ ok: true })
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
