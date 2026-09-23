import Fastify from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { originate } from './ami'
import { createAudioSocketServer } from './audioServer'
import type { ZadarmaGatewayConfig } from './config'
import { SipCallRegistry } from './registry'
import type { prepareSipCall, prepareSipTestCall } from './runtime'
import { completedRecording, RECORDING_UUID, recordingUrl } from './recordings'

export function authorizedGateway(header: string | undefined, token: string): boolean {
  const received = Buffer.from(header ?? '')
  const expected = Buffer.from(`Bearer ${token}`)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

const identity = {
  orgId: z.string().min(1).max(100), leadId: z.string().min(1).max(100),
  agentId: z.string().min(1).max(100), requestId: z.string().uuid(),
}

// Dos formas, nunca mezcladas: una llamada de campaña trae campaña, y una
// prueba de agente en borrador trae `mode: 'test'` y ninguna. Así no existe una
// petición que "olvide" la campaña y acabe marcando por el camino equivocado.
const requestSchema = z.union([
  z.object({ ...identity, campaignId: z.string().min(1).max(100), mode: z.literal('campaign').optional() }).strict(),
  z.object({ ...identity, mode: z.literal('test') }).strict(),
])

export function buildZadarmaControl(config: ZadarmaGatewayConfig, registry: SipCallRegistry, dependencies: {
  prepare: typeof prepareSipCall; prepareTest: typeof prepareSipTestCall; originate: typeof originate
  recording?: (uuid: string) => ReturnType<typeof completedRecording>
}) {
  const control = Fastify({ logger: false, bodyLimit: 4096 })
  // Retain bounded idempotency entries even after failure. Ambiguous originate
  // failures must not create a second paid call when the same request is retried.
  const requests = new Map<string, { at: number; fingerprint: string; result: Promise<{ status: string; sid: string; to: string }> }>()
  control.addHook('onRequest', async (req, reply) => {
    if (!authorizedGateway(req.headers.authorization, config.token)) return reply.code(401).send({ error: 'Unauthorized' })
  })
  control.get('/health', async () => ({ status: 'listening', sipVerified: false, provider: 'zadarma', activeCalls: registry.size, maxConcurrent: config.maxConcurrent, recording: 'asterisk-mixmonitor' }))
  control.get<{ Params: { uuid: string } }>('/recordings/:uuid', async (req, reply) => {
    const { uuid } = req.params
    if (!RECORDING_UUID.test(uuid) || !dependencies.recording) return reply.code(404).send({ error: 'NOT_FOUND' })
    try {
      const file = await dependencies.recording(uuid)
      return reply.type('audio/wav').header('Content-Length', file.size)
        .header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').send(file.stream())
    } catch { return reply.code(409).send({ error: 'RECORDING_UNAVAILABLE' }) }
  })
  control.post('/calls', async (req, reply) => {
    const parsed = requestSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_CALL_REQUEST' })
    const data = parsed.data
    if (data.orgId !== config.orgId) return reply.code(403).send({ error: 'ORGANIZATION_NOT_ALLOWED' })
    const fingerprint = JSON.stringify([data.orgId, data.leadId, data.mode === 'test' ? 'test' : data.campaignId, data.agentId])
    const prior = requests.get(data.requestId)
    if (prior && prior.fingerprint !== fingerprint) return reply.code(409).send({ error: 'REQUEST_ID_CONFLICT' })
    if (!prior) {
      for (const [key, value] of requests) if (Date.now() - value.at > 24 * 3600_000) requests.delete(key)
      if (requests.size >= 5000) return reply.code(503).send({ error: 'REQUEST_CAPACITY_REACHED' })
      const result = (async () => {
        const prepared = data.mode === 'test'
          ? await dependencies.prepareTest(data, config.callerId)
          : await dependencies.prepare(data, config.callerId)
        const id = registry.reserve(`${data.orgId}:${data.leadId}`, hangup => prepared.start(id, hangup))
        try {
          await dependencies.originate(config.ami, id, prepared.phone, config.callerId)
          return { status: 'iniciada', sid: `zadarma:${id}`, to: prepared.phone }
        } catch (error) { registry.cancel(id); throw error }
      })()
      requests.set(data.requestId, { at: Date.now(), fingerprint, result })
    }
    try { return await requests.get(data.requestId)!.result }
    catch (error) {
      console.warn('[ZADARMA] Call request failed:', error instanceof Error ? error.message : 'unknown')
      return reply.code(409).send({ error: 'ZADARMA_CALL_BLOCKED_OR_FAILED' })
    }
  })
  return control
}

export async function startZadarmaGateway(config: ZadarmaGatewayConfig) {
  const { prepareSipCall, prepareSipTestCall } = await import('./runtime')
  const registry = new SipCallRegistry(config.maxConcurrent)
  const media = createAudioSocketServer((id, hangup) => registry.claim(id, hangup), {
    maxDurationMs: config.maxDurationMs, onError: code => console.error('[ZADARMA]', code),
  })
  const control = buildZadarmaControl(config, registry, {
    prepare: prepareSipCall, prepareTest: prepareSipTestCall, originate,
    recording: async uuid => {
      const { prisma } = await import('../../../lib/prisma')
      const owner = await prisma.call.findFirst({
        where: { orgId: config.orgId, externalCallId: `zadarma:${uuid}`, recordingUrl: recordingUrl(uuid) },
        select: { id: true },
      })
      if (!owner) throw new Error('RECORDING_UNAVAILABLE')
      return completedRecording(uuid)
    },
  })
  try {
    await new Promise<void>((resolve, reject) => {
      media.server.once('error', reject)
      media.server.listen(config.audioPort, '127.0.0.1', resolve)
    })
    await control.listen({ host: '127.0.0.1', port: config.controlPort })
  } catch (error) { await media.shutdown(); await control.close(); throw error }
  return { close: async () => { await media.shutdown(); await control.close() } }
}
