// Normalización E.164, deduplicación contra la organización, opt-out al
// importar y consentimiento por fila/lote en importOneRow. Prisma simulado.
process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.REDIS_ENABLED = 'false'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import { createLead, dedupeImportRows, findDuplicateLead, InvalidPhoneError, LeadDuplicateError, normalizeLeadPhone } from '../services/leads.service'
import { importOneRow, ImportRowExistsError, readRowsPayload, resolveRowConsent } from '../jobs/importJobRunner'

test('normalizeLeadPhone usa 34 por defecto y rechaza lo ambiguo', () => {
  assert.equal(normalizeLeadPhone('600 111 222'), '+34600111222')
  assert.equal(normalizeLeadPhone('+34 600-111-222'), '+34600111222')
  assert.equal(normalizeLeadPhone('0034600111222'), '+34600111222')
  assert.equal(normalizeLeadPhone('12'), null)
  assert.equal(normalizeLeadPhone(''), null)
  assert.equal(normalizeLeadPhone(undefined), null)
})

test('dedupeImportRows compara teléfonos normalizados y conserva el consentimiento por fila', () => {
  const { items, duplicates } = dedupeImportRows([
    { name: 'A', phone: '+34600111222', consentVoice: true, consentSource: 'web' },
    { name: 'B', phone: '600 111 222' },
    { name: 'C', email: 'X@Y.com' },
    { name: 'D', email: 'x@y.com' },
    { name: 'E', phone: '600 333 444', consentVoice: false },
  ])
  assert.deepEqual(items.map(i => i.row), [2, 4, 6])
  assert.deepEqual(duplicates, [{ row: 3, message: 'duplicate_in_file' }, { row: 5, message: 'duplicate_in_file' }])
  assert.equal(items[0].consentVoice, true)
  assert.equal(items[0].consentSource, 'web')
  assert.equal(items[2].consentVoice, false)
})

test('resolveRowConsent: la fila manda, después el lote, y sin nada no se registra', () => {
  const batch = { voice: true, source: 'contrato', evidence: 'Cláusula 3' }
  assert.deepEqual(resolveRowConsent({ row: 2, name: 'A', consentVoice: true, consentSource: 'web', consentEvidence: 'form' }, batch), { voice: true, source: 'web', evidence: 'form' })
  assert.deepEqual(resolveRowConsent({ row: 2, name: 'A', consentVoice: true }, undefined), { voice: true, source: 'import_row', evidence: undefined })
  assert.equal(resolveRowConsent({ row: 2, name: 'A', consentVoice: false }, batch), undefined)
  assert.deepEqual(resolveRowConsent({ row: 2, name: 'A' }, batch), { voice: true, source: 'contrato', evidence: 'Cláusula 3' })
  assert.equal(resolveRowConsent({ row: 2, name: 'A' }, undefined), undefined)
  assert.equal(resolveRowConsent({ row: 2, name: 'A' }, { voice: false }), undefined)
  assert.equal(readRowsPayload({ items: [], consent: { voice: false } }).consent, undefined)
  assert.deepEqual(readRowsPayload({ items: [], consent: { voice: true, source: 's' }, attachExistingToCampaign: true }), { autoCall: false, items: [], consent: { voice: true, source: 's', evidence: undefined }, attachExistingToCampaign: true })
})

type Mocks = { calls: Record<string, any[]>; consentUpserts: any[]; restore: () => void }

