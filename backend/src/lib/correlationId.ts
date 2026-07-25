import { randomUUID } from 'node:crypto'
import type { FastifyRequest } from 'fastify'

// FND-06: un correlationId por request permite rastrear una petición HTTP a
// través de logs, AutomationRun y OutboxEvent sin acoplar cada servicio.
export function generateCorrelationId(): string {
  return randomUUID()
}

export function isSafeCorrelationId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
}

/** Reusa el correlationId que mande el cliente en 'x-correlation-id', o genera uno nuevo. */
export function getOrCreateCorrelationId(request: FastifyRequest): string {
  const header = request.headers['x-correlation-id']
  const value = Array.isArray(header) ? header[0] : header
  const trimmed = value ? String(value).trim() : ''
  return isSafeCorrelationId(trimmed) ? trimmed : generateCorrelationId()
}
