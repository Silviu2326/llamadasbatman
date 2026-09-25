// Encolado automático de llamadas por consentimiento de voz / autoCall:
// solo con campaña activa y agente publicado, con la clave idempotente
// lead-call:<leadId>:<campaignId>. Prisma simulado.
process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.REDIS_ENABLED = 'false'
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import { enqueueCampaignLeadCall, findActiveCampaignForLeadCall, leadCampaignCallDedupeKey } from '../services/leadCallGate'
import { orchestrateNewLead } from '../services/conversations.service'
import { importOneRow } from '../jobs/importJobRunner'

type Campaign = { status: string; agent: { isActive: boolean; lifecycleStatus: string } | null } | null

function mockPrisma(campaign: Campaign, opts: { voiceConsent?: boolean } = {}) {
  const jobs: any[] = []
  const saved: Array<[any, string, any]> = []
  const patch = (target: any, key: string, fn: any) => { saved.push([target, key, target[key]]); target[key] = fn }
  const dedupeKeys = new Set<string>()

  patch(prisma.lead, 'findFirst', async (args: any) => {
    if (args.where.OR) return null
    const base = { id: 'lead-1', orgId: args.where.orgId, name: 'Ana', phone: '+34600111222', email: null, company: null, source: 'import', campaignId: campaign ? 'c1' : null, createdAt: new Date() }
    return args.select?.campaign ? { campaignId: base.campaignId, campaign } : base
  })
  patch(prisma.lead, 'findUnique', async () => null)
  patch(prisma.lead, 'create', async (args: any) => ({ id: 'lead-1', ...args.data }))
  patch(prisma.campaign, 'findFirst', async (args: any) => ({ id: args.where.id }))
  patch(prisma.campaign, 'updateMany', async () => ({ count: 1 }))
  patch(prisma.account, 'findFirst', async () => null)
  patch(prisma.optOut, 'findUnique', async () => null)
  patch(prisma.auditLog, 'create', async () => ({}))
  patch(prisma.salesActivity, 'create', async () => ({}))
  patch(prisma.contactConsent, 'findFirst', async (args: any) => (opts.voiceConsent && args.where.channel === 'voice' ? { status: 'granted', expiresAt: null } : null))
  patch(prisma.organizationIntegrationCredential, 'findUnique', async () => null)
  patch(prisma.workerQueueJob, 'create', async (args: any) => {
    // Misma unicidad que la tabla real: una clave ya encolada no crea otra fila.
    if (args.data.dedupeKey) {
      if (dedupeKeys.has(args.data.dedupeKey)) throw Object.assign(new Error('unique'), { code: 'P2002' })
      dedupeKeys.add(args.data.dedupeKey)
    }
    jobs.push(args.data)
    return args.data
  })
  patch(prisma.workerQueueJob, 'updateMany', async () => ({ count: 0 }))
  patch(prisma, '$transaction', async (fn: any) => fn({
    conversation: { findUnique: async () => null, upsert: async () => ({ id: 'conv' }) },
    channelIdentity: { upsert: async (args: any) => ({ id: `ci-${args.create.channel}` }) },
    contactConsent: { upsert: async () => ({}) },
    outboxEvent: { create: async () => ({}) },
    nextBestAction: { findFirst: async () => ({ id: 'nba' }), create: async () => ({}) },
  }))
  return { jobs, restore: () => { for (const [target, key, value] of saved.reverse()) target[key] = value } }
}

const activeCampaign: Campaign = { status: 'active', agent: { isActive: true, lifecycleStatus: 'active' } }

test('leadCampaignCallDedupeKey coincide con la clave de startCampaign', () => {
  assert.equal(leadCampaignCallDedupeKey('l1', 'c1'), 'lead-call:l1:c1')
})

test('findActiveCampaignForLeadCall: solo campaña activa con agente publicado', async t => {
  for (const [campaign, expected] of [
    [null, null],
    [{ status: 'draft', agent: { isActive: true, lifecycleStatus: 'active' } }, null],
    [{ status: 'active', agent: null }, null],
    [{ status: 'active', agent: { isActive: true, lifecycleStatus: 'draft' } }, null],
    [{ status: 'active', agent: { isActive: false, lifecycleStatus: 'active' } }, null],
    [activeCampaign, 'c1'],
  ] as Array<[Campaign, string | null]>) {
    const m = mockPrisma(campaign)
    try { assert.equal(await findActiveCampaignForLeadCall('org', 'lead-1'), expected, JSON.stringify(campaign)) } finally { m.restore() }
  }
})

test('consentimiento de voz con campaña en borrador: orchestrateNewLead no encola nada', async t => {
  const m = mockPrisma({ status: 'draft', agent: { isActive: true, lifecycleStatus: 'active' } }, { voiceConsent: true })
  t.after(m.restore)
  const result = await orchestrateNewLead('org', 'lead-1', { voice: true })
  assert.deepEqual(result.queued, [])
  assert.equal(m.jobs.filter(j => j.queue === 'lead-call-dispatch').length, 0)
})

test('consentimiento de voz con campaña activa: una sola llamada con dedupeKey de campaña', async t => {
  const m = mockPrisma(activeCampaign, { voiceConsent: true })
  t.after(m.restore)
  const result = await orchestrateNewLead('org', 'lead-1', { voice: true })
  assert.deepEqual(result.queued, ['voice'])
  const calls = m.jobs.filter(j => j.queue === 'lead-call-dispatch')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].dedupeKey, 'lead-call:lead-1:c1')
  assert.deepEqual(calls[0].payload, { orgId: 'org', leadId: 'lead-1', campaignId: 'c1' })
  // Repetir (autoCall, reintento) con la misma clave no crea otro trabajo:
  // la cola responde true (la intención ya está encolada) sin segunda fila.
  assert.equal(await enqueueCampaignLeadCall('org', 'lead-1'), true)
  assert.equal(m.jobs.filter(j => j.queue === 'lead-call-dispatch').length, 1)
})

test('importOneRow con consentimiento + autoCall y campaña activa: un único trabajo con la clave de campaña', async t => {
  const m = mockPrisma(activeCampaign, { voiceConsent: true })
  t.after(m.restore)
  const job = { id: 'job1', orgId: 'org', createdById: 'user', campaignId: 'c1' }
  const outcome = await importOneRow(job, { row: 2, name: 'Ana', phone: '600 111 222' }, true, { consent: { voice: true, source: 'contrato' } })
  assert.equal(outcome, 'created')
  const calls = m.jobs.filter(j => j.queue === 'lead-call-dispatch')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].dedupeKey, leadCampaignCallDedupeKey('lead-1', 'c1'))
})

test('importOneRow con consentimiento + autoCall y campaña en borrador: sin trabajos ni ruido', async t => {
  const m = mockPrisma({ status: 'draft', agent: { isActive: true, lifecycleStatus: 'active' } }, { voiceConsent: true })
  t.after(m.restore)
  const job = { id: 'job1', orgId: 'org', createdById: 'user', campaignId: 'c1' }
  await importOneRow(job, { row: 2, name: 'Ana', phone: '600 111 222' }, true, { consent: { voice: true } })
  assert.equal(m.jobs.filter(j => j.queue === 'lead-call-dispatch').length, 0)
})
