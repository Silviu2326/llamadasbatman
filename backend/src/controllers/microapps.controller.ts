import { FastifyRequest, FastifyReply } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { ZodTypeAny } from 'zod'
import { prisma } from '../lib/prisma'
import { parseRequest } from '../lib/validation'
import { getAccessPrincipal, hasPermission, isKnownRole, isPermission } from '../access-control'
import { WalletError } from '../services/wallet.service'
import { RoutingError } from '../providers/router'
import { getMicroapp, isFollowUpKind, listMicroapps, MICROAPP_SURFACES } from '../microapps/registry'
import { resolveConfiguredInput, startMicroappRun } from '../microapps/runtime'
import type { FollowUpAction, MicroappManifest, MicroappSurface } from '../microapps/types'
import { applyFollowUpAction, FollowUpAdapterError } from '../microapps/followUpAdapter'
import { validateMicroappEstimate } from '../microapps/quality'
import { selected60Metadata } from '../microapps/selected60Catalog'
import { previousCatalogMetadata } from '../microapps/catalogMetadata'
import {
  agenticExecutionConfigSchema,
  agenticProfileFor,
  estimateAgenticCouncilCost,
} from '../microapps/agentic'
import { agenticFlowTemplateFor, stableAgenticTemplateJson } from '../microapps/agenticFlowTemplate'
import * as flowService from '../services/flows.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

/**
 * Serialización propia de zod → resumen JSON Schema para el runner genérico
 * del frontend. `zod-to-json-schema` NO está en package.json y la regla del
 * repo es no añadir dependencias: se cubren los tipos que usan los
 * `inputSchema` de microapps (objetos de campos primitivos, enums, arrays,
 * opcionales y defaults) y cualquier otro cae a `{}` — el `uiSchema` del
 * manifiesto es la fuente principal de la UX de formulario de todos modos.
 */
export function zodToJsonSchemaSummary(schema: ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchemaSummary(schema.unwrap() as ZodTypeAny)
  }
  if (schema instanceof z.ZodNullable) {
    return { anyOf: [zodToJsonSchemaSummary(schema.unwrap() as ZodTypeAny), { type: 'null' }] }
  }
  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchemaSummary(schema._def.innerType as ZodTypeAny)
    return { ...inner, default: schema._def.defaultValue() }
  }
  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchemaSummary(schema._def.schema as ZodTypeAny)
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, ZodTypeAny>
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, field] of Object.entries(shape)) {
      properties[key] = zodToJsonSchemaSummary(field)
      if (!field.isOptional()) required.push(key)
    }
    return { type: 'object', properties, ...(required.length ? { required } : {}) }
  }
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' }
    for (const check of schema._def.checks) {
      if (check.kind === 'min') result.minLength = check.value
      if (check.kind === 'max') result.maxLength = check.value
      if (check.kind === 'email') result.format = 'email'
      if (check.kind === 'url') result.format = 'uri'
      if (check.kind === 'uuid') result.format = 'uuid'
      if (check.kind === 'regex') result.pattern = check.regex.source
    }
    return schema.description ? { ...result, description: schema.description } : result
  }
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: schema.isInt ? 'integer' : 'number' }
    for (const check of schema._def.checks) {
      if (check.kind === 'min') result[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value
      if (check.kind === 'max') result[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value
      if (check.kind === 'multipleOf') result.multipleOf = check.value
    }
    return schema.description ? { ...result, description: schema.description } : result
  }
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' }
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: [...schema.options] }
  if (schema instanceof z.ZodLiteral) return { const: schema.value }
  if (schema instanceof z.ZodArray) {
    const result: Record<string, unknown> = { type: 'array', items: zodToJsonSchemaSummary(schema.element as ZodTypeAny) }
    if (schema._def.minLength) result.minItems = schema._def.minLength.value
    if (schema._def.maxLength) result.maxItems = schema._def.maxLength.value
    if (schema._def.exactLength) {
      result.minItems = schema._def.exactLength.value
      result.maxItems = schema._def.exactLength.value
    }
    return result
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema.options as ZodTypeAny[]
    return { anyOf: options.map((option) => zodToJsonSchemaSummary(option)) }
  }
  if (schema instanceof z.ZodRecord) return { type: 'object' }
  return {}
}

