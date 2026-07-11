import { FastifyRequest, FastifyReply } from 'fastify'
import * as leadsService from '../services/leads.service'
import { enqueueLeadCall } from '../services/leadIngestion.service'
import { sendEmailToLead } from '../services/mauticSync.service'
import { prisma } from '../lib/prisma'
import { parse } from 'csv-parse/sync'
import { LeadStatus } from '@prisma/client'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function list(
  request: FastifyRequest<{
    Querystring: {
      campaignId?: string
      status?: string
      page?: string
      limit?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const q = request.query
  const result = await leadsService.listLeads(orgId, {
    campaignId: q.campaignId,
    status: q.status as LeadStatus | undefined,
    page: q.page ? parseInt(q.page) : undefined,
    limit: q.limit ? parseInt(q.limit) : undefined,
  })
  return reply.send(result)
}

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const lead = await leadsService.getLead(orgId, request.params.id)
  if (!lead) return reply.status(404).send({ error: 'Not found' })
  return reply.send(lead)
}

export async function create(
  request: FastifyRequest<{
    Body: {
      name: string
      phone?: string
      email?: string
      company?: string
      campaignId?: string
      source?: string
      tags?: string[]
      customFields?: Record<string, unknown>
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const lead = await leadsService.createLead(orgId, request.body)
  return reply.status(201).send(lead)
}

export async function importCsv(
  request: FastifyRequest<{
    Querystring: { campaignId: string; autoCall?: string }
    Body: string
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const { campaignId, autoCall } = request.query

  if (!campaignId) {
    return reply.status(400).send({ error: 'campaignId is required' })
  }

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

  const result = await leadsService.importLeads(orgId, campaignId, rows)

  if (autoCall === 'true') {
    for (const lead of result.leads) await enqueueLeadCall(orgId, lead.id)
  }

  return reply.send({ imported: result.imported })
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      name?: string
      phone?: string
      email?: string
      company?: string
      status?: LeadStatus
      source?: string
      tags?: string[]
      customFields?: Record<string, unknown>
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await leadsService.updateLead(orgId, request.params.id, request.body)
  return reply.send({ ok: true })
}

export async function callNow(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const lead = await leadsService.getLead(orgId, request.params.id)
  if (!lead) return reply.status(404).send({ error: 'Not found' })
  const queued = await enqueueLeadCall(orgId, lead.id)
  return reply.send({ ok: true, queued })
}

export async function timeline(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await leadsService.getLeadTimeline(orgId, request.params.id)
  if (!result.lead) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function audit(
  request: FastifyRequest<{
    Params: { id: string }
    Body: { website?: string; sector?: string; city?: string }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await leadsService.auditLead(orgId, request.params.id, request.body ?? {})
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function listFiles(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const files = await leadsService.listFiles(orgId, request.params.id)
  return reply.send(files)
}

export async function uploadFile(
  request: FastifyRequest<{
    Params: { id: string }
    Body: { name: string; contentBase64: string; mimeType?: string }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const { name, contentBase64, mimeType } = request.body ?? ({} as any)
  if (!name || !contentBase64) {
    return reply.status(400).send({ error: 'name y contentBase64 son requeridos' })
  }
  const buffer = Buffer.from(contentBase64, 'base64')
  const file = await leadsService.uploadFile(orgId, request.params.id, name, buffer, mimeType)
  return reply.status(201).send(file)
}

export async function auditHistory(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const rows = await leadsService.getAuditHistory(orgId, request.params.id)
  return reply.send(rows)
}

export async function listNotes(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const notes = await leadsService.listNotes(orgId, request.params.id)
  return reply.send(notes)
}

export async function createNote(
  request: FastifyRequest<{ Params: { id: string }; Body: { text: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const text = request.body?.text?.trim()
  if (!text) return reply.status(400).send({ error: 'text es requerido' })
  const note = await leadsService.createNote(orgId, request.params.id, userId, text)
  return reply.status(201).send(note)
}

/** Botón "Enviar plantilla" de la ficha del lead (sección 4 punto 6/7.3 del plan). */
export async function sendEmail(
  request: FastifyRequest<{ Params: { id: string }; Body: { mauticEmailId: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, mauticEnabled: true } })
  if (org?.plan !== 'completo' || !org.mauticEnabled) {
    return reply.status(403).send({ error: 'Email marketing no está incluido en tu plan' })
  }

  const mauticEmailId = request.body?.mauticEmailId
  if (!mauticEmailId) return reply.status(400).send({ error: 'mauticEmailId es requerido' })
  const sent = await sendEmailToLead(request.params.id, mauticEmailId)
  if (!sent) return reply.status(502).send({ error: 'No se pudo enviar el email (contacto no sincronizado o Mautic no disponible)' })
  return reply.send({ ok: true })
}

export async function getAudit(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await leadsService.getLeadAudit(orgId, request.params.id)
  if (result === undefined) return reply.status(404).send({ error: 'Not found' })
  return reply.send({ audit: result })
}
