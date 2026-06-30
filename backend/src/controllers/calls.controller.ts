import { FastifyRequest, FastifyReply } from 'fastify'
import * as callsService from '../services/calls.service'
import { emitToOrg } from '../websockets/index'
import { CallStatus } from '@prisma/client'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function list(
  request: FastifyRequest<{
    Querystring: {
      agentId?: string
      campaignId?: string
      status?: string
      dateFrom?: string
      dateTo?: string
      page?: string
      limit?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const q = request.query
  const result = await callsService.listCalls(orgId, {
    agentId: q.agentId,
    campaignId: q.campaignId,
    status: q.status as CallStatus | undefined,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
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
  const call = await callsService.getCall(orgId, request.params.id)
  if (!call) return reply.status(404).send({ error: 'Not found' })
  return reply.send(call)
}

export async function ingest(
  request: FastifyRequest<{
    Body: {
      orgId: string
      externalCallId?: string
      leadId: string
      agentId?: string
      campaignId?: string
      duration?: number
      recordingUrl?: string
      transcript?: string
      transcriptWords?: unknown
      sentiment?: string
      sentimentScore?: number
      summary?: string
      outcome?: string
      startedAt?: string
      endedAt?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, ...data } = request.body
  const call = await callsService.ingestCall(orgId, data)

  // Emit real-time event to org room
  emitToOrg(orgId, 'call:completed', call)

  return reply.status(201).send(call)
}

export async function live(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const calls = await callsService.listLiveCalls(orgId)
  return reply.send(calls)
}
