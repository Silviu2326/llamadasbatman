import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { assistantUndoAvailable, undoAssistantAction } from '../services/assistantUndo'

const request = (role = 'admin', orgId = 'org-a', userId = 'user-a'): any => ({ user: { role, orgId, userId, workspaceScope: 'org' } })
function fixture(t: any) {
  const task = { id: 'task-a', orgId: 'org-a', ownerId: 'user-a', createdById: 'user-a', source: 'platform-assistant', status: 'open', updatedAt: new Date('2026-09-15T10:00:00Z') }
  const action: any = { id: 'action-a', orgId: 'org-a', microappId: 'platform-assistant', scope: 'user-a', values: { name: 'create_task', status: 'completed', result: { ...task, updatedAt: task.updatedAt.toISOString() } } }
  let writes = 0, audits = 0
  const match = (row: any, where: any): boolean => Object.entries(where).every(([k, v]: any) => v === undefined || (k === 'values' ? JSON.stringify(row[k]) === JSON.stringify(v.equals) : v instanceof Date ? row[k]?.getTime() === v.getTime() : row[k] === v))
  const tx: any = {
    microappConfig: { findFirst: async ({ where }: any) => match(action, where) ? structuredClone(action) : null, updateMany: async ({ where, data }: any) => { if (!match(action, where)) return { count: 0 }; Object.assign(action, structuredClone(data)); return { count: 1 } } },
    task: { findFirst: async ({ where }: any) => match(task, where) ? structuredClone(task) : null, updateMany: async ({ where, data }: any) => { if (!match(task, where)) return { count: 0 }; Object.assign(task, data); writes++; return { count: 1 } } },
    auditLog: { create: async () => { audits++; return {} } },
  }
  const originalTx = prisma.$transaction, originalOrg = prisma.organization.findUnique
  const counters = [prisma.user, prisma.lead, prisma.campaign, prisma.agent, prisma.automation].map(model => ({ model, count: model.count }))
  for (const { model } of counters) (model as any).count = async () => 0
  prisma.organization.findUnique = (async () => ({ id: 'org-a', plan: 'completo' })) as any
  prisma.$transaction = (async (fn: any) => {
    const before = structuredClone({ task, action })
    try { return await fn(tx) } catch (error) { Object.assign(task, before.task); Object.assign(action, before.action); throw error }
  }) as any
  t.after(() => { prisma.$transaction = originalTx; prisma.organization.findUnique = originalOrg; for (const { model, count } of counters) (model as any).count = count })
  return { task, action, counts: () => ({ writes, audits }) }
}

test('deshacer cancela una tarea intacta una sola vez y conserva recibo y auditoría', async t => {
  const state = fixture(t)
  assert.equal(assistantUndoAvailable(state.action.values), true)
  const undone = await undoAssistantAction(request(), 'action-a')
  assert.equal(undone.undoStatus, 'completed'); assert.equal(state.task.status, 'cancelled')
  await undoAssistantAction(request(), 'action-a')
  assert.deepEqual(state.counts(), { writes: 1, audits: 1 })
})

test('deshacer rechaza otros usuarios, empresas, roles y tareas modificadas', async t => {
  const state = fixture(t)
  for (const actor of [request('viewer'), request('admin', 'org-b'), request('admin', 'org-a', 'user-b')]) await assert.rejects(undoAssistantAction(actor, 'action-a'))
  state.task.updatedAt = new Date('2026-09-15T11:00:00Z')
  await assert.rejects(undoAssistantAction(request(), 'action-a'), /cambió/)
  assert.equal(state.action.values.undoStatus, undefined)
  assert.deepEqual(state.counts(), { writes: 0, audits: 0 })
  assert.equal(assistantUndoAvailable({ ...state.action.values, name: 'create_contact' }), false)
})
