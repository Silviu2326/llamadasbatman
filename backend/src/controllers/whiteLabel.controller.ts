import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import * as service from '../services/whiteLabel.service'
import * as telegram from '../services/telegram.service'

type User = { orgId: string }

const clientParams = z.object({ id: z.string().trim().min(1).max(128) }).strict()
const createSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  clientEmail: z.string().trim().email().optional().or(z.literal('')),
  website: z.string().trim().url().optional().or(z.literal('')),
  monthlyPriceCents: z.number().int().min(0).max(10_000_000).optional(),
  wholesaleCostCents: z.number().int().min(0).max(10_000_000).optional(),
  monthlyVoiceMinutes: z.number().int().min(0).max(10_000_000).optional(),
  monthlyMessages: z.number().int().min(0).max(10_000_000).optional(),
}).strict()
const updateSchema = createSchema.partial().extend({ status: z.enum(service.CLIENT_STATUSES).optional() }).strict()
const brandSchema = z.object({
  brandName: z.string().trim().min(2).max(160).optional(),
  logoUrl: z.string().trim().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  textColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  widgetTitle: z.string().trim().min(2).max(160).optional(),
  welcomeMessage: z.string().trim().min(2).max(500).optional(),
  enabled: z.boolean().optional(),
  allowedOrigins: z.array(z.string().trim().url()).max(20).optional(),
}).strict()
const ownBrandSchema = z.object({
  brandName: z.string().trim().min(2).max(160).optional(),
  logoUrl: z.string().trim().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  textColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  appDomain: z.string().trim().max(253).nullable().optional(),
}).strict()
const trainingSchema = z.object({ sourceUrl: z.string().trim().url() }).strict()
const documentSchema = z.object({ name: z.string().trim().min(1).max(180), content: z.string().trim().min(20).max(42_000) }).strict()
const telegramSchema = z.object({ botToken: z.string().trim().min(20).max(200), webhookBaseUrl: z.string().trim().url().optional() }).strict()

function orgId(request: FastifyRequest) {
  return (request.user as User).orgId
}

function params(reply: FastifyReply, request: FastifyRequest) {
  return parseRequest(reply, clientParams, request.params)
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await service.listClients(orgId(request)))
}

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, createSchema, request.body)
  if (!body) return
  try {
    return reply.status(201).send(await service.createClient(orgId(request), body))
  } catch (error) {
    return reply.status(400).send({ error: (error as Error).message })
  }
}

export async function get(request: FastifyRequest, reply: FastifyReply) {
  const p = params(reply, request)
  if (!p) return
  const result = await service.getClient(orgId(request), p.id)
  if (!result) return reply.status(404).send({ error: 'Cliente no encontrado' })
  return reply.send(result)
}

export async function update(request: FastifyRequest, reply: FastifyReply) {
  const p = params(reply, request)
  const body = parseRequest(reply, updateSchema, request.body)
  if (!p || !body) return
  const result = await service.updateClient(orgId(request), p.id, body)
  if (!result) return reply.status(404).send({ error: 'Cliente no encontrado' })
  return reply.send(result)
}

export async function brand(request: FastifyRequest, reply: FastifyReply) {
  const p = params(reply, request)
  const body = parseRequest(reply, brandSchema, request.body)
  if (!p || !body) return
  const result = await service.updateWhiteLabelConfig(orgId(request), p.id, body)
  if (!result) return reply.status(404).send({ error: 'Cliente no encontrado' })
  return reply.send(result)
}

/** Marca del panel de la propia agencia (el CRM que ven ella y su equipo). */
export async function ownBrand(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await service.getOwnBrand(orgId(request)))
}

export async function saveOwnBrand(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, ownBrandSchema, request.body)
  if (!body) return
  try {
    return reply.send(await service.updateOwnBrand(orgId(request), body))
  } catch (error) {
    return reply.status(400).send({ error: (error as Error).message })
  }
}

/** Resuelve la marca por dominio antes del login. Sin marca responde 204. */
export async function publicBrand(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { host?: unknown }
  const host = typeof query?.host === 'string' && query.host ? query.host : request.headers.host
  const brand = await service.brandForHost(host)
  return brand ? reply.send(brand) : reply.status(204).send()
}

export async function billingSummary(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await service.agencyBillingSummary(orgId(request)))
}

export async function rotateKey(request: FastifyRequest, reply: FastifyReply) {
  const p = params(reply, request)
  if (!p) return
  const result = await service.rotateWidgetKey(orgId(request), p.id)
  if (!result) return reply.status(404).send({ error: 'Cliente no encontrado' })
  return reply.send(result)
}

