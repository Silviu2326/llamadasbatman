import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import * as keys from '../services/apiKeys.service'
import * as webhooks from '../services/webhooks.service'

type User = { orgId: string; userId: string }

const idParams = z.object({ id: z.string().trim().min(1).max(128) }).strict()
const createKeySchema = z.object({
  name: z.string().trim().min(2).max(120),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
}).strict()
const subscribeSchema = z.object({
  topic: z.string().trim().min(3).max(80),
  targetUrl: z.string().trim().url().max(2048),
}).strict()

function actor(request: FastifyRequest) {
  return request.user as User
}

export async function listKeys(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await keys.listApiKeys(actor(request).orgId))
}

export async function createKey(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, createKeySchema, request.body)
  if (!body) return
  const { orgId, userId } = actor(request)
  try {
    return reply.status(201).send(await keys.createApiKey(orgId, userId, body))
  } catch (error) {
    return reply.status(400).send({ error: (error as Error).message })
  }
}

export async function revokeKey(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  if (!params) return
  const revoked = await keys.revokeApiKey(actor(request).orgId, params.id)
  if (!revoked) return reply.status(404).send({ error: 'Clave no encontrada o ya revocada' })
  return reply.send({ ok: true })
}

/** Catálogo de eventos: lo que Zapier lista como disparadores disponibles. */
export async function topics(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ topics: webhooks.WEBHOOK_TOPICS })
}

export async function listWebhooks(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await webhooks.listSubscriptions(actor(request).orgId))
}

export async function createWebhook(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, subscribeSchema, request.body)
  if (!body) return
  const { orgId, userId } = actor(request)
  try {
    return reply.status(201).send(await webhooks.subscribe(orgId, { ...body, createdById: userId }))
  } catch (error) {
    return reply.status(400).send({ error: (error as Error).message })
  }
}

export async function deleteWebhook(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  if (!params) return
  const removed = await webhooks.unsubscribe(actor(request).orgId, params.id)
  if (!removed) return reply.status(404).send({ error: 'Suscripción no encontrada' })
  return reply.status(204).send()
}

/**
 * Prueba de credenciales: es lo que llama Zapier al conectar una cuenta para
 * comprobar que la clave sirve, y lo que usa cualquiera para depurar la suya.
 */
export async function whoami(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as { orgId: string; userId: string; role: string; email: string; tokenType?: string }
  return reply.send({
    orgId: user.orgId,
    userId: user.userId,
    email: user.email,
    role: user.role,
    authenticatedWith: user.tokenType === 'api_key' ? 'api_key' : 'session',
  })
}
