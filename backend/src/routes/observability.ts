import { timingSafeEqual } from 'node:crypto'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { renderPrometheus, snapshotMetrics } from '../observability/metrics'
import { getOperationalMetrics, getWorkerHealth } from '../observability/operationalHealth'
import { logOperational } from '../observability/operationalLog'
import { prisma } from '../lib/prisma'

function hasBearerToken(request: FastifyRequest, expected: string): boolean {
  const raw = request.headers.authorization
  const provided = typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7).trim() : ''
  return provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

/** Superficie protegida de observabilidad; nunca devuelve secretos. */
function protectObservability(request: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.OBSERVABILITY_TOKEN?.trim()
  if (!expected && process.env.NODE_ENV === 'production') {
    return reply.status(503).send({ error: 'Observabilidad no configurada', code: 'OBSERVABILITY_TOKEN_REQUIRED' })
  }
  if (!expected) return
  if (!hasBearerToken(request, expected)) return reply.status(401).send({ error: 'Autorización requerida', code: 'OBSERVABILITY_AUTH_REQUIRED' })
}

/** Las mutaciones operativas requieren un secreto distinto al de lectura. */
function protectOperationalMutation(request: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.OBSERVABILITY_MUTATION_TOKEN?.trim()
  if (!expected) return reply.status(503).send({ error: 'Operaciones de observabilidad desactivadas', code: 'OBSERVABILITY_MUTATIONS_DISABLED' })
  if (!hasBearerToken(request, expected)) return reply.status(401).send({ error: 'Autorización requerida', code: 'OBSERVABILITY_MUTATION_AUTH_REQUIRED' })
}

export async function observabilityRoutes(app: FastifyInstance) {
  // Liveness no consulta dependencias: permite distinguir proceso vivo de
  // instancia lista para recibir trabajo.
  app.get('/live', async (_request, reply) => reply.send({ status: 'ok', service: 'backend', checkedAt: new Date().toISOString() }))

  // Readiness devuelve únicamente un resumen seguro para el load balancer.
  app.get('/ready', async (request, reply) => {
    const health = await getWorkerHealth()
    const statusCode = health.status === 'ready' ? 200 : 503
    return reply.status(statusCode).send({
      status: health.status,
      checkedAt: health.checkedAt,
      correlationId: request.correlationId,
      checks: {
        database: health.dependencies.database.status,
        redis: health.dependencies.redis.status,
        worker: health.worker.heartbeat.status,
        queues: health.queues.databaseQueriesAvailable ? 'available' : 'unavailable',
      },
    })
  })

  app.get('/workers', { preHandler: protectObservability }, async (_request, reply) => {
    const result = await getWorkerHealth()
    return reply.status(result.status === 'not_ready' ? 503 : 200).send(result)
  })

  app.get('/queues', { preHandler: protectObservability }, async (_request, reply) => {
    const result = await getWorkerHealth()
    return reply.status(result.status === 'not_ready' ? 503 : 200).send({
      status: result.status,
      checkedAt: result.checkedAt,
      queues: result.queues,
      alerts: result.alertDetails,
    })
  })

  app.get('/metrics', { preHandler: protectObservability }, async (_request, reply) => {
    const [runtime, persisted] = await Promise.all([Promise.resolve(snapshotMetrics()), getOperationalMetrics()])
    reply.header('cache-control', 'no-store')
    reply.type('text/plain; version=0.0.4; charset=utf-8')
    return reply.send(`${renderPrometheus(runtime)}vozia_database_available ${persisted.database === 'healthy' ? 1 : 0}\n`)
  })

  app.get('/metrics/json', { preHandler: protectObservability }, async (_request, reply) => {
    const [runtime, persisted] = await Promise.all([Promise.resolve(snapshotMetrics()), getOperationalMetrics()])
    reply.header('cache-control', 'no-store')
    return reply.send({ runtime, persisted })
  })

  // Redrive explícito y autenticado para el tipo de evento que contiene el
  // payload persistente necesario para una reejecución segura.
  app.post<{ Params: { id: string } }>('/ops/outbox/:id/replay', { preHandler: protectOperationalMutation }, async (request, reply) => {
    const result = await prisma.outboxEvent.updateMany({
      where: { id: request.params.id, status: 'dead_letter' },
      data: {
        status: 'pending',
        availableAt: new Date(),
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        lastErrorCode: 'MANUAL_REPLAY_REQUESTED',
        lastError: null,
      },
    })
    if (!result.count) return reply.status(409).send({ error: 'El evento no está en dead-letter o no existe', code: 'OUTBOX_REPLAY_NOT_ALLOWED', correlationId: request.correlationId })
    logOperational('warn', 'outbox.replay.requested', {
      correlationId: request.correlationId,
      queue: 'outbox',
      eventId: request.params.id,
      remediation: 'Verificar el resultado del siguiente intento y la ausencia de duplicados.',
    })
    return reply.send({ ok: true, id: request.params.id, status: 'pending', correlationId: request.correlationId })
  })
}
