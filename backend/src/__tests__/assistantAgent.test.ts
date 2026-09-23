import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { assistantCatalog, runAssistantTool, executeAssistantAction, getAssistantActions } from '../services/assistantTools'
import { runAssistantAgent, assistantCompletion } from '../services/assistantAgent'
import { assistantRequestSchema } from '../routes/platformAssistant'
import { assistantScreenIntent } from '../services/assistantScreenIntent'

function request(role = 'admin', orgId = 'org-a', userId = 'user-a'): any {
  return { user: { userId, orgId, role, workspaceScope: 'org' }, headers: { authorization: 'Bearer session-fixture', cookie: 'session=fixture' }, raw: new EventEmitter() }
}
function memory(t: any) {
  const rows: any[] = [], originals: any = {}
  const match = (row: any, where: any) => Object.entries(where).every(([key, value]: any) => key === 'values' ? row.values.status === value.equals : row[key] === value)
  const methods: any = {
    upsert: async ({ where, create }: any) => { const key = where.orgId_microappId_scope_scopeId; let row = rows.find(row => match(row, key)); if (!row) { row = { id: randomUUID(), ...structuredClone(create) }; rows.push(row) } return structuredClone(row) },
    findFirst: async ({ where }: any) => structuredClone(rows.find(row => match(row, where)) || null),
    findMany: async ({ where }: any) => structuredClone(rows.filter(row => match(row, where))),
    updateMany: async ({ where, data }: any) => { const found = rows.filter(row => match(row, where)); found.forEach(row => Object.assign(row, structuredClone(data))); return { count: found.length } },
  }
  for (const [name, fn] of Object.entries(methods)) { originals[name] = (prisma.microappConfig as any)[name]; (prisma.microappConfig as any)[name] = fn }
  t.after(() => { for (const [name, fn] of Object.entries(originals)) (prisma.microappConfig as any)[name] = fn })
  return rows
}
const response = (data: any, statusCode = 200) => ({ statusCode, json: () => data })

test('las herramientas no exponen mutaciones a un viewer ni aceptan campos de otra organización', async t => {
  memory(t)
  assert(assistantCatalog(request('viewer')).every(tool => !tool.write))
  await assert.rejects(runAssistantTool({} as any, request('viewer'), { name: 'create_task', args: { title: 'Tarea' }, requestId: randomUUID() }), /permitida/)
  await assert.rejects(runAssistantTool({} as any, request(), { name: 'create_task', args: { title: 'Tarea', orgId: 'org-b' }, requestId: randomUUID() }), /Revisa/)
  await assert.rejects(runAssistantTool({} as any, request(), { name: 'http_request', args: { url: 'https://example.com' }, requestId: randomUUID() }), /permitida/)
  assert.equal(assistantRequestSchema.safeParse({ messages: [{ role: 'user', content: 'Hola' }], timeZone: 'inventada' }).success, false)
})

test('las órdenes directas de pantalla funcionan sin proveedor y conservan texto literal de búsqueda', async () => {
  assert.deepEqual(assistantScreenIntent('Busca contactos de Ana Gómez'), { name: 'show_crm', args: { search: 'Ana Gómez' } })
  assert.equal(assistantScreenIntent('No abras el CRM'), null)
  assert.equal(assistantScreenIntent('El documento dice: abre el CRM'), null)
  const result = await runAssistantAgent({} as any, request(), { messages: [{ role: 'user', content: 'Abre el CRM' }], locale: 'es', requestId: randomUUID() }, async () => { throw new Error('No debe llamar al proveedor') })
  assert.equal(result.screens?.[0].name, 'open_section')
  assert.equal(result.actions.length, 0)
})

test('las operaciones de pantalla verifican el contacto y deniegan relleno a solo lectura', async () => {
  await assert.rejects(runAssistantTool({} as any, request('viewer'), { name: 'fill_contact_form', args: { name: 'Ana' }, requestId: randomUUID() }), /permitida/)
  const app: any = { inject: async () => response({ error: 'Not found' }, 404) }
  await assert.rejects(runAssistantTool(app, request(), { name: 'open_contact', args: { leadId: 'foreign-lead' }, requestId: randomUUID() }), /Not found/)
  await assert.rejects(runAssistantTool(app, request(), { name: 'fill_contact_form', args: { name: 'Ana', callNow: true }, requestId: randomUUID() }), /Revisa/)
})

