process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/test'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import { getStartPreview, START_LEAD_WHERE } from '../services/campaigns.service'

// La vista previa de /start debe contar exactamente lo que startCampaign
// encolaría (leads `new` con teléfono E.164, sin opt-out y con consentimiento
// de voz cuando aplica), filtrada por organización, y no escribir nada.
test('start-preview desglosa por motivo lo que startCampaign encolaría, por organización y sin escribir', async t => {
  const original = {
    findFirst: prisma.campaign.findFirst,
    findMany: prisma.lead.findMany,
    optOut: prisma.optOut.findMany,
    consent: prisma.contactConsent.findMany,
    updateMany: prisma.campaign.updateMany,
  }
  t.after(() => {
    prisma.campaign.findFirst = original.findFirst
    prisma.lead.findMany = original.findMany
    prisma.optOut.findMany = original.optOut
    prisma.contactConsent.findMany = original.consent
    prisma.campaign.updateMany = original.updateMany
  })

  const campaignQueries: any[] = []
  const leadQueries: any[] = []
  prisma.campaign.findFirst = (async (args: any) => {
    campaignQueries.push(args)
    if (args.where.orgId !== 'org-a') return null
    return { id: 'c1', name: 'Reactivación', status: 'draft', agent: { id: 'ag', name: 'Carlos', isActive: true, lifecycleStatus: 'draft' } }
  }) as any
  prisma.lead.findMany = (async (args: any) => {
    leadQueries.push(args)
    return [
      { id: 'l-ok', phone: '+34600000001', tags: [], attempts: 0 },
      { id: 'l-national', phone: '600 000 002', tags: [], attempts: 0 },
      { id: 'l-nophone', phone: null, tags: [], attempts: 0 },
      { id: 'l-empty', phone: '', tags: [], attempts: 0 },
      { id: 'l-invalid', phone: '12', tags: [], attempts: 0 },
      { id: 'l-optout', phone: '+34600000003', tags: [], attempts: 0 },
      { id: 'l-tag', phone: '+34600000004', tags: ['opt_out'], attempts: 0 },
      { id: 'l-noconsent', phone: '+34600000005', tags: [], attempts: 0 },
      { id: 'l-expired', phone: '+34600000006', tags: [], attempts: 0 },
      { id: 'l-burnt', phone: '+34600000007', tags: [], attempts: 3 },
    ]
  }) as any
  prisma.optOut.findMany = (async () => [{ phone: '+34600000003' }]) as any
  prisma.contactConsent.findMany = (async () => [
    { leadId: 'l-ok', status: 'granted', expiresAt: null, occurredAt: new Date(), id: 'c-1' },
    { leadId: 'l-national', status: 'granted', expiresAt: null, occurredAt: new Date(), id: 'c-2' },
    { leadId: 'l-expired', status: 'granted', expiresAt: new Date(Date.now() - 1000), occurredAt: new Date(), id: 'c-3' },
    // decisión más reciente manda: este lead concedió y luego revocó
    { leadId: 'l-noconsent', status: 'revoked', expiresAt: null, occurredAt: new Date(), id: 'c-5' },
    { leadId: 'l-noconsent', status: 'granted', expiresAt: null, occurredAt: new Date(Date.now() - 10_000), id: 'c-4' },
  ]) as any
  prisma.campaign.updateMany = (async () => { throw new Error('la vista previa no debe escribir') }) as any

  const preview = await getStartPreview('org-a', 'c1')
  assert.ok(preview)
  assert.equal(preview.eligibleLeads, 2)
  assert.equal(preview.newLeadsWithoutPhone, 2)
  assert.equal(preview.canStart, false)
  assert.deepEqual(preview.breakdown, { eligible: 2, withoutPhone: 2, invalidPhone: 1, optOut: 2, missingConsent: 2, maxAttempts: 1 })
  assert.equal(preview.agent?.name, 'Carlos')
  assert.deepEqual(campaignQueries[0].where, { id: 'c1', orgId: 'org-a' })

  assert.equal(leadQueries[0].where.orgId, 'org-a')
  assert.equal(leadQueries[0].where.campaignId, 'c1')
  assert.equal(leadQueries[0].where.status, START_LEAD_WHERE.status)

  // Otra organización: 404 (null) y sin consultar leads.
  leadQueries.length = 0
  assert.equal(await getStartPreview('org-b', 'c1'), null)
  assert.equal(leadQueries.length, 0)
})
