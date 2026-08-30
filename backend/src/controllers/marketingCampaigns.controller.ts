import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as service from '../services/marketingCampaigns.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict()

const createDraftSchema = z.object({
  name: z.string().trim().min(1).max(140),
  objective: z.string().trim().max(2_000).optional(),
}).strict()

// EM-106: mismo shape que AudienceDefinition del servicio — objeto de
// filtros planos, no un AST genérico.
const audienceDefinitionSchema = z.object({
  status: z.array(z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted'])).max(10).optional(),
  source: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  // EM-112: mismo formato de `purpose` que el centro de preferencias.
  subscribedPurpose: z.string().trim().min(1).max(60).regex(/^[a-z0-9_-]+$/, 'purpose inválido').optional(),
}).strict()

const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/, 'Fecha inválida')

// EM-113: el reparto A/B. `null` desactiva la prueba y devuelve la campaña a
// una sola versión. La propiedad de cada plantilla se re-verifica en el
// servicio, igual que con templateBindingId.
const variantDefinitionSchema = z.array(z.object({
  key: z.string().trim().min(1).max(16),
  templateExternalId: z.string().trim().min(1).max(64),
}).strict()).min(2).max(service.MAX_CAMPAIGN_VARIANTS)

const updateCampaignSchema = z.object({
  objective: z.string().trim().max(2_000).optional(),
  audienceDefinition: audienceDefinitionSchema.optional(),
  templateBindingId: z.string().trim().min(1).max(64).optional(),
  variantDefinition: variantDefinitionSchema.nullable().optional(),
  sender: z.string().trim().min(3).max(200).optional(),
  replyTo: z.string().trim().min(3).max(200).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  scheduledStartAt: dateSchema.nullable().optional(),
  scheduledEndAt: dateSchema.nullable().optional(),
  attributionWindowDays: z.coerce.number().int().min(1).max(90).optional(),
}).strict()

const audiencePreviewSchema = z.object({
  audienceDefinition: audienceDefinitionSchema,
}).strict()

/** Traduce los errores de dominio del servicio a códigos HTTP. */
function handleServiceError(err: unknown, reply: FastifyReply) {
  if (err instanceof service.CampaignNotFoundError) {
    return reply.status(404).send({ error: 'Campaña no encontrada' })
  }
  if (err instanceof service.TemplateOwnershipError) {
    return reply.status(404).send({ error: 'Plantilla no encontrada' })
  }
  if (err instanceof service.CampaignStateError) {
    return reply.status(400).send({ error: err.message })
  }
  throw err
}

/** GET / — lista de campañas de email marketing de la organización. */
export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await service.listCampaigns(orgId))
}

/** POST / — crea un borrador (EM-105). */
export async function create(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, createDraftSchema, request.body)
  if (!body) return
  const campaign = await service.createDraft(orgId, userId, body)
  return reply.status(201).send(campaign)
}

/** GET /:id — detalle de una campaña. */
export async function get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await service.getCampaign(orgId, params.id))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

/** PUT /:id — objetivo, audiencia, plantilla, remitente y calendario (EM-104/EM-105/EM-106). */
export async function update(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const [params, body] = [
    parseRequest(reply, idParamsSchema, request.params),
    parseRequest(reply, updateCampaignSchema, request.body),
  ]
  if (!params || !body) return
  try {
    return reply.send(await service.updateCampaign(orgId, userId, params.id, body))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

/** POST /:id/validate — checklist de completitud, promueve a 'ready' si aplica. */
export async function validate(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await service.validateCampaign(orgId, params.id))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

/** POST /:id/audience-preview — no persiste, solo cuenta/lista con el filtro recibido (EM-106). */
export async function audiencePreview(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const [params, body] = [
    parseRequest(reply, idParamsSchema, request.params),
    parseRequest(reply, audiencePreviewSchema, request.body),
  ]
  if (!params || !body) return
  return reply.send(await service.previewAudience(orgId, body.audienceDefinition))
}

/**
 * POST /:id/publish — exige 'ready', configura el grafo de email en Mautic,
 * añade la audiencia y solo refleja un estado activo tras leer de vuelta la
 * confirmación remota. La respuesta comunica contactos incorporados y
 * destinatarios omitidos por cumplimiento o falta de sincronización.
 */
export async function publish(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    const result = await service.publishCampaign(orgId, userId, params.id)
    return reply.send({ ...result.campaign, enrolledCount: result.enrolled, skippedCount: result.skipped })
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

/** POST /:id/pause — pausa remota en Mautic. */
export async function pause(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await service.pauseCampaign(orgId, userId, params.id))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}

/** GET /:id/reconcile — EM-107: lee el estado remoto real y corrige el local si difiere. */
export async function reconcile(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await service.reconcileCampaignStatus(orgId, params.id))
  } catch (err) {
    return handleServiceError(err, reply)
  }
}
