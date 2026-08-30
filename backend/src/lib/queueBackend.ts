export type QueueBackend = 'redis' | 'postgres'

/**
 * Redis remains the default for deployed environments. Local development can
 * opt into the durable PostgreSQL queue with WORKER_QUEUE_BACKEND=postgres or
 * REDIS_ENABLED=false.
 */
export function getQueueBackend(environment: NodeJS.ProcessEnv = process.env): QueueBackend {
  const configured = environment.WORKER_QUEUE_BACKEND?.trim().toLowerCase()
  if (configured === 'postgres' || configured === 'database') return 'postgres'
  if (configured === 'redis' || configured === 'bullmq') return 'redis'
  return environment.REDIS_ENABLED === 'false' ? 'postgres' : 'redis'
}

export function isPostgresQueueBackend(environment: NodeJS.ProcessEnv = process.env): boolean {
  return getQueueBackend(environment) === 'postgres'
}