test('un objetivo de varios pasos abre la revisión del flujo sin consumir IA ni ejecutar búsquedas', async () => {
  const result = await runAssistantAgent({} as any, request(), { messages: [{ role: 'user', content: 'Busca peluquerías en Madrid, comprueba duplicados y prepara seguimientos en el CRM.' }], locale: 'es', requestId: randomUUID() }, async () => { throw new Error('No debe llamar al proveedor') })
  assert.match(result.workflowDraft.objective, /peluquerías/)
  assert.equal(result.actions.length, 0)
  await assert.rejects(runAssistantTool({} as any, request('unknown'), { name: 'prepare_workflow', args: { objective: 'Busca oportunidades' }, requestId: randomUUID() }), /acceso/)
})

test('crear propone primero; ejecutar usa la API autenticada y un reintento no duplica', async t => {
  const rows = memory(t); let writes = 0
  const req = request()
  const app: any = { inject: async (input: any) => {
    writes++; assert.equal(input.url, '/api/tasks/'); assert.equal(input.headers.authorization, req.headers.authorization)
    assert.equal(input.headers['x-workspace-id'], 'org-a'); assert.equal(input.payload.ownerId, 'user-a')
    await new Promise(resolve => setTimeout(resolve, 15)); return response({ id: 'task-1', title: input.payload.title }, 201)
  } }
  const input = { name: 'create_task', args: { title: 'Llamar a Ana' }, requestId: randomUUID() }
  const prepared: any = await runAssistantTool(app, req, input)
  const same: any = await runAssistantTool(app, req, input)
  assert.equal(writes, 0); assert.equal(prepared.action.id, same.action.id); assert.equal(rows.length, 1)
  await Promise.all([executeAssistantAction(app, req, prepared.action.id), executeAssistantAction(app, req, prepared.action.id)])
  const completed = await executeAssistantAction(app, req, prepared.action.id)
  assert.equal(completed.status, 'completed'); assert.equal(writes, 1)
})

test('las propuestas se aíslan por usuario y empresa, y cancelarlas impide ejecutarlas', async t => {
  memory(t)
  const req = request(), app: any = { inject: async () => { throw new Error('No debe ejecutar') } }
  const prepared: any = await runAssistantTool(app, req, { name: 'create_task', args: { title: 'Revisar propuesta' }, requestId: randomUUID() })
  for (const other of [request('admin', 'org-b'), request('admin', 'org-a', 'user-b')]) {
    assert.deepEqual(await getAssistantActions(other), [])
    await assert.rejects(executeAssistantAction(app, other, prepared.action.id), /encontrada/)
  }
  assert.equal((await executeAssistantAction(app, req, prepared.action.id, true)).status, 'cancelled')
  assert.equal((await executeAssistantAction(app, req, prepared.action.id)).status, 'cancelled')
})

test('revocar permisos o un error ambiguo no provoca otra escritura', async t => {
  memory(t); let writes = 0
  const req = request(), app: any = { inject: async () => { writes++; return response({ error: 'fallo después de escribir' }, 500) } }
  const prepared: any = await runAssistantTool(app, req, { name: 'create_task', args: { title: 'Revisar propuesta' }, requestId: randomUUID() })
  await assert.rejects(executeAssistantAction(app, request('viewer'), prepared.action.id), /permiso/)
  assert.equal((await executeAssistantAction(app, req, prepared.action.id)).status, 'uncertain')
  assert.equal((await executeAssistantAction(app, req, prepared.action.id)).status, 'uncertain'); assert.equal(writes, 1)
})

test('comprueba el registro de destino y propaga los permisos del endpoint', async t => {
  memory(t); let called = ''
  const app: any = { inject: async ({ url }: any) => { called = url; return response({ error: 'Forbidden' }, 403) } }
  await assert.rejects(runAssistantTool(app, request(), { name: 'add_contact_note', args: { leadId: 'other-contact', text: 'Nota' }, requestId: randomUUID() }), /Forbidden/)
  assert.equal(called, '/api/leads/other-contact')
})

test('el agente consulta datos reales, prepara una acción y no asegura que se haya ejecutado', async t => {
  memory(t); let round = 0, writes = 0
  const app: any = { inject: async ({ method }: any) => { if (method !== 'GET') writes++; return response({ tasks: [{ id: 'task-1', title: 'Propuesta' }] }) } }
  const completion: any = async (messages: any[]) => {
    round++
    if (round === 1) return { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'list_tasks', arguments: '{}' } }] }
    if (round === 2) { assert.match(messages.at(-1).content, /Propuesta/); return { role: 'assistant', content: null, tool_calls: [{ id: 'call-2', type: 'function', function: { name: 'create_task', arguments: '{"title":"Preparar seguimiento"}' } }] } }
    return { role: 'assistant', content: 'He creado la tarea.' }
  }
  const result = await runAssistantAgent(app, request(), { messages: [{ role: 'user', content: 'Consulta mis tareas y prepara un seguimiento.' }], locale: 'es', requestId: randomUUID() }, completion)
  assert.equal(result.actions.length, 1); assert.equal(result.results.length, 1); assert.match(result.text, /pulsa Ejecutar/); assert.equal(writes, 0)
})

