import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://unused:unused@127.0.0.1:9/orchestration_offline'
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
process.env.REDIS_ENABLED = 'false'

/** Sustituye un delegado de Prisma solo durante el test actual. */
function stubModel(t: any, client: any, name: string, methods: Record<string, (...args: any[]) => unknown>) {
  const original = Object.getOwnPropertyDescriptor(client, name)
  Object.defineProperty(client, name, { value: methods, configurable: true, writable: true })
  t.after(() => {
    if (original) Object.defineProperty(client, name, original)
    else delete client[name]
  })
}

const baseInput = {
  objective: 'Conseguir pacientes de implantes en Valencia',
  durationDays: 60,
  location: 'Valencia',
  budget: 2000,
  desiredOutcome: '20 pacientes cualificados',
}

/** Construye un input mínimo válido a partir de los metadatos del catálogo. */
function sampleValue(field: { type: string; options?: readonly string[] }): unknown {
  switch (field.type) {
    case 'cents': return 10_000
    case 'integer': return 7
    case 'platforms': return [field.options?.[0] ?? 'facebook']
    case 'stage': return field.options?.[0] ?? 'qualified'
    case 'referenceList': return ['lead-1']
    default: return 'ref-1'
  }
}

test('el catálogo cubre todas las acciones y describe campos para la UI', async () => {
  const { ORCHESTRATION_ACTION_CATALOG, ORCHESTRATION_ACTION_KINDS } = await import('../services/orchestration.adapters')
  assert.deepEqual(ORCHESTRATION_ACTION_CATALOG.map(item => item.kind).sort(), [...ORCHESTRATION_ACTION_KINDS].sort())
  for (const contract of ORCHESTRATION_ACTION_CATALOG) {
    assert.ok(Array.isArray(contract.fields), `${contract.kind} sin fields`)
    for (const required of contract.required) {
      const field: { required: unknown } | undefined = contract.fields.find(item => item.key === required)
      assert.ok(field, `${contract.kind}: el campo obligatorio ${required} no está descrito`)
      assert.equal(field!.required, true, `${contract.kind}: ${required} debe marcarse obligatorio`)
    }
  }
})

test('los campos obligatorios del catálogo bastan para pasar la validación del backend', async () => {
  const { ORCHESTRATION_ACTION_CATALOG, validateOrchestrationActionInput } = await import('../services/orchestration.adapters')
  for (const contract of ORCHESTRATION_ACTION_CATALOG) {
    const input: Record<string, unknown> = {}
    for (const field of contract.fields) if (field.required) input[field.key] = sampleValue(field)
    // Sin acciones previas, las referencias «unless_resolved» son obligatorias.
    for (const field of contract.fields) if (field.required === 'unless_resolved') input[field.key] = sampleValue(field)
    assert.equal(validateOrchestrationActionInput(contract.kind, input), null, `${contract.kind} debería validar con ${JSON.stringify(input)}`)
    const strictlyRequired = contract.fields.filter(field => field.required === true)
    if (strictlyRequired.length) {
      const missing = { ...input }
      delete missing[strictlyRequired[0].key]
      assert.notEqual(validateOrchestrationActionInput(contract.kind, missing), null, `${contract.kind} debería fallar sin ${strictlyRequired[0].key}`)
    }
  }
})

test('pipeline.move_stage rechaza etapas que no existen', async () => {
  const { validateOrchestrationActionInput } = await import('../services/orchestration.adapters')
  const issue = validateOrchestrationActionInput('pipeline.move_stage', { opportunityId: 'opp-1', toStage: 'meeting' })
  assert.equal(issue?.code, 'ACTION_INPUT_INVALID')
  assert.equal(validateOrchestrationActionInput('pipeline.move_stage', { opportunityId: 'opp-1', toStage: 'qualified' }), null)
})

test('un plan live sin acciones responde 422 EXECUTABLE_ACTIONS_REQUIRED', async () => {
  const { createInitialPlan, OrchestrationError } = await import('../services/orchestration.service')
  assert.throws(() => createInitialPlan('org-1', { ...baseInput }), (error: unknown) => error instanceof OrchestrationError && error.statusCode === 422 && error.code === 'EXECUTABLE_ACTIONS_REQUIRED')
  assert.throws(() => createInitialPlan('org-1', { ...baseInput, actions: [] }), (error: unknown) => error instanceof OrchestrationError && error.code === 'EXECUTABLE_ACTIONS_REQUIRED')
})

