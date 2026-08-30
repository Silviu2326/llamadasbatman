import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { hasPermission } from '../access-control'
import * as service from '../services/revenueIntelligence.service'
import {
  getBusinessIntelligenceContext,
  listBusinessInvestigations,
  RESEARCH_LENSES,
  type ResearchLensKey,
  BUSINESS_INTELLIGENCE_MICROAPP_ID,
} from '../services/businessIntelligence.service'
import { startMicroappRun } from '../microapps/runtime'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()
const policyParamsSchema = z.object({ key: z.enum(service.GOVERNANCE_POLICY_KEYS) }).strict()
const objectSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 250_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El objeto no puede superar 250 KB' })
  }
})

const listNextActionsQuerySchema = z.object({
  status: z.string().trim().min(1).max(32).optional(),
  limit: z.coerce.number().int().min(1).max(250).optional(),
}).strict()
const refreshNextActionsSchema = z.object({ limit: z.coerce.number().int().min(1).max(250).optional() }).strict()
const updateNextActionSchema = z.object({ status: z.enum(['accepted', 'dismissed', 'executed']) }).strict()

const variantSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/, 'La clave solo admite letras, números, guiones y guiones bajos'),
  name: z.string().trim().min(1).max(160),
  isControl: z.boolean().optional(),
  allocation: z.coerce.number().int().min(0).max(10_000).optional(),
  payload: objectSchema.nullable().optional(),
}).strict()
const createExperimentSchema = z.object({
  name: z.string().trim().min(2).max(160),
  surface: z.enum(service.EXPERIMENT_SURFACES),
  primaryMetric: z.string().trim().min(2).max(120),
  audienceDefinition: objectSchema.nullable().optional(),
  attributionWindowDays: z.coerce.number().int().min(1).max(365).optional(),
  budgetCents: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
  variants: z.array(variantSchema).min(2).max(8),
}).strict()
const updateExperimentSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  primaryMetric: z.string().trim().min(2).max(120).optional(),
  audienceDefinition: objectSchema.nullable().optional(),
  attributionWindowDays: z.coerce.number().int().min(1).max(365).optional(),
  budgetCents: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
  status: z.enum(['paused', 'completed', 'archived']).optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), 'Incluye al menos un campo para actualizar')
const listExperimentsQuerySchema = z.object({
  status: z.enum(service.EXPERIMENT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()
const assignmentSchema = z.object({
  subjectKey: z.string().trim().min(1).max(256),
  leadId: z.string().trim().min(1).max(128).optional(),
  metadata: objectSchema.nullable().optional(),
}).strict()
const conversionSchema = z.object({
  subjectKey: z.string().trim().min(1).max(256),
  conversionType: z.string().trim().min(1).max(100),
  attributedRevenue: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().trim().min(3).max(3).toUpperCase().optional(),
}).strict()

const listMemoryQuerySchema = z.object({
  status: z.enum(service.MEMORY_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()
const createMemorySchema = z.object({
  sourceType: z.enum(['conversation', 'call', 'experiment', 'manual']),
  sourceId: z.string().trim().min(1).max(128).nullable().optional(),
  targetType: z.enum(['playbook', 'knowledge_base', 'message_template', 'campaign']),
  targetId: z.string().trim().min(1).max(128).nullable().optional(),
  title: z.string().trim().min(3).max(220),
  summary: z.string().trim().min(10).max(8_000),
  evidence: objectSchema.nullable().optional(),
  proposedChange: objectSchema.nullable().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
}).strict()
const reviewMemorySchema = z.object({
  decision: z.enum(['approve', 'reject', 'mark_applied', 'approved', 'rejected']),
  reviewComment: z.string().trim().min(1).max(4_000).optional(),
}).strict()

const policySchema = z.object({ enabled: z.boolean(), config: objectSchema.nullable().optional() }).strict()
const investigationQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(20).optional() }).strict()
const startInvestigationSchema = z.object({
  lens: z.enum(RESEARCH_LENSES),
  focus: z.string().trim().max(1200).optional().default(''),
  allowExternalReview: z.literal(true),
}).strict()

function handleServiceError(error: unknown, reply: FastifyReply) {
  if (error instanceof service.RevenueIntelligenceNotFoundError) return reply.status(404).send({ error: error.message })
  if (error instanceof service.RevenueIntelligenceStateError) return reply.status(409).send({ error: error.message })
  if (error instanceof service.RevenueIntelligencePolicyError) return reply.status(403).send({ error: error.message })
  throw error
}

export async function getBusinessContext(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const context = await getBusinessIntelligenceContext(orgId)
  if (!context) return reply.status(404).send({ error: 'Organización no encontrada', code: 'ORGANIZATION_NOT_FOUND' })
  return reply.send(context)
}

export async function listInvestigations(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, investigationQuerySchema, request.query)
  if (!query) return
  return reply.send(await listBusinessInvestigations(orgId, query.limit))
}

export async function startInvestigation(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, startInvestigationSchema, request.body ?? {})
  if (!body) return
  const context = await getBusinessIntelligenceContext(orgId)
  if (!context) return reply.status(404).send({ error: 'Organización no encontrada', code: 'ORGANIZATION_NOT_FOUND' })
  if (!context.intelligenceReadiness.canResearch) {
    return reply.status(409).send({
      error: 'Completa al menos la descripción o el sector de la empresa antes de investigar.',
      code: 'BUSINESS_CONTEXT_INCOMPLETE',
      details: { missing: context.intelligenceReadiness.missing },
    })
  }
  const lens = context.lenses.find(item => item.key === body.lens)
  if (!lens) return reply.status(400).send({ error: 'Lente de investigación desconocida', code: 'RESEARCH_LENS_UNKNOWN' })

  try {
    const description = context.profile.description.trim()
      || `${context.company.name} opera en el sector ${context.company.industry || context.vertical.label}.`
    const result = await startMicroappRun({
      orgId,
      createdById: userId,
      microappId: BUSINESS_INTELLIGENCE_MICROAPP_ID,
      input: {
        company: {
          name: context.company.name,
          website: context.company.website,
          industry: context.company.industry,
          address: context.company.address,
          currency: context.company.currency,
        },
        businessDescription: description,
        idealCustomer: context.profile.idealCustomer,
        valueProposition: context.profile.valueProposition,
        differentiators: context.profile.differentiators,
        offers: context.profile.offers.filter(offer => offer.active && offer.name.trim()).map(offer => ({ name: offer.name, description: offer.description })),
        vertical: context.vertical.label,
        lens: body.lens as ResearchLensKey,
        lensTitle: lens.title,
        queryAngles: lens.queryAngles,
        focus: body.focus,
      },
      agentic: {
        enabled: true,
        strategy: 'closed_loop',
        rounds: 2,
        qualityThreshold: 88,
        maxAdditionalCostCents: 200,
        allowExternalReview: body.allowExternalReview,
      },
      idempotencyKey: `business-radar:${body.lens}:${Date.now()}`,
    })
    return reply.status(202).send({ ...result, microappId: BUSINESS_INTELLIGENCE_MICROAPP_ID })
  } catch (error) {
    const details = error as { message?: string; code?: string; statusCode?: number }
    return reply.status(details.statusCode && details.statusCode >= 400 && details.statusCode < 600 ? details.statusCode : 500).send({
      error: details.message || 'No se pudo iniciar la investigación',
      code: details.code || 'BUSINESS_INVESTIGATION_START_FAILED',
    })
  }
}

export async function listNextActions(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listNextActionsQuerySchema, request.query)
  if (!query) return
  return reply.send(await service.listNextBestActions(orgId, query))
}

export async function refreshNextActions(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, refreshNextActionsSchema, request.body ?? {})
  if (!body) return
  return reply.send(await service.refreshNextBestActions(orgId, userId, body.limit))
}