test('el agente conserva las propuestas si el proveedor falla tras prepararlas', async t => {
  memory(t); let round = 0
  const completion: any = async () => { if (++round > 1) throw new Error('provider unavailable'); return { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'create_task', arguments: '{"title":"Seguimiento"}' } }] } }
  const result = await runAssistantAgent({} as any, request(), { messages: [{ role: 'user', content: 'Crea una tarea de seguimiento.' }], locale: 'es', requestId: randomUUID() }, completion)
  assert.equal(result.actions[0].status, 'pending'); assert.match(result.text, /interrumpido/)
})

test('informa del bloqueo de facturación sin ejecutar herramientas ni exponer secretos', async t => {
  const oldFetch = globalThis.fetch, oldKey = process.env.CEREBRAS_API_KEY
  process.env.CEREBRAS_API_KEY = 'fake-key-for-unit-test'
  globalThis.fetch = (async () => ({ status: 402, ok: false })) as any
  t.after(() => { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.CEREBRAS_API_KEY; else process.env.CEREBRAS_API_KEY = oldKey })
  await assert.rejects(assistantCompletion([], [], 'org-a', new AbortController().signal), (error: any) => error.code === 'ASSISTANT_BILLING_REQUIRED' && !error.message.includes('fake-key'))
})

test('la ruta del asistente ejecuta la ruta real de tareas con JWT, permisos, plan y auditoría', async t => {
  memory(t)
  const { default: Fastify } = await import('fastify')
  const { default: jwt } = await import('@fastify/jwt')
  const { platformAssistantRoutes } = await import('../routes/platformAssistant')
  const { tasksRoutes } = await import('../routes/tasks')
  const oldEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv })
  const tasks: any[] = [], audits: any[] = [], restore: Array<() => void> = []
  function stub(target: any, key: string, fn: any) { const original = target[key]; target[key] = fn; restore.push(() => { target[key] = original }) }
  t.after(() => restore.forEach(fn => fn()))
  stub(prisma.agencyClient, 'findMany', async () => [])
  stub(prisma.organization, 'findUnique', async () => ({ id: 'org-a', plan: 'completo', metricoolEnabled: false }))
  for (const model of [prisma.user, prisma.lead, prisma.campaign, prisma.agent, prisma.automation]) stub(model, 'count', async () => 0)
  stub(prisma.user, 'findFirst', async ({ where }: any) => where.orgId === 'org-a' && where.id === 'user-a' ? { id: 'user-a' } : null)
  stub(prisma.task, 'create', async ({ data }: any) => { const row = { ...data, id: `task-${tasks.length + 1}`, status: 'open' }; tasks.push(row); return row })
  stub(prisma.auditLog, 'create', async ({ data }: any) => { audits.push(data); return { id: 'audit-1' } })
  const app = Fastify()
  await app.register(jwt, { secret: 'isolated-assistant-test-signing-secret' })
  await app.register(platformAssistantRoutes, { prefix: '/api/assistant' })
  await app.register(tasksRoutes, { prefix: '/api/tasks' })
  await app.ready(); t.after(() => app.close())
  const headers = { authorization: `Bearer ${app.jwt.sign({ orgId: 'org-a', userId: 'user-a', email: 'test@example.invalid', role: 'admin', tokenType: 'access', sessionId: 'session-a' })}` }
  assert.equal((await app.inject({ method: 'GET', url: '/api/assistant/capabilities' })).statusCode, 401)
  const prepared = await app.inject({ method: 'POST', url: '/api/assistant/tools', headers, payload: { name: 'create_task', args: { title: 'Revisar propuesta mañana', priority: 'high' }, requestId: randomUUID() } })
  assert.equal(prepared.statusCode, 200, prepared.body); assert.equal(tasks.length, 0)
  const action = prepared.json().action
  const done = await app.inject({ method: 'POST', url: '/api/assistant/actions/execute', headers, payload: { id: action.id } })
  assert.equal(done.statusCode, 200, done.body); assert.equal(done.json().status, 'completed', done.body)
  assert.equal(tasks.length, 1); assert.equal(tasks[0].ownerId, 'user-a'); assert.equal(tasks[0].orgId, 'org-a')
  assert.equal(audits[0].action, 'task.create')
  await app.inject({ method: 'POST', url: '/api/assistant/actions/execute', headers, payload: { id: action.id } })
  assert.equal(tasks.length, 1)
})