/**
 * Proyección pública del manifiesto (07-MICROAPPS §2): lo que el catálogo y el
 * runner necesitan, sin las funciones (`run`, `estimateCost`) ni internals.
 */
export function manifestProjection(manifest: MicroappManifest) {
  const editorial = selected60Metadata(manifest.id)
  const previous = previousCatalogMetadata(manifest.id)
  return {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    promise: manifest.promise,
    category: manifest.category,
    capabilities: manifest.capabilities,
    dataAccess: manifest.dataAccess,
    effects: manifest.effects,
    approvalAction: manifest.approvalAction ?? null,
    agenticProfile: agenticProfileFor(manifest),
    agenticWorkflow: {
      available: true,
      templateUrl: `/api/microapps/${manifest.id}/agentic-flow-template`,
      installUrl: `/api/microapps/${manifest.id}/agentic-flow/install`,
      requiresExplicitExternalReviewConsent: true,
      installInputSchema: {
        type: 'object',
        properties: { allowExternalReview: { const: true } },
        required: ['allowExternalReview'],
        additionalProperties: false,
      },
    },
    freshnessDays: manifest.freshnessDays ?? null,
    followUps: manifest.followUps,
    placements: manifest.placements ?? [],
    resultProjection: manifest.resultProjection ?? null,
    configurationScope: manifest.configurationScope ?? ['run'],
    uiSchema: manifest.uiSchema,
    inputSchema: zodToJsonSchemaSummary(manifest.inputSchema),
    collection: editorial?.collection ?? previous?.collection ?? 'existing',
    editorialNumber: editorial?.number ?? previous?.number ?? null,
    catalogEdition: editorial ? 'selected-60' : previous?.catalogEdition ?? 'existing',
  }
}

/**
 * La cuadrícula solo necesita metadatos editoriales. Mantener aquí una
 * proyección pequeña evita serializar uiSchema/inputSchema/followUps de todo
 * el marketplace; GET /:id conserva el manifiesto público completo para el
 * runner.
 */
export function catalogProjection(manifest: MicroappManifest) {
  const {
    followUps: _followUps,
    uiSchema: _uiSchema,
    inputSchema: _inputSchema,
    agenticProfile: _agenticProfile,
    ...catalogEntry
  } = manifestProjection(manifest)
  return { ...catalogEntry, inputs: catalogInputsSummary(manifest) }
}

/**
 * Resumen de lo que pide la microapp para decidir desde la tarjeta sin abrir
 * el runner: etiqueta + widget + obligatoriedad por campo (sin help, options
 * ni placeholders, que solo necesita el formulario).
 */
export function catalogInputsSummary(manifest: MicroappManifest) {
  const schema = manifest.inputSchema as ZodTypeAny
  const shape = schema instanceof z.ZodObject ? (schema.shape as Record<string, ZodTypeAny>) : {}
  return manifest.uiSchema.map(field => ({
    key: field.key,
    label: field.label,
    widget: field.widget,
    required: shape[field.key] ? !shape[field.key].isOptional() : false,
  }))
}

/**
 * Mapeo único de errores de ejecución (compartido con capabilities.controller):
 * - WalletError 402 → además de code, las dos salidas accionables (recargar o
 *   pasar a BYOK), como exige runCapability.ts.
 * - RoutingError → su statusCode con code y details (decisión transparente).
 * - Errores con { statusCode, code } (MICROAPP_INPUT_INVALID 400,
 *   MICROAPP_UNKNOWN 404...) → tal cual.
 * Cualquier otro error se relanza para el handler global de Fastify.
 */
export function replyWithRunError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof WalletError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      ...(error.statusCode === 402 ? { actions: ['topup', 'byok'] } : {}),
    })
  }
  if (error instanceof RoutingError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code, details: error.details })
  }
  const candidate = error as { statusCode?: number; code?: string; message?: string; details?: unknown }
  if (typeof candidate.statusCode === 'number' && typeof candidate.code === 'string') {
    return reply.status(candidate.statusCode).send({
      error: candidate.message ?? 'Error al ejecutar',
      code: candidate.code,
      ...(candidate.details !== undefined ? { details: candidate.details } : {}),
    })
  }
  throw error
}

