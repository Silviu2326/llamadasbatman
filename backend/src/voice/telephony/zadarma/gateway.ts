import Fastify from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { originate, OriginateError } from './ami'
import { createAudioSocketServer } from './audioServer'
import type { ZadarmaGatewayConfig } from './config'
import { RegistryError, SipCallRegistry } from './registry'
import type { prepareSipCall, prepareSipTestCall } from './runtime'
import { completedRecording, RECORDING_UUID, recordingUrl } from './recordings'

/**
 * Respuesta de error de `POST /calls`. `code` es el contrato que lee el
 * backend (`outbound.ts`) para decidir qué hacer con el trabajo; `error` se
 * mantiene con el mismo valor por compatibilidad. `retryable` significa que
 * la pasarela no ha marcado y el mismo `requestId` puede repetirse.
 */
export interface GatewayCallError {
  error: string
  code: string
  retryable: boolean
  dialed: boolean
  retryAfterMs?: number
  cause?: string
}

const PREPARE_CODE = /^[A-Z][A-Z0-9_]{2,80}$/

/**
 * Traduce el fallo de una petición de llamada a un código y estado HTTP
 * distintos según la fase: capacidad (429, reintentable con `retryAfterMs`),
 * bloqueo de preparación con su código real (422, no se ha marcado), y fallo
 * de marcado (409, con `cause` cuando se conoce; ambiguo si fue timeout).
 */
export function classifyGatewayError(error: unknown): { status: number; body: GatewayCallError } {
  if (error instanceof RegistryError) {
    const capacity = error.code === 'ZADARMA_CAPACITY_REACHED'
    return { status: capacity ? 429 : 409, body: { error: error.code, code: error.code, retryable: true, dialed: false, retryAfterMs: error.retryAfterMs } }
  }
  if (error instanceof OriginateError) {
    // Solo se reintenta lo que no llegó a marcar por un fallo transitorio
    // (AMI caído, parámetros). Un rechazo de dialplan/permisos tampoco marcó
    // (`dialed:false`), pero repetirlo no lo arregla: no es reintentable.
    const preDial = error.code === 'AMI_UNAVAILABLE' || error.code === 'INVALID_ORIGINATE_PARAMETERS'
    return { status: preDial ? 503 : 409, body: { error: error.code, code: error.code, retryable: preDial && !error.dialed, dialed: error.dialed, cause: error.cause } }
  }
  const message = error instanceof Error ? error.message : ''
  // Los bloqueos de `prepareSipCall`/`prepareSipTestCall` lanzan su código
  // como mensaje (ZADARMA_PHONE_MISMATCH, ZADARMA_TEST_CALL_BLOCKED_*, ...).
  if (PREPARE_CODE.test(message)) return { status: 422, body: { error: message, code: message, retryable: false, dialed: false } }
  return { status: 409, body: { error: 'ZADARMA_CALL_BLOCKED_OR_FAILED', code: 'ZADARMA_CALL_BLOCKED_OR_FAILED', retryable: false, dialed: false } }
}

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
  // Los fallos previos al marcado (preparación, capacidad, AMI caído) sí se
  // olvidan: el backend reintenta con el mismo `requestId` y debe volver a
  // intentarse de verdad, no recibir el rechazo cacheado para siempre.
  const requests = new Map<string, { at: number; fingerprint: string; result: Promise<{ status: string; sid: string; to: string }> }>()
  control.addHook('onRequest', async (req, reply) => {
    if (!authorizedGateway(req.headers.authorization, config.token)) return reply.code(401).send({ error: 'Unauthorized' })
  })
  control.get('/health', async () => ({ status: 'listening', sipVerified: false, provider: 'zadarma', activeCalls: registry.size, maxConcurrent: config.maxConcurrent, availableSlots: Math.max(0, config.maxConcurrent - registry.size), recording: 'asterisk-mixmonitor' }))
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
      // La capacidad se comprueba antes de preparar: preparar carga agente,
      // prompt y comprobaciones de BD, y no tiene sentido hacerlo para
      // rechazar después por línea ocupada.
      if (registry.size >= registry.capacity) {
        const { status, body } = classifyGatewayError(new RegistryError('ZADARMA_CAPACITY_REACHED', 20_000 + Math.floor(Math.random() * 10_000)))
        return reply.code(status).send(body)
      }
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
      const { status, body } = classifyGatewayError(error)
      // Solo se recuerda lo que llegó a marcar: es lo único ambiguo.
      if (!body.dialed) requests.delete(data.requestId)
      console.warn(`[ZADARMA] Call request failed: ${body.code}${body.cause ? ` (${body.cause})` : ''}`)
      return reply.code(status).send(body)
    }
  })
  return control
}

export async function startZadarmaGateway(config: ZadarmaGatewayConfig) {
  const { prepareSipCall, prepareSipTestCall, startPendingCallReconciler } = await import('./runtime')
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
  // Reintenta las ingestas que fallaron al colgar (<uuid>.pending.json) y
  // enlaza grabaciones huérfanas; corre al arrancar y cada pocos minutos.
  const stopReconciler = startPendingCallReconciler()
  return { close: async () => { stopReconciler(); await media.shutdown(); await control.close() } }
}
