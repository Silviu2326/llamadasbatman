import test from 'node:test'
import assert from 'node:assert/strict'
import { executeOrchestrationAction, type OrchestrationAction } from '../../services/orchestration.adapters'
import { createInitialPlan, type OrchestrationPlanInput } from '../../services/orchestration.service'

const baseInput: OrchestrationPlanInput = {
  objective: 'Validar una campaña de captación local',
  durationDays: 30,
  location: 'Valencia',
  budget: 250,
  desiredOutcome: '10 leads cualificados',
  actions: [{ kind: 'landing.create_draft', title: 'landing.create_draft', input: { landingSlug: 'implantes' }, estimatedCostCents: 0 }],
}

function action(kind: OrchestrationAction['kind'], input: Record<string, unknown>): OrchestrationAction {
  return { id: 'action-contract', kind, title: kind, input, references: {}, estimatedCostCents: 0, requiresApproval: true }
}

test('la UI/API de propuesta y los adaptadores live están separados por contrato', () => {
  const plan = createInitialPlan('org-contract', baseInput, 'demo-live-contract')
  assert.equal(plan.explainability.execution, 'proposal_only')
  assert.equal(plan.lifecycle.execution, 'not_queued')
  assert.equal(plan.actions.length, 1)
})

test('un efecto social live queda bloqueado si falta la URL pública de atribución', async () => {
  const previousAppUrl = process.env.APP_URL
  const previousFrontendUrl = process.env.FRONTEND_URL
  delete process.env.APP_URL
  delete process.env.FRONTEND_URL
  try {
    const result = await executeOrchestrationAction({
      orgId: 'org-contract',
      actorUserId: 'user-contract',
      actorRole: 'marketing_growth',
      planId: 'plan-contract',
      planBudgetCents: 25_000,
      idempotencyKey: 'live-action-contract',
      action: action('social.create_draft', { text: 'Mensaje de prueba', platforms: ['instagram'], landingSlug: 'implantes', campaignId: 'campaign-1' }),
    })
    assert.equal(result.status, 'blocked')
    assert.equal(result.code, 'PUBLIC_APP_URL_MISSING')
  } finally {
    if (previousAppUrl === undefined) delete process.env.APP_URL
    else process.env.APP_URL = previousAppUrl
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = previousFrontendUrl
  }
})
