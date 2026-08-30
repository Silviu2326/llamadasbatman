import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import { parseRequest } from '../lib/validation'
import * as market from '../services/marketplace.service'

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof market.MarketplaceError) return reply.status(error.statusCode).send({ error: error.message, code: error.code, details: error.details })
  throw error
}

const querySchema = z.object({ category: z.string().trim().max(80).optional(), kind: z.enum(['microapp', 'flow']).optional() }).strict()
const listingSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), kind: z.enum(['microapp', 'flow']), name: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(5000), category: z.string().trim().min(2).max(80), revenueShareBps: z.number().int().min(0).max(10_000).optional() }).strict()
const listingUpdateSchema = listingSchema.pick({ name: true, description: true, category: true }).partial().refine(v => Object.keys(v).length > 0)
const versionSchema = z.object({ version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/).max(64), manifest: z.unknown(), priceCents: z.number().int().min(0).max(10_000_000).default(0) }).strict()
const reviewSchema = z.object({ approve: z.boolean(), publish: z.boolean().optional(), notes: z.string().trim().max(5000).optional() }).strict()
const installSchema = z.object({ versionId: z.string().trim().min(1).optional(), config: z.record(z.unknown()).optional() }).strict()
const settleSchema = z.object({ microappRunId: z.string().trim().min(1).max(128) }).strict()
const runSchema = z.object({ input: z.record(z.unknown()).default({}), idempotencyKey: z.string().trim().min(8).max(200).optional() }).strict()

export async function marketplaceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const read = { preHandler: requirePermission('integrations.read', { scope: 'org' }) }
  const manage = { preHandler: requirePermission('integrations.manage', { scope: 'org' }) }

  app.get('/', read, async (request: FastifyRequest<{ Querystring: unknown }>, reply) => {
    const query = parseRequest(reply, querySchema, request.query ?? {})
    if (!query) return
    return reply.send({ listings: await market.listMarketplace(query) })
  })
  app.get('/installs', read, async (request) => ({ installs: await market.listMarketplaceInstalls(request.user.orgId) }))
  app.get('/:id', read, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const listing = await market.getMarketplaceListing(request.params.id)
    return listing ? reply.send(listing) : reply.status(404).send({ error: 'Publicación no encontrada' })
  })
  app.post('/listings', manage, async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const body = parseRequest(reply, listingSchema, request.body ?? {}); if (!body) return
    try { return reply.status(201).send(await market.createMarketplaceListing({ orgId: request.user.orgId, userId: request.user.userId, ...body })) } catch (error) { return fail(reply, error) }
  })
  app.patch('/listings/:id', manage, async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const body = parseRequest(reply, listingUpdateSchema, request.body ?? {}); if (!body) return
    try { return reply.send(await market.updateMarketplaceListing({ orgId: request.user.orgId, listingId: request.params.id, ...body })) } catch (error) { return fail(reply, error) }
  })
  app.post('/listings/:id/versions', manage, async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const body = parseRequest(reply, versionSchema, request.body ?? {}); if (!body) return
    if (body.manifest === undefined) return reply.status(400).send({ error: 'manifest requerido', code: 'MANIFEST_REQUIRED' })
    try { return reply.status(201).send(await market.addMarketplaceVersion({ orgId: request.user.orgId, userId: request.user.userId, listingId: request.params.id, version: body.version, priceCents: body.priceCents, manifest: body.manifest })) } catch (error) { return fail(reply, error) }
  })
  app.post('/listings/:id/submit', manage, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try { return reply.send(await market.submitMarketplaceListing(request.user.orgId, request.params.id)) } catch (error) { return fail(reply, error) }
  })
  app.post('/listings/:id/review', manage, async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    if (!market.isMarketplaceEditor(request.user.email)) return reply.status(403).send({ error: 'Se requiere rol editorial del marketplace', code: 'MARKETPLACE_EDITOR_REQUIRED' })
    const body = parseRequest(reply, reviewSchema, request.body ?? {}); if (!body) return
    try { return reply.send(await market.reviewMarketplaceListing({ listingId: request.params.id, reviewerId: request.user.userId, ...body })) } catch (error) { return fail(reply, error) }
  })
  app.post('/listings/:id/install', manage, async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const body = parseRequest(reply, installSchema, request.body ?? {}); if (!body) return
    try { return reply.status(201).send(await market.installMarketplaceListing({ orgId: request.user.orgId, userId: request.user.userId, role: request.user.role, listingId: request.params.id, ...body })) } catch (error) { return fail(reply, error) }
  })
  app.post('/listings/:id/disable', manage, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try { await market.setMarketplaceInstallStatus({ orgId: request.user.orgId, listingId: request.params.id, status: 'disabled' }); return reply.send({ ok: true }) } catch (error) { return fail(reply, error) }
  })
  app.delete('/listings/:id/install', manage, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try { await market.setMarketplaceInstallStatus({ orgId: request.user.orgId, listingId: request.params.id, status: 'uninstalled' }); return reply.status(204).send() } catch (error) { return fail(reply, error) }
  })
  app.post('/listings/:id/settlements', manage, async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const body = parseRequest(reply, settleSchema, request.body ?? {}); if (!body) return
    try { return reply.send(await market.settleMarketplaceExecution({ orgId: request.user.orgId, listingId: request.params.id, microappRunId: body.microappRunId })) } catch (error) { return fail(reply, error) }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/listings/:id/run', { preHandler: requirePermission('costs.request', { scope: 'org' }) }, async (request, reply) => {
    const body = parseRequest(reply, runSchema, request.body ?? {}); if (!body) return
    try { return reply.status(202).send(await market.startMarketplaceExecution({ orgId: request.user.orgId, userId: request.user.userId, role: request.user.role, listingId: request.params.id, payload: body.input, idempotencyKey: body.idempotencyKey })) } catch (error) { return fail(reply, error) }
  })
}
