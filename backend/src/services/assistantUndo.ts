import type { FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma'
import { assertCapability, getAccessPrincipal, hasPermission } from '../access-control'
import { scopedOwnerId } from '../lib/dataScope'

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode })
export function assistantUndoAvailable(action: any) {
  return action.status === 'completed' && action.name === 'create_task' && !action.undoStatus
    && action.result?.status === 'open' && typeof action.result?.id === 'string'
    && typeof action.result?.updatedAt === 'string' && Number.isFinite(Date.parse(action.result.updatedAt))
}

/** Compensates an untouched task creation. Task, receipt and audit commit together. */
export async function undoAssistantAction(request: FastifyRequest, id: string) {
  const actor = getAccessPrincipal(request)
  if (!actor || !hasPermission(actor.role, 'tasks.write', 'own')) throw fail('No tienes permiso para deshacer esta tarea.', 403)
  await assertCapability(actor.orgId, 'crm')
  const where = { id, orgId: actor.orgId, microappId: 'platform-assistant', scope: actor.userId }
  return prisma.$transaction(async tx => {
    const row = await tx.microappConfig.findFirst({ where })
    if (!row) throw fail('Acción no encontrada.', 404)
    const values = row.values as any
    if (values.undoStatus === 'completed') return { id, ...values, undoAvailable: false, undoLabel: 'Tarea cancelada' }
    if (!assistantUndoAvailable(values)) throw fail('Esta acción no se puede deshacer automáticamente.')
    const claim = await tx.microappConfig.updateMany({ where: { ...where, values: { equals: row.values! } }, data: { values: { ...values, undoStatus: 'running' } } })
    if (!claim.count) throw fail('La acción ha cambiado. Actualiza su estado.')
    const taskWhere = { id: values.result.id, orgId: actor.orgId, ownerId: scopedOwnerId(actor, 'tasks.write'), createdById: actor.userId, source: 'platform-assistant', status: 'open' as const, updatedAt: new Date(values.result.updatedAt) }
    const task = await tx.task.findFirst({ where: taskWhere })
    if (!task) throw fail('La tarea cambió desde su creación. Consúltala antes de modificarla.')
    const changed = await tx.task.updateMany({ where: taskWhere, data: { status: 'cancelled' } })
    if (!changed.count) throw fail('Otra persona modificó la tarea. No se ha deshecho.')
    const final = { ...values, undoStatus: 'completed', undoneAt: new Date().toISOString() }
    await tx.auditLog.create({ data: { orgId: actor.orgId, actorUserId: actor.userId, actorType: 'user', action: 'assistant.task.undo', entityType: 'Task', entityId: task.id, before: JSON.parse(JSON.stringify(task)), after: { status: 'cancelled', assistantActionId: id } } })
    await tx.microappConfig.updateMany({ where, data: { values: final } })
    return { id, ...final, undoAvailable: false, undoLabel: 'Tarea cancelada' }
  })
}
