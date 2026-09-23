import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { listAgentVoices, VoiceCatalogError } from '../services/agentVoices.service'

const querySchema = z.object({
  language: z.string().regex(/^[a-z]{2,3}$/).optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(80).default(1),
}).strict()

export async function voices(request: FastifyRequest, reply: FastifyReply) {
  const parsed = querySchema.safeParse(request.query)
  if (!parsed.success) return reply.code(400).send({ error: 'Revisa los filtros de voces.' })
  try { return reply.send(await listAgentVoices(parsed.data)) }
  catch (error) {
    if (error instanceof VoiceCatalogError) return reply.code(error.statusCode).send({ error: error.message })
    throw error
  }
}