/** GET / — catálogo completo de microapps registradas en este proceso. */
export async function list(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ microapps: listMicroapps().map(catalogProjection) })
}

/** GET /:id — manifiesto público de una microapp. */
export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const manifest = getMicroapp(request.params.id)
  if (!manifest) return reply.status(404).send({ error: 'Microapp no encontrada', code: 'MICROAPP_UNKNOWN' })
  return reply.send(manifestProjection(manifest))
}

/** GET /:id/agentic-flow-template — uno de los 147 wrappers instalables. */
export async function getAgenticFlowTemplate(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const manifest = getMicroapp(request.params.id)
  if (!manifest) return reply.status(404).send({ error: 'Microapp no encontrada', code: 'MICROAPP_UNKNOWN' })
  return reply.send(agenticFlowTemplateFor(manifest))
}

/** Instala idempotentemente el wrapper agentic como Flow de la organización. */
export async function installAgenticFlow(
  request: FastifyRequest<{ Params: { id: string }; Body: { allowExternalReview?: unknown } }>,
  reply: FastifyReply,
) {
  const principal = getAccessPrincipal(request)
  if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })
  const manifest = getMicroapp(request.params.id)
  if (!manifest) return reply.status(404).send({ error: 'Microapp no encontrada', code: 'MICROAPP_UNKNOWN' })
  const missing = manifest.dataAccess.filter(permission => !hasPermission(principal.role, permission))
  if (missing.length) {
    return reply.status(403).send({
      error: 'Tu rol no tiene los permisos de datos necesarios para instalar este workflow',
      code: 'MICROAPP_DATA_ACCESS_DENIED',
      details: { missing },
    })
  }
  const consent = z.object({ allowExternalReview: z.literal(true) }).strict().safeParse(request.body ?? {})
  if (!consent.success) {
    return reply.status(400).send({
      error: 'Debes autorizar explícitamente la revisión externa antes de instalar el workflow agentic',
      code: 'AGENTIC_EXTERNAL_REVIEW_CONSENT_REQUIRED',
    })
  }
  const template = agenticFlowTemplateFor(manifest)
  try {
    const existing = await prisma.flow.findFirst({ where: { orgId: principal.orgId, slug: template.slug } })
    if (existing?.currentVersionId) {
      const version = await prisma.flowVersion.findUnique({ where: { id: existing.currentVersionId } })
      if (version && stableAgenticTemplateJson(version.graph) === stableAgenticTemplateJson(template.graph)) {
        return reply.send({ installed: false, flow: await flowService.getFlow(principal.orgId, existing.id), template })
      }
    }
    const published = await flowService.publishFlowVersion({
      orgId: principal.orgId,
      slug: template.slug,
      name: template.name,
      description: template.description,
      graph: template.graph,
      createdById: principal.userId,
    })
    return reply.status(existing ? 200 : 201).send({
      installed: true,
      flow: await flowService.getFlow(principal.orgId, published.flow.id),
      template,
    })
  } catch (error) {
    return replyWithRunError(reply, error)
  }
}

/** POST /:id/estimate — coste estimado para un input concreto (§5.8). */
export async function estimate(
  request: FastifyRequest<{ Params: { id: string }; Body: { input?: unknown; agentic?: unknown } }>,
  reply: FastifyReply
) {
  const manifest = getMicroapp(request.params.id)
  if (!manifest) return reply.status(404).send({ error: 'Microapp no encontrada', code: 'MICROAPP_UNKNOWN' })

  const body = z.object({ input: z.unknown().optional(), agentic: agenticExecutionConfigSchema.optional() }).strict().safeParse(request.body ?? {})
  if (!body.success) {
    return reply.status(400).send({ error: 'Configuración de ejecución inválida', code: 'MICROAPP_RUN_CONFIG_INVALID', details: body.error.flatten() })
  }
  const parsed = manifest.inputSchema.safeParse(body.data.input ?? {})
  if (!parsed.success) {
    return reply.status(400).send({
      error: 'Entrada inválida para la microapp',
      code: 'MICROAPP_INPUT_INVALID',
      details: parsed.error.flatten(),
    })
  }
  const base = validateMicroappEstimate(manifest.id, await manifest.estimateCost(parsed.data))
  if (!body.data.agentic) return reply.send({ cents: base.cents })
  try {
    const agenticCents = await estimateAgenticCouncilCost({
      orgId: (request.user as JWTUser).orgId,
      manifest,
      input: parsed.data,
      config: body.data.agentic,
    })
    return reply.send({
      cents: base.cents + agenticCents,
      baseCents: base.cents,
      agenticCents,
      agenticProfile: agenticProfileFor(manifest),
    })
  } catch (error) {
    return replyWithRunError(reply, error)
  }
}