function mockPrisma(opts: { existingLead?: { id: string; phone: string | null; email: string | null; campaignId: string | null } | null; optOut?: boolean } = {}): Mocks {
  const calls: Record<string, any[]> = { leadFindFirst: [], leadCreate: [], leadUpdateMany: [], campaignUpdateMany: [], optOut: [] }
  const consentUpserts: any[] = []
  const saved: Array<[any, string, any]> = []
  const patch = (target: any, key: string, fn: any) => { saved.push([target, key, target[key]]); target[key] = fn }

  patch(prisma.campaign, 'findFirst', async (args: any) => ({ id: args.where.id }))
  patch(prisma.account, 'findFirst', async () => null)
  patch(prisma.lead, 'findUnique', async () => null)
  patch(prisma.lead, 'findFirst', async (args: any) => {
    calls.leadFindFirst.push(args)
    // dedupe → OR; orquestación → id
    if (args.where.OR) return opts.existingLead ?? null
    return { id: 'new-lead', orgId: args.where.orgId, name: 'X', phone: '+34600111222', email: null, company: null, source: 'import', campaignId: 'c1', createdAt: new Date() }
  })
  patch(prisma.optOut, 'findUnique', async (args: any) => { calls.optOut.push(args); return opts.optOut ? { id: 'oo' } : null })
  patch(prisma.lead, 'create', async (args: any) => { calls.leadCreate.push(args); return { id: 'new-lead', ...args.data } })
  patch(prisma.lead, 'updateMany', async (args: any) => { calls.leadUpdateMany.push(args); return { count: 1 } })
  patch(prisma.campaign, 'updateMany', async (args: any) => { calls.campaignUpdateMany.push(args); return { count: 1 } })
  patch(prisma.auditLog, 'create', async () => ({}))
  patch(prisma.salesActivity, 'create', async () => ({}))
  patch(prisma.workerQueueJob, 'create', async () => ({}))
  patch(prisma, '$transaction', async (fn: any) => fn({
    conversation: { findUnique: async () => ({ id: 'conv' }), upsert: async () => ({ id: 'conv' }) },
    channelIdentity: { upsert: async (args: any) => ({ id: `ci-${args.create.channel}` }) },
    contactConsent: { upsert: async (args: any) => { consentUpserts.push(args); return {} } },
    outboxEvent: { create: async () => ({}) },
    nextBestAction: { findFirst: async () => ({ id: 'nba' }), create: async () => ({}) },
  }))
  return { calls, consentUpserts, restore: () => { for (const [target, key, value] of saved.reverse()) target[key] = value } }
}

test('createLead strict: normaliza a E.164, rechaza teléfono inválido y duplicado, marca opt-out', async t => {
  const m = mockPrisma()
  t.after(m.restore)
  const lead = await createLead('org', 'user', { name: 'Ana', phone: '600 111 222', email: 'ANA@X.es', campaignId: 'c1' }, { strict: true })
  assert.equal(lead.phone, '+34600111222')
  assert.equal(lead.email, 'ana@x.es')
  assert.deepEqual(m.calls.leadFindFirst[0].where.OR, [{ phone: '+34600111222' }, { email: { equals: 'ana@x.es', mode: 'insensitive' } }])
  assert.equal(m.calls.leadFindFirst[0].where.orgId, 'org')

  await assert.rejects(createLead('org', 'user', { name: 'Mal', phone: '12' }, { strict: true }), (err: any) => err instanceof InvalidPhoneError && err.phone === '12')
  // Sin strict (fuentes externas) el teléfono no interpretable se conserva y no se deduplica.
  m.calls.leadFindFirst.length = 0
  const loose = await createLead('org', null, { name: 'Ext', phone: '12' })
  assert.equal(loose.phone, '12')
  assert.equal(m.calls.leadFindFirst.some((q: any) => q.where.OR), false)
  m.restore()

  const dup = mockPrisma({ existingLead: { id: 'old', phone: '+34600111222', email: null, campaignId: null } })
  t.after(dup.restore)
  await assert.rejects(createLead('org', 'user', { name: 'Ana', phone: '+34600111222' }, { strict: true }), (err: any) => err instanceof LeadDuplicateError && err.existingLeadId === 'old' && err.matchedBy === 'phone')
  assert.equal(dup.calls.leadCreate.length, 0)
  assert.deepEqual(await findDuplicateLead('org', { email: 'ana@x.es' }), { id: 'old', campaignId: null, matchedBy: 'email' })
  dup.restore()

  const oo = mockPrisma({ optOut: true })
  t.after(oo.restore)
  const excluded = await createLead('org', 'user', { name: 'Ex', phone: '600 555 666', tags: ['csv'] }, { strict: true })
  assert.deepEqual(excluded.tags, ['csv', 'opt_out'])
  assert.equal((excluded.customFields as any).optOut, true)
  assert.deepEqual(oo.calls.optOut[0].where, { orgId_phone: { orgId: 'org', phone: '+34600555666' } })
})

