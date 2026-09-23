process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/test'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import {
  FunnelNotFoundError,
  FunnelStatusError,
  bottleneck,
  buildFunnel,
  funnelStatusTransitionError,
  getFunnelsOverview,
  percent,
  summarizeFunnels,
  updateFunnelStatus,
} from '../services/funnels.service'

const campaign = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'Diagnóstico',
  objective: null,
  status: 'active',
  landingSlug: 'diagnostico-1234',
  totalLeads: 20,
  contacted: 10,
  meetingsScheduled: 2,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  ...overrides,
})

test('percent devuelve null sin dato anterior o con base cero y redondea a un decimal', () => {
  assert.equal(percent(5, null), null)
  assert.equal(percent(5, 0), null)
  assert.equal(percent(1, 3), 33.3)
  assert.equal(percent(0, 10), 0)
})

test('buildFunnel: sin eventos de visita las tasas de tráfico quedan en null, nunca 0', () => {
  const untracked = buildFunnel(campaign(), undefined)
  assert.equal(untracked.visits, null)
  assert.equal(untracked.rates.visitToLead, null)
  assert.equal(untracked.rates.visitToMeeting, null)
  assert.equal(untracked.rates.leadToContact, 50)
  assert.equal(untracked.rates.contactToMeeting, 20)
  assert.equal(untracked.rates.leadToMeeting, 10)

  // Outbound (sin landing): las visitas no aplican aunque haya eventos sueltos.
  const outbound = buildFunnel(campaign({ landingSlug: null }), 40)
  assert.equal(outbound.visits, null)
  assert.equal(outbound.rates.visitToLead, null)

  const tracked = buildFunnel(campaign(), 200)
  assert.equal(tracked.visits, 200)
  assert.equal(tracked.rates.visitToLead, 10)
  assert.equal(tracked.rates.visitToMeeting, 1)

  // Sin leads no se puede calcular nada aguas abajo.
  const empty = buildFunnel(campaign({ totalLeads: 0, contacted: 0, meetingsScheduled: 0 }), 50)
  assert.equal(empty.rates.visitToLead, 0)
  assert.equal(empty.rates.leadToContact, null)
  assert.equal(empty.rates.contactToMeeting, null)
})

test('bottleneck elige la transición medible con menor tasa e ignora las que no tienen base', () => {
  const tracked = buildFunnel(campaign(), 200) // 10% visita→lead, 50% lead→contacto, 20% contacto→reunión
  assert.deepEqual(bottleneck(tracked), { label: 'visita a lead', rate: 10, previous: 200 })

  const untracked = buildFunnel(campaign(), undefined)
  assert.equal(bottleneck(untracked)?.label, 'contacto a reunion')

  const nothing = buildFunnel(campaign({ totalLeads: 0, contacted: 0, meetingsScheduled: 0 }), undefined)
  assert.equal(bottleneck(nothing), null)
})

test('summarizeFunnels prioriza medir visitas antes de optimizar e ignora funnels finalizados', () => {
  const untracked = buildFunnel(campaign({ id: 'a', name: 'Sin tracking' }), undefined)
  const tracked = buildFunnel(campaign({ id: 'b', name: 'Medido' }), 200)
  const first = summarizeFunnels([tracked, untracked])
  assert.equal(first.recommendation?.funnelId, 'a')
  assert.equal(first.recommendation?.title, 'Mide las visitas antes de optimizar')
  assert.equal(first.summary.untrackedFunnels, 1)
  assert.equal(first.summary.trackedFunnels, 1)
  assert.equal(first.summary.active, 2)
  // La conversión global de tráfico solo usa funnels medidos.
  assert.equal(first.summary.visitToLead, 10)
  assert.equal(first.summary.visitToMeeting, 1)

  // Un funnel finalizado sin tracking no debe pedir que se mida.
  const finished = buildFunnel(campaign({ id: 'a', name: 'Sin tracking', status: 'done' }), undefined)
  const second = summarizeFunnels([tracked, finished])
  assert.equal(second.summary.untrackedFunnels, 0)
  assert.equal(second.recommendation?.funnelId, 'b')
  assert.match(second.recommendation?.title || '', /visita a lead/)
  assert.equal(second.recommendation?.action.to, '/captacion/cerrar?selected=b')
  assert.equal(second.summary.active, 1)
})

test('summarizeFunnels sin datos medibles no inventa recomendación ni tasas', () => {
  const outbound = buildFunnel(campaign({ landingSlug: null, totalLeads: 0, contacted: 0, meetingsScheduled: 0 }), undefined)
  const result = summarizeFunnels([outbound])
  assert.equal(result.recommendation, null)
  assert.equal(result.summary.visitToLead, null)
  assert.equal(result.summary.visitToMeeting, null)
  assert.equal(summarizeFunnels([]).recommendation, null)
})

