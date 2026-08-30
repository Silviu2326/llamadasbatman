import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Job } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { parseRequest } from '../lib/validation'
import { writeAuditLog } from '../lib/audit'
import {
  JOB_STATUSES,
  cancelJob,
  isRetryableJobError,
  jobSummary,
  retryJob,
} from '../services/jobs.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const listQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  kind: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

/**
 * `input` es privado del job salvo la decisión del router (`_routing`), que la
 * UI del Centro de trabajos muestra tal cual. Extraerla aquí evita mandar el
 * input completo (prompts, payloads) en cada fila del listado.
 */
function routingOf(job: Pick<Job, 'input'>): unknown {
  const input = job.input
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return (input as Record<string, unknown>)._routing ?? null
}

/** GET / — cola de la org para el Centro de trabajos, sin payloads pesados. */
export async function list(
  request: FastifyRequest<{ Querystring: { status?: string; kind?: string; page?: string; limit?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listQuerySchema, request.query)
  if (!query) return

  const page = query.page ?? 1
  const limit = query.limit ?? 25
  const where = {
    orgId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
  }
  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return reply.send({
    jobs: jobs.map(job => ({ ...jobSummary(job), routing: routingOf(job) })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  })
}

/** GET /:id — detalle completo: input (con _routing), output, error y costes. */
export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const job = await prisma.job.findFirst({ where: { id: request.params.id, orgId } })
  if (!job) return reply.status(404).send({ error: 'Job no encontrado' })
  return reply.send(job)
}

/** POST /:id/cancel — best effort: solo aborta lo que aún no terminó. */
export async function cancel(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const existing = await prisma.job.findFirst({ where: { id: request.params.id, orgId } })
  if (!existing) return reply.status(404).send({ error: 'Job no encontrado' })

  const canceled = await cancelJob(orgId, existing.id)
  // Sin fila actualizada el job ya estaba terminado: se informa, no se finge.
  if (!canceled) return reply.status(409).send({ error: `El job ya terminó (${existing.status}) y no puede cancelarse` })

  await writeAuditLog({
    orgId,
    actorUserId: userId,
    action: 'job.cancel',
    entityType: 'Job',
    entityId: canceled.id,
    before: { status: existing.status },
    after: { status: canceled.status },
  })
  return reply.send(jobSummary(canceled))
}

/** POST /:id/retry — solo fallos cuyo efecto externo no quedó en duda. */
export async function retry(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const existing = await prisma.job.findFirst({ where: { id: request.params.id, orgId } })
  if (!existing) return reply.status(404).send({ error: 'Job no encontrado' })
  if (existing.status !== 'failed') {
    return reply.status(409).send({ error: `Solo un job failed puede reintentarse (estado actual: ${existing.status})` })
  }
  if (!isRetryableJobError(existing.error)) {
    // Regla del repo: efecto externo incierto nunca se repite en silencio.
    return reply.status(409).send({ error: 'El resultado externo de este job es incierto; requiere revisión manual, no reintento' })
  }

  const retried = await retryJob(orgId, existing.id)
  if (!retried) return reply.status(409).send({ error: 'El job cambió de estado y ya no puede reintentarse' })

  await writeAuditLog({
    orgId,
    actorUserId: userId,
    action: 'job.retry',
    entityType: 'Job',
    entityId: retried.id,
    before: { status: existing.status, error: existing.error },
    after: { status: retried.status },
  })
  return reply.send(jobSummary(retried))
}
