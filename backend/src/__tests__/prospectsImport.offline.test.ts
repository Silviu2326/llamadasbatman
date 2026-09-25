// Importación de prospectos (POST /prospects/import) con Prisma simulado y sin
// Places: duplicado por teléfono normalizado, teléfono inválido reportado y
// autoCall omitido con motivo cuando la campaña no puede marcar.
process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.REDIS_ENABLED = 'false'
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import { importProspects, importSchema, searchSchema } from '../controllers/prospects.controller'

type Campaign = { status: string; agent: { isActive: boolean; lifecycleStatus: string } | null }

function mockPrisma(campaign: Campaign, existingPhones: string[] = []) {
  const saved: Array<[any, string, any]> = []
  const patch = (target: any, key: string, fn: any) => { saved.push([target, key, target[key]]); target[key] = fn }
  const jobs: any[] = []
  const createdLeads: any[] = []
  let counter = 0

  patch(prisma.lead, 'findMany', async () => existingPhones.map((phone, i) => ({ phone, customFields: { placeId: `existing-${i}` } })))
  patch(prisma.lead, 'findFirst', async (args: any) => {
    if (args.where.OR) {
      const phone = args.where.OR.find((c: any) => c.phone)?.phone
      return phone && existingPhones.includes(phone) ? { id: 'old', phone, email: null, campaignId: 'c1' } : null
    }
    return { campaignId: 'c1', campaign }
  })
  patch(prisma.lead, 'findUnique', async () => null)
  patch(prisma.lead, 'create', async (args: any) => { const lead = { id: `lead-${++counter}`, ...args.data }; createdLeads.push(lead); return lead })
  patch(prisma.campaign, 'findFirst', async (args: any) => (args.select?.status ? { status: campaign.status, agent: campaign.agent } : { id: args.where.id, settings: {} }))
  patch(prisma.campaign, 'updateMany', async () => ({ count: 1 }))
  patch(prisma.account, 'findFirst', async () => null)
  patch(prisma.optOut, 'findUnique', async () => null)
  patch(prisma.auditLog, 'create', async () => ({}))
  patch(prisma.salesActivity, 'create', async () => ({}))
  patch(prisma.acquisitionEvent, 'upsert', async (args: any) => args.create)
  patch(prisma.contactConsent, 'findFirst', async () => null)
  patch(prisma.organizationIntegrationCredential, 'findUnique', async () => null)
  patch(prisma.workerQueueJob, 'create', async (args: any) => { jobs.push(args.data); return args.data })
  patch(prisma.workerQueueJob, 'updateMany', async () => ({ count: 0 }))
  patch(prisma, '$transaction', async (fn: any) => fn({
    conversation: { findUnique: async () => null, upsert: async () => ({ id: 'conv' }) },
    channelIdentity: { upsert: async (args: any) => ({ id: `ci-${args.create.channel}` }) },
    contactConsent: { upsert: async () => ({}) },
    outboxEvent: { create: async () => ({}) },
    nextBestAction: { findFirst: async () => ({ id: 'nba' }), create: async () => ({}) },
  }))
  return { jobs, createdLeads, restore: () => { for (const [target, key, value] of saved.reverse()) target[key] = value } }
}

function fakeReply() {
  const reply: any = { statusCode: 200, body: null }
  reply.status = (code: number) => { reply.statusCode = code; return reply }
  reply.send = (body: any) => { reply.body = body; return reply }
  return reply
}

function request(body: Record<string, unknown>) {
  return { user: { orgId: 'org', userId: 'user', role: 'admin', email: 'a@b.c' }, body } as any
}

const item = (over: Record<string, unknown>) => ({ placeId: `p-${Math.random()}`, name: 'Negocio', address: null, phone: null, website: null, rating: null, userRatingCount: null, mapsUri: null, photosCount: null, quickScore: 10, ...over })

