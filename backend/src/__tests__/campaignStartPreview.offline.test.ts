process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/test'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import { getStartPreview, START_LEAD_WHERE } from '../services/campaigns.service'

// La vista previa de /start debe contar exactamente lo que startCampaign
// encolaría (leads `new` con teléfono), filtrada por organización, y no
// escribir nada.
test('start-preview cuenta los leads que startCampaign encolaría, por organización y sin escribir', async t => {
  const original = {
    findFirst: prisma.campaign.findFirst,
    count: prisma.lead.count,
    updateMany: prisma.campaign.updateMany,
  }
  t.after(() => {
    prisma.campaign.findFirst = original.findFirst
    prisma.lead.count = original.count
    prisma.campaign.updateMany = original.updateMany
  })

  const campaignQueries: any[] = []
  const countQueries: any[] = []
  prisma.campaign.findFirst = (async (args: any) => {
    campaignQueries.push(args)
    if (args.where.orgId !== 'org-a') return null
    return { id: 'c1', name: 'Reactivación', status: 'draft', agent: { id: 'ag', name: 'Carlos', isActive: true, lifecycleStatus: 'draft' } }
  }) as any
  prisma.lead.count = (async (args: any) => {
    countQueries.push(args)
    return args.where.OR ? 2 : 7
  }) as any
  prisma.campaign.updateMany = (async () => { throw new Error('la vista previa no debe escribir') }) as any

  const preview = await getStartPreview('org-a', 'c1')
  assert.ok(preview)
  assert.equal(preview.eligibleLeads, 7)
  assert.equal(preview.newLeadsWithoutPhone, 2)
  assert.equal(preview.agent?.name, 'Carlos')
  assert.deepEqual(campaignQueries[0].where, { id: 'c1', orgId: 'org-a' })

  const eligibleQuery = countQueries.find(query => !query.where.OR)
  assert.equal(eligibleQuery.where.orgId, 'org-a')
  assert.equal(eligibleQuery.where.campaignId, 'c1')
  assert.equal(eligibleQuery.where.status, START_LEAD_WHERE.status)
  assert.deepEqual(eligibleQuery.where.phone, { not: null })
  assert.deepEqual(eligibleQuery.where.NOT, { phone: '' })

  // Otra organización: 404 (null) y sin consultar leads.
  countQueries.length = 0
  assert.equal(await getStartPreview('org-b', 'c1'), null)
  assert.equal(countQueries.length, 0)
})
