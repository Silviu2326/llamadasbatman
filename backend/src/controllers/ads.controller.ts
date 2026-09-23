import { FastifyRequest, FastifyReply } from 'fastify'
import * as wizardService from '../services/adsWizard.service'
import * as strategyService from '../services/adsStrategy.service'
import * as insightsService from '../services/metaInsights.service'
import * as adsOverviewService from '../services/adsOverview.service'
import * as adDataQualityService from '../services/adDataQuality.service'
import * as adPolicyService from '../services/adPolicy.service'
import * as adActionService from '../services/adAction.service'
import * as adRuleAutonomyService from '../services/adRuleAutonomy.service'
import * as adExperimentService from '../services/adExperiment.service'
import * as adAttributionService from '../services/adAttribution.service'
import * as adTargetsService from '../services/adTargets.service'
import * as adDiagnosticsService from '../services/adDiagnostics.service'
import * as metaConversionsService from '../services/metaConversions.service'
import * as metaCampaignBuilder from '../services/metaCampaignBuilder.service'
import { prisma } from '../lib/prisma'
import { z } from 'zod'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const knowledgeContextSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(180),
  type: z.string().trim().max(60).optional(),
  content: z.string().trim().max(5000),
})

const strategyInputSchema = z.object({
  vertical: z.string().trim().min(1).max(120),
  objetivo: z.string().trim().min(1).max(180),
  presupuestoMensual: z.coerce.number().positive().max(100000),
  audience: z.string().trim().max(160).optional(),
  campaignFocus: z.string().trim().min(1).max(180),
  destination: z.enum(['landing', 'website', 'whatsapp', 'calendar', 'app']),
  knowledgeContext: knowledgeContextSchema.nullable().optional(),
})

const draftInputSchema = z.object({
  vertical: z.string().trim().max(120).optional(),
  objetivo: z.string().trim().max(180).optional(),
  audience: z.string().trim().max(160).nullable().optional(),
  campaignFocus: z.string().trim().max(180).optional(),
  destination: z.enum(['landing', 'website', 'whatsapp', 'calendar', 'app']).optional(),
  knowledgeContext: knowledgeContextSchema.nullable().optional(),
  presupuesto: z.union([z.coerce.number().positive().max(100000), z.null()]).optional(),
  strategy: z.record(z.unknown()).nullable().optional(),
  creativeIndex: z.coerce.number().int().min(0).max(2).optional(),
})

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({
    error: 'Datos de campaña no válidos',
    issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })),
  })
}

export async function strategy(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply,
) {
  const parsed = strategyInputSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)

  const result = await strategyService.generateStrategy(parsed.data)
  return reply.send(result)
}

export async function getDraft(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const draft = await strategyService.getDraft(orgId, userId)
  return reply.send(draft)
}

export async function overview(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await adsOverviewService.getAdsOverview(orgId))
}

/**
 * Integridad + política en una sola lectura, para pantallas que no necesitan
 * el resumen completo de /overview (la de cuenta de Meta, por ejemplo).
 */
export async function dataQuality(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const [quality, policy, capi] = await Promise.all([
    adDataQualityService.getDataQuality(orgId),
    adPolicyService.getPolicy(orgId),
    metaConversionsService.getCapiHealth(orgId),
  ])
  return reply.send({
    ...quality,
    capi,
    policy: {
      autonomyLevel: policy.autonomyLevel,
      mode: policy.mode,
      killSwitch: policy.killSwitchEnabled ? 'engaged' : 'ready',
      killSwitchReason: policy.killSwitchReason,
    },
  })
}

export async function refreshDataQuality(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await adDataQualityService.evaluateDataQuality(orgId))
}

export async function saveDraft(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const parsed = draftInputSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)

  const draft = await strategyService.saveDraft(orgId, userId, parsed.data)
  return reply.send(draft)
}

