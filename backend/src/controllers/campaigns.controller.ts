import { FastifyRequest, FastifyReply } from 'fastify'
import * as campaignsService from '../services/campaigns.service'
import * as leadsService from '../services/leads.service'
import { CampaignStatus } from '@prisma/client'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await campaignsService.listCampaigns(orgId))
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
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const campaign = await campaignsService.createCampaign(orgId, request.body)
  return reply.status(201).send(campaign)
}

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const campaign = await campaignsService.getCampaign(orgId, request.params.id)
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
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await campaignsService.updateCampaign(orgId, request.params.id, request.body)
  return reply.send({ ok: true })
}

export async function start(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  try {
    const result = await campaignsService.startCampaign(orgId, request.params.id)
    return reply.send(result)
  } catch (err) {
    return reply.status(404).send({ error: (err as Error).message })
  }
}

export async function pause(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await campaignsService.pauseCampaign(orgId, request.params.id)
  return reply.send(result)
}

export async function stats(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await campaignsService.getCampaignStats(orgId, request.params.id)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function auditBulk(
  request: FastifyRequest<{ Params: { id: string }; Body: { force?: boolean } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const result = await leadsService.auditBulk(orgId, request.params.id, { force: request.body?.force })
  return reply.send(result)
}
