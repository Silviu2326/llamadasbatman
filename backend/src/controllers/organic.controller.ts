import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import * as service from '../services/organic.service'
import * as googleService from '../services/organicGoogleIntegration.service'
import { getAppUrl } from '../lib/securityConfig'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const idSchema = z.string().trim().min(1).max(128)
const jsonObjectSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 200_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El objeto no puede superar 200 KB' })
  }
})
const stringListSchema = z.array(z.string().trim().min(1).max(160)).max(50)
const dateSchema = z.string().trim().min(1).max(64).refine(value => !Number.isNaN(Date.parse(value)), 'Fecha inválida')
const providerParamsSchema = z.object({ provider: z.string().trim().min(1).max(64) }).strict()
const resourceSchema = z.object({ externalPropertyId: z.string().trim().min(1).max(2_048) }).strict()
const googleDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa fechas YYYY-MM-DD').refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Fecha no válida')
const searchConsoleSyncSchema = z.object({
  startDate: googleDateSchema,
  endDate: googleDateSchema,
  rowLimit: z.coerce.number().int().min(1).max(25_000).optional(),
}).strict().refine(value => new Date(value.startDate) <= new Date(value.endDate), {
  message: 'startDate debe ser anterior o igual a endDate',
  path: ['endDate'],
})

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(160),
  website: z.string().trim().max(2_048).nullable().optional(),
  services: stringListSchema.optional(),
  locations: stringListSchema.optional(),
  averageLeadValueCents: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  config: jsonObjectSchema.nullable().optional(),
}).strict()

const updateProjectSchema = createProjectSchema.extend({
  isActive: z.boolean().optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), 'Incluye al menos un campo para actualizar')

const createAssetSchema = z.object({
  projectId: idSchema.optional(),
  opportunityId: idSchema.nullable().optional(),
  type: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(240),
  content: jsonObjectSchema.nullable().optional(),
  targetUrl: z.string().trim().max(2_048).nullable().optional(),
}).strict()

const createActionSchema = z.object({
  type: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4_000).nullable().optional(),
  priority: z.coerce.number().int().min(0).max(100).optional(),
  dueAt: dateSchema.nullable().optional(),
  metadata: jsonObjectSchema.nullable().optional(),
}).strict()

function handleServiceError(error: unknown, reply: FastifyReply) {
  if (error instanceof service.OrganicProjectNotFoundError) return reply.status(404).send({ error: error.message })
  if (error instanceof service.OrganicOpportunityNotFoundError) return reply.status(404).send({ error: error.message })
  if (error instanceof service.OrganicProjectAlreadyExistsError) return reply.status(409).send({ error: error.message })
  if (error instanceof service.OrganicProjectOwnershipError) return reply.status(409).send({ error: error.message })
  if (error instanceof googleService.OrganicGoogleIntegrationError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code })
  }
  throw error
}

export async function overview(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await service.getOrganicOverview(orgId))
}

export async function getProject(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ project: await service.getOrganicProject(orgId) })
}

export async function createProject(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, createProjectSchema, request.body)
  if (!body) return
  try {
    return reply.status(201).send(await service.createOrganicProject(orgId, userId, body))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function updateProject(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, updateProjectSchema, request.body)
  if (!body) return
  try {
    return reply.send(await service.updateOrganicProject(orgId, userId, body))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function createAsset(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, createAssetSchema, request.body)
  if (!body) return
  try {
    return reply.status(201).send(await service.createOrganicAssetDraft(orgId, userId, body))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function createAction(
  request: FastifyRequest<{ Params: { opportunityId: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, z.object({ opportunityId: idSchema }).strict(), request.params)
  const body = parseRequest(reply, createActionSchema, request.body)
  if (!params || !body) return
  try {
    return reply.status(201).send(await service.createOrganicActionFromOpportunity(orgId, userId, params.opportunityId, body))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function integrations(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await googleService.getIntegrationStatuses(orgId))
}

function providerFromRequest(
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
): googleService.OrganicGoogleProvider | null {
  const params = parseRequest(reply, providerParamsSchema, request.params)
  if (!params) return null
  try {
    return googleService.requireOrganicGoogleProvider(params.provider)
  } catch (error) {
    handleServiceError(error, reply)
    return null
  }
}

export async function oauthStartUrl(
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) {
  const provider = providerFromRequest(request, reply)
  if (!provider) return
  const { orgId, userId } = request.user as JWTUser
  try {
    return reply.send({ provider, url: await googleService.buildOAuthStartUrl(orgId, userId, provider) })
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function oauthStart(
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) {
  const provider = providerFromRequest(request, reply)
  if (!provider) return
  const { orgId, userId } = request.user as JWTUser
  try {
    return reply.redirect(await googleService.buildOAuthStartUrl(orgId, userId, provider))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function oauthCallback(
  request: FastifyRequest<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>,
  reply: FastifyReply,
) {
  const provider = googleService.isOrganicGoogleProvider(request.params.provider) ? request.params.provider : null
  const appUrl = getAppUrl()
  const resultUrl = new URL('/captacion/conectar', appUrl)
  resultUrl.searchParams.set('organic_provider', request.params.provider)

  if (!provider || !request.query.state) {
    resultUrl.searchParams.set('status', 'error')
    return reply.redirect(resultUrl.toString())
  }

  const oauthState = await googleService.consumeOAuthState(provider, request.query.state)
  if (!oauthState || request.query.error || !request.query.code) {
    resultUrl.searchParams.set('status', 'error')
    return reply.redirect(resultUrl.toString())
  }

  try {
    await googleService.completeOAuth(oauthState, provider, request.query.code, oauthState.codeVerifier)
    resultUrl.searchParams.set('status', 'connected')
  } catch (error) {
    console.error('[OrganicGoogleOAuth] callback failed:', error instanceof googleService.OrganicGoogleIntegrationError ? error.code : 'unknown')
    resultUrl.searchParams.set('status', 'error')
  }
  return reply.redirect(resultUrl.toString())
}

export async function integrationStatus(
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) {
  const provider = providerFromRequest(request, reply)
  if (!provider) return
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await googleService.getIntegrationStatus(orgId, provider))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function discover(
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) {
  const provider = providerFromRequest(request, reply)
  if (!provider) return
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await googleService.discoverResources(orgId, provider))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function configureResource(
  request: FastifyRequest<{ Params: { provider: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const provider = providerFromRequest(request, reply)
  if (!provider) return
  const body = parseRequest(reply, resourceSchema, request.body)
  if (!body) return
  const { orgId, userId } = request.user as JWTUser
  try {
    return reply.send(await googleService.configureResource(orgId, userId, provider, body.externalPropertyId))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function disconnectIntegration(
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) {
  const provider = providerFromRequest(request, reply)
  if (!provider) return
  const { orgId, userId } = request.user as JWTUser
  try {
    return reply.send(await googleService.disconnect(orgId, userId, provider))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function syncSearchConsole(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply,
) {
  const body = parseRequest(reply, searchConsoleSyncSchema, request.body)
  if (!body) return
  const { orgId, userId } = request.user as JWTUser
  try {
    return reply.send(await googleService.syncSearchConsoleQueries(orgId, userId, body))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}