test('las referencias implícitas solo se aceptan si la acción previa las resuelve', async () => {
  const { createInitialPlan, OrchestrationError } = await import('../services/orchestration.service')
  const plan = createInitialPlan('org-1', { ...baseInput, actions: [
    { kind: 'landing.create_draft', input: {} },
    { kind: 'ads.publish_paused', input: { budgetCents: 50_000 } },
    { kind: 'social.create_draft', input: { text: 'Primera consulta gratis', platforms: ['instagram'] } },
  ] }, 'plan-implicit')
  assert.equal(plan.actions.length, 3)
  assert.equal(plan.limits.estimatedCostCents, 50_000)
  assert.throws(
    () => createInitialPlan('org-1', { ...baseInput, actions: [{ kind: 'ads.publish_paused', input: { budgetCents: 50_000 } }] }, 'plan-no-landing'),
    (error: unknown) => error instanceof OrchestrationError && error.statusCode === 422 && error.code === 'ACTION_REFERENCE_REQUIRED',
  )
  assert.throws(
    () => createInitialPlan('org-1', { ...baseInput, budget: 100, actions: [{ kind: 'landing.create_draft', input: {} }, { kind: 'ads.publish_paused', input: { budgetCents: 50_000 } }] }, 'plan-over-budget'),
    (error: unknown) => error instanceof OrchestrationError && error.code === 'ACTION_COST_EXCEEDS_PLAN_BUDGET',
  )
})

test('listPersistedPlans filtra por organización y superficie, pagina y resume sin payload', async t => {
  const { prisma } = await import('../lib/prisma')
  const { listPersistedPlans } = await import('../services/orchestration.service')
  const calls: any[] = []
  const createdAt = new Date('2026-09-20T10:00:00Z')
  stubModel(t, prisma, 'revenueExperiment', {
    findMany: async (args: any) => {
      calls.push(['findMany', args])
      return [{ id: 'orch_1', name: 'Orquestación: Objetivo', status: 'proposal', primaryMetric: '20 pacientes', budgetCents: 90_000, createdAt, updatedAt: createdAt, audienceDefinition: { plan: { objective: 'Objetivo', location: 'Valencia', durationDays: 60, desiredOutcome: '20 pacientes', actions: [{ kind: 'landing.create_draft' }, { kind: 'bogus' }] } } }]
    },
    count: async (args: any) => { calls.push(['count', args]); return 3 },
  })
  stubModel(t, prisma, 'operationalMemoryProposal', { findMany: async (args: any) => { calls.push(['approvals', args]); return [{ targetId: 'orch_1', status: 'approved' }] } })
  const result = await listPersistedPlans('org-a', { limit: 1, offset: 1, status: 'proposal' })
  const findMany = calls.find(call => call[0] === 'findMany')[1]
  assert.deepEqual(findMany.where, { orgId: 'org-a', surface: 'orchestration', status: 'proposal' })
  assert.equal(findMany.skip, 1)
  assert.equal(findMany.take, 1)
  assert.equal(calls.find(call => call[0] === 'approvals')[1].where.orgId, 'org-a')
  assert.equal(result.total, 3)
  assert.equal(result.hasMore, true)
  assert.deepEqual(result.items[0].actionKinds, ['landing.create_draft'])
  assert.equal(result.items[0].approval, 'approved')
  assert.equal('audienceDefinition' in result.items[0], false)
  const capped = await listPersistedPlans('org-a', { limit: 5000 })
  assert.equal(capped.limit, 50)
})