const wizardInputSchema = z.object({
  vertical: z.string().trim().min(1).max(120),
  objetivo: z.string().trim().min(1).max(180),
  presupuestoMensual: z.coerce.number().positive().max(100000),
  audience: z.string().trim().max(160).optional(),
  campaignFocus: z.string().trim().min(1).max(180),
  destination: z.enum(['landing', 'website', 'whatsapp', 'calendar', 'app']),
  knowledgeContext: knowledgeContextSchema.nullable().optional(),
  strategy: z.record(z.unknown()).optional(),
  // El margen es opcional: obligarlo bloquearia crear campanas a quien aun no
  // lo sepa. Sin el, la campana existe pero no tiene objetivo de coste y la
  // pagina lo dice en vez de inventarse uno.
  marginPerSaleCents: z.coerce.number().int().positive().max(100_000_000).optional(),
  acquisitionSharePct: z.coerce.number().int().min(1).max(100).optional(),
  // Variante de anuncio elegida en el asistente; se persiste en adAssets.creative.
  creative: z.object({
    label: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(500),
    cta: z.string().trim().min(1).max(40),
  }).optional(),
})

export async function wizard(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = wizardInputSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  const campaign = await wizardService.runWizard(orgId, parsed.data)
  return reply.status(201).send(campaign)
}

export async function campaignStatus(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const campaign = await wizardService.getCampaignAdStatus(orgId, request.params.id)
  if (!campaign) return reply.status(404).send({ error: 'Not found' })
  return reply.send(campaign)
}

export async function listInsights(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const rows = await insightsService.listInsights(orgId, request.params.id)
  return reply.send(rows)
}

export async function updateMaxCpl(
  request: FastifyRequest<{ Params: { id: string }; Body: { maxCostPerLeadCents: number } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const { maxCostPerLeadCents } = request.body
  if (maxCostPerLeadCents == null || maxCostPerLeadCents < 0) {
    return reply.status(400).send({ error: 'maxCostPerLeadCents requerido y >= 0' })
  }
  const result = await prisma.campaign.updateMany({
    where: { id: request.params.id, orgId },
    data: { maxCostPerLeadCents },
  })
  if (!result.count) return reply.status(404).send({ error: 'Campaña no encontrada' })
  return reply.send({ ok: true })
}

async function runMetaAction(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
  action: () => Promise<unknown>,
) {
  const { orgId } = request.user as JWTUser
  try {
    const result = await action()
    return reply.send(result)
  } catch (error) {
    // Los fallos previos a Meta (sin página, sin creatividad, APP_URL local,
    // consentimiento…) son 4xx con código propio: el usuario puede corregirlos
    // y la interfaz enseña el mensaje. Solo lo que falla en Meta es 502/504.
    const classified = metaCampaignBuilder.classifyPublishError(error)
    console.error(`[Ads] action failed for ${orgId}/${request.params.id}:`, classified.code, (error as Error).message)
    return reply.status(classified.status).send({
      error: classified.message,
      code: classified.code,
      ...(classified.details ? { details: classified.details } : {}),
    })
  }
}

export async function publish(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return runMetaAction(request, reply, () => metaCampaignBuilder.publishCampaign(orgId, request.params.id))
}

export async function activate(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return runMetaAction(request, reply, () => metaCampaignBuilder.activateCampaign(orgId, request.params.id))
}

export async function pause(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return runMetaAction(request, reply, () => metaCampaignBuilder.pauseCampaign(orgId, request.params.id))
}

export async function remoteStatus(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return runMetaAction(request, reply, () => metaCampaignBuilder.getRemoteStatus(orgId, request.params.id))
}

// ─── Fase 3: política de autonomía y decisión humana ─────────────────────────

const decisionNoteSchema = z.object({ note: z.string().trim().max(600).optional() })
const rejectSchema = z.object({
  // El motivo es obligatorio: en N1 es el único aprendizaje que recoge el
  // sistema, y un rechazo sin razón no enseña nada a la siguiente versión.
  reason: z.string().trim().min(3, 'Explica por qué la rechazas').max(600),
})
const policyPatchSchema = z.object({
  targetSignal: z.enum(['lead', 'qualified_lead', 'sale']).optional(),
  autonomyLevel: z.enum(['N1', 'N2', 'N3']).optional(),
  mode: z.enum(['shadow', 'live']).optional(),
  maxDailySpendCents: z.coerce.number().int().min(0).nullable().optional(),
  maxMonthlySpendCents: z.coerce.number().int().min(0).nullable().optional(),
  maxChangesPerDay: z.coerce.number().int().min(1).max(50).optional(),
  minMinutesBetweenChanges: z.coerce.number().int().min(0).max(10_080).optional(),
  protectLearningPhase: z.boolean().optional(),
  minCampaignBudgetCents: z.coerce.number().int().min(0).nullable().optional(),
  maxNewLeadsPerDay: z.coerce.number().int().min(0).nullable().optional(),
})

function policyError(reply: FastifyReply, error: unknown) {
  if (
    error instanceof adPolicyService.PolicyBlockedError ||
    error instanceof adPolicyService.DecisionNotActionableError
  ) {
    return reply.status(error.statusCode).send({ error: error.message })
  }
  throw error
}

export async function getPolicy(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await adPolicyService.getPolicy(orgId))
}

