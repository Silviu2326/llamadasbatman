// Contrato del cliente del Centro de acciones: el modo live debe enviar
// `actions` (el backend responde 422 EXECUTABLE_ACTIONS_REQUIRED sin ellas).
// node --test src/lib/orchestration.test.mjs
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let server, orch
before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' })
  orch = await server.ssrLoadModule('/src/lib/orchestration.js')
})
after(async () => { await server?.close() })

const CATALOG = [
  { kind: 'landing.create_draft', title: 'Crear landing en borrador', effects: 'local', fields: [{ key: 'name', label: 'Nombre', type: 'text', required: false }, { key: 'campaignId', label: 'ID de campaña', type: 'reference', required: false }] },
  { kind: 'ads.publish_paused', title: 'Crear campaña Ads pausada', effects: 'external', resolvesWith: ['landing.create_draft'], fields: [{ key: 'budgetCents', label: 'Presupuesto total', type: 'cents', required: true }, { key: 'campaignId', label: 'ID de campaña', type: 'reference', required: 'unless_resolved' }] },
  { kind: 'social.create_draft', title: 'Crear borrador social', effects: 'external', resolvesWith: ['landing.create_draft'], fields: [{ key: 'text', label: 'Texto', type: 'longText', required: true }, { key: 'platforms', label: 'Plataformas', type: 'platforms', required: true, options: ['facebook', 'instagram'] }] },
  { kind: 'sequence.create_draft', title: 'Preparar secuencia', effects: 'local', fields: [{ key: 'leadIds', label: 'Leads', type: 'referenceList', required: true }] },
]

const FORM = { objective: 'Conseguir 20 pacientes de implantes en redes', period: '60 días', location: 'Valencia', budget: '1800', desiredResult: '20 pacientes cualificados' }

function fakeFetcher(responder) {
  const calls = []
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init, body: init.body ? JSON.parse(init.body) : undefined })
    const { status = 200, body } = responder(path, init)
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }
  return { fetcher, calls }
}

const livePlan = { id: 'orch_1', status: 'proposal', objective: FORM.objective, durationDays: 60, location: 'Valencia', budget: 1800, desiredOutcome: FORM.desiredResult, phases: [{ id: 'activation', actions: ['Crear landing en borrador'] }], actions: [{ id: 'step_1', kind: 'landing.create_draft', title: 'Crear landing en borrador', input: {} }] }

test('requestOrchestrationPlan envía actions en el cuerpo del POST live con Idempotency-Key', async () => {
  const { fetcher, calls } = fakeFetcher(() => ({ status: 201, body: livePlan }))
  const selection = orch.suggestOrchestrationActions(FORM, CATALOG)
  const actions = orch.buildActionsPayload(selection, CATALOG)
  const result = await orch.requestOrchestrationPlan(FORM, { mode: 'live', actions, fetcher })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/api/orchestration/plan')
  assert.equal(calls[0].init.method, 'POST')
  assert.ok(calls[0].init.headers['Idempotency-Key'])
  assert.deepEqual(calls[0].body.actions, actions)
  assert.equal(calls[0].body.durationDays, 60)
  assert.equal(calls[0].body.budget, 1800)
  assert.equal(result.source, 'live')
  assert.equal('fallback' in result, false)
})

test('sin acciones el modo live falla antes de llamar a la API con el mismo código que el backend', async () => {
  const { fetcher, calls } = fakeFetcher(() => ({ status: 201, body: livePlan }))
  await assert.rejects(() => orch.requestOrchestrationPlan(FORM, { mode: 'live', fetcher }), error => error.code === 'EXECUTABLE_ACTIONS_REQUIRED' && error.status === 422)
  await assert.rejects(() => orch.requestOrchestrationPlan(FORM, { mode: 'live', actions: [], fetcher }), error => error.code === 'EXECUTABLE_ACTIONS_REQUIRED')
  assert.equal(calls.length, 0)
})

