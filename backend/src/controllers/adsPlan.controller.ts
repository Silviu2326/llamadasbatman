import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as adPlanService from '../services/adPlan.service'
import * as adAudienceService from '../services/adAudience.service'
import * as adCreativeService from '../services/adCreative.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({
    error: 'Datos de campaña no válidos',
    issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })),
  })
}

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: 'Not found' })
}

/**
 * Los conflictos de negocio viajan con su `code` y sus detalles (p. ej. el
 * guardarraíl de presupuesto adjunta assignedCents/globalCents) para que el
 * frontend pueda explicar el bloqueo, no solo anunciarlo.
 */
function planError(reply: FastifyReply, error: unknown) {
  if (error instanceof adPlanService.AdPlanConflictError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code, ...error.details })
  }
  if (error instanceof adCreativeService.CreativeValidationError) {
    return reply.status(error.statusCode).send({ error: error.message })
  }
  throw error
}

// ─── Campañas globales y plan ────────────────────────────────────────────────

export async function listGlobalCampaigns(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ campaigns: await adPlanService.listGlobalCampaigns(orgId) })
}

export async function getPlan(
  request: FastifyRequest<{ Querystring: { campaignId?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const campaignId = request.query?.campaignId?.trim()
  if (!campaignId) return reply.status(400).send({ error: 'campaignId requerido' })
  const plan = await adPlanService.getPlan(orgId, campaignId)
  if (!plan) return notFound(reply)
  return reply.send(plan)
}

// Los formularios de la página envían null para "vaciar este campo". nullish
// distingue "no tocar" (undefined, que Prisma ignora) de "limpiar" (null, que
// Prisma escribe). Además z.coerce a secas convertiría null en valores reales
// (Number(null) = 0, new Date(null) = 1970-01-01) y violaría la regla
// null = sin medición: los union con z.null() delante lo impiden.
const optionalText = (max: number) => z.string().trim().max(max).nullish()
const optionalId = z.string().trim().min(1).nullish()
const optionalCount = z.union([z.null(), z.coerce.number().int().min(0)]).optional()
const optionalDate = z.union([z.null(), z.coerce.date()]).optional()

// ─── Activaciones ────────────────────────────────────────────────────────────

const activationCreateSchema = z.object({
  campaignId: z.string().trim().min(1),
  platform: z.enum(['meta', 'google']),
  objective: optionalText(180),
  budgetCents: optionalCount,
  startDate: optionalDate,
  endDate: optionalDate,
  conversionEvent: optionalText(120),
})

const activationPatchSchema = activationCreateSchema
  .omit({ campaignId: true, platform: true })
  .extend({ status: z.enum(['unconfigured', 'draft', 'ready', 'active', 'paused', 'finished']).optional() })

export async function createActivation(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = activationCreateSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const activation = await adPlanService.createActivation(orgId, parsed.data)
    if (!activation) return notFound(reply)
    return reply.status(201).send(activation)
  } catch (error) {
    return planError(reply, error)
  }
}

export async function updateActivation(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const parsed = activationPatchSchema.safeParse(request.body ?? {})
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const activation = await adPlanService.updateActivation(orgId, userId, request.params.id, parsed.data)
    if (!activation) return notFound(reply)
    return reply.send(activation)
  } catch (error) {
    return planError(reply, error)
  }
}

// ─── Audiencias ──────────────────────────────────────────────────────────────

const audiencePatchSchema = z.object({
  name: z.string().trim().min(1).max(140).optional(),
  campaignId: z.string().trim().min(1).nullable().optional(),
  segment: optionalText(600),
  location: optionalText(240),
  ageRange: optionalText(60),
  interests: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  customAudiences: z.array(z.string().trim().min(1).max(240)).max(50).optional(),
  exclusions: z.array(z.string().trim().min(1).max(240)).max(50).optional(),
  estimatedSize: optionalCount,
  dataSource: optionalText(240),
  consentBasis: optionalText(240),
})

const audienceCreateSchema = audiencePatchSchema.extend({ name: z.string().trim().min(1).max(140) })

