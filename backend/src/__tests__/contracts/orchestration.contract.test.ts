import test from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../../lib/prisma'
import { hasPermission } from '../../access-control'
import {
  createInitialPlan,
  approvePlan,
  OrchestrationError,
  type OrchestrationPlanInput,
} from '../../services/orchestration.service'
import { actionHasExternalEffect } from '../../services/orchestration.adapters'

const input: OrchestrationPlanInput = {
  objective: 'Conseguir pacientes de implantes en Valencia',
  durationDays: 60,
  location: 'Valencia',
  budget: 900,
  desiredOutcome: '20 pacientes cualificados',
  actions: [
    { kind: 'landing.create_draft', input: { campaignId: 'campaign-1' } },
    { kind: 'ads.publish_paused', input: { campaignId: 'campaign-1', budgetCents: 90000 } },
    { kind: 'lead.create_follow_up', input: { leadId: 'lead-1', title: 'Llamar al lead' } },
  ],
}

test('un plan nuevo es una propuesta explicable y nunca ejecución live', () => {
  const plan = createInitialPlan('org-contract', input, 'plan-contract')
  assert.equal(plan.status, 'proposal')
  assert.equal(plan.explainability.execution, 'proposal_only')
  assert.equal(plan.lifecycle.approval, 'pending')
  assert.equal(plan.lifecycle.execution, 'not_queued')
  assert.equal(plan.approvalRequired, true)
  assert.equal(plan.approvalRequests.find(item => item.blocking)?.phase, 'activation')
  assert.equal(plan.limits.budgetCents, 90_000)
  assert.equal(plan.actions.every(action => action.requiresApproval), true)
  assert.equal(plan.phases.length, 5)
})

test('las acciones externas están clasificadas y los IDs del plan son deterministas', () => {
  const first = createInitialPlan('org-contract', input, 'plan-contract')
  const second = createInitialPlan('org-contract', input, 'plan-contract')
  assert.deepEqual(first.actions.map(action => action.id), second.actions.map(action => action.id))
  assert.equal(actionHasExternalEffect('ads.publish_paused'), true)
  assert.equal(actionHasExternalEffect('ads.activate'), true)
  assert.equal(actionHasExternalEffect('social.create_draft'), true)
  assert.equal(actionHasExternalEffect('email.publish'), true)
  assert.equal(actionHasExternalEffect('lead.create_follow_up'), false)
})

test('el orquestador expone enriquecimiento de prospectos y borradores de secuencia sin activarlos', () => {
  const plan = createInitialPlan('org-contract', {
    ...input,
    actions: [
      { kind: 'prospecting.enrich', input: { leadId: 'lead-1', website: 'https://example.com' } },
      { kind: 'sequence.create_draft', input: { leadIds: ['lead-1'], steps: [{ type: 'email', delayDays: 1 }] } },
    ],
  }, 'plan-prospecting-sequence')
  assert.deepEqual(plan.actions.map(action => action.kind), ['prospecting.enrich', 'sequence.create_draft'])
  assert.equal(plan.actions.every(action => action.requiresApproval), true)
  assert.equal(actionHasExternalEffect('prospecting.enrich'), false)
  assert.equal(actionHasExternalEffect('sequence.create_draft'), false)
})

test('la normalización del plan rechaza límites de entrada y acciones no soportadas', () => {
  assert.throws(
    () => createInitialPlan('org-contract', { ...input, objective: '' }, 'invalid-objective'),
    (error: unknown) => error instanceof OrchestrationError && error.code === 'INVALID_OBJECTIVE',
  )
  assert.throws(
    () => createInitialPlan('org-contract', { ...input, durationDays: 366 }, 'invalid-duration'),
    (error: unknown) => error instanceof OrchestrationError && error.code === 'INVALID_DURATION',
  )
  assert.throws(
    () => createInitialPlan('org-contract', { ...input, budget: 1_000_001 }, 'invalid-budget'),
    (error: unknown) => error instanceof OrchestrationError && error.code === 'INVALID_BUDGET',
  )
  assert.throws(
    () => createInitialPlan('org-contract', { ...input, actions: [{ kind: 'unsupported.kind' } as never] }, 'invalid-action'),
    (error: unknown) => error instanceof OrchestrationError && error.code === 'UNSUPPORTED_ACTION',
  )
})

async function withPlanLookup<T>(plan: Record<string, unknown>, work: () => Promise<T>): Promise<T> {
  const client = prisma as unknown as { revenueExperiment: { findFirst: unknown } }
  const original = client.revenueExperiment.findFirst
  client.revenueExperiment.findFirst = async () => plan
  try {
    return await work()
  } finally {
    client.revenueExperiment.findFirst = original
  }
}

test('el guard de aprobación exige permiso financiero y separación de funciones', async () => {
  assert.equal(hasPermission('finance_controller', 'costs.approve', 'org'), true)
  assert.equal(hasPermission('sales_manager', 'costs.approve', 'org'), false)
  const persistedPlan = { id: 'plan-contract', orgId: 'org-contract', surface: 'orchestration', createdById: 'creator', budgetCents: 90_000 }

  await withPlanLookup(persistedPlan, async () => {
    await assert.rejects(
      () => approvePlan({ userId: 'reviewer', orgId: 'org-contract', role: 'sales_manager' }, 'plan-contract', 'approval-key-001'),
      (error: unknown) => error instanceof OrchestrationError && error.code === 'APPROVAL_PERMISSION_REQUIRED',
    )
  })

  await withPlanLookup({ ...persistedPlan, createdById: 'reviewer' }, async () => {
    await assert.rejects(
      () => approvePlan({ userId: 'reviewer', orgId: 'org-contract', role: 'finance_controller' }, 'plan-contract', 'approval-key-002'),
      (error: unknown) => error instanceof OrchestrationError && error.code === 'SEPARATION_OF_DUTIES',
    )
  })
})
