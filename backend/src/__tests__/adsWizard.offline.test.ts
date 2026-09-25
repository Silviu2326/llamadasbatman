import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { materializeWizardPlan } from '../services/adsWizard.service'

// Sin base de datos: prisma se sustituye por un almacén en memoria mínimo para
// comprobar que el asistente persiste activación Meta y audiencia como filas
// del plan (las mismas que lee /captacion/atraer/ads) y que repetirlo no duplica.

const original = {
  campaignFindFirst: prisma.campaign.findFirst,
  campaignUpdate: prisma.campaign.update,
  activationFindFirst: prisma.adActivation.findFirst,
  activationFindMany: prisma.adActivation.findMany,
  activationCreate: prisma.adActivation.create,
  audienceFindFirst: prisma.adAudience.findFirst,
  audienceCreate: prisma.adAudience.create,
  metaFindFirst: prisma.metaAdAccount.findFirst,
}

afterEach(() => {
  prisma.campaign.findFirst = original.campaignFindFirst
  prisma.campaign.update = original.campaignUpdate
  prisma.adActivation.findFirst = original.activationFindFirst
  prisma.adActivation.findMany = original.activationFindMany
  prisma.adActivation.create = original.activationCreate
  prisma.adAudience.findFirst = original.audienceFindFirst
  prisma.adAudience.create = original.audienceCreate
  prisma.metaAdAccount.findFirst = original.metaFindFirst
})

type Row = Record<string, unknown>

function memoryStore() {
  const campaign: Row = { id: 'c1', orgId: 'org-1', status: 'draft', adStatus: 'draft', budgetCents: 60_000, metaCampaignId: null, metaAdSetId: null, metaAdId: null, adPlaybookId: null }
  const activations: Row[] = []
  const audiences: Row[] = []

  prisma.campaign.findFirst = (async (args: { where: { id: string; orgId: string } }) =>
    args.where.id === campaign.id && args.where.orgId === campaign.orgId ? campaign : null) as unknown as typeof prisma.campaign.findFirst
  prisma.campaign.update = (async (args: { data: Row }) => Object.assign(campaign, args.data)) as unknown as typeof prisma.campaign.update
  prisma.adActivation.findFirst = (async (args: { where: { campaignId: string; platform: string } }) =>
    activations.find(row => row.campaignId === args.where.campaignId && row.platform === args.where.platform) ?? null) as unknown as typeof prisma.adActivation.findFirst
  prisma.adActivation.findMany = (async () => activations) as unknown as typeof prisma.adActivation.findMany
  prisma.adActivation.create = (async (args: { data: Row }) => {
    const row = { id: `act-${activations.length + 1}`, health: null, ...args.data }
    activations.push(row)
    return row
  }) as unknown as typeof prisma.adActivation.create
  prisma.adAudience.findFirst = (async (args: { where: { campaignId: string; name: string } }) =>
    audiences.find(row => row.campaignId === args.where.campaignId && row.name === args.where.name) ?? null) as unknown as typeof prisma.adAudience.findFirst
  prisma.adAudience.create = (async (args: { data: Row }) => {
    const row = { id: `aud-${audiences.length + 1}`, ...args.data }
    audiences.push(row)
    return row
  }) as unknown as typeof prisma.adAudience.create
  prisma.metaAdAccount.findFirst = (async () => ({ id: 'meta-acc' })) as unknown as typeof prisma.metaAdAccount.findFirst

  return { campaign, activations, audiences }
}

test('el asistente persiste la activación Meta y la audiencia como filas del plan, sin duplicar', async () => {
  const store = memoryStore()
  const input = { objetivo: 'Conseguir reservas', presupuestoMensual: 600, audience: '  Adultos de Valencia ' }

  const first = await materializeWizardPlan('org-1', 'c1', input)
  assert.equal(store.activations.length, 1)
  assert.equal(store.audiences.length, 1)
  assert.equal(first.activationId, 'act-1')
  assert.equal(first.audienceId, 'aud-1')

  const activation = store.activations[0]
  assert.equal(activation.platform, 'meta')
  assert.equal(activation.objective, 'Conseguir reservas')
  assert.equal(activation.budgetCents, 60_000)
  assert.equal(activation.status, 'draft')
  assert.equal(activation.adAccountRef, 'meta-acc')

  const audience = store.audiences[0]
  assert.equal(audience.name, 'Adultos de Valencia')
  assert.equal(audience.campaignId, 'c1')
  assert.equal(audience.dataSource, 'wizard')

  // Idempotente: un reintento devuelve las mismas filas.
  const second = await materializeWizardPlan('org-1', 'c1', input)
  assert.deepEqual(second, first)
  assert.equal(store.activations.length, 1)
  assert.equal(store.audiences.length, 1)
})

test('sin audiencia escrita solo se crea la activación', async () => {
  const store = memoryStore()
  const result = await materializeWizardPlan('org-1', 'c1', { objetivo: 'Demos', presupuestoMensual: 100 })
  assert.equal(result.activationId, 'act-1')
  assert.equal(result.audienceId, null)
  assert.equal(store.audiences.length, 0)
})

test('otra organización no puede materializar el plan de una campaña ajena', async () => {
  const store = memoryStore()
  const result = await materializeWizardPlan('org-2', 'c1', { objetivo: 'Demos', presupuestoMensual: 100, audience: 'Pymes' })
  assert.equal(result.activationId, null)
  assert.equal(result.audienceId, null)
  assert.equal(store.activations.length, 0)
  assert.equal(store.audiences.length, 0)
})
