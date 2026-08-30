import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { recordWebsiteEvent } from '../services/websiteConnections.service'

const eventSchema = z.object({
  siteKey: z.string().trim().regex(/^wk_[A-Za-z0-9_-]{16,80}$/),
  event: z.string().trim().regex(/^[a-z0-9_.-]{1,80}$/),
  path: z.string().trim().max(1_000).optional(),
  referrer: z.string().trim().max(1_000).optional(),
}).strict()

/** Endpoint deliberadamente pequeño y sin autenticación: el siteKey vive en
 * el HTML público. No acepta payloads de formularios ni datos personales. */
export async function webEventsRoutes(app: FastifyInstance) {
  app.get('/collect', async (request: FastifyRequest<{ Querystring: unknown }>, reply) => {
    const query = parseRequest(reply, eventSchema, request.query ?? {})
    if (!query) return
    const accepted = await recordWebsiteEvent({
      siteKey: query.siteKey,
      eventName: query.event,
      path: query.path,
      referrer: query.referrer,
      origin: typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
    })
    return reply.status(accepted ? 204 : 404).send()
  })
}