test('PUT de automatización: esquema estricto y estado de publicación', async () => {
  const { updateAutomationSchema } = await import('../controllers/automations.controller')
  const { describePublicationState } = await import('../services/automations.service')
  assert.equal(updateAutomationSchema.safeParse({}).success, false)
  assert.equal(updateAutomationSchema.safeParse({ orgId: 'other', name: 'x' }).success, false)
  assert.equal(updateAutomationSchema.safeParse({ actions: [{ type: 'drop_database' }] }).success, false)
  assert.equal(updateAutomationSchema.safeParse({ name: 'Seguimiento', trigger: { event: 'lead.created' }, actions: [{ type: 'create_task', params: { title: 'Llamar' } }] }).success, true)
  const current = { name: 'A', description: null, trigger: { event: 'lead.created' }, actions: [{ type: 'log' }] }
  assert.deepEqual(describePublicationState(current, null), { latestVersion: null, hasUnpublishedChanges: false })
  assert.deepEqual(describePublicationState(current, { version: 2, ...current }), { latestVersion: 2, hasUnpublishedChanges: false })
  assert.equal(describePublicationState({ ...current, actions: [] }, { version: 2, ...current }).hasUnpublishedChanges, true)
})

test('updateAutomation filtra por organización y valida disparador y acciones', async t => {
  const { prisma } = await import('../lib/prisma')
  const { updateAutomation } = await import('../services/automations.service')
  const existing = { id: 'auto-1', orgId: 'org-a', name: 'A', description: null, trigger: { event: 'lead.created' }, actions: [{ type: 'log' }], isActive: true, status: 'active' }
  const lookups: any[] = []
  stubModel(t, prisma, 'automation', {
    findFirst: async (args: any) => { lookups.push(args.where); return args.where.orgId === 'org-a' ? existing : null },
    update: async (args: any) => ({ ...existing, ...args.data }),
  })
  stubModel(t, prisma, 'automationVersion', { findFirst: async () => ({ version: 1, name: 'A', description: null, trigger: { event: 'lead.created' }, actions: [{ type: 'log' }] }) })
  assert.equal(await updateAutomation('org-b', 'auto-1', { name: 'B' }), null)
  assert.deepEqual(lookups[0], { id: 'auto-1', orgId: 'org-b' })
  const result = await updateAutomation('org-a', 'auto-1', { name: 'B', trigger: { event: 'nuevo_lead' } })
  assert.equal(result!.after.name, 'B')
  assert.deepEqual(result!.after.trigger, { event: 'lead.created' })
  assert.equal(result!.after.hasUnpublishedChanges, true)
  await assert.rejects(() => updateAutomation('org-a', 'auto-1', { trigger: { event: 'evento.inexistente' } }), /Unsupported automation trigger/)
  await assert.rejects(() => updateAutomation('org-a', 'auto-1', { actions: [] }), /sin acciones/)
})

test('Ads: el presupuesto aprobado por el plan debe coincidir con el total que publicaría Meta', async () => {
  const { buildPublishPlan, resolveTotalBudgetCents, MetaPublishError } = await import('../services/metaCampaignBuilder.service')
  const input = {
    publicBaseUrl: 'https://app.vendrava.test',
    campaign: { id: 'c1', name: 'Implantes', landingSlug: 'implantes-1', budgetCents: 60_000, adAssets: { adCopy: 'Primera consulta', presupuestoMensual: 600 } },
    metaAccount: { metaAdAccountId: 'act_1', metaPageId: 'page_1', metaPixelId: null, dailyBudgetCapCents: null },
    // La activación Meta manda sobre presupuestoMensual: el total real es 900 €.
    activation: { objective: null, budgetCents: 90_000, startDate: null, endDate: null, conversionEvent: null },
  }
  assert.equal(resolveTotalBudgetCents({ activationBudgetCents: 90_000, wizardMonthlyBudget: 600, campaignBudgetCents: 60_000 }), 90_000)
  // El adaptador antiguo solo miraba presupuestoMensual (60 000) y habría aprobado un importe distinto del publicado.
  assert.throws(() => buildPublishPlan({ ...input, expectedTotalBudgetCents: 60_000 }), (error: unknown) => error instanceof MetaPublishError && error.code === 'BUDGET_APPROVAL_MISMATCH' && error.statusCode === 409)
  assert.equal(buildPublishPlan({ ...input, expectedTotalBudgetCents: 90_000 }).dailyBudgetCents, 3_000)
  // Sin presupuesto esperado (publicación manual desde Ads) el comportamiento no cambia.
  assert.equal(buildPublishPlan(input).dailyBudgetCents, 3_000)
  const withoutActivation = { ...input, activation: null }
  assert.equal(buildPublishPlan({ ...withoutActivation, expectedTotalBudgetCents: 60_000 }).dailyBudgetCents, 2_000)
})
