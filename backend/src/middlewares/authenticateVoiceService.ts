import { FastifyRequest, FastifyReply } from 'fastify'
import { timingSafeEqual } from 'crypto'

export async function authenticateVoiceService(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['x-voice-service-secret']
  const expected = process.env.VOICE_SERVICE_SECRET?.trim()

  // Fail closed when the service secret is missing. Compare buffers in
  // constant time so this shared credential is not exposed through timing.
  if (typeof key !== 'string' || !expected) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const provided = Buffer.from(key)
  const configured = Buffer.from(expected)
  if (provided.length !== configured.length || !timingSafeEqual(provided, configured)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
