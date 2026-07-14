import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as emailMetricsService from '../services/emailMetrics.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const campaignParamsSchema = z.object({ campaignId: z.string().trim().min(1).max(128) }).strict()

const periodQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict()

/** EM-108: GET /api/email/campaigns/:campaignId/metrics?from=&to= */
export async function campaignMetrics(
  request: FastifyRequest<{ Params: { campaignId: string }; Querystring: { from?: string; to?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, campaignParamsSchema, request.params)
  const query = parseRequest(reply, periodQuerySchema, request.query)
  if (!params || !query) return

  const metrics = await emailMetricsService.getCampaignMetrics(orgId, params.campaignId, {
    periodFrom: query.from,
    periodTo: query.to,
  })
  return reply.send(metrics)
}

/** EM-108: GET /api/email/overview?from=&to= */
export async function overview(
  request: FastifyRequest<{ Querystring: { from?: string; to?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, periodQuerySchema, request.query)
  if (!query) return

  const metrics = await emailMetricsService.getOverviewMetrics(orgId, {
    periodFrom: query.from,
    periodTo: query.to,
  })
  return reply.send(metrics)
}