test('un 422 del backend conserva código y motivo', async () => {
  const { fetcher } = fakeFetcher(() => ({ status: 422, body: { error: 'La acción necesita una de estas referencias: campaignId.', code: 'ACTION_REFERENCE_REQUIRED' } }))
  await assert.rejects(
    () => orch.requestOrchestrationPlan(FORM, { mode: 'live', actions: [{ kind: 'ads.publish_paused', input: { budgetCents: 1000 } }], fetcher }),
    error => error.status === 422 && error.code === 'ACTION_REFERENCE_REQUIRED' && /campaignId/.test(error.message),
  )
})

test('el modo demo no llama a la API y queda etiquetado como demo', async () => {
  const { fetcher, calls } = fakeFetcher(() => ({ status: 500, body: {} }))
  const result = await orch.requestOrchestrationPlan(FORM, { mode: 'demo', fetcher })
  assert.equal(calls.length, 0)
  assert.equal(result.source, 'demo')
  assert.equal(result.plan.source, 'demo')
})

test('sugerencia por defecto: landing, Ads pausado con el presupuesto y social si el objetivo lo menciona', () => {
  const selection = orch.suggestOrchestrationActions(FORM, CATALOG)
  assert.deepEqual(selection.map(item => item.kind), ['landing.create_draft', 'ads.publish_paused', 'social.create_draft'])
  const payload = orch.buildActionsPayload(selection, CATALOG)
  assert.equal(payload[1].input.budgetCents, 180_000)
  assert.deepEqual(payload[2].input.platforms, ['instagram', 'facebook'])
  const noBudget = orch.suggestOrchestrationActions({ ...FORM, budget: '', objective: 'Conseguir reuniones' }, CATALOG)
  assert.deepEqual(noBudget.map(item => item.kind), ['landing.create_draft'])
})

test('la validación local replica referencias implícitas, obligatorios y presupuesto', () => {
  const ads = orch.createActionSelection('ads.publish_paused', { budgetCents: '500' })
  const alone = orch.validateActionSelection([ads], CATALOG, { budget: 1000 })
  assert.match(alone.errors[ads.key], /ID de campaña/)
  const landing = orch.createActionSelection('landing.create_draft')
  const ordered = orch.validateActionSelection([landing, ads], CATALOG, { budget: 1000 })
  assert.deepEqual(ordered.errors, {})
  assert.equal(ordered.general, '')
  const overBudget = orch.validateActionSelection([landing, ads], CATALOG, { budget: 100 })
  assert.match(overBudget.general, /presupuesto/)
  const sequence = orch.createActionSelection('sequence.create_draft', { leadIds: ' , ' })
  assert.match(orch.validateActionSelection([sequence], CATALOG).errors[sequence.key], /Leads/)
  assert.match(orch.validateActionSelection([], CATALOG).general, /al menos una acción/)
  const payload = orch.buildActionsPayload([orch.createActionSelection('sequence.create_draft', { leadIds: 'lead-1, lead-2' })], CATALOG)
  assert.deepEqual(payload[0].input.leadIds, ['lead-1', 'lead-2'])
})

test('catálogo y lista de planes usan los endpoints GET del orquestador', async () => {
  const { fetcher, calls } = fakeFetcher(path => path.startsWith('/api/orchestration/actions/catalog')
    ? { body: { contractVersion: 2, actions: CATALOG } }
    : { body: { items: [{ id: 'orch_1', objective: 'X', status: 'proposal', actionCount: 1 }], total: 3, limit: 1, offset: 0, hasMore: true } })
  const catalog = await orch.fetchOrchestrationActionCatalog({ fetcher })
  assert.equal(catalog.actions.length, CATALOG.length)
  const plans = await orch.listOrchestrationPlans({ fetcher, limit: 1, offset: 0, status: 'proposal' })
  assert.equal(plans.hasMore, true)
  assert.equal(calls[1].path, '/api/orchestration/plans?limit=1&offset=0&status=proposal')
  const reopened = orch.selectionFromPlanActions([{ kind: 'ads.publish_paused', input: { budgetCents: 180_000 } }, { kind: 'unknown.kind', input: {} }], CATALOG)
  assert.equal(reopened.length, 1)
  assert.equal(reopened[0].values.budgetCents, '1800')
})