test('importOneRow: consentimiento del lote llega a ContactConsent(voice) solo si se declaró', async t => {
  const job = { id: 'job1', orgId: 'org', createdById: 'user', campaignId: 'c1' }
  const withConsent = mockPrisma()
  t.after(withConsent.restore)
  const outcome = await importOneRow(job, { row: 2, name: 'Ana', phone: '600 111 222' }, false, { consent: { voice: true, source: 'contrato', evidence: 'Cláusula 3' } })
  assert.equal(outcome, 'created')
  const created = withConsent.calls.leadCreate[0].data
  assert.equal(created.phone, '+34600111222')
  assert.equal(created.externalLeadId, 'import:job1:row:2')
  const voice = withConsent.consentUpserts.find(u => u.create.channel === 'voice')
  assert.ok(voice, 'debe registrar consentimiento de voz')
  assert.equal(voice.create.status, 'granted')
  assert.equal(voice.create.source, 'contrato')
  assert.equal(voice.create.evidence, 'Cláusula 3')
  withConsent.restore()

  const noConsent = mockPrisma()
  t.after(noConsent.restore)
  await importOneRow(job, { row: 3, name: 'Luis', phone: '600 333 444' }, false, {})
  assert.equal(noConsent.consentUpserts.length, 0, 'sin declaración no se registra ningún consentimiento')
  noConsent.restore()

  const rowSaysNo = mockPrisma()
  t.after(rowSaysNo.restore)
  await importOneRow(job, { row: 4, name: 'Eva', phone: '600 777 888', consentVoice: false }, false, { consent: { voice: true, source: 'contrato' } })
  assert.equal(rowSaysNo.consentUpserts.length, 0, 'consent_voice=no en la fila anula la declaración del lote')
})

test('importOneRow: teléfono inválido se rechaza con motivo; ya existente se omite y opcionalmente se asigna a la campaña', async t => {
  const job = { id: 'job1', orgId: 'org', createdById: 'user', campaignId: 'c1' }
  const invalid = mockPrisma()
  t.after(invalid.restore)
  await assert.rejects(importOneRow(job, { row: 2, name: 'Mal', phone: 'abc' }, false), /invalid_phone: abc/)
  assert.equal(invalid.calls.leadCreate.length, 0)
  invalid.restore()

  const existing = mockPrisma({ existingLead: { id: 'old', phone: '+34600111222', email: null, campaignId: null } })
  t.after(existing.restore)
  await assert.rejects(importOneRow(job, { row: 3, name: 'Ana', phone: '600111222' }, false, { attachExistingToCampaign: true }), (err: any) => err instanceof ImportRowExistsError && err.existingLeadId === 'old')
  assert.equal(existing.calls.leadCreate.length, 0)
  assert.deepEqual(existing.calls.leadUpdateMany[0].where, { id: 'old', orgId: 'org', campaignId: null })
  assert.deepEqual(existing.calls.leadUpdateMany[0].data, { campaignId: 'c1' })
  assert.equal(existing.calls.campaignUpdateMany.length, 1)
  existing.restore()

  const noAttach = mockPrisma({ existingLead: { id: 'old', phone: '+34600111222', email: null, campaignId: null } })
  t.after(noAttach.restore)
  await assert.rejects(importOneRow(job, { row: 3, name: 'Ana', phone: '600111222' }, false, {}), ImportRowExistsError)
  assert.equal(noAttach.calls.leadUpdateMany.length, 0)
})
