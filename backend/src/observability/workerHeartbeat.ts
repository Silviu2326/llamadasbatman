import { connectOptionalRedis } from '../lib/optionalRedis'
import { prisma } from '../lib/prisma'
import { isPostgresQueueBackend } from '../lib/queueBackend'

const DEFAULT_ROLE = 'dedicated-worker'
const DEFAULT_TTL_SECONDS = 45

export type WorkerHeartbeatStatus = {
  status: 'healthy' | 'missing' | 'stale' | 'unavailable'
  key: string
  role: string
  lastSeenAt?: string
  ageSeconds?: number
  pid?: number
  remediation?: string
}

function heartbeatConfig(role: string) {
  const prefix = process.env.WORKER_HEARTBEAT_PREFIX?.trim() || 'vendrava:worker:heartbeat'
  const configuredKey = process.env.WORKER_HEARTBEAT_KEY?.trim()
  const key = role === DEFAULT_ROLE && configuredKey ? configuredKey : `${prefix}:${role}`
  const ttlSeconds = Math.max(15, Number(process.env.WORKER_HEARTBEAT_TTL_SECONDS ?? DEFAULT_TTL_SECONDS))
  const intervalMs = Math.max(5_000, Math.floor((ttlSeconds * 1_000) / 3))
  return { key, ttlSeconds, intervalMs }
}

export async function startWorkerHeartbeat(role = DEFAULT_ROLE): Promise<(() => void) | null> {
  const config = heartbeatConfig(role)
  if (isPostgresQueueBackend()) {
    const startedAt = new Date()
    const write = async () => {
      await prisma.workerHeartbeat.upsert({
        where: { role },
        create: { role, pid: process.pid, startedAt, lastSeenAt: new Date() },
        update: { pid: process.pid, lastSeenAt: new Date() },
      })
    }
    try { await write() } catch { return null }
    const timer = setInterval(() => { void write().catch(() => undefined) }, config.intervalMs)
    timer.unref()
    return () => { clearInterval(timer); void prisma.workerHeartbeat.deleteMany({ where: { role, pid: process.pid } }).catch(() => undefined) }
  }
  const connection = await connectOptionalRedis(`WorkerHeartbeat:${role}`)
  if (!connection) return null
  const startedAt = new Date().toISOString()
  const write = async () => {
    const value = JSON.stringify({ role, pid: process.pid, at: new Date().toISOString(), startedAt })
    await connection.set(config.key, value, 'EX', config.ttlSeconds)
  }
  try {
    await write()
  } catch {
    connection.disconnect()
    return null
  }
  const timer = setInterval(() => { void write().catch(() => undefined) }, config.intervalMs)
  timer.unref()
  return () => {
    clearInterval(timer)
    connection.disconnect()
  }
}

export async function readWorkerHeartbeat(role = DEFAULT_ROLE, now = Date.now()): Promise<WorkerHeartbeatStatus> {
  const config = heartbeatConfig(role)
  if (isPostgresQueueBackend()) {
    try {
      const row = await prisma.workerHeartbeat.findUnique({ where: { role } })
      if (!row) return { status: 'missing', key: config.key, role, remediation: 'Arranca el proceso dedicado del worker y comprueba su supervisor.' }
      const ageSeconds = Math.max(0, Math.round((now - row.lastSeenAt.getTime()) / 1_000))
      if (ageSeconds > config.ttlSeconds) return { status: 'stale', key: config.key, role, lastSeenAt: row.lastSeenAt.toISOString(), ageSeconds, pid: row.pid, remediation: 'El worker no ha renovado su heartbeat dentro del TTL; comprueba sus logs.' }
      return { status: 'healthy', key: config.key, role, lastSeenAt: row.lastSeenAt.toISOString(), ageSeconds, pid: row.pid }
    } catch {
      return { status: 'unavailable', key: config.key, role, remediation: 'No se pudo leer el heartbeat PostgreSQL; revisa la conexión de base de datos.' }
    }
  }
  const connection = await connectOptionalRedis(`WorkerHealth:${role}`)
  if (!connection) {
    return { status: 'unavailable', key: config.key, role, remediation: 'Redis no está disponible; comprueba REDIS_URL y el proceso worker.' }
  }
  try {
    const raw = await connection.get(config.key)
    if (!raw) return { status: 'missing', key: config.key, role, remediation: 'Arranca el proceso dedicado del worker y comprueba su supervisor.' }
    let parsed: { at?: string; role?: string; pid?: number }
    try { parsed = JSON.parse(raw) as typeof parsed } catch {
      return { status: 'stale', key: config.key, role, remediation: 'El heartbeat persistido no tiene un formato válido; reinicia el worker.' }
    }
    if (parsed.role !== role || typeof parsed.at !== 'string') {
      return { status: 'stale', key: config.key, role, remediation: 'El heartbeat no corresponde al rol esperado; revisa procesos duplicados.' }
    }
    const timestamp = new Date(parsed.at).getTime()
    if (!Number.isFinite(timestamp)) {
      return { status: 'stale', key: config.key, role, remediation: 'El heartbeat tiene una fecha inválida; reinicia el worker.' }
    }
    const ageSeconds = Math.max(0, Math.round((now - timestamp) / 1_000))
    if (ageSeconds > config.ttlSeconds) {
      return { status: 'stale', key: config.key, role, lastSeenAt: parsed.at, ageSeconds, pid: parsed.pid, remediation: 'El worker no ha renovado su heartbeat dentro del TTL; comprueba logs y Redis.' }
    }
    return { status: 'healthy', key: config.key, role, lastSeenAt: parsed.at, ageSeconds, pid: parsed.pid }
  } catch {
    return { status: 'unavailable', key: config.key, role, remediation: 'No se pudo leer el heartbeat de Redis; revisa conectividad y permisos.' }
  } finally {
    connection.disconnect()
  }
}

export function workerHeartbeatKey(role = DEFAULT_ROLE): string {
  return heartbeatConfig(role).key
}
