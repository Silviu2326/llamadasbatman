import { FastifyRequest, FastifyReply } from 'fastify'
import * as campaignsService from '../services/campaigns.service'
import { CampaignAgentError, CampaignStartError } from '../services/campaigns.service'
import * as leadsService from '../services/leads.service'
import { CampaignStatus } from '@prisma/client'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const VALID_STATUSES = ['draft', 'active', 'paused', 'done'] as const satisfies readonly CampaignStatus[]

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()
const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/, 'Fecha inválida')
const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(140).optional(),
  agentId: z.string().trim().min(1).max(128).optional().nullable(),
  playbookId: z.string().trim().min(1).max(128).optional().nullable(),
  objective: z.string().trim().max(2_000).optional().nullable(),
  startDate: dateSchema.optional().nullable(),
  endDate: dateSchema.optional().nullable(),
  budgetCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  goal: z.string().trim().max(240).optional().nullable(),
  settings: z.record(z.unknown()).optional(),
})
const createCampaignSchema = campaignInputSchema.extend({
  name: z.string().trim().min(1).max(140),
  landingSlug: z.string().trim().min(1).max(160).optional(),
  adAssets: z.record(z.unknown()).optional(),
}).strict()
// Activar encola llamadas reales y pasa por el gate de agente publicado:
// solo POST /:id/start puede poner 'active'. El PUT lo rechaza con 400.
const updateCampaignSchema = campaignInputSchema.extend({
  status: z.enum(VALID_STATUSES.filter(status => status !== 'active') as ['draft', 'paused', 'done'], {
    errorMap: () => ({ message: "status 'active' solo se establece con POST /api/campaigns/:id/start" }),
  }).optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), 'Incluye al menos un campo para actualizar')
const landingSchema = z.object({
  landingSlug: z.string().trim().min(1).max(160).nullable().optional(),
  adAssets: z.record(z.unknown()).optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), 'Incluye al menos un campo para actualizar')
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  search: z.string().trim().max(160).optional(),
}).strict()

export async function list(
  request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; status?: string; search?: string }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listQuerySchema, request.query)
  if (!query) return
  const result = await campaignsService.listCampaigns(orgId, {
    page: query.page,
    limit: query.limit,
    status: query.status,
    search: query.search || undefined,
  })
  return reply.send(result)
}

export async function create(
  request: FastifyRequest<{
    Body: {
      name: string
      agentId?: string
      playbookId?: string
      objective?: string
      startDate?: string
      endDate?: string
      landingSlug?: string
      adAssets?: Record<string, unknown>
      budgetCents?: number
      goal?: string
      settings?: Record<string, unknown>
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, createCampaignSchema, request.body)
  if (!body) return
  try {
    const campaign = await campaignsService.createCampaign(orgId, body)
    return reply.status(201).send(campaign)
  } catch (err) {
    if (err instanceof CampaignAgentError) return reply.status(404).send({ error: 'agentId no encontrado', code: 'AGENT_NOT_FOUND' })
    throw err
  }
}

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const campaign = await campaignsService.getCampaign(orgId, params.id)
  if (!campaign) return reply.status(404).send({ error: 'Not found' })
  return reply.send(campaign)
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      name?: string
      agentId?: string
      playbookId?: string
      objective?: string
      startDate?: string
      endDate?: string
      status?: CampaignStatus
      budgetCents?: number
      goal?: string
      settings?: Record<string, unknown>
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const [params, body] = [
    parseRequest(reply, idParamsSchema, request.params),
    parseRequest(reply, updateCampaignSchema, request.body),
  ]
  if (!params || !body) return
  try {
    const result = await campaignsService.updateCampaign(orgId, params.id, body)
    if (!result.count) return reply.status(404).send({ error: 'Not found' })
    return reply.send({ ok: true })
  } catch (err) {
    if (err instanceof CampaignAgentError) return reply.status(404).send({ error: 'agentId no encontrado', code: 'AGENT_NOT_FOUND' })
    if (err instanceof CampaignStartError) return reply.status(err.status).send({ error: err.message, code: err.code })
    throw err
  }
}

export async function updateLanding(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      landingSlug?: string | null
      adAssets?: Record<string, unknown>
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const [params, body] = [
    parseRequest(reply, idParamsSchema, request.params),
    parseRequest(reply, landingSchema, request.body),
  ]
  if (!params || !body) return
  const result = await campaignsService.updateCampaignLanding(orgId, params.id, body)
  if (!result.count) return reply.status(404).send({ error: 'Not found' })
  return reply.send({ ok: true })
}

export async function start(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    const result = await campaignsService.startCampaign(orgId, params.id)
    return reply.send(result)
  } catch (err) {
    // 409 con código estable cuando el agente no está publicado o falta; 404
    // si la campaña no es de la organización. Cualquier otro fallo es un 500 real.
    if (err instanceof CampaignStartError) return reply.status(err.status).send({ error: err.message, code: err.code })
    throw err
  }
}

// Solo lectura: cuántas llamadas encolaría /start. Usa los mismos permisos que
// start para que nadie sin permiso de lanzar pueda sondear la cola.
export async function startPreview(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const result = await campaignsService.getStartPreview(orgId, params.id)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function pause(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const result = await campaignsService.pauseCampaign(orgId, params.id)
  if (!result) return reply.status(404).send({ error: 'Not found', code: 'CAMPAIGN_NOT_FOUND' })
  return reply.send(result)
}

export async function stats(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const result = await campaignsService.getCampaignStats(orgId, params.id)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function auditBulk(
  request: FastifyRequest<{ Params: { id: string }; Body: { force?: boolean } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, z.object({ force: z.boolean().optional() }).strict(), request.body ?? {})
  if (!params || !body) return
  const result = await leadsService.auditBulk(orgId, params.id, { force: body.force })
  return reply.send(result)
}

export async function duplicate(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const copy = await campaignsService.duplicateCampaign(orgId, params.id)
  if (!copy) return reply.status(404).send({ error: 'Not found' })
  return reply.status(201).send(copy)
}

export async function activity(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const result = await campaignsService.getCampaignActivity(orgId, params.id)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function shareLink(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const token = await campaignsService.getOrCreateShareToken(orgId, params.id)
  if (!token) return reply.status(404).send({ error: 'Not found' })
  const base = process.env.FRONTEND_URL || ''
  return reply.send({ token, url: `${base}/campanas/compartir/${token}` })
}

// Ruta pública (sin auth, ver routes/campaignShare.ts) — solo campos seguros
// para mostrar fuera de la organización.
export async function publicByToken(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply
) {
  const params = parseRequest(reply, z.object({ token: z.string().uuid() }).strict(), request.params)
  if (!params) return
  const campaign = await campaignsService.getCampaignByShareToken(params.token)
  if (!campaign) return reply.status(404).send({ error: 'Not found' })
  return reply.send(campaign)
}
