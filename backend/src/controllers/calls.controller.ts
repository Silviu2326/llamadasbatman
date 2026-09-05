import { FastifyRequest, FastifyReply } from 'fastify'
import * as callsService from '../services/calls.service'
import { emitToOrg } from '../websockets/index'
import { CallStatus } from '@prisma/client'
import { normalizeCallOutcome } from '../lib/callOutcome'
import { z } from 'zod'
import {
  FISH_LATENCY_MODES,
  FISH_MODELS,
  FishAudioLatencyError,
  measureFishAudioLatency,
} from '../services/fishAudioLatency.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const fishLatencySchema = z.object({
  text: z.string().trim().min(12).max(600),
  voiceId: z.string().trim().min(8).max(160).optional().or(z.literal('')),
  model: z.enum(FISH_MODELS).default('s2.1-pro-free'),
  latency: z.enum(FISH_LATENCY_MODES).default('balanced'),
  speed: z.number().min(0.5).max(2).default(1),
})

export async function ttsLatencyDemo(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply,
) {
  const parsed = fishLatencySchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Parámetros de medición no válidos.', details: parsed.error.flatten() })
  }

  const { orgId } = request.user as JWTUser
  try {
    const result = await measureFishAudioLatency({
      ...parsed.data,
      voiceId: parsed.data.voiceId || undefined,
    }, { orgId })
    return reply
      .type(result.contentType)
      .header('Cache-Control', 'no-store')
      .header('X-Fish-TTFA-Ms', String(result.ttfaMs))
      .header('X-Fish-Total-Ms', String(result.totalMs))
      .header('X-Fish-Model', result.model)
      .header('X-Fish-Latency', result.latency)
      .header('Server-Timing', `fish-ttfa;dur=${result.ttfaMs}, fish-total;dur=${result.totalMs}`)
      .send(result.audio)
  } catch (error) {
    if (error instanceof FishAudioLatencyError) {
      return reply.status(error.statusCode).send({ error: error.message })
    }
    throw error
  }
}

export async function list(
  request: FastifyRequest<{
    Querystring: {
      leadId?: string
      search?: string
      highIntent?: string
      agentId?: string
      campaignId?: string
      status?: string
      outcome?: string
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
    leadId: q.leadId,
    search: typeof q.search === 'string' ? q.search.trim().slice(0, 200) : undefined,
    highIntent: q.highIntent === 'true',
    agentId: q.agentId,
    campaignId: q.campaignId,
    status: q.status as CallStatus | undefined,
    // Se traducen los alias antiguos (`rejected`, `callback`) en vez de dejar
    // que el filtro devuelva cero resultados sin explicación.
    outcome: q.outcome ? normalizeCallOutcome(q.outcome) ?? q.outcome : undefined,
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
    if (
      error instanceof callsService.InvalidVoiceContextError ||
      error instanceof callsService.InvalidCallOutcomeError
    ) {
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
