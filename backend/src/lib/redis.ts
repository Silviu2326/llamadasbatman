import Redis from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  enableOfflineQueue: false,
  lazyConnect: true,
})

// Prevent unhandled error crash when Redis is unavailable
redis.on('error', (err) => {
  console.warn('[Redis] connection error (non-fatal):', err.message)
})
