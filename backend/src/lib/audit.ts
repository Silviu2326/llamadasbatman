import { prisma } from './prisma'

interface AuditLogInput {
  orgId: string
  actorUserId?: string | null
  actorType?: 'user' | 'system'
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  correlationId?: string
}

/**
 * Registro forense de mutaciones sensibles (P0-12). Nunca debe bloquear la
 * mutación que audita: si falla, se loguea y se sigue.
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: input.orgId,
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType ?? 'user',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before === undefined ? undefined : (input.before as object),
        after: input.after === undefined ? undefined : (input.after as object),
        correlationId: input.correlationId,
      },
    })
  } catch (err) {
    console.error('[audit] failed to write audit log', { action: input.action, entityType: input.entityType, entityId: input.entityId, err })
  }
}
