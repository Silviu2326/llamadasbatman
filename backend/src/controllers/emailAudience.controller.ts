import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as emailAudience from '../services/emailAudience.service'
import { parseRequest } from '../lib/validation'
import { writeAuditLog } from '../lib/audit'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

// El mismo formato de `purpose` que acepta el centro de preferencias del lead
// (leads.controller.ts): categoría libre en minúsculas, no una lista cerrada.
const purposeSchema = z.string().trim().min(1).max(60).regex(/^[a-z0-9_-]+$/, 'purpose inválido')

const subscribersQuerySchema = z.object({
  purpose: purposeSchema.optional(),
  status: z.enum(emailAudience.SUBSCRIBER_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).strict()

/** EM-111: GET /api/email/subscribers */
export async function listSubscribers(
  request: FastifyRequest<{ Querystring: Record<string, string> }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, subscribersQuerySchema, request.query)
  if (!query) return
  return reply.send(await emailAudience.listSubscribers(orgId, query))
}

/** EM-111: GET /api/email/subscribers/summary */
export async function subscriberSummary(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await emailAudience.getSubscriberSummary(orgId))
}

const subscriptionParamsSchema = z.object({ leadId: z.string().trim().min(1).max(128) }).strict()

const subscriptionBodySchema = z.object({
  purpose: purposeSchema,
  status: z.enum(['granted', 'revoked']),
}).strict()

/**
 * EM-111: PUT /api/email/subscribers/:leadId
 *
 * Cambiar a quién se le puede escribir es una decisión de cumplimiento, no de
 * marketing: por eso exige `governance.write` y queda auditado, igual que
 * `PUT /api/leads/:id/preferences`.
 */
export async function updateSubscription(
  request: FastifyRequest<{ Params: { leadId: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, subscriptionParamsSchema, request.params)
  const body = parseRequest(reply, subscriptionBodySchema, request.body)
  if (!params || !body) return

  const consent = await emailAudience.setSubscription(
    orgId,
    params.leadId,
    body.purpose,
    body.status,
    'email_audience_manager'
  )
  if (!consent) return reply.status(404).send({ error: 'Lead no encontrado' })

  await writeAuditLog({
    orgId,
    actorUserId: userId,
    action: 'email.subscription.update',
    entityType: 'ContactConsent',
    entityId: consent.id,
    after: { leadId: params.leadId, purpose: body.purpose, status: body.status },
  })

  return reply.send(consent)
}

const deliveriesQuerySchema = z.object({
  status: z.string().trim().max(40).optional(),
  campaignId: z.string().trim().max(128).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).strict()

/** EM-111: GET /api/email/deliveries — seguimiento por destinatario. */
export async function listDeliveries(
  request: FastifyRequest<{ Querystring: Record<string, string> }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, deliveriesQuerySchema, request.query)
  if (!query) return
  return reply.send(await emailAudience.listDeliveries(orgId, query))
}
