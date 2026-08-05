import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import * as service from '../services/organic.service'
import * as googleService from '../services/organicGoogleIntegration.service'
import * as ingest from '../services/organicGoogleIngest.service'
import { getAppUrl } from '../lib/securityConfig'
import * as onboarding from '../services/organicOnboarding.service'
import * as recommendations from '../services/organicRecommendation.service'
import * as connectors from '../services/verticalConnector.service'
import * as autonomy from '../services/organicAutonomy.service'
import { assessPromotion, promoteRule, degradeRule, PromotionBlockedError } from '../services/adRuleAutonomy.service'

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

export async function overview(
  request: FastifyRequest<{ Querystring: { period?: string; projectId?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  // El selector de período de la página no llegaba al servicio: era decorativo.
  return reply.send(await service.getOrganicOverview(orgId, {
    period: request.query?.period,
    projectId: request.query?.projectId,
  }))
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
  // Volvía a /captacion/conectar, que es la cuenta de Meta: quien conectaba
  // Google acababa mirando la pantalla de otro producto.
  const resultUrl = new URL('/organic', appUrl)
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

/**
 * Ingesta de GA4 y del Perfil de Empresa (fase 1). Comparten validación de
 * fechas con Search Console: una ventana al revés o una fecha inventada se
 * rechazan aquí y no a mitad de la llamada a Google.
 */
export async function syncGa4(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const body = parseRequest(reply, searchConsoleSyncSchema, request.body)
  if (!body) return
  const { orgId, userId } = request.user as JWTUser
  try {
    return reply.send(await ingest.syncGa4Traffic(orgId, userId, { startDate: body.startDate, endDate: body.endDate }))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function syncBusinessProfile(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const body = parseRequest(reply, searchConsoleSyncSchema, request.body)
  if (!body) return
  const { orgId, userId } = request.user as JWTUser
  try {
    return reply.send(await ingest.syncBusinessProfile(orgId, userId, { startDate: body.startDate, endDate: body.endDate }))
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

// ─── Onboarding adaptativo (organico.md §4) ──────────────────────────────────

const onboardingSaveSchema = z.object({
  step: z.enum(['business', 'sector', 'sources', 'events', 'content', 'approval', 'activation']).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  website: z.string().trim().max(300).optional(),
  locations: z.array(z.string().trim().max(120)).max(30).optional(),
  sectors: z.array(z.string().trim().max(60)).max(5).optional(),
  businessModel: z.string().trim().max(160).optional(),
  primaryGoal: z.string().trim().max(160).optional(),
  businessDescription: z.string().trim().max(4000).optional(),
  audience: z.string().trim().max(400).optional(),
  socialProfiles: z.array(z.string().trim().max(200)).max(12).optional(),
  moduleAnswers: z.record(z.record(z.unknown())).optional(),
})

const onboardingCompleteSchema = z.object({
  choices: z.array(z.object({
    moduleKey: z.string().trim().min(1).max(60),
    eventKey: z.string().trim().min(1).max(60),
    formats: z.array(z.string().trim().max(40)).max(10).optional(),
    timings: z.array(z.string().trim().max(40)).max(10).optional(),
    channels: z.array(z.string().trim().max(40)).max(12).optional(),
    approvalPolicy: z.enum(['auto', 'approval', 'always_approval']).optional(),
    isActive: z.boolean().optional(),
  })).min(1).max(40),
})

function onboardingError(reply: FastifyReply, error: unknown) {
  if (error instanceof onboarding.OnboardingError) {
    return reply.status(error.statusCode).send({ error: error.message })
  }
  throw error
}

export async function getOnboarding(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await onboarding.getOnboarding(orgId))
}

export async function investigateBusiness(
  request: FastifyRequest<{ Body: { website?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send(await onboarding.investigate(orgId, request.body?.website))
  } catch (error) {
    return onboardingError(reply, error)
  }
}

export async function saveOnboarding(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = onboardingSaveSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Datos de onboarding no válidos', issues: parsed.error.issues })
  }
  try {
    return reply.send(await onboarding.saveOnboarding(orgId, parsed.data))
  } catch (error) {
    return onboardingError(reply, error)
  }
}

export async function completeOnboarding(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = onboardingCompleteSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Reglas de contenido no válidas', issues: parsed.error.issues })
  }
  try {
    return reply.send(await onboarding.completeOnboarding(orgId, parsed.data.choices))
  } catch (error) {
    return onboardingError(reply, error)
  }
}

// ─── Recomendaciones y despacho a los brazos (organico.md §5.5) ──────────────

export async function listRecommendations(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await recommendations.listOrganicRecommendations(orgId))
}

export async function runDiagnostics(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await recommendations.runOrganicDiagnostics(orgId))
}

export async function dispatchRecommendation(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const result = await recommendations.dispatchRecommendation(orgId, request.params.id)
  if (!result) return reply.status(404).send({ error: 'Recomendación no encontrada' })
  return reply.send(result)
}

export async function dismissRecommendation(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const parsed = z.object({ reason: z.string().trim().min(3, 'Explica por qué la descartas').max(600) })
    .safeParse(request.body ?? {})
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Hace falta un motivo para descartar', issues: parsed.error.issues })
  }
  const result = await recommendations.dismissRecommendation(orgId, request.params.id, parsed.data.reason)
  if (!result) return reply.status(404).send({ error: 'Recomendación no encontrada' })
  return reply.send(result)
}

// ─── Conectores verticales (organico.md §4.9 nivel 2 y §10) ─────────────────

const connectorCreateSchema = z.object({
  moduleKey: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(160),
  kind: z.enum(['webhook', 'api', 'feed', 'manual']).optional(),
  endpoint: z.string().trim().url().max(500).optional(),
  secret: z.string().trim().min(8).max(500).optional(),
  webhookSecret: z.string().trim().min(16).max(500).optional(),
})

const connectorEventsSchema = z.object({
  events: z.array(z.object({
    eventKey: z.string().trim().min(1).max(80),
    externalId: z.string().trim().min(1).max(200),
    occurredAt: z.string().trim().max(40).optional(),
    payload: z.record(z.unknown()).optional(),
  })).min(1).max(200),
})

function connectorError(reply: FastifyReply, error: unknown) {
  if (error instanceof connectors.ConnectorError) {
    return reply.status(error.statusCode).send({ error: error.message })
  }
  throw error
}

export async function listConnectors(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await connectors.listConnectors(orgId))
}

export async function createConnector(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = connectorCreateSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Datos del conector no válidos', issues: parsed.error.issues })
  }
  try {
    return reply.status(201).send(await connectors.createConnector(orgId, parsed.data))
  } catch (error) {
    return connectorError(reply, error)
  }
}

