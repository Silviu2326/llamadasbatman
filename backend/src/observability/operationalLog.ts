import { redactProviderError } from '../lib/integrationRuntime'

export type OperationalLogLevel = 'info' | 'warn' | 'error'

export type OperationalLogContext = {
  correlationId?: string
  orgId?: string
  worker?: string
  queue?: string
  jobId?: string
  eventId?: string
  status?: string
  attempt?: number
  errorCode?: string
  remediation?: string
  [key: string]: unknown
}

export type OperationalError = {
  code: string
  remediation: string
  safeMessage: string
}

const SECRET_LIKE = /(token|secret|password|authorization|cookie|signature|body|payload|transcript|content)/i

function safeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > 256 ? `${value.slice(0, 256)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return `[${value.length} items]`
  return '[redacted]'
}

/**
 * Builds a JSON log record using an allow-list for operational fields. The
 * function is exported separately so policy tests can prove that provider
 * payloads and credentials never reach worker logs.
 */
export function buildOperationalLog(
  level: OperationalLogLevel,
  event: string,
  context: OperationalLogContext = {},
  now = new Date(),
) {
  const safeContext: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (SECRET_LIKE.test(key)) continue
    safeContext[key] = safeValue(value)
  }
  return {
    timestamp: now.toISOString(),
    service: 'backend',
    level,
    event,
    ...safeContext,
  }
}

export function logOperational(
  level: OperationalLogLevel,
  event: string,
  context: OperationalLogContext = {},
): void {
  const record = JSON.stringify(buildOperationalLog(level, event, context))
  if (level === 'error') console.error(record)
  else if (level === 'warn') console.warn(record)
  else console.info(record)
}

export function classifyOperationalError(error: unknown): OperationalError {
  const raw = redactProviderError(error)
  const text = raw.toLowerCase()
  if (text.includes('timeout') || text.includes('timed out')) {
    return {
      code: 'DEPENDENCY_TIMEOUT',
      safeMessage: 'La dependencia no respondió dentro del tiempo límite.',
      remediation: 'Revisar latencia, disponibilidad del proveedor y timeouts antes de reintentar.',
    }
  }
  if (text.includes('econnrefused') || text.includes('enotfound') || text.includes('network') || text.includes('fetch')) {
    return {
      code: 'DEPENDENCY_UNAVAILABLE',
      safeMessage: 'La dependencia no está disponible o no se pudo alcanzar.',
      remediation: 'Comprobar DNS, firewall, URL pública y estado de la dependencia.',
    }
  }
  if (text.includes('unauthorized') || text.includes('forbidden') || text.includes('401') || text.includes('403')) {
    return {
      code: 'DEPENDENCY_AUTHENTICATION',
      safeMessage: 'La dependencia rechazó la autenticación o los permisos.',
      remediation: 'Verificar credenciales, scopes y permisos del workspace en el proveedor.',
    }
  }
  if (text.includes('unique') || text.includes('p2002') || text.includes('duplicate')) {
    return {
      code: 'IDEMPOTENCY_CONFLICT',
      safeMessage: 'La operación ya existe o fue procesada por otro intento.',
      remediation: 'Consultar el registro por correlationId/eventId; no repetir efectos externos a ciegas.',
    }
  }
  if (text.includes('invalid') || text.includes('required') || text.includes('validation') || text.includes('not found')) {
    return {
      code: 'VALIDATION_ERROR',
      safeMessage: 'La operación contiene datos inválidos o un recurso inexistente.',
      remediation: 'Revisar el payload y el vínculo del recurso antes de reintentar.',
    }
  }
  return {
    code: 'UNEXPECTED_ERROR',
    safeMessage: 'Error no clasificado durante la ejecución operativa.',
    remediation: 'Buscar el correlationId en logs y revisar el último paso persistido antes de reintentar.',
  }
}

export function safeOperationalError(error: unknown): OperationalError {
  return classifyOperationalError(error)
}
