import { FastifyReply } from 'fastify'
import { z } from 'zod'

/**
 * Centraliza las respuestas de validación para que los controladores no
 * acepten campos inesperados ni datos incompletos antes de tocar la base.
 */
export function parseRequest<T extends z.ZodTypeAny>(
  reply: FastifyReply,
  schema: T,
  payload: unknown
): z.output<T> | null {
  const result = schema.safeParse(payload)
  if (result.success) return result.data

  reply.status(400).send({
    error: 'Datos de entrada no válidos',
    fields: result.error.flatten().fieldErrors,
  })
  return null
}
