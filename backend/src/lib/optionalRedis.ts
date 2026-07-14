import Redis from 'ioredis'

const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 1500)

/**
 * Redis is optional for the HTTP API. Stop reconnecting when it is unavailable
 * so a missing queue service does not flood the backend logs.
 */
export async function connectOptionalRedis(scope: string): Promise<Redis | null> {
  const url = process.env.REDIS_URL?.trim()
  if (!url || process.env.REDIS_ENABLED === 'false') return null

  const connection = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    retryStrategy: () => null,
    reconnectOnError: () => false,
  })

  let reported = false
  const reportError = (error: Error) => {
    if (reported) return
    reported = true
    const details = error as Error & { code?: string }
    console.warn(`[${scope}] Redis no disponible; funcionalidad de cola desactivada:`, details.message || details.code || 'conexión rechazada')
  }
  connection.on('error', reportError)

  try {
    await connection.connect()
    await connection.ping()
    return connection
  } catch (error) {
    reportError(error as Error)
    connection.disconnect()
    return null
  }
}

export function reportQueueError(scope: string) {
  let reported = false
  return (error: Error) => {
    if (reported) return
    reported = true
    const details = error as Error & { code?: string }
    console.warn(`[${scope}] cola no disponible; se omite la operación:`, details.message || details.code || 'error de conexión')
  }
}
