import { prisma } from '../lib/prisma'

export async function getAutomation(orgId: string, id: string) {
  return prisma.automation.findFirst({ where: { id, orgId } })
}

export async function listAutomations(orgId: string) {
  return prisma.automation.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createAutomation(orgId: string, data: {
  name: string
  trigger: Record<string, unknown>
  actions: unknown[]
  isActive?: boolean
}) {
  return prisma.automation.create({
    data: {
      orgId,
      name: data.name,
      trigger: data.trigger as any,
      actions: data.actions as any,
      isActive: data.isActive ?? true,
    },
  })
}

export async function toggleAutomation(orgId: string, id: string) {
  const automation = await prisma.automation.findFirst({ where: { id, orgId } })
  if (!automation) throw new Error('Automation not found')

  return prisma.automation.update({
    where: { id },
    data: { isActive: !automation.isActive },
  })
}

export async function runAutomationsForEvent(
  orgId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const automations = await prisma.automation.findMany({
    where: { orgId, isActive: true },
  })

  const matching = automations.filter((a) => {
    const trigger = a.trigger as Record<string, unknown>
    return trigger.event === event
  })

  for (const automation of matching) {
    const actions = automation.actions as Array<{ type: string; params?: Record<string, unknown> }>

    for (const action of actions) {
      if (action.type === 'log') {
        console.log(`[Automation:${automation.name}] event=${event}`, payload)
      } else if (action.type === 'update_lead_status' && payload.leadId) {
        const newStatus = action.params?.status as string | undefined
        if (newStatus) {
          await prisma.lead.updateMany({
            where: { id: String(payload.leadId), orgId },
            data: { status: newStatus as 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted' },
          })
        }
      }
    }

    await prisma.automation.update({
      where: { id: automation.id },
      data: { runsCount: { increment: 1 }, lastRunAt: new Date() },
    })
  }

  return { triggered: matching.length }
}
