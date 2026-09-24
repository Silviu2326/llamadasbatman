// startCampaign: rechaza con código si el agente no está publicado, encola
// solo los leads llamables con dedupeKey estable y valida agentId al crear.
process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.REDIS_ENABLED = 'false'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import { campaignCallDedupeKey, CampaignAgentError, CampaignStartError, createCampaign, startCampaign, updateCampaign } from '../services/campaigns.service'

function patchAll(t: any, patches: Array<[any, string, any]>) {
  const saved = patches.map(([target, key, fn]) => { const prev = target[key]; target[key] = fn; return [target, key, prev] as const })
  t.after(() => { for (const [target, key, prev] of saved) target[key] = prev })
}

test('startCampaign rechaza 409 con código si el agente falta o no está publicado, sin activar la campaña', async t => {
  const updates: any[] = []
  let agent: any = null
  patchAll(t, [
    [prisma.campaign, 'findFirst', async (args: any) => (args.where.orgId === 'org' ? { id: 'c1', agent } : null)],
    [prisma.campaign, 'updateMany', async (args: any) => { updates.push(args); return { count: 1 } }],
  ])

  await assert.rejects(startCampaign('otra', 'c1'), (err: any) => err instanceof CampaignStartError && err.code === 'CAMPAIGN_NOT_FOUND' && err.status === 404)
  await assert.rejects(startCampaign('org', 'c1'), (err: any) => err instanceof CampaignStartError && err.code === 'AGENT_MISSING' && err.status === 409)
  agent = { id: 'a1', orgId: 'org', isActive: true, lifecycleStatus: 'draft', name: 'Carlos' }
  await assert.rejects(startCampaign('org', 'c1'), (err: any) => err instanceof CampaignStartError && err.code === 'AGENT_NOT_PUBLISHED' && /Carlos/.test(err.message))
  agent = { id: 'a1', orgId: 'org', isActive: false, lifecycleStatus: 'active', name: 'Carlos' }
  await assert.rejects(startCampaign('org', 'c1'), (err: any) => err.code === 'AGENT_NOT_PUBLISHED')
  agent = { id: 'a1', orgId: 'otra', isActive: true, lifecycleStatus: 'active', name: 'Ajeno' }
  await assert.rejects(startCampaign('org', 'c1'), (err: any) => err.code === 'AGENT_MISSING')
  assert.equal(updates.length, 0, 'ningún rechazo debe activar la campaña')
})

test('startCampaign con agente publicado activa y encola solo los llamables con dedupeKey lead-call:<leadId>:<campaignId>', async t => {
  const updates: any[] = []
  const jobs: any[] = []
  patchAll(t, [
    [prisma.campaign, 'findFirst', async () => ({ id: 'c1', agent: { id: 'a1', orgId: 'org', isActive: true, lifecycleStatus: 'active', name: 'Carlos' } })],
    [prisma.campaign, 'updateMany', async (args: any) => { updates.push(args); return { count: 1 } }],
    [prisma.lead, 'findMany', async () => [
      { id: 'l-ok', phone: '600111222', tags: [], attempts: 0 },
      { id: 'l-optout', phone: '+34600333444', tags: [], attempts: 0 },
      { id: 'l-noconsent', phone: '+34600555666', tags: [], attempts: 0 },
      { id: 'l-nophone', phone: null, tags: [], attempts: 0 },
    ]],
    [prisma.optOut, 'findMany', async () => [{ phone: '+34600333444' }]],
    [prisma.contactConsent, 'findMany', async () => [{ leadId: 'l-ok', status: 'granted', expiresAt: null, occurredAt: new Date(), id: 'x' }]],
    [prisma.workerQueueJob, 'create', async (args: any) => { jobs.push(args.data); return args.data }],
    [prisma.workerQueueJob, 'updateMany', async () => ({ count: 0 })],
    [prisma.workerQueueJob, 'findMany', async () => []],
  ])

  const result = await startCampaign('org', 'c1')
  assert.equal(result.queued, 1)
  assert.deepEqual(result.breakdown, { eligible: 1, withoutPhone: 1, invalidPhone: 0, optOut: 1, missingConsent: 1, maxAttempts: 0, alreadyQueued: 0 })
  assert.deepEqual(updates[0], { where: { id: 'c1', orgId: 'org' }, data: { status: 'active' } })
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].queue, 'lead-call-dispatch')
  assert.equal(jobs[0].dedupeKey, campaignCallDedupeKey('l-ok', 'c1'))
  assert.equal(jobs[0].dedupeKey, 'lead-call:l-ok:c1')
  assert.deepEqual(jobs[0].payload, { orgId: 'org', leadId: 'l-ok', campaignId: 'c1' })

  // Reactivar tras pausar: la clave repetida (P2002) no crea un segundo trabajo ni falla.
  // Si el trabajo sigue pendiente/en curso, `updateMany` no reactiva nada y no cuenta como encolado.
  prisma.workerQueueJob.create = (async () => { throw Object.assign(new Error('dup'), { code: 'P2002' }) }) as any
  const again = await startCampaign('org', 'c1')
  assert.equal(again.queued, 0)
  // Un trabajo terminado sí se reactiva y cuenta.
  prisma.workerQueueJob.updateMany = (async () => ({ count: 1 })) as any
  const reactivated = await startCampaign('org', 'c1')
  assert.equal(reactivated.queued, 1)
})