export async function train(request: FastifyRequest, reply: FastifyReply) {
  const p = params(reply, request)
  const body = parseRequest(reply, trainingSchema, request.body)
  if (!p || !body) return
  try {
    const result = await service.startTraining(orgId(request), p.id, body.sourceUrl)
    if (!result) return reply.status(404).send({ error: 'Cliente no encontrado' })
    return reply.status(202).send(result)
  } catch (error) {
    return reply.status(400).send({ error: (error as Error).message })
  }
}

export async function document(request: FastifyRequest, reply: FastifyReply) {
  const p = params(reply, request)
  const body = parseRequest(reply, documentSchema, request.body)
  if (!p || !body) return
  try {
    const result = await service.addDocument(orgId(request), p.id, body)
    if (!result) return reply.status(404).send({ error: 'Cliente no encontrado' })
    return reply.status(201).send(result)
  } catch (error) {
    return reply.status(400).send({ error: (error as Error).message })
  }
}

async function clientOrg(agencyOrgId: string, clientId: string) {
  const client = await service.getClient(agencyOrgId, clientId)
  return client?.clientOrgId ?? null
}

export async function telegramStatus(request: FastifyRequest, reply: FastifyReply) {
  const p = params(reply, request)
  if (!p) return
  const target = await clientOrg(orgId(request), p.id)
  if (!target) return reply.status(404).send({ error: 'Cliente no encontrado' })
  return reply.send(await telegram.telegramStatus(target))
}

export async function telegramConnect(request: FastifyRequest, reply: FastifyReply) {
  const p = params(reply, request)
  const body = parseRequest(reply, telegramSchema, request.body)
  if (!p || !body) return
  const target = await clientOrg(orgId(request), p.id)
  if (!target) return reply.status(404).send({ error: 'Cliente no encontrado' })
  try {
    const baseUrl = body.webhookBaseUrl || process.env.APP_URL?.trim() || process.env.FRONTEND_URL?.trim()
    return reply.send(await telegram.connectTelegram(target, body.botToken, baseUrl))
  } catch (error) {
    return reply.status(400).send({ error: (error as Error).message })
  }
}

export async function telegramDisconnect(request: FastifyRequest, reply: FastifyReply) {
  const p = params(reply, request)
  if (!p) return
  const target = await clientOrg(orgId(request), p.id)
  if (!target) return reply.status(404).send({ error: 'Cliente no encontrado' })
  try {
    return reply.send(await telegram.disconnectTelegram(target))
  } catch (error) {
    return reply.status(400).send({ error: (error as Error).message })
  }
}

export async function publicBootstrap(request: FastifyRequest, reply: FastifyReply) {
  const key = typeof (request.query as { key?: unknown })?.key === 'string' ? (request.query as { key: string }).key : ''
  const result = await service.publicBootstrap(key)
  if (!result) return reply.status(404).send({ error: 'Widget no disponible' })
  return reply.send(result)
}

export async function publicMessage(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { key?: unknown; message?: unknown } | undefined
  const key = typeof body?.key === 'string' ? body.key : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!key || !message || message.length > 2_000) return reply.status(400).send({ error: 'Mensaje no válido' })
  const result = await service.publicMessage(key, message)
  if (!result) return reply.status(404).send({ error: 'Widget no disponible' })
  if ('error' in result) return reply.status(429).send({ error: 'Límite mensual alcanzado', code: result.error })
  return reply.send(result)
}

export async function widgetScript(request: FastifyRequest, reply: FastifyReply) {
  const key = typeof (request.query as { key?: unknown })?.key === 'string' ? (request.query as { key: string }).key : ''
  const config = await service.publicBootstrap(key)
  if (!config) return reply.status(404).type('text/plain').send('Widget no disponible')
  const origin = `${request.protocol}://${request.headers.host || request.hostname}`
  return reply.type('application/javascript').send(service.widgetScript(origin, key))
}

export async function widget(request: FastifyRequest, reply: FastifyReply) {
  const key = typeof (request.query as { key?: unknown })?.key === 'string' ? (request.query as { key: string }).key : ''
  const config = await service.publicBootstrap(key)
  if (!config) return reply.status(404).type('text/plain').send('Widget no disponible')
  const origin = `${request.protocol}://${request.headers.host || request.hostname}`
  return reply.type('text/html').send(service.widgetHtml(origin, key, config))
}