// ─── Autonomía limitada (organico.md §9 y fase 4 de §11) ────────────────────

const autonomyConfigSchema = z.object({
  level: z.enum(['N1', 'N2', 'N3']).optional(),
  shadowMode: z.boolean().optional(),
  maxActionsPerDay: z.coerce.number().int().min(1).max(50).optional(),
  cooldownMinutes: z.coerce.number().int().min(0).max(10_080).optional(),
  minAttributionCoveragePct: z.coerce.number().int().min(0).max(100).optional(),
}).refine(value => Object.values(value).some(item => item !== undefined), 'Incluye al menos un campo')

function autonomyError(reply: FastifyReply, error: unknown) {
  if (error instanceof autonomy.AutonomyBlockedError) return reply.status(error.statusCode).send({ error: error.message })
  if (error instanceof autonomy.AutonomyNotActionableError) return reply.status(error.statusCode).send({ error: error.message })
  if (error instanceof PromotionBlockedError) return reply.status(error.statusCode).send({ error: error.message, blockers: error.blockers })
  throw error
}

/**
 * Estado de la sala: nivel, sombra, freno compartido y, por cada tipo de acción
 * de §9, qué le falta para ganarse la promoción. La evaluación se compone aquí
 * y no dentro del servicio para no encadenar los dos servicios de autonomía en
 * un ciclo de imports.
 */
export async function getAutonomy(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const state = await autonomy.getAutonomyState(orgId)
  const kinds = await Promise.all(state.kinds.map(async kind => ({
    ...kind,
    promotion: await assessPromotion(orgId, autonomy.ruleKeyForKind(kind.kind)),
  })))
  return reply.send({ ...state, kinds })
}

export async function updateAutonomy(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, autonomyConfigSchema, request.body)
  if (!body) return
  try {
    return reply.send(await autonomy.setAutonomyConfig(orgId, userId, body))
  } catch (error) {
    return autonomyError(reply, error)
  }
}

export async function runAutonomyPass(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await autonomy.runAutonomyPass(orgId))
}

export async function approveAutonomyDecision(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  try {
    const result = await autonomy.approveDecision(orgId, userId, request.params.id)
    if (!result) return reply.status(404).send({ error: 'Decisión no encontrada' })
    return reply.send(result)
  } catch (error) {
    return autonomyError(reply, error)
  }
}

export async function rejectAutonomyDecision(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const parsed = z.object({ reason: z.string().trim().min(3, 'Explica por qué la rechazas').max(600) })
    .safeParse(request.body ?? {})
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Hace falta un motivo para rechazar', issues: parsed.error.issues })
  }
  try {
    const result = await autonomy.rejectDecision(orgId, userId, request.params.id, parsed.data.reason)
    if (!result) return reply.status(404).send({ error: 'Decisión no encontrada' })
    return reply.send(result)
  } catch (error) {
    return autonomyError(reply, error)
  }
}

/** Promoción por tipo de acción: se gana con historial, no se concede. */
export async function promoteAutonomyKind(
  request: FastifyRequest<{ Params: { kind: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  if (!autonomy.kindDefinition(request.params.kind)) {
    return reply.status(404).send({ error: 'Ese tipo de acción no existe en la lista de §9' })
  }
  try {
    return reply.send(await promoteRule(orgId, userId, autonomy.ruleKeyForKind(request.params.kind)))
  } catch (error) {
    return autonomyError(reply, error)
  }
}

export async function demoteAutonomyKind(
  request: FastifyRequest<{ Params: { kind: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  if (!autonomy.kindDefinition(request.params.kind)) {
    return reply.status(404).send({ error: 'Ese tipo de acción no existe en la lista de §9' })
  }
  const parsed = z.object({ reason: z.string().trim().max(600).optional() }).safeParse(request.body ?? {})
  const reason = parsed.success && parsed.data.reason ? parsed.data.reason : 'Degradación solicitada por el equipo'
  return reply.send(await degradeRule(orgId, autonomy.ruleKeyForKind(request.params.kind), reason))
}

export async function ingestConnectorEvents(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const parsed = connectorEventsSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Acontecimientos no válidos', issues: parsed.error.issues })
  }
  try {
    const result = await connectors.ingestEvents(orgId, request.params.id, parsed.data.events, {
      // La firma se valida sobre el cuerpo tal cual llegó, no sobre el objeto
      // ya parseado: reserializar cambia el orden y rompe el HMAC.
      rawBody: typeof (request as { rawBody?: string }).rawBody === 'string'
        ? (request as { rawBody?: string }).rawBody
        : JSON.stringify(request.body),
      signature: request.headers['x-vendrava-signature'] as string | undefined,
    })
    return reply.send(result)
  } catch (error) {
    return connectorError(reply, error)
  }
}