export async function updateNextAction(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, updateNextActionSchema, request.body)
  if (!params || !body) return
  try {
    return reply.send(await service.updateNextBestActionStatus(orgId, userId, params.id, body.status))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function listExperiments(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listExperimentsQuerySchema, request.query)
  if (!query) return
  return reply.send(await service.listExperiments(orgId, query.status, query.limit))
}

export async function getExperiment(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await service.getExperiment(orgId, params.id))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function createExperiment(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, createExperimentSchema, request.body)
  if (!body) return
  try {
    return reply.status(201).send(await service.createExperiment(orgId, userId, body))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function updateExperiment(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, updateExperimentSchema, request.body)
  if (!params || !body) return
  try {
    return reply.send(await service.updateExperiment(orgId, userId, params.id, body))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function startExperiment(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId, role } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  try {
    return reply.send(await service.startExperiment(orgId, userId, role, params.id))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function assignVariant(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, assignmentSchema, request.body)
  if (!params || !body) return
  try {
    return reply.status(201).send(await service.assignExperimentVariant(orgId, params.id, body.subjectKey, body.leadId, body.metadata))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function recordConversion(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, conversionSchema, request.body)
  if (!params || !body) return
  try {
    return reply.send(await service.recordExperimentConversion(orgId, userId, params.id, body.subjectKey, body))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function listMemoryProposals(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listMemoryQuerySchema, request.query)
  if (!query) return
  return reply.send(await service.listMemoryProposals(orgId, query.status, query.limit))
}

export async function createMemoryProposal(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, createMemorySchema, request.body)
  if (!body) return
  try {
    return reply.status(201).send(await service.createMemoryProposal(orgId, userId, body))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function reviewMemoryProposal(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, reviewMemorySchema, request.body)
  if (!params || !body) return
  const decision = body.decision === 'approved' ? 'approve' : body.decision === 'rejected' ? 'reject' : body.decision
  try {
    return reply.send(await service.reviewMemoryProposal(orgId, userId, params.id, decision, body.reviewComment))
  } catch (error) {
    return handleServiceError(error, reply)
  }
}

export async function governanceOverview(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, role } = request.user as JWTUser
  const overview = await service.governanceOverview(orgId)
  // La pantalla de gobierno pinta su boton de edicion segun este flag. Sin el,
  // la accion principal quedaba muerta para todos los roles. La decision es del
  // servidor: se calcula con el mismo permiso que guarda PUT /governance/policies/:key.
  return reply.send({ ...overview, canManagePolicies: hasPermission(role, 'governance.write', 'org') })
}

export async function listGovernancePolicies(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ policies: await service.listGovernancePolicies(orgId) })
}

export async function getGovernancePolicy(request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, policyParamsSchema, request.params)
  if (!params) return
  return reply.send(await service.getGovernancePolicy(orgId, params.key))
}

export async function updateGovernancePolicy(request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, policyParamsSchema, request.params)
  const body = parseRequest(reply, policySchema, request.body)
  if (!params || !body) return
  return reply.send(await service.updateGovernancePolicy(orgId, userId, params.key, body))
}