test('startCampaign no reencola un lead con un trabajo de llamada pendiente o en curso (reintento retry:<org>:<lead>:<n>)', async t => {
  const jobs: any[] = []
  const queries: any[] = []
  patchAll(t, [
    [prisma.campaign, 'findFirst', async () => ({ id: 'c1', agent: { id: 'a1', orgId: 'org', isActive: true, lifecycleStatus: 'active', name: 'Carlos' } })],
    [prisma.campaign, 'updateMany', async () => ({ count: 1 })],
    [prisma.lead, 'findMany', async () => [
      { id: 'l-retry', phone: '+525511111111', tags: [], attempts: 1 },
      { id: 'l-fresh', phone: '+525522222222', tags: [], attempts: 0 },
    ]],
    [prisma.optOut, 'findMany', async () => []],
    [prisma.contactConsent, 'findMany', async () => []],
    [prisma.workerQueueJob, 'findMany', async (args: any) => {
      queries.push(args)
      return [
        { payload: { orgId: 'org', leadId: 'l-retry' } },
        { payload: { orgId: 'org', leadId: 'l-otra-campana' } },
      ]
    }],
    [prisma.workerQueueJob, 'create', async (args: any) => { jobs.push(args.data); return args.data }],
    [prisma.workerQueueJob, 'updateMany', async () => ({ count: 0 })],
  ])

  const result = await startCampaign('org', 'c1')
  assert.equal(queries.length, 1, 'una sola consulta para todos los elegibles')
  assert.deepEqual(queries[0].where.status, { in: ['pending', 'processing'] })
  assert.equal(queries[0].where.queue, 'lead-call-dispatch')
  assert.deepEqual(queries[0].where.payload, { path: ['orgId'], equals: 'org' })
  assert.equal(result.breakdown.alreadyQueued, 1)
  assert.equal(result.breakdown.eligible, 2)
  assert.equal(result.queued, 1)
  assert.deepEqual(jobs.map(job => job.payload.leadId), ['l-fresh'])
})

test('createCampaign/updateCampaign rechazan un agentId de otra organización', async t => {
  const created: any[] = []
  patchAll(t, [
    [prisma.agent, 'findFirst', async (args: any) => (args.where.orgId === 'org' && args.where.id === 'a1' ? { id: 'a1' } : null)],
    [prisma.campaign, 'create', async (args: any) => { created.push(args); return { id: 'new', ...args.data } }],
    [prisma.campaign, 'updateMany', async () => ({ count: 1 })],
  ])
  await assert.rejects(createCampaign('org', { name: 'X', agentId: 'ajeno' }), CampaignAgentError)
  await assert.rejects(updateCampaign('org', 'c1', { agentId: 'ajeno' }), CampaignAgentError)
  assert.equal(created.length, 0)
  const ok = await createCampaign('org', { name: 'X', agentId: 'a1' })
  assert.equal(ok.agentId, 'a1')
  // Sin agente sigue siendo válido (campañas de captación sin llamadas).
  await createCampaign('org', { name: 'Y' })
  assert.equal(created.length, 2)
  assert.deepEqual(await updateCampaign('org', 'c1', { name: 'Z' }), { count: 1 })
})