const runBodySchema = z.object({
  input: z.unknown().optional(),
  leadId: z.string().trim().min(1).max(128).optional(),
  accountId: z.string().trim().min(1).max(128).optional(),
  productionId: z.string().trim().min(1).max(128).optional(),
  callId: z.string().trim().min(1).max(128).optional(),
  opportunityId: z.string().trim().min(1).max(128).optional(),
  conversationId: z.string().trim().min(1).max(128).optional(),
  meetingId: z.string().trim().min(1).max(128).optional(),
  agentic: agenticExecutionConfigSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
}).strict()

type MicroappRunLinks = {
  leadId?: string
  accountId?: string
  productionId?: string
  callId?: string
  opportunityId?: string
  conversationId?: string
  meetingId?: string
}

/**
 * Los enlaces de MicroappRun son columnas ligeras, sin FK compuesta a orgId.
 * Por eso la frontera HTTP debe demostrar pertenencia antes de crear el Job:
 * además de evitar asociaciones cruzadas, el mismo mensaje 404 no revela si
 * el identificador existe en otra organización.
 */
export async function assertMicroappRunLinksBelongToOrg(orgId: string, links: MicroappRunLinks): Promise<void> {
  const checks = await Promise.all([
    links.leadId
      ? prisma.lead.findFirst({ where: { id: links.leadId, orgId }, select: { id: true } })
      : Promise.resolve({ id: 'not-requested' }),
    links.accountId
      ? prisma.account.findFirst({ where: { id: links.accountId, orgId }, select: { id: true } })
      : Promise.resolve({ id: 'not-requested' }),
    links.productionId
      ? prisma.production.findFirst({ where: { id: links.productionId, orgId }, select: { id: true } })
      : Promise.resolve({ id: 'not-requested' }),
    links.callId
      ? prisma.call.findFirst({ where: { id: links.callId, orgId }, select: { id: true } })
      : Promise.resolve({ id: 'not-requested' }),
    links.opportunityId
      ? prisma.opportunity.findFirst({ where: { id: links.opportunityId, orgId }, select: { id: true } })
      : Promise.resolve({ id: 'not-requested' }),
    links.conversationId
      ? prisma.conversation.findFirst({ where: { id: links.conversationId, orgId }, select: { id: true } })
      : Promise.resolve({ id: 'not-requested' }),
    links.meetingId
      ? prisma.meeting.findFirst({ where: { id: links.meetingId, orgId }, select: { id: true } })
      : Promise.resolve({ id: 'not-requested' }),
  ])
  const invalid = [links.leadId && !checks[0] ? 'leadId' : null, links.accountId && !checks[1] ? 'accountId' : null, links.productionId && !checks[2] ? 'productionId' : null, links.callId && !checks[3] ? 'callId' : null, links.opportunityId && !checks[4] ? 'opportunityId' : null, links.conversationId && !checks[5] ? 'conversationId' : null, links.meetingId && !checks[6] ? 'meetingId' : null]
    .filter((key): key is string => key !== null)
  if (invalid.length) {
    throw Object.assign(new Error('Uno o más vínculos no existen en esta organización'), {
      statusCode: 404,
      code: 'MICROAPP_LINK_NOT_FOUND',
      details: { invalid },
    })
  }
}

