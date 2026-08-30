import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { StudioServiceError } from '../services/studio.service'
import { addPublicStudioReviewComment, getPublicStudioReview } from '../services/studioReview.service'

const commentSchema = z.object({
  timecodeMs: z.number().int().min(0).max(86_400_000),
  body: z.string().trim().min(1).max(2_000),
  authorName: z.string().trim().min(1).max(80).optional(),
}).strict()

export async function studioReviewPublicRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>('/:token', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer')
    const review = await getPublicStudioReview(request.params.token)
    if (!review) return reply.status(404).send({ error: 'Sala de revisión no disponible' })
    return reply.send(review)
  })
  app.post<{ Params: { token: string }; Body: unknown }>('/:token/comments', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Params: { token: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer')
    const body = parseRequest(reply, commentSchema, request.body ?? {})
    if (!body) return
    try {
      const comment = await addPublicStudioReviewComment({ token: request.params.token, ...body })
      if (!comment) return reply.status(404).send({ error: 'Sala de revisión no disponible' })
      return reply.status(201).send(comment)
    } catch (error) {
      if (error instanceof StudioServiceError) return reply.status(error.statusCode).send({ error: error.message, code: error.code })
      throw error
    }
  })
}
