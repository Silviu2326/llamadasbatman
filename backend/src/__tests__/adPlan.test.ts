import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import {
  AdPlanConflictError,
  createActivation,
  getPlan,
  listGlobalCampaigns,
  updateActivation,
} from '../services/adPlan.service'
import { cleanupOrgs, createTestOrg, createTestUser } from './testHelpers'

const orgIds: string[] = []

/**
 * Las tablas del nivel de campaña global no están en cleanupOrgs y Campaign
 * no cascadea desde Organization: se limpian aquí, antes de borrar las orgs.
 */
async function cleanupPlanData() {
  const where = { orgId: { in: orgIds } }
  await prisma.adCreative.deleteMany({ where })
  await prisma.creativeBrief.deleteMany({ where })
  await prisma.adAudience.deleteMany({ where })
  await prisma.adActivation.deleteMany({ where })
  await prisma.adInsightSnapshot.deleteMany({ where })
  await prisma.metaAdAccount.deleteMany({ where })
  await prisma.campaign.deleteMany({ where })
}

after(async () => {
  await cleanupPlanData()
  await cleanupOrgs(orgIds)
  await prisma.$disconnect()
})

function conflictWith(code: string) {
  return (error: unknown) => error instanceof AdPlanConflictError && error.code === code
}

test('la activación meta se deriva de los campos legacy de la campaña', async () => {
  const org = await createTestOrg('test-ad-plan-derive')
  orgIds.push(org.id)
  const account = await prisma.metaAdAccount.create({
    data: { orgId: org.id, metaAdAccountId: `act_${randomUUID()}`, status: 'connected' },
  })

  const published = await prisma.campaign.create({
    data: { orgId: org.id, name: 'Publicada', status: 'active', metaCampaignId: 'mc-1', metaAdSetId: 'as-1' },
  })
  const paused = await prisma.campaign.create({
    data: { orgId: org.id, name: 'Parada', status: 'paused', metaCampaignId: 'mc-2' },
  })
  const drafted = await prisma.campaign.create({
    data: { orgId: org.id, name: 'Borrador', status: 'draft', adStatus: 'draft' },
  })
  const empty = await prisma.campaign.create({
    data: { orgId: org.id, name: 'Sin señal', status: 'draft' },
  })

  const planPublished = await getPlan(org.id, published.id)
  assert.ok(planPublished)
  const meta = planPublished.activations.find(a => a.platform === 'meta')
  assert.ok(meta)
  assert.equal(meta.id, null)
  assert.equal(meta.status, 'active')
  assert.equal(meta.derivedFromLegacy, true)
  assert.equal(meta.adAccountRef, account.id)
  assert.deepEqual(meta.remote, { metaCampaignId: 'mc-1', metaAdSetId: 'as-1', metaAdId: null, adStatus: null })

  // Siempre dos entradas: google existe aunque no haya fila ni señal alguna.
  const google = planPublished.activations.find(a => a.platform === 'google')
  assert.ok(google)
  assert.equal(google.id, null)
  assert.equal(google.status, 'unconfigured')
  assert.equal(google.derivedFromLegacy, false)
  assert.equal(google.remote, null)

  const planPaused = await getPlan(org.id, paused.id)
  assert.equal(planPaused?.activations.find(a => a.platform === 'meta')?.status, 'paused')

  const planDrafted = await getPlan(org.id, drafted.id)
  assert.equal(planDrafted?.activations.find(a => a.platform === 'meta')?.status, 'draft')

  const planEmpty = await getPlan(org.id, empty.id)
  const emptyMeta = planEmpty?.activations.find(a => a.platform === 'meta')
  assert.equal(emptyMeta?.status, 'unconfigured')
  assert.equal(emptyMeta?.remote, null)

  // Y materializar la activación meta hereda el estado derivado y la cuenta.
  const created = await createActivation(org.id, { campaignId: published.id, platform: 'meta' })
  assert.ok(created)
  assert.equal(created.status, 'active')
  assert.equal(created.adAccountRef, account.id)
  assert.equal(created.derivedFromLegacy, false)

  // Con fila propia ya no existe la derivada, y repetir el POST es conflicto.
  const replanned = await getPlan(org.id, published.id)
  assert.equal(replanned?.activations.find(a => a.platform === 'meta')?.id, created.id)
  await assert.rejects(
    () => createActivation(org.id, { campaignId: published.id, platform: 'meta' }),
    conflictWith('ACTIVATION_EXISTS')
  )

  const listed = await listGlobalCampaigns(org.id)
  assert.equal(listed.length, 4)

  // Formalizar la activación meta de una campaña sin ningún rastro de Meta
  // deja señal persistida: la campaña pasa a adStatus 'draft' y la vista
  // devuelve remote (no null), de modo que la operación en Meta sigue visible.
  const formalized = await createActivation(org.id, { campaignId: empty.id, platform: 'meta' })
  assert.ok(formalized)
  assert.equal(formalized.status, 'draft')
  assert.equal(formalized.adAccountRef, account.id)
  assert.equal(formalized.remote?.adStatus, 'draft')
  const emptyAfter = await prisma.campaign.findUnique({ where: { id: empty.id }, select: { adStatus: true } })
  assert.equal(emptyAfter?.adStatus, 'draft')
  const replannedEmpty = await getPlan(org.id, empty.id)
  assert.equal(replannedEmpty?.activations.find(a => a.platform === 'meta')?.remote?.adStatus, 'draft')
})