/**
 * POST /:id/run — crea el Job. Los guards de la ruta ya comprobaron
 * costs.request y el entitlement `microapps`; aquí queda el gate específico
 * del manifiesto: cada permiso de `dataAccess` debe estar concedido al rol del
 * usuario (denegación por defecto — un permiso desconocido nunca pasa).
 */
export async function run(
  request: FastifyRequest<{ Params: { id: string }; Body: { input?: unknown; leadId?: string; accountId?: string; productionId?: string; callId?: string; opportunityId?: string; conversationId?: string; meetingId?: string; agentic?: unknown; idempotencyKey?: string } }>,
  reply: FastifyReply
) {
  const principal = getAccessPrincipal(request)
  if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })

  const manifest = getMicroapp(request.params.id)
  if (!manifest) return reply.status(404).send({ error: 'Microapp no encontrada', code: 'MICROAPP_UNKNOWN' })

  const missing = manifest.dataAccess.filter((permission) => !hasPermission(principal.role, permission))
  if (missing.length) {
    return reply.status(403).send({
      error: 'Tu rol no tiene los permisos de datos que esta microapp necesita',
      code: 'MICROAPP_DATA_ACCESS_DENIED',
      details: { missing },
    })
  }

  const body = parseRequest(reply, runBodySchema, request.body ?? {})
  if (!body) return

  const rawHeaderKey = request.headers['idempotency-key']
  const headerValue = Array.isArray(rawHeaderKey) ? rawHeaderKey[0] : rawHeaderKey
  const headerKey = headerValue === undefined
    ? undefined
    : z.string().trim().min(8).max(180).safeParse(headerValue)
  if (headerKey && !headerKey.success) {
    return reply.status(400).send({ error: 'Idempotency-Key no válida', code: 'IDEMPOTENCY_KEY_INVALID' })
  }
  if (body.idempotencyKey && headerKey?.success && body.idempotencyKey !== headerKey.data) {
    return reply.status(409).send({ error: 'La clave del body y la cabecera no coinciden', code: 'IDEMPOTENCY_KEY_CONFLICT' })
  }
  const idempotencyKey = body.idempotencyKey ?? (headerKey?.success ? headerKey.data : undefined)

  try {
    // CallDetail can launch call-prep with only the call id. Resolve its lead
    // at the tenant boundary so the UI does not need a second lookup or a
    // duplicate lead selector.
    let leadId = body.leadId
    if (!leadId && body.callId) {
      const call = await prisma.call.findFirst({
        where: { id: body.callId, orgId: principal.orgId },
        select: { leadId: true },
      })
      leadId = call?.leadId ?? undefined
    }

    const links = {
      leadId,
      accountId: body.accountId,
      productionId: body.productionId,
      callId: body.callId,
      opportunityId: body.opportunityId,
      conversationId: body.conversationId,
      meetingId: body.meetingId,
    }
    await assertMicroappRunLinksBelongToOrg(principal.orgId, links)
    const { jobId } = await startMicroappRun({
      orgId: principal.orgId,
      microappId: manifest.id,
      input: body.input ?? {},
      createdById: principal.userId,
      links,
      agentic: body.agentic,
      idempotencyKey,
    })
    return reply.send({ jobId })
  } catch (error) {
    return replyWithRunError(reply, error)
  }
}

