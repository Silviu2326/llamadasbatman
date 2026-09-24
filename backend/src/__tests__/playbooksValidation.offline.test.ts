process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/test'
import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { createPlaybookSchema, updatePlaybookSchema } from '../controllers/playbooks.controller'
import { createKnowledgeSchema } from '../controllers/knowledge.controller'
import { createPlaybook, removePlaybook, updatePlaybook } from '../services/playbooks.service'
import { loadAgentConfig, renderPlaybookSteps } from '../voice/agentConfig'

test('zod: nombre 2-160, tipo de conocimiento cerrado y pasos con forma', () => {
  assert.equal(createPlaybookSchema.safeParse({ name: 'A' }).success, false)
  assert.equal(createPlaybookSchema.safeParse({ name: 'x'.repeat(161) }).success, false)
  assert.equal(createPlaybookSchema.safeParse({ name: 'Cierre', steps: 'no es una lista' }).success, false)
  assert.equal(createPlaybookSchema.safeParse({ name: 'Cierre', steps: [{ instruction: 'sin título' }] }).success, false)
  assert.equal(createPlaybookSchema.safeParse({ name: 'Cierre', steps: [{ title: 'Apertura', instruction: 'Preséntate', goal: 'Permiso' }], tags: ['b2b'] }).success, true)
  assert.equal(createPlaybookSchema.safeParse({ name: 'Cierre', extra: 1 }).success, false, 'strict: campos desconocidos fuera')
  assert.equal(updatePlaybookSchema.safeParse({ steps: [] }).success, true)
  assert.equal(updatePlaybookSchema.safeParse({ isActive: 'sí' }).success, false)

  assert.equal(createKnowledgeSchema.safeParse({ name: 'X', content: 'hola' }).success, false)
  assert.equal(createKnowledgeSchema.safeParse({ name: 'Producto', type: 'Producto' }).success, false)
  assert.equal(createKnowledgeSchema.safeParse({ name: 'Producto', type: 'url', sourceUrl: 'https://a.es' }).success, true)
  assert.equal(createKnowledgeSchema.safeParse({ name: 'Doc', file: { name: 'sin-extension', contentBase64: 'QQ==' } }).success, false)
  assert.equal(createKnowledgeSchema.safeParse({ name: 'Doc', file: { name: 'a.pdf', contentBase64: 'QQ==' } }).success, true)
})

test('los pasos estructurados se renderizan legibles para el LLM', () => {
  const text = renderPlaybookSteps([{ title: 'Apertura', instruction: 'Preséntate y pide permiso', goal: 'Permiso para hablar' }, { title: 'Cierre' }])
  assert.match(text, /^1\. Apertura — Preséntate y pide permiso — \(goal: Permiso para hablar\)\n2\. Cierre$/)
  assert.equal(renderPlaybookSteps({ any: 'json' }), '{"any":"json"}')
  assert.equal(renderPlaybookSteps(null), '')
})

function stubAgentConfigQueries(t: any, state: { playbookDescription: string }) {
  const original = {
    agentFindFirst: prisma.agent.findFirst,
    agentFindMany: prisma.agent.findMany,
    playbookFindFirst: prisma.playbook.findFirst,
    credential: prisma.organizationIntegrationCredential.findUnique,
  }
  t.after(() => {
    prisma.agent.findFirst = original.agentFindFirst
    prisma.agent.findMany = original.agentFindMany
    prisma.playbook.findFirst = original.playbookFindFirst
    prisma.organizationIntegrationCredential.findUnique = original.credential
  })
  prisma.agent.findFirst = (async () => ({
    id: 'ag-1', name: 'Carlos', agentType: 'sales', callDirection: 'outbound', language: 'es', isActive: true, systemPrompt: 'Guion', role: 'Comercial', voiceId: null, phoneNumber: null,
    settings: { activePlaybookId: 'pb-1' },
    org: { name: 'Vendrava', industry: 'Software', currency: 'EUR', timezone: 'Europe/Madrid', settings: {} },
  })) as any
  const agentQueries: any[] = []
  prisma.agent.findMany = (async (args: any) => { agentQueries.push(args); return [{ id: 'ag-1', name: 'Carlos', isActive: true, lifecycleStatus: 'draft' }] }) as any
  prisma.playbook.findFirst = (async () => ({ id: 'pb-1', name: 'Cierre', description: state.playbookDescription, steps: null, tags: [] })) as any
  prisma.organizationIntegrationCredential.findUnique = (async () => null) as any
  return agentQueries
}

test('updatePlaybook con steps: [] borra los pasos e invalida la caché de los agentes que lo usan', async t => {
  const state = { playbookDescription: 'v1' }
  const agentQueries = stubAgentConfigQueries(t, state)
  const originalUpdateMany = prisma.playbook.updateMany
  const updates: any[] = []
  prisma.playbook.updateMany = (async (args: any) => { updates.push(args); return { count: 1 } }) as any
  t.after(() => { prisma.playbook.updateMany = originalUpdateMany })

  const before = await loadAgentConfig('ag-1', 'org-a')
  assert.match(String(before.playbook.scripts.custom_playbook), /Purpose: v1/)
  state.playbookDescription = 'v2'
  // Sin invalidación la caché de 5 minutos seguiría sirviendo v1.
  assert.match(String((await loadAgentConfig('ag-1', 'org-a')).playbook.scripts.custom_playbook), /Purpose: v1/)

  await updatePlaybook('org-a', 'pb-1', { steps: [], description: 'v2' })
  assert.deepEqual(updates[0].where, { id: 'pb-1', orgId: 'org-a' })
  assert.equal(updates[0].data.steps, Prisma.DbNull, 'steps vacío = borrar')
  assert.deepEqual(agentQueries[0].where, { orgId: 'org-a', settings: { path: ['activePlaybookId'], equals: 'pb-1' } })
  assert.match(String((await loadAgentConfig('ag-1', 'org-a')).playbook.scripts.custom_playbook), /Purpose: v2/)

  await updatePlaybook('org-a', 'pb-1', { name: 'Solo nombre' })
  assert.equal(updates[1].data.steps, undefined, 'sin steps en el patch no se tocan')

  await updatePlaybook('org-a', 'pb-1', { steps: [{ title: 'Apertura' }] })
  assert.deepEqual(updates[2].data.steps, [{ id: 'step-1', title: 'Apertura', instruction: '', goal: '' }])
})

test('crear y borrar un guion también invalidan; el borrado es lógico', async t => {
  const state = { playbookDescription: 'v1' }
  const agentQueries = stubAgentConfigQueries(t, state)
  const original = { create: prisma.playbook.create, updateMany: prisma.playbook.updateMany }
  prisma.playbook.create = (async (args: any) => ({ id: 'pb-new', ...args.data })) as any
  const updates: any[] = []
  prisma.playbook.updateMany = (async (args: any) => { updates.push(args); return { count: 1 } }) as any
  t.after(() => { prisma.playbook.create = original.create; prisma.playbook.updateMany = original.updateMany })

  const created = await createPlaybook('org-a', { name: 'Nuevo', steps: [] })
  assert.equal(created.steps, Prisma.DbNull)
  assert.equal(agentQueries.length, 1)

  await removePlaybook('org-a', 'pb-1')
  assert.deepEqual(updates[0].data, { isActive: false })
  assert.equal(agentQueries.length, 2)
})
