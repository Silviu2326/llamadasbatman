import { FastifyRequest, FastifyReply } from 'fastify'
import * as pipelineService from '../services/pipeline.service'
import { OpportunityStage } from '@prisma/client'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const opp = await pipelineService.getOpportunity(orgId, request.params.id)
  if (!opp) return reply.status(404).send({ error: 'Not found' })
  return reply.send(opp)
}

export async function listByStage(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const result = await pipelineService.listByStage(orgId)
  return reply.send(result)
}

export async function create(
  request: FastifyRequest<{
    Body: {
      leadId: string
      assignedTo?: string
      name: string
      stage?: OpportunityStage
      value?: number
      currency?: string
      probability?: number
      expectedCloseDate?: string
      notes?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const opp = await pipelineService.createOpportunity(orgId, request.body)
  return reply.status(201).send(opp)
}

export async function insights(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.getPipelineInsights(orgId))
}

export async function prediction(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.getPipelinePrediction(orgId))
}

export async function actions(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.getPipelineActions(orgId))
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      name?: string
      stage?: OpportunityStage
      value?: number
      currency?: string
      probability?: number
      expectedCloseDate?: string
      notes?: string
      assignedTo?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await pipelineService.updateOpportunity(orgId, request.params.id, request.body)
  return reply.send({ ok: true })
}
