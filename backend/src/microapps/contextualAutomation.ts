import { prisma } from '../lib/prisma'
import { hasPermission } from '../access-control'
import { getMicroapp, listMicroapps } from './registry'
import { startMicroappRun } from './runtime'

export type ContextualDomainEvent = 'after_call' | 'after_create'

/** Creates opt-in runs from domain events. Configuration is explicit and fail-closed. */
export async function triggerContextualMicroapps(params: {
  orgId: string
  event: ContextualDomainEvent
  entity: { leadId?: string; accountId?: string; callId?: string; opportunityId?: string; conversationId?: string; meetingId?: string }
  createdById?: string
  role?: string
}) {
  const manifests = listMicroapps().filter(manifest => manifest.placements?.some(placement => placement.trigger === params.event))
  const queued: Array<{ microappId: string; jobId: string }> = []
  for (const manifest of manifests) {
    if (params.role && !manifest.dataAccess.every(permission => hasPermission(params.role, permission))) continue
    const config = await prisma.microappConfig.findFirst({ where: { orgId: params.orgId, microappId: manifest.id, scope: 'organization' } })
    const values = config?.values && typeof config.values === 'object' && !Array.isArray(config.values) ? config.values as Record<string, unknown> : {}
    const triggers = Array.isArray(values.autoTriggers) ? values.autoTriggers : []
    if (!triggers.includes(params.event)) continue
    const input = params.event === 'after_call' && params.entity.callId ? { callId: params.entity.callId } : params.entity.leadId ? { leadId: params.entity.leadId } : {}
    if (!manifest.inputSchema.safeParse(input).success) continue
    const run = await startMicroappRun({ orgId: params.orgId, microappId: manifest.id, input, createdById: params.createdById, links: params.entity, idempotencyKey: `${params.event}:${params.entity.callId ?? params.entity.leadId ?? params.entity.opportunityId ?? 'entity'}` })
    queued.push({ microappId: manifest.id, jobId: run.jobId })
  }
  return queued
}
