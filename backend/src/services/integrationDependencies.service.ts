import { prisma } from '../lib/prisma'
import { getProvider } from '../providers/registry'

type AutomationLike = { id: string; name: string; actions: unknown }

const AUTOMATION_PROVIDER_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  mautic: ['send_to_mautic_segment', 'send_email_template'],
  twilio: ['send_whatsapp_template', 'queue_voice_call', 'ai_reply_whatsapp'],
  deepseek: ['ai_reply_whatsapp'],
}

function actionTypes(actions: unknown): string[] {
  if (!Array.isArray(actions)) return []
  return actions.flatMap(action => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return []
    const type = (action as Record<string, unknown>).type
    return typeof type === 'string' ? [type] : []
  })
}

export function automationsAffectedByProvider(providerId: string, automations: AutomationLike[]) {
  const relevant = new Set(AUTOMATION_PROVIDER_ACTIONS[providerId] ?? [])
  if (!relevant.size) return []
  return automations.flatMap(automation => {
    const actions = [...new Set(actionTypes(automation.actions).filter(type => relevant.has(type)))]
    return actions.length ? [{ automationId: automation.id, name: automation.name, actions }] : []
  })
}

/**
 * Impacto visible antes de desconectar. Un flow fijado al proveedor sí se
 * bloquearía; uno no fijado solo queda marcado como «puede reenrutarse» porque
 * la viabilidad final depende de credenciales, política y presupuesto.
 */
export async function providerDependencyImpact(orgId: string, providerId: string) {
  return (await providerDependencyImpacts(orgId, [providerId]))[providerId]
}

/** Calcula todo el catálogo con tres queries, no una pareja por proveedor. */
export async function providerDependencyImpacts(orgId: string, providerIds: string[]) {
  const flows = await prisma.flow.findMany({
    where: { OR: [{ orgId }, { orgId: null }], currentVersionId: { not: null } },
    select: { id: true, slug: true, name: true, orgId: true, currentVersionId: true },
  })
  const versionIds = flows.map(flow => flow.currentVersionId).filter((id): id is string => Boolean(id))
  const [dependencies, automations] = await Promise.all([
    versionIds.length
      ? prisma.flowCapabilityDependency.findMany({ where: { flowVersionId: { in: versionIds } } })
      : Promise.resolve([]),
    prisma.automation.findMany({
      where: { orgId, isActive: true, status: 'active' },
      select: { id: true, name: true, actions: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ])
  return Object.fromEntries(providerIds.map(providerId => {
    const capabilities = new Set(getProvider(providerId)?.capabilities.map(binding => binding.capability) ?? [])
    const affectedFlows = flows.flatMap(flow => {
      const relevant = dependencies
        .filter(dep => dep.flowVersionId === flow.currentVersionId)
        .flatMap(dep => dep.pinnedProvider === providerId
          ? [{ capability: dep.capability, pinned: true }]
          : dep.pinnedProvider === null && capabilities.has(dep.capability)
            ? [{ capability: dep.capability, pinned: false }]
            : [])
      return relevant.length ? [{ flowId: flow.id, slug: flow.slug, name: flow.name, isSystem: flow.orgId === null, capabilities: relevant }] : []
    })
    const blockingFlows = affectedFlows.filter(flow => flow.capabilities.some(dependency => dependency.pinned))
    const reroutableFlows = affectedFlows.filter(flow => !flow.capabilities.some(dependency => dependency.pinned))
    const affectedAutomations = automationsAffectedByProvider(providerId, automations)
    return [providerId, {
      wouldBlock: blockingFlows.length > 0 || affectedAutomations.length > 0,
      counts: { blockingFlows: blockingFlows.length, reroutableFlows: reroutableFlows.length, automations: affectedAutomations.length },
      blockingFlows,
      reroutableFlows,
      automations: affectedAutomations,
    }]
  }))
}
