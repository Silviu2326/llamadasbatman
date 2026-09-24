import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { invalidateAgentConfigCache } from '../voice/agentConfig'

/**
 * Guiones de llamada (modelo `Playbook`). Un agente lo usa a través de
 * `Agent.settings.activePlaybookId` y `agentConfig.loadAgentConfig` lo cachea
 * cinco minutos: por eso cada escritura invalida la caché de los agentes de
 * la organización que lo tienen activo.
 */

export interface PlaybookStep {
  id?: string
  title: string
  instruction?: string
  goal?: string
}

export interface PlaybookInput {
  name: string
  description?: string
  steps?: PlaybookStep[]
  tags?: string[]
}

export type PlaybookPatch = Partial<PlaybookInput> & { isActive?: boolean }

export async function getPlaybook(orgId: string, id: string) {
  return prisma.playbook.findFirst({ where: { id, orgId } })
}

export async function listPlaybooks(orgId: string) {
  // `campaignCount` alimenta la tarjeta "Usados en campañas", que hasta ahora
  // enseñaba un guion fijo por no tener de dónde sacarlo.
  const playbooks = await prisma.playbook.findMany({
    where: { orgId, isActive: true },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { campaigns: true } } },
  })
  return playbooks.map(({ _count, ...playbook }) => ({ ...playbook, campaignCount: _count.campaigns }))
}

/** Agentes de la organización con este guion activo (`settings.activePlaybookId`). */
export async function agentsUsingPlaybook(orgId: string, playbookId: string) {
  return prisma.agent.findMany({
    where: { orgId, settings: { path: ['activePlaybookId'], equals: playbookId } },
    select: { id: true, name: true, isActive: true, lifecycleStatus: true },
  })
}

/** Vacía la caché de configuración de los agentes que usan el guion. */
export async function invalidatePlaybookAgents(orgId: string, playbookId: string): Promise<string[]> {
  let agentIds: string[] = []
  try {
    agentIds = (await agentsUsingPlaybook(orgId, playbookId)).map(agent => agent.id)
  } catch (error) {
    // Si la consulta JSON falla, se invalida la organización entera: más
    // barato que servir un guion viejo en una llamada.
    console.warn('[PLAYBOOKS] no se pudo resolver los agentes del guion; se invalida toda la organización:', error instanceof Error ? error.message : error)
    invalidateAgentConfigCache(orgId)
    return []
  }
  if (!agentIds.length) return []
  for (const agentId of agentIds) invalidateAgentConfigCache(orgId, agentId)
  return agentIds
}

/** `[]` o `undefined` en creación = sin pasos (null en la base). */
function stepsValue(steps: PlaybookStep[] | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (steps === undefined) return undefined
  if (!steps.length) return Prisma.DbNull
  return steps.map((step, index) => ({
    id: step.id?.trim() || `step-${index + 1}`,
    title: step.title.trim(),
    instruction: step.instruction?.trim() ?? '',
    goal: step.goal?.trim() ?? '',
  }))
}

export async function createPlaybook(orgId: string, data: PlaybookInput) {
  const playbook = await prisma.playbook.create({
    data: {
      orgId,
      name: data.name,
      description: data.description,
      steps: stepsValue(data.steps) ?? undefined,
      tags: data.tags ?? [],
    },
  })
  // Un guion recién creado no lo usa nadie todavía, pero un clon o un
  // reintento sí pueden heredar el id: invalidar no cuesta nada.
  await invalidatePlaybookAgents(orgId, playbook.id)
  return playbook
}

export async function updatePlaybook(orgId: string, id: string, data: PlaybookPatch) {
  const result = await prisma.playbook.updateMany({
    where: { id, orgId },
    data: {
      name: data.name,
      description: data.description,
      // `steps: []` borra los pasos (DbNull). `undefined` los deja como están.
      steps: stepsValue(data.steps),
      tags: data.tags,
      isActive: data.isActive,
    },
  })
  if (result.count) await invalidatePlaybookAgents(orgId, id)
  return result
}

/** Borrado lógico: el guion deja de listarse y de cargarse en llamadas. */
export async function removePlaybook(orgId: string, id: string) {
  const result = await prisma.playbook.updateMany({ where: { id, orgId }, data: { isActive: false } })
  if (result.count) await invalidatePlaybookAgents(orgId, id)
  return result
}