test('getFunnelsOverview filtra por organización y usa solo eventos landing_view', async t => {
  const oldFind = prisma.campaign.findMany
  const oldGroup = prisma.acquisitionEvent.groupBy
  t.after(() => { prisma.campaign.findMany = oldFind; prisma.acquisitionEvent.groupBy = oldGroup })
  const calls: any[] = []
  prisma.campaign.findMany = (async (args: any) => { calls.push(['campaigns', args]); return [campaign()] }) as any
  prisma.acquisitionEvent.groupBy = (async (args: any) => { calls.push(['events', args]); return [{ campaignId: 'c1', _count: { id: 100 } }] }) as any
  const result = await getFunnelsOverview('org-1')
  assert.equal(calls[0][1].where.orgId, 'org-1')
  assert.equal(calls[1][1].where.orgId, 'org-1')
  assert.equal(calls[1][1].where.type, 'landing_view')
  assert.equal(result.funnels[0].visits, 100)
  assert.equal(result.funnels[0].rates.visitToLead, 20)

  // Sin campañas no se consulta la tabla de eventos.
  calls.length = 0
  prisma.campaign.findMany = (async () => []) as any
  const empty = await getFunnelsOverview('org-1')
  assert.equal(calls.length, 0)
  assert.deepEqual(empty.funnels, [])
})

test('funnelStatusTransitionError: done es terminal, solo se pausa lo activo y un agente bloquea activar', () => {
  assert.equal(funnelStatusTransitionError('draft', 'active', { hasAgent: false }), null)
  assert.equal(funnelStatusTransitionError('paused', 'active', { hasAgent: false }), null)
  assert.equal(funnelStatusTransitionError('active', 'paused', { hasAgent: true }), null)
  assert.equal(funnelStatusTransitionError('draft', 'done', { hasAgent: false }), null)
  assert.equal(funnelStatusTransitionError('active', 'done', { hasAgent: true }), null)
  assert.equal(funnelStatusTransitionError('draft', 'paused', { hasAgent: false })?.code, 'FUNNEL_NOT_ACTIVE')
  assert.equal(funnelStatusTransitionError('done', 'active', { hasAgent: false })?.code, 'FUNNEL_FINISHED')
  assert.equal(funnelStatusTransitionError('active', 'active', { hasAgent: false })?.code, 'FUNNEL_STATUS_UNCHANGED')
  assert.equal(funnelStatusTransitionError('paused', 'active', { hasAgent: true })?.code, 'FUNNEL_HAS_AGENT')
})

test('updateFunnelStatus cambia solo Campaign.status (update condicionado), filtra por org y detecta conflictos', async t => {
  const oldFind = prisma.campaign.findFirst
  const oldUpdate = prisma.campaign.updateMany
  const oldAudit = prisma.auditLog.create
  t.after(() => { prisma.campaign.findFirst = oldFind; prisma.campaign.updateMany = oldUpdate; prisma.auditLog.create = oldAudit })
  const updates: any[] = []
  let row: any = { id: 'c1', name: 'Diagnóstico', status: 'draft', agentId: null }
  prisma.campaign.findFirst = (async (args: any) => (args.where.orgId === 'org-1' && args.where.id === row.id ? row : null)) as any
  prisma.campaign.updateMany = (async (args: any) => { updates.push(args); return { count: 1 } }) as any
  prisma.auditLog.create = (async () => ({})) as any

  const result = await updateFunnelStatus('org-1', 'user-1', 'c1', 'active')
  assert.deepEqual(result, { id: 'c1', name: 'Diagnóstico', status: 'active' })
  assert.deepEqual(updates[0], { where: { id: 'c1', orgId: 'org-1', status: 'draft' }, data: { status: 'active' } })

  await assert.rejects(updateFunnelStatus('otra-org', 'user-1', 'c1', 'paused'), FunnelNotFoundError)

  row = { ...row, status: 'paused', agentId: 'agent-1' }
  await assert.rejects(updateFunnelStatus('org-1', 'user-1', 'c1', 'active'), (err: unknown) => err instanceof FunnelStatusError && err.code === 'FUNNEL_HAS_AGENT')

  // Si otra sesión cambió el estado entre lectura y escritura, se informa conflicto.
  row = { ...row, agentId: null }
  prisma.campaign.updateMany = (async () => ({ count: 0 })) as any
  await assert.rejects(updateFunnelStatus('org-1', 'user-1', 'c1', 'done'), (err: unknown) => err instanceof FunnelStatusError && err.code === 'FUNNEL_STATUS_CONFLICT')
})
