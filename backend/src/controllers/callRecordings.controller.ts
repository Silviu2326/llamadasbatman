import type { FastifyReply, FastifyRequest } from 'fastify'
import { loadCallRecording, RECORDING_UUID, recordingUrl } from '../voice/telephony/zadarma/recordings'

// Auth and calls.read are applied by callsRoutes. The lookup below binds an
// opaque recording UUID to the current organisation before accessing any file.
export function createCallRecordingHandler(deps: {
  ownsRecording: (orgId: string, uuid: string) => Promise<boolean>
  load: typeof loadCallRecording
}) {
return async function getCallRecording(request: FastifyRequest<{ Params: { uuid: string } }>, reply: FastifyReply) {
  const { uuid } = request.params
  if (!RECORDING_UUID.test(uuid)) return reply.code(404).send({ error: 'Grabación no encontrada.' })
  const { orgId } = request.user as { orgId: string }
  if (!await deps.ownsRecording(orgId, uuid)) return reply.code(404).send({ error: 'Grabación no encontrada.' })
  try {
    const file = await deps.load(uuid)
    return reply.type('audio/wav')
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Length', file.size)
      .header('Content-Disposition', `inline; filename="llamada-${uuid}.wav"`)
      .send(file.stream())
  } catch {
    // No filesystem paths leak, and unfinished/invalid files are never exposed.
    return reply.code(409).header('Cache-Control', 'no-store').send({ error: 'La grabación aún no está disponible. Si la llamada acaba de terminar, vuelve a intentarlo en unos segundos.' })
  }
}
}

export const getCallRecording = createCallRecordingHandler({
  ownsRecording: async (orgId, uuid) => {
    const { prisma } = await import('../lib/prisma')
    return Boolean(await prisma.call.findFirst({
      where: { orgId, externalCallId: `zadarma:${uuid}`, recordingUrl: recordingUrl(uuid) },
      select: { id: true },
    }))
  },
  load: loadCallRecording,
})
