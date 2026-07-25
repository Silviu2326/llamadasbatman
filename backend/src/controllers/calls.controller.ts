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

export async function trace(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 1000
  const result = await callsService.getCallTrace(orgId, request.params.id, Number.isFinite(limit) ? limit : 1000)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function voiceMetrics(
  request: FastifyRequest<{ Querystring: { from?: string; to?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  return reply.send(await callsService.getVoiceMetrics(orgId, request.query.from, request.query.to))
}

export async function evaluation(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const result = await callsService.getCallEvaluation(orgId, request.params.id)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function metrics(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const result = await callsService.getCallMetrics(orgId, request.params.id)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
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
      contactClassification?: string
      contactClassificationConfidence?: number
      amdResult?: unknown
      startedAt?: string
      endedAt?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, ...data } = request.body
  let call
  try {
    call = await callsService.ingestCall(orgId, data)
  } catch (error) {
    if (error instanceof callsService.InvalidVoiceContextError) {
      return reply.status(error.statusCode).send({ error: error.message })
    }
    throw error
  }

  // Emit real-time event to org room
  emitToOrg(orgId, 'call:completed', call)

  return reply.status(201).send(call)
}

export async function live(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const calls = await callsService.listLiveCalls(orgId)
  return reply.send(calls)
}

export async function bulkActions(
  request: FastifyRequest<{
    Body: { ids: string[]; action: 'follow_up' | 'priority' }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const { ids, action } = request.body
  const updated = await callsService.bulkActions(orgId, ids, action, userId)
  return reply.send({ ok: true, updated })
}

export async function listNotes(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const notes = await callsService.listCallNotes(orgId, request.params.id)
  return reply.send(notes)
}

export async function createNote(
  request: FastifyRequest<{ Params: { id: string }; Body: { text: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const note = await callsService.createCallNote(orgId, request.params.id, userId, request.body.text)
  if (!note) return reply.status(404).send({ error: 'Not found' })
  return reply.status(201).send(note)
}

export async function updateNote(
  request: FastifyRequest<{ Params: { id: string; noteId: string }; Body: { text: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await callsService.updateCallNote(orgId, request.params.id, request.params.noteId, request.body.text)
  return reply.send({ ok: true })
}

export async function deleteNote(
  request: FastifyRequest<{ Params: { id: string; noteId: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await callsService.deleteCallNote(orgId, request.params.id, request.params.noteId)
  return reply.send({ ok: true })
}

export async function favorite(
  request: FastifyRequest<{ Params: { id: string }; Body: { favorite?: boolean } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const isFavorite = await callsService.toggleCallFavorite(orgId, request.params.id, request.body?.favorite)
  if (isFavorite === null) return reply.status(404).send({ error: 'Not found' })
  return reply.send({ isFavorite })
}

export async function listTasks(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const tasks = await callsService.listCallTasks(orgId, request.params.id)
  return reply.send(tasks)
}

export async function createTask(
  request: FastifyRequest<{
    Params: { id: string }
    Body: { title: string; dueAt?: string }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const task = await callsService.createCallTask(orgId, request.params.id, userId, request.body)
  return reply.status(201).send(task)
}

export async function updateTask(
  request: FastifyRequest<{
    Params: { id: string; taskId: string }
    Body: { title?: string; done?: boolean; dueAt?: string }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await callsService.updateCallTask(orgId, request.params.id, request.params.taskId, request.body)
  return reply.send({ ok: true })
}