const listRunsQuerySchema = z.object({
  microappId: z.string().trim().min(1).max(128).optional(),
  leadId: z.string().trim().min(1).max(128).optional(),
  accountId: z.string().trim().min(1).max(128).optional(),
  productionId: z.string().trim().min(1).max(128).optional(),
  callId: z.string().trim().min(1).max(128).optional(),
  opportunityId: z.string().trim().min(1).max(128).optional(),
  conversationId: z.string().trim().min(1).max(128).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

// Proyección ligera del historial: sin `input` ni `result` (pueden pesar);
// el detalle completo se pide por id.
const RUN_LIGHT_SELECT = {
  id: true,
  microappId: true,
  version: true,
  jobId: true,
  staleAt: true,
  leadId: true,
  accountId: true,
  productionId: true,
  callId: true,
  opportunityId: true,
  conversationId: true,
  createdById: true,
  createdAt: true,
} as const

type MicroappRunAccessRecord = {
  microappId: string
  dataAccessSnapshot?: unknown | null
  accessRolesSnapshot?: unknown | null
}

function validSnapshotArray(value: unknown, predicate: (item: unknown) => boolean): value is string[] {
  return Array.isArray(value)
    && new Set(value).size === value.length
    && value.every(item => typeof item === 'string' && predicate(item))
}

/**
 * Autoriza el historial con la política congelada en el run. Solo las filas
 * legacy con ambas columnas NULL recurren al manifiesto actual. Un manifiesto
 * retirado, un snapshot parcial o JSON corrupto cierran el acceso.
 */
export function canReadMicroappRun(role: unknown, run: MicroappRunAccessRecord): boolean {
  if (!isKnownRole(role)) return false
  const manifest = getMicroapp(run.microappId)
  if (!manifest) return false
  const dataSnapshot = run.dataAccessSnapshot
  const rolesSnapshot = run.accessRolesSnapshot
  if (dataSnapshot == null && rolesSnapshot == null) {
    return manifest.dataAccess.every(permission => hasPermission(role, permission))
  }
  if (!validSnapshotArray(dataSnapshot, isPermission) || !validSnapshotArray(rolesSnapshot, isKnownRole)) return false
  // accessRolesSnapshot ya es la materialización de dataAccessSnapshot contra
  // la matriz RBAC de aquella versión. Recalcularla con la matriz actual
  // permitiría que cambios futuros alterasen la política histórica.
  return rolesSnapshot.includes(role)
}

/** GET /runs — historial de ejecuciones de la org, filtrable por vínculo. */
export async function listRuns(
  request: FastifyRequest<{ Querystring: { microappId?: string; leadId?: string; accountId?: string; productionId?: string; callId?: string; opportunityId?: string; conversationId?: string; page?: string; limit?: string } }>,
  reply: FastifyReply
) {
  const principal = getAccessPrincipal(request)
  if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })
  const { orgId } = principal
  const query = parseRequest(reply, listRunsQuerySchema, request.query)
  if (!query) return

  const manifests = listMicroapps()
  const knownMicroappIds = manifests.map(manifest => manifest.id)
  const readableLegacyIds = manifests
    .filter(manifest => manifest.dataAccess.every(permission => hasPermission(principal.role, permission)))
    .map(manifest => manifest.id)
  const requestedManifest = query.microappId ? getMicroapp(query.microappId) : null
  if (query.microappId && !requestedManifest) {
    return reply.status(403).send({
      error: 'Tu rol no puede consultar el historial de esta microapp',
      code: 'MICROAPP_HISTORY_ACCESS_DENIED',
    })
  }

  const page = query.page ?? 1
  const limit = query.limit ?? 25
  const accessWhere = {
    microappId: { in: knownMicroappIds },
    OR: [
      {
        dataAccessSnapshot: { not: Prisma.DbNull },
        accessRolesSnapshot: { array_contains: [principal.role] },
      },
      {
        dataAccessSnapshot: { equals: Prisma.DbNull },
        accessRolesSnapshot: { equals: Prisma.DbNull },
        microappId: { in: readableLegacyIds },
      },
    ],
  }
  const baseWhere = {
    orgId,
    ...(query.microappId ? { microappId: query.microappId } : {}),
    ...(query.leadId ? { leadId: query.leadId } : {}),
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(query.productionId ? { productionId: query.productionId } : {}),
    ...(query.callId ? { callId: query.callId } : {}),
    ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
    ...(query.conversationId ? { conversationId: query.conversationId } : {}),
  }
  const where = {
    ...baseWhere,
    AND: [accessWhere],
  }
  const [total, runs] = await Promise.all([
    prisma.microappRun.count({ where }),
    prisma.microappRun.findMany({
      where,
      select: RUN_LIGHT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])
  if (query.microappId && total === 0) {
    const matchingRuns = await prisma.microappRun.count({ where: baseWhere })
    if (matchingRuns > 0 || !readableLegacyIds.includes(query.microappId)) {
      return reply.status(403).send({
        error: 'Tu rol no puede consultar el historial de esta microapp',
        code: 'MICROAPP_HISTORY_ACCESS_DENIED',
      })
    }
  }

  return reply.send({
    runs,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  })
}

/** GET /runs/:id — detalle con `result` completo (y `staleAt` para el aviso de caducidad). */
export async function getRun(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const principal = getAccessPrincipal(request)
  if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })
  const { orgId } = principal
  const runRow = await prisma.microappRun.findFirst({ where: { id: request.params.id, orgId } })
  if (!runRow) return reply.status(404).send({ error: 'Ejecución no encontrada' })
  if (!canReadMicroappRun(principal.role, runRow)) {
    return reply.status(403).send({
      error: 'Tu rol no puede consultar el resultado de esta microapp',
      code: 'MICROAPP_HISTORY_ACCESS_DENIED',
    })
  }
  return reply.send(runRow)
}

