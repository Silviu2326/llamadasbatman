import { prisma } from './prisma'
import { Prisma } from '@prisma/client'

interface LogSalesActivityInput {
  orgId: string
  type: string
  leadId?: string | null
  opportunityId?: string | null
  meetingId?: string | null
  conversationId?: string | null
  actorUserId?: string | null
  source?: string
  sourceId?: string | null
  subject?: string | null
  body?: string | null
  metadata?: unknown
  occurredAt?: Date
}

/**
 * FND-02: proyecta una entrada del timeline comercial (SalesActivity) desde
 * el punto de mutación real. Nunca debe bloquear la mutación que la llama:
 * si falla, se loguea y se sigue (mismo criterio que writeAuditLog).
 *
 * Si `sourceId` está presente, hace upsert sobre el unique compuesto
 * (orgId, source, sourceId, type) para que sea idempotente ante reintentos
 * (p.ej. un webhook de llamada reprocesado). Sin sourceId, hace un create
 * normal (occurredAt cae al default `now()` del schema).
 */
export async function logSalesActivity(input: LogSalesActivityInput): Promise<void> {
  const source = input.source ?? 'manual'
  const data = {
    orgId: input.orgId,
    type: input.type,
    leadId: input.leadId ?? undefined,
    opportunityId: input.opportunityId ?? undefined,
    meetingId: input.meetingId ?? undefined,
    conversationId: input.conversationId ?? undefined,
    actorUserId: input.actorUserId ?? undefined,
    source,
    sourceId: input.sourceId ?? undefined,
    subject: input.subject ?? undefined,
    body: input.body ?? undefined,
    metadata: input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonValue),
    occurredAt: input.occurredAt,
  }

  try {
    if (input.sourceId) {
      await prisma.salesActivity.upsert({
        where: {
          orgId_source_sourceId_type: {
            orgId: input.orgId,
            source,
            sourceId: input.sourceId,
            type: input.type,
          },
        },
        create: data,
        update: data,
      })
    } else {
      await prisma.salesActivity.create({ data })
    }
  } catch (err) {
    console.error('[salesActivity] failed to log activity', { type: input.type, leadId: input.leadId, err })
  }
}