export async function updatePolicy(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const parsed = policyPatchSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    return reply.send(await adPolicyService.updatePolicy(orgId, userId, parsed.data))
  } catch (error) {
    return policyError(reply, error)
  }
}

export async function stopAutonomy(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const parsed = z.object({ reason: z.string().trim().max(300).optional(), resume: z.boolean().optional() })
    .safeParse(request.body ?? {})
  if (!parsed.success) return validationError(reply, parsed.error)
  const enabled = !parsed.data.resume
  return reply.send(await adPolicyService.setKillSwitch(orgId, userId, enabled, parsed.data.reason))
}

export async function approveDecision(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const parsed = decisionNoteSchema.safeParse(request.body ?? {})
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const result = await adPolicyService.approveDecision(orgId, userId, request.params.id, parsed.data.note)
    if (!result) return reply.status(404).send({ error: 'Decisión no encontrada' })
    return reply.send(result)
  } catch (error) {
    return policyError(reply, error)
  }
}

export async function rejectDecision(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const parsed = rejectSchema.safeParse(request.body ?? {})
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const result = await adPolicyService.rejectDecision(orgId, userId, request.params.id, parsed.data.reason)
    if (!result) return reply.status(404).send({ error: 'Decisión no encontrada' })
    return reply.send(result)
  } catch (error) {
    return policyError(reply, error)
  }
}

export async function listActions(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await adPolicyService.listActions(orgId))
}

// ─── Fase 4: ejecutar con aprobación ─────────────────────────────────────────

function actionError(reply: FastifyReply, error: unknown) {
  if (error instanceof adActionService.ActionBlockedError) {
    return reply.status(error.statusCode).send({ error: error.message, checks: error.checks })
  }
  if (error instanceof adActionService.ActionNotExecutableError) {
    return reply.status(error.statusCode).send({ error: error.message })
  }
  throw error
}

export async function listPendingActions(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await adActionService.listPendingActions(orgId))
}

export async function executeAction(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { dryRun?: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  try {
    const result = await adActionService.executeAction(orgId, userId, request.params.id, {
      dryRun: request.query?.dryRun === 'true',
    })
    if (!result) return reply.status(404).send({ error: 'Acción no encontrada' })
    return reply.send(result)
  } catch (error) {
    return actionError(reply, error)
  }
}

export async function compensateAction(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  try {
    const result = await adActionService.compensateAction(orgId, userId, request.params.id)
    if (!result) return reply.status(404).send({ error: 'Acción no encontrada' })
    return reply.send(result)
  } catch (error) {
    return actionError(reply, error)
  }
}

// ─── Fases 5 y 6: autonomía por regla y aprendizaje deliberado ───────────────

export async function listRuleAutonomy(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await adRuleAutonomyService.listRuleAutonomy(orgId))
}