export async function listAudiences(
  request: FastifyRequest<{ Querystring: { campaignId?: string; includeArchived?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const audiences = await adAudienceService.listAudiences(orgId, {
    campaignId: request.query?.campaignId?.trim() || undefined,
    includeArchived: request.query?.includeArchived === 'true',
  })
  return reply.send({ audiences })
}

export async function createAudience(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = audienceCreateSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  const audience = await adAudienceService.createAudience(orgId, parsed.data)
  if (!audience) return notFound(reply)
  return reply.status(201).send(audience)
}

export async function updateAudience(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = audiencePatchSchema.safeParse(request.body ?? {})
  if (!parsed.success) return validationError(reply, parsed.error)
  const audience = await adAudienceService.updateAudience(orgId, request.params.id, parsed.data)
  if (!audience) return notFound(reply)
  return reply.send(audience)
}

export async function archiveAudience(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await adAudienceService.archiveAudience(orgId, request.params.id)
  if (!result) return notFound(reply)
  return reply.send(result)
}

// ─── Briefs ──────────────────────────────────────────────────────────────────

const briefPatchSchema = z.object({
  activationId: optionalId,
  audienceId: optionalId,
  channel: z.enum(['meta', 'google']).optional(),
  format: z.enum(['imagen', 'video', 'carrusel']).nullish(),
  message: z.record(z.unknown()).optional(),
  cta: optionalText(120),
  destination: optionalText(500),
  references: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  restrictions: optionalText(1000),
  variantCount: z.union([z.null(), z.coerce.number().int().min(1).max(12)]).optional(),
})

const briefCreateSchema = briefPatchSchema.extend({ campaignId: z.string().trim().min(1) })
const briefStatusSchema = z.object({ status: z.enum(['draft', 'in_studio', 'delivered', 'archived']) })

export async function createBrief(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = briefCreateSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  const brief = await adCreativeService.createBrief(orgId, parsed.data)
  if (!brief) return notFound(reply)
  return reply.status(201).send(brief)
}

export async function updateBrief(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = briefPatchSchema.safeParse(request.body ?? {})
  if (!parsed.success) return validationError(reply, parsed.error)
  const brief = await adCreativeService.updateBrief(orgId, request.params.id, parsed.data)
  if (!brief) return notFound(reply)
  return reply.send(brief)
}

export async function setBriefStatus(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = briefStatusSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const brief = await adCreativeService.setBriefStatus(orgId, request.params.id, parsed.data.status)
    if (!brief) return notFound(reply)
    return reply.send(brief)
  } catch (error) {
    return planError(reply, error)
  }
}

// ─── Creatividades ───────────────────────────────────────────────────────────

const creativePatchSchema = z.object({
  assetId: optionalId,
  format: optionalText(60),
  headline: optionalText(255),
  primaryText: optionalText(4000),
  description: optionalText(1000),
  cta: optionalText(120),
})

const creativeCreateSchema = creativePatchSchema.extend({
  campaignId: z.string().trim().min(1),
  briefId: z.string().trim().min(1).optional(),
})

const creativeRejectSchema = z.object({
  // El motivo es obligatorio: un rechazo sin razón no enseña nada al equipo
  // ni al Studio que produjo la pieza.
  reason: z.string().trim().min(3, 'Explica por qué la rechazas').max(600),
})

export async function createCreative(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = creativeCreateSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  const creative = await adCreativeService.createCreative(orgId, parsed.data)
  if (!creative) return notFound(reply)
  return reply.status(201).send(creative)
}

export async function updateCreative(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = creativePatchSchema.safeParse(request.body ?? {})
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const creative = await adCreativeService.updateCreative(orgId, request.params.id, parsed.data)
    if (!creative) return notFound(reply)
    return reply.send(creative)
  } catch (error) {
    return planError(reply, error)
  }
}

export async function submitCreative(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  try {
    const creative = await adCreativeService.submitCreative(orgId, request.params.id)
    if (!creative) return notFound(reply)
    return reply.send(creative)
  } catch (error) {
    return planError(reply, error)
  }
}

export async function approveCreative(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  try {
    const creative = await adCreativeService.approveCreative(orgId, userId, request.params.id)
    if (!creative) return notFound(reply)
    return reply.send(creative)
  } catch (error) {
    return planError(reply, error)
  }
}

export async function rejectCreative(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const parsed = creativeRejectSchema.safeParse(request.body ?? {})
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const creative = await adCreativeService.rejectCreative(orgId, userId, request.params.id, parsed.data.reason)
    if (!creative) return notFound(reply)
    return reply.send(creative)
  } catch (error) {
    return planError(reply, error)
  }
}