test('schemas: search acota limit/query e items no pasa de 100', () => {
  assert.equal(searchSchema.safeParse({ sector: 'a', city: 'Madrid' }).success, false)
  assert.equal(searchSchema.safeParse({ sector: 'Clínicas', city: 'Madrid', limit: 50 }).success, false)
  assert.equal(searchSchema.safeParse({ sector: 'Clínicas', city: 'Madrid', limit: 20 }).success, true)
  assert.equal(importSchema.safeParse({ campaignId: 'c1', items: Array.from({ length: 101 }, () => item({})) }).success, false)
  assert.equal(importSchema.safeParse({ campaignId: 'c1', items: [] }).success, false)
})

test('duplicado por teléfono normalizado: «600 111 222» coincide con +34600111222 ya importado', async t => {
  const m = mockPrisma({ status: 'active', agent: { isActive: true, lifecycleStatus: 'active' } }, ['+34600111222'])
  t.after(m.restore)
  const reply = fakeReply()
  await importProspects(request({ campaignId: 'c1', items: [
    item({ name: 'Repetido', phone: '600 111 222' }),
    item({ name: 'Nuevo', phone: '+34 611 222 333' }),
  ] }), reply)
  assert.equal(reply.statusCode, 200)
  assert.equal(reply.body.imported, 1)
  assert.deepEqual(reply.body.duplicates, [{ name: 'Repetido', matchedBy: 'phone' }])
  assert.deepEqual(reply.body.invalid, [])
  assert.equal(m.createdLeads[0].phone, '+34611222333')
  assert.deepEqual(reply.body.callsSkipped, { count: 0, reason: null })
})

test('teléfono inválido: se reporta por nombre y no crea lead', async t => {
  const m = mockPrisma({ status: 'active', agent: { isActive: true, lifecycleStatus: 'active' } })
  t.after(m.restore)
  const reply = fakeReply()
  await importProspects(request({ campaignId: 'c1', items: [item({ name: 'Raro', phone: 'no-es-un-telefono' })] }), reply)
  assert.equal(reply.body.imported, 0)
  assert.deepEqual(reply.body.invalid, [{ name: 'Raro', phone: 'no-es-un-telefono' }])
  assert.equal(m.createdLeads.length, 0)
})

test('autoCall con campaña en borrador: nada encolado y motivo campaign_not_active', async t => {
  const m = mockPrisma({ status: 'draft', agent: { isActive: true, lifecycleStatus: 'active' } })
  t.after(m.restore)
  const reply = fakeReply()
  await importProspects(request({ campaignId: 'c1', autoCall: true, items: [item({ name: 'Uno', phone: '600111222' }), item({ name: 'Dos', phone: '600111223' })] }), reply)
  assert.equal(reply.body.imported, 2)
  assert.equal(reply.body.callsQueued, 0)
  assert.deepEqual(reply.body.callsSkipped, { count: 2, reason: 'campaign_not_active' })
  assert.equal(m.jobs.filter(j => j.queue === 'lead-call-dispatch').length, 0)
})

test('autoCall con campaña activa pero agente sin publicar: motivo agent_not_published', async t => {
  const m = mockPrisma({ status: 'active', agent: { isActive: true, lifecycleStatus: 'draft' } })
  t.after(m.restore)
  const reply = fakeReply()
  await importProspects(request({ campaignId: 'c1', autoCall: true, items: [item({ name: 'Uno', phone: '600111222' })] }), reply)
  assert.deepEqual(reply.body.callsSkipped, { count: 1, reason: 'agent_not_published' })
})

test('autoCall con campaña activa y agente publicado: callsQueued cuenta el trabajo', async t => {
  const m = mockPrisma({ status: 'active', agent: { isActive: true, lifecycleStatus: 'active' } })
  t.after(m.restore)
  const reply = fakeReply()
  await importProspects(request({ campaignId: 'c1', autoCall: true, items: [item({ name: 'Uno', phone: '600111222' })] }), reply)
  assert.equal(reply.body.callsQueued, 1)
  assert.equal(m.jobs.filter(j => j.queue === 'lead-call-dispatch').length, 1)
})