export async function promoteRule(
  request: FastifyRequest<{ Params: { ruleKey: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const parsed = z.object({ canaryPercent: z.coerce.number().int().min(1).max(25).optional() })
    .safeParse(request.body ?? {})
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    return reply.send(
      await adRuleAutonomyService.promoteRule(orgId, userId, request.params.ruleKey, parsed.data.canaryPercent)
    )
  } catch (error) {
    if (error instanceof adRuleAutonomyService.PromotionBlockedError) {
      return reply.status(error.statusCode).send({ error: error.message, blockers: error.blockers })
    }
    throw error
  }
}

export async function demoteRule(request: FastifyRequest<{ Params: { ruleKey: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(
    await adRuleAutonomyService.degradeRule(orgId, request.params.ruleKey, 'Degradada manualmente por el equipo.')
  )
}

export async function listExperiments(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await adExperimentService.listExperiments(orgId))
}

export async function createExperiment(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = z.object({
    name: z.string().trim().min(1).max(160),
    hypothesis: z.string().trim().min(5).max(600),
    campaignId: z.string().trim().optional(),
    mode: z.enum(['experiment', 'bandit']).optional(),
    primaryMetric: z.enum(['lead', 'qualified_lead', 'sale']).optional(),
    explorePercent: z.coerce.number().int().min(0).max(50).optional(),
    variants: z.array(z.object({
      key: z.string().trim().min(1).max(40),
      label: z.string().trim().min(1).max(120),
      description: z.string().trim().max(400).optional(),
      metaAdId: z.string().trim().max(64).optional(),
    })).min(2).max(6),
  }).safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  return reply.status(201).send(await adExperimentService.createExperiment(orgId, parsed.data))
}

export async function experimentAllocation(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await adExperimentService.computeAllocation(orgId, request.params.id)
  if (!result) return reply.status(404).send({ error: 'Experimento no encontrado' })
  return reply.send(result)
}

export async function startExperiment(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await adExperimentService.startExperiment(orgId, request.params.id)
  if (!result) return reply.status(404).send({ error: 'Experimento no encontrado' })
  return reply.send(result)
}

export async function concludeExperiment(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await adExperimentService.concludeExperiment(orgId, request.params.id)
  if (!result) return reply.status(404).send({ error: 'Experimento no encontrado' })
  return reply.send(result)
}

export async function budgetAllocation(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await adExperimentService.recommendBudgetAllocation(orgId))
}

// ─── Rutas de la §6.2 que faltaban ───────────────────────────────────────────

export async function campaignAttribution(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const campaign = await prisma.campaign.findFirst({
    where: { id: request.params.id, orgId },
    select: { id: true },
  })
  if (!campaign) return reply.status(404).send({ error: 'Campaña no encontrada' })
  const [attribution, targets, breakdown] = await Promise.all([
    adAttributionService.getCampaignAttribution(orgId, campaign.id),
    adTargetsService.getCampaignTargets(orgId, campaign.id),
    adAttributionService.getAdBreakdown(orgId, campaign.id),
  ])
  return reply.send({ ...attribution, targets, breakdown })
}

export async function campaignDecisions(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  // Todo el historial, no solo lo vigente: el valor de este endpoint es poder
  // auditar qué se decidió, quién y qué pasó después.
  const decisions = await prisma.adDecision.findMany({
    where: { orgId, campaignId: request.params.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      actor: { select: { name: true, email: true } },
      actions: {
        select: { id: true, kind: true, status: true, executedAt: true, errorCode: true, irreversibleEffects: true },
      },
    },
  })
  return reply.send(decisions)
}

export async function syncNow(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  // Sincronización manual: trae Insights de las campañas activas y rehace
  // integridad y diagnósticos, en el orden de la §14.
  const campaigns = await prisma.campaign.findMany({
    where: { orgId, status: 'active', metaAdSetId: { not: null } },
    select: { id: true },
  })
  let synced = 0
  for (const campaign of campaigns) {
    try {
      await insightsService.fetchAndStoreInsights(orgId, campaign.id)
      synced += 1
    } catch (error) {
      console.warn(`[Ads] sync manual falló en ${campaign.id}:`, (error as Error).message)
    }
  }
  const dataQuality = await adDataQualityService.evaluateDataQuality(orgId)
  const diagnostics = await adDiagnosticsService.runDiagnostics(orgId)
  return reply.send({ requested: campaigns.length, synced, dataQuality: dataQuality.status, ...diagnostics })
}

/**
 * Log de auditoría de Ads (§4.5). Las entradas ya se escribían en cada
 * aprobación, rechazo, ejecución, promoción y degradación; faltaba una forma
 * de consultarlas.
 */
export async function auditTrail(
  request: FastifyRequest<{ Querystring: { campaignId?: string; limit?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const limit = Math.min(100, Math.max(1, Number(request.query?.limit) || 40))
  const entries = await prisma.auditLog.findMany({
    where: { orgId, action: { startsWith: 'ads.' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, action: true, entityType: true, entityId: true,
      actorType: true, createdAt: true,
      actor: { select: { name: true, email: true } },
    },
  })
  return reply.send(entries)
}