const surfaceQuerySchema = z.object({ entityId: z.string().trim().min(1).max(128).optional() }).strict()

/** Discovery used by CRM surfaces; hardcoded page button lists are deliberately not consulted. */
export async function listSurface(
  request: FastifyRequest<{ Params: { surface: string }; Querystring: { entityId?: string } }>,
  reply: FastifyReply,
) {
  const principal = getAccessPrincipal(request)
  if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })
  if (!MICROAPP_SURFACES.includes(request.params.surface as MicroappSurface)) return reply.status(400).send({ error: 'Surface inválida', code: 'MICROAPP_SURFACE_INVALID' })
  const query = parseRequest(reply, surfaceQuerySchema, request.query)
  if (!query) return
  const surface = request.params.surface as MicroappSurface
  const entries = await Promise.all(listMicroapps()
    .filter(manifest => manifest.placements?.some(placement => placement.surface === surface))
    .filter(manifest => manifest.dataAccess.every(permission => hasPermission(principal.role, permission)))
    .map(async manifest => {
      const placement = manifest.placements!.find(item => item.surface === surface)!
      const link = query.entityId ? { [`${surface}Id`]: query.entityId } : {}
      const lastRun = query.entityId
        ? await prisma.microappRun.findFirst({ where: { orgId: principal.orgId, microappId: manifest.id, ...link }, select: { id: true, createdAt: true, staleAt: true, result: true }, orderBy: { createdAt: 'desc' } })
        : null
      return { ...manifestProjection(manifest), actionLabel: placement.actionLabel, role: placement.role, trigger: placement.trigger, estimatedCost: await manifest.estimateCost({}).catch(() => ({ cents: 0 })), lastRun: lastRun ? { id: lastRun.id, createdAt: lastRun.createdAt, staleAt: lastRun.staleAt, hasResult: Boolean(lastRun.result) } : null }
    }))
  return reply.send({ surface, entityId: query.entityId ?? null, microapps: entries })
}

export async function listProjections(
  request: FastifyRequest<{ Querystring: { surface?: string; entityId?: string } }>,
  reply: FastifyReply,
) {
  const principal = getAccessPrincipal(request)
  if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })
  const query = z.object({ surface: z.string().trim().min(1).max(40).optional(), entityId: z.string().trim().min(1).max(128).optional() }).strict().safeParse(request.query)
  if (!query.success) return reply.status(400).send({ error: 'Filtro inválido', code: 'MICROAPP_PROJECTION_FILTER_INVALID' })
  const projectionInclude = { run: { select: { microappId: true } } } as const
  const rows = await prisma.microappProjection.findMany({ where: { orgId: principal.orgId, ...(query.data.surface ? { surface: query.data.surface } : {}), ...(query.data.entityId ? { entityId: query.data.entityId } : {}) }, include: projectionInclude, orderBy: { createdAt: 'desc' }, take: 100 })
  // call-prep projects its brief to the lead (the canonical CRM record) but
  // the same brief must be visible from the originating call detail too.
  // Keep runId unique and expose a read-side alias instead of duplicating data.
  const callAlias = query.data.surface === 'call' && query.data.entityId
    ? await (async () => {
      const runs = await prisma.microappRun.findMany({ where: { orgId: principal.orgId, microappId: 'call-prep', callId: query.data.entityId }, select: { id: true } })
      if (!runs.length) return []
      return prisma.microappProjection.findMany({ where: { orgId: principal.orgId, runId: { in: runs.map(run => run.id) } }, include: projectionInclude, orderBy: { createdAt: 'desc' }, take: 20 })
    })()
    : []
  const combined = [...rows, ...callAlias].filter((row, index, list) => list.findIndex(candidate => candidate.id === row.id) === index)
  return reply.send({ projections: combined.map(({ run, ...row }) => ({ ...row, microappId: run.microappId, surface: query.data.surface ?? row.surface, entityId: query.data.entityId ?? row.entityId, stale: Boolean(row.staleAt && row.staleAt.getTime() <= Date.now()) })) })
}

