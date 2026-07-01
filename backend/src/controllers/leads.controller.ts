import { FastifyRequest, FastifyReply } from 'fastify'
import * as leadsService from '../services/leads.service'
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
    Querystring: { campaignId: string }
    Body: string
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const { campaignId } = request.query

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
  return reply.send(result)
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

export async function timeline(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await leadsService.getLeadTimeline(orgId, request.params.id)
  if (!result.lead) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}
