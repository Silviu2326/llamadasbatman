import type { FastifyReply, FastifyRequest } from 'fastify'
import { handleUpdate, verifyWebhook } from '../services/telegram.service'

export async function webhook(request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) {
  const secret = request.headers['x-telegram-bot-api-secret-token']
  const supplied = Array.isArray(secret) ? secret[0] : secret
  if (!await verifyWebhook(request.params.orgId, supplied)) return reply.status(403).send({ error: 'Invalid Telegram webhook signature' })
  const result = await handleUpdate(request.params.orgId, request.body as any)
  return reply.send({ ok: true, ...result })
}