test('el guardarraíl de presupuesto impide superar el global de la campaña', async () => {
  const org = await createTestOrg('test-ad-plan-budget')
  orgIds.push(org.id)
  const user = await createTestUser(org.id, 'admin')
  const campaign = await prisma.campaign.create({
    data: { orgId: org.id, name: 'Presupuesto', status: 'draft', budgetCents: 10_000 },
  })

  const meta = await createActivation(org.id, { campaignId: campaign.id, platform: 'meta', budgetCents: 6_000 })
  assert.ok(meta)

  await assert.rejects(
    () => createActivation(org.id, { campaignId: campaign.id, platform: 'google', budgetCents: 5_000 }),
    (error: unknown) => {
      assert.ok(error instanceof AdPlanConflictError)
      assert.equal(error.code, 'BUDGET_EXCEEDS_GLOBAL')
      assert.deepEqual(error.details, { assignedCents: 11_000, globalCents: 10_000 })
      return true
    }
  )

  const google = await createActivation(org.id, { campaignId: campaign.id, platform: 'google', budgetCents: 4_000 })
  assert.ok(google)

  // Subir el propio presupuesto también pasa por el guardarraíl (la suma
  // sustituye el valor propio, no lo duplica).
  await assert.rejects(
    () => updateActivation(org.id, user.id, meta.id as string, { budgetCents: 7_000 }),
    conflictWith('BUDGET_EXCEEDS_GLOBAL')
  )
  const kept = await updateActivation(org.id, user.id, meta.id as string, { budgetCents: 6_000 })
  assert.equal(kept?.budgetCents, 6_000)

  // budget del plan: asignado = suma persistida; sin snapshots el gasto es
  // null (sin medición), nunca 0.
  const plan = await getPlan(org.id, campaign.id)
  assert.deepEqual(plan?.budget, { globalCents: 10_000, assignedCents: 10_000, spentCents: null, availableCents: null })

  await prisma.adInsightSnapshot.create({
    data: { orgId: org.id, campaignId: campaign.id, spendCents: 2_500, impressions: 100, clicks: 10, leadsCount: 1 },
  })
  const measured = await getPlan(org.id, campaign.id)
  assert.equal(measured?.budget.spentCents, 2_500)
  assert.equal(measured?.budget.availableCents, 7_500)
})

test('las transiciones de estado de la activación se validan y se auditan', async () => {
  const org = await createTestOrg('test-ad-plan-status')
  orgIds.push(org.id)
  const user = await createTestUser(org.id, 'admin')
  const campaign = await prisma.campaign.create({
    data: { orgId: org.id, name: 'Ciclo de vida', status: 'draft' },
  })

  const activation = await createActivation(org.id, { campaignId: campaign.id, platform: 'google' })
  assert.equal(activation?.status, 'draft')
  const id = activation?.id as string

  // draft no puede saltar directamente a active: falta pasar por ready.
  await assert.rejects(
    () => updateActivation(org.id, user.id, id, { status: 'active' }),
    conflictWith('INVALID_STATUS_TRANSITION')
  )

  for (const status of ['ready', 'active', 'paused', 'active', 'finished'] as const) {
    const updated = await updateActivation(org.id, user.id, id, { status })
    assert.equal(updated?.status, status)
  }
  await assert.rejects(
    () => updateActivation(org.id, user.id, id, { status: 'active' }),
    conflictWith('INVALID_STATUS_TRANSITION')
  )

  // Repetir el estado vigente no es una transición y no falla.
  const idempotent = await updateActivation(org.id, user.id, id, { status: 'finished' })
  assert.equal(idempotent?.status, 'finished')

  const audited = await prisma.auditLog.count({
    where: { orgId: org.id, action: 'ads.activation.status_changed', entityId: id },
  })
  assert.equal(audited, 5)
})

test('el plan y las activaciones están aislados por organización', async () => {
  const orgA = await createTestOrg('test-ad-plan-org-a')
  const orgB = await createTestOrg('test-ad-plan-org-b')
  orgIds.push(orgA.id, orgB.id)
  const userB = await createTestUser(orgB.id, 'admin')
  const campaign = await prisma.campaign.create({
    data: { orgId: orgA.id, name: 'De la org A', status: 'draft' },
  })
  const activation = await createActivation(orgA.id, { campaignId: campaign.id, platform: 'meta' })
  assert.ok(activation)

  // Desde la org B nada de esto existe: ni el plan, ni crear sobre la campaña
  // ajena, ni editar la activación ajena.
  assert.equal(await getPlan(orgB.id, campaign.id), null)
  assert.equal(await createActivation(orgB.id, { campaignId: campaign.id, platform: 'google' }), null)
  assert.equal(await updateActivation(orgB.id, userB.id, activation.id as string, { status: 'ready' }), null)
  assert.equal((await listGlobalCampaigns(orgB.id)).length, 0)
})
