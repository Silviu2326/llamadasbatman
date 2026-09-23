import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getVoiceUpload, listVoiceUploads, uploadAgentVoice } from '../services/agentVoiceUpload.service'
import { MAX_VOICE_BYTES, VoiceUploadError } from '../services/voiceUploadProvider'

const schema = z.object({ name: z.string().trim().min(1).max(80), subjectName: z.string().trim().min(1).max(160), confirmed: z.literal(true), audioBase64: z.string().min(1).max(Math.ceil(MAX_VOICE_BYTES / 3) * 4) }).strict()
type User = { orgId: string; userId: string }

async function respond(reply: FastifyReply, operation: () => Promise<unknown>) {
  try { return reply.send(await operation()) }
  catch (error) {
    if (error instanceof VoiceUploadError) return reply.code(error.statusCode).send({ error: error.message })
    // Never serialize upload bodies or provider errors into logs/responses.
    return reply.code(503).send({ error: 'No se pudo completar la operación. Vuelve a comprobar la voz antes de subirla otra vez.' })
  }
}

export async function upload(request: FastifyRequest, reply: FastifyReply) {
  const body = schema.safeParse(request.body)
  if (!body.success) return reply.code(400).send({ error: 'Añade el nombre, un MP3 o WAV de hasta 10 MB y confirma la autorización.' })
  const { orgId, userId } = request.user as User
  return respond(reply, () => uploadAgentVoice(orgId, (request.params as { id: string }).id, userId, body.data))
}
export async function status(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as User
  const { id, requestId } = request.params as { id: string; requestId: string }
  return respond(reply, () => getVoiceUpload(orgId, id, requestId))
}
export async function mine(request: FastifyRequest, reply: FastifyReply) {
  return respond(reply, () => listVoiceUploads((request.user as User).orgId, (request.params as { id: string }).id))
}
