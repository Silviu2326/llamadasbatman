import { FastifyRequest, FastifyReply } from 'fastify'
import * as wizardService from '../services/adsWizard.service'
import * as strategyService from '../services/adsStrategy.service'
import * as insightsService from '../services/metaInsights.service'
import * as adsOverviewService from '../services/adsOverview.service'
import * as metaCampaignBuilder from '../services/metaCampaignBuilder.service'
import { prisma } from '../lib/prisma'
import { z } from 'zod'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const strategyInputSchema = z.object({
  vertical: z.string().trim().min(1).max(120),
  objetivo: z.string().trim().min(1).max(180),
  presupuestoMensual: z.coerce.number().positive().max(100000),
  audience: z.string().trim().max(160).optional(),
})

const draftInputSchema = z.object({
  vertical: z.string().trim().max(120).optional(),
  objetivo: z.string().trim().max(180).optional(),
  audience: z.string().trim().max(160).nullable().optional(),
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

export async function wizard(
  request: FastifyRequest<{
    Body: { vertical: string; objetivo: string; presupuestoMensual: number; audience?: string; strategy?: Record<string, unknown> }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const { vertical, objetivo, presupuestoMensual, audience, strategy } = request.body
  if (!vertical || !objetivo || !presupuestoMensual) {
    return reply.status(400).send({ error: 'vertical, objetivo y presupuestoMensual son requeridos' })
  }
  const campaign = await wizardService.runWizard(orgId, { vertical, objetivo, presupuestoMensual, audience, strategy })
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
    const message = (error as Error).message
    const status = message === 'Campaign not found' ? 404 : 502
    console.error(`[Ads] action failed for ${orgId}/${request.params.id}:`, message)
    return reply.status(status).send({ error: status === 404 ? 'CampaÃ±a no encontrada' : 'Meta no pudo completar la operaciÃ³n' })
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
