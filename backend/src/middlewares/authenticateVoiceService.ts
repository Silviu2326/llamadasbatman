import { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticateVoiceService(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['x-voice-service-secret']
  if (!key || key !== process.env.VOICE_SERVICE_SECRET) {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}