const configSchema = z.object({ scope: z.enum(['organization', 'team', 'user']), scopeId: z.string().trim().min(1).max(128).optional(), values: z.record(z.unknown()) }).strict()

export async function getConfig(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const principal = getAccessPrincipal(request)
  const manifest = getMicroapp(request.params.id)
  if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })
  if (!manifest) return reply.status(404).send({ error: 'Microapp no encontrada', code: 'MICROAPP_UNKNOWN' })
  const rows = await prisma.microappConfig.findMany({ where: { orgId: principal.orgId, microappId: manifest.id } })
  return reply.send({ microappId: manifest.id, fields: manifest.uiSchema.filter(field => field.scope && field.scope !== 'run'), configs: rows })
}

export async function putConfig(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const principal = getAccessPrincipal(request)
  const manifest = getMicroapp(request.params.id)
  if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })
  if (!manifest) return reply.status(404).send({ error: 'Microapp no encontrada', code: 'MICROAPP_UNKNOWN' })
  const body = parseRequest(reply, configSchema, request.body)
  if (!body) return
  if (body.scope !== 'user' && !hasPermission(principal.role, 'organization.manage')) {
    return reply.status(403).send({ error: 'No puedes modificar configuración organizativa', code: 'MICROAPP_CONFIG_FORBIDDEN' })
  }
  const scopeId = body.scope === 'user' ? body.scopeId ?? principal.userId : body.scopeId ?? null
  const allowed = new Set(manifest.uiSchema.filter(field => field.scope === body.scope).map(field => field.key))
  const unknown = Object.keys(body.values).filter(key => !allowed.has(key))
  if (unknown.length) return reply.status(400).send({ error: 'La configuración contiene campos no declarados para este nivel', code: 'MICROAPP_CONFIG_FIELDS_INVALID', details: { unknown } })
  const existing = await prisma.microappConfig.findFirst({ where: { orgId: principal.orgId, microappId: manifest.id, scope: body.scope, scopeId } })
  const config = existing
    ? await prisma.microappConfig.update({ where: { id: existing.id }, data: { values: body.values as never } })
    : await prisma.microappConfig.create({ data: { orgId: principal.orgId, microappId: manifest.id, scope: body.scope, scopeId, values: body.values as never } })
  return reply.send(config)
}

export async function applyAction(
  request: FastifyRequest<{ Params: { runId: string }; Body: { action?: FollowUpAction } }>,
  reply: FastifyReply,
) {
  const principal = getAccessPrincipal(request)
  if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })
  const body = z.object({ action: z.object({ kind: z.string().trim().min(1), label: z.string().trim().min(1), params: z.record(z.unknown()).optional() }).strict() }).strict().safeParse(request.body ?? {})
  if (!body.success) return reply.status(400).send({ error: 'Acción inválida', code: 'MICROAPP_ACTION_INVALID', details: body.error.flatten() })
  if (!isFollowUpKind(body.data.action.kind)) return reply.status(400).send({ error: 'Tipo de acción no soportado', code: 'MICROAPP_ACTION_KIND_INVALID' })
  try {
    return reply.send(await applyFollowUpAction({ orgId: principal.orgId, userId: principal.userId, role: principal.role, runId: request.params.runId, action: body.data.action }))
  } catch (error) {
    if (error instanceof FollowUpAdapterError) return reply.status(error.statusCode).send({ error: error.message, code: error.code })
    throw error
  }
}
