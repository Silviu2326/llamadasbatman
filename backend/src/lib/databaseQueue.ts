import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

const DEFAULT_LEASE_MS = Math.max(30_000, Number(process.env.WORKER_QUEUE_LEASE_MS ?? 5 * 60_000))
const DEFAULT_MAX_ATTEMPTS = Math.max(1, Number(process.env.WORKER_QUEUE_MAX_ATTEMPTS ?? 5))

export type DatabaseQueuePayload = Prisma.InputJsonObject

type DatabaseQueueHandler = (payload: DatabaseQueuePayload) => Promise<void>

export async function enqueueDatabaseJob(input: {
  queue: string
  kind: string
  payload: DatabaseQueuePayload
  dedupeKey?: string
  delayMs?: number
  maxAttempts?: number
}): Promise<boolean> {
  const dedupeKey = input.dedupeKey?.trim() || randomUUID()
  try {
    await prisma.workerQueueJob.create({
      data: {
        queue: input.queue,
        kind: input.kind,
        payload: input.payload,
        dedupeKey,
        availableAt: new Date(Date.now() + Math.max(0, input.delayMs ?? 0)),
        maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      },
    })
    return true
  } catch (error) {
    // Idempotent enqueue: a duplicate dedupe key means the original job is
    // already present and must not create a second call/automation run.
    if ((error as { code?: string }).code === 'P2002') return true
    throw error
  }
}

async function claimDatabaseJob(queue: string, workerId: string, orgId?: string) {
  const now = new Date()
  const candidates = await prisma.workerQueueJob.findMany({
    where: {
      queue,
      ...(orgId ? { payload: { path: ['orgId'], equals: orgId } } : {}),
      OR: [
        { status: 'pending', availableAt: { lte: now } },
        { status: 'processing', leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 10,
  })

  for (const candidate of candidates) {
    const claimed = await prisma.workerQueueJob.updateMany({
      where: {
        id: candidate.id,
        ...(orgId ? { payload: { path: ['orgId'], equals: orgId } } : {}),
        OR: [
          { status: 'pending', availableAt: { lte: now } },
          { status: 'processing', leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: 'processing',
        attempts: { increment: 1 },
        lockedAt: now,
        leaseExpiresAt: new Date(now.getTime() + DEFAULT_LEASE_MS),
        workerId,
      },
    })
    if (claimed.count === 1) {
      return prisma.workerQueueJob.findUnique({ where: { id: candidate.id } })
    }
  }
  return null
}

async function finishDatabaseJob(id: string, workerId: string): Promise<void> {
  await prisma.workerQueueJob.updateMany({
    where: { id, status: 'processing', workerId },
    data: { status: 'completed', processedAt: new Date(), lockedAt: null, leaseExpiresAt: null, workerId: null, lastError: null },
  })
}

async function retryDatabaseJob(job: { id: string; attempts: number; maxAttempts: number }, workerId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 500) : 'Error desconocido en el worker'
  const terminal = job.attempts >= job.maxAttempts
  const delayMs = Math.min(60 * 60_000, 2 ** Math.max(0, job.attempts - 1) * 60_000)
  await prisma.workerQueueJob.updateMany({
    where: { id: job.id, status: 'processing', workerId },
    data: {
      status: terminal ? 'failed' : 'pending',
      availableAt: terminal ? undefined : new Date(Date.now() + delayMs),
      lockedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      lastError: message,
      processedAt: terminal ? new Date() : null,
    },
  })
}

export function startDatabaseQueueWorker(input: {
  queue: string
  handler: DatabaseQueueHandler
  pollMs?: number
  workerId?: string
  orgId?: string
}): () => void {
  const workerId = input.workerId ?? `postgres-${input.queue}-${process.pid}`
  const tick = async () => {
    const job = await claimDatabaseJob(input.queue, workerId, input.orgId)
    if (!job) return
    try {
      await input.handler(job.payload as DatabaseQueuePayload)
      await finishDatabaseJob(job.id, workerId)
    } catch (error) {
      await retryDatabaseJob(job, workerId, error)
      console.error(`[PostgresQueue:${input.queue}] job ${job.id} falló:`, error instanceof Error ? error.message : error)
    }
  }
  const timer = setInterval(() => { void tick().catch(error => console.error(`[PostgresQueue:${input.queue}] tick falló:`, error)) }, Math.max(500, input.pollMs ?? 5_000))
  timer.unref()
  void tick().catch(error => console.error(`[PostgresQueue:${input.queue}] primer tick falló:`, error))
  return () => clearInterval(timer)
}
