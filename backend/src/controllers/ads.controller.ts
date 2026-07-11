import { FastifyRequest, FastifyReply } from 'fastify'
import * as wizardService from '../services/adsWizard.service'
import * as insightsService from '../services/metaInsights.service'
import { prisma } from '../lib/prisma'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function wizard(
  request: FastifyRequest<{
    Body: { vertical: string; objetivo: string; presupuestoMensual: number }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const { vertical, objetivo, presupuestoMensual } = request.body
  if (!vertical || !objetivo || !presupuestoMensual) {
    return reply.status(400).send({ error: 'vertical, objetivo y presupuestoMensual son requeridos' })
  }
  const campaign = await wizardService.runWizard(orgId, { vertical, objetivo, presupuestoMensual })
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
  await prisma.campaign.updateMany({
    where: { id: request.params.id, orgId },
    data: { maxCostPerLeadCents },
  })
  return reply.send({ ok: true })
}
