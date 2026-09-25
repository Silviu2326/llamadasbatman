import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:9/calls_ingest_offline'
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
process.env.REDIS_ENABLED = 'false'
process.env.WORKER_QUEUE_BACKEND = 'postgres'

const ORG = 'org-ingest'
const LEAD = { id: 'lead-1', orgId: ORG, name: 'Ana Pérez', company: 'Acme', status: 'new', campaignId: 'camp-1' }
const AGENT = { id: 'agent-1', orgId: ORG, callDirection: 'outbound' }
const CAMPAIGN = { id: 'camp-1', orgId: ORG, agentId: 'agent-1' }

type Method = (...args: any[]) => any
type Models = Record<string, Record<string, Method>>

/**
 * Prisma simulado: cada modelo responde con valores neutros salvo que el
 * test lo sobrescriba, y `$transaction` ejecuta el callback sobre el mismo
 * cliente. Se restauran los métodos originales al terminar.
 */
async function stubPrisma(t: test.TestContext, models: Models) {
  const { prisma } = await import('../lib/prisma')
  const restore: Array<() => void> = []
  const generic: Record<string, Method> = {
    findFirst: async () => null, findUnique: async () => null, findUniqueOrThrow: async () => { throw new Error('not found') },
    findMany: async () => [], createMany: async () => ({ count: 0 }), create: async (q: any) => ({ id: `${Math.random().toString(36).slice(2, 8)}`, ...q.data }),
    update: async (q: any) => ({ id: q.where?.id, ...q.data }), updateMany: async () => ({ count: 0 }), upsert: async (q: any) => ({ id: 'up', ...q.create }),
    count: async () => 0, aggregate: async () => ({ _sum: {} }), deleteMany: async () => ({ count: 0 }),
  }
  const defaults = ['lead', 'agent', 'campaign', 'call', 'usageRecord', 'salesActivity', 'conversation', 'message', 'channelIdentity', 'outboxEvent', 'workerQueueJob', 'agencyClient', 'whiteLabelUsage', 'microappConfig', 'meeting', 'callTask', 'leadNote', 'auditLog', 'voiceCallEvent', 'nextBestAction', 'contactConsent']
  for (const model of new Set([...defaults, ...Object.keys(models)])) {
    const delegate = (prisma as any)[model]
    assert.ok(delegate, `modelo ${model} inexistente`)
    for (const [name, impl] of Object.entries({ ...generic, ...(models[model] ?? {}) })) {
      const original = delegate[name]
      delegate[name] = impl
      restore.push(() => { delegate[name] = original })
    }
  }
  const originalTx = (prisma as any).$transaction
  ;(prisma as any).$transaction = async (arg: any) => typeof arg === 'function' ? arg(prisma) : Promise.all(arg)
  restore.push(() => { (prisma as any).$transaction = originalTx })
  t.after(() => restore.forEach(fn => fn()))
  return prisma
}

function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) =>
    value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value)
}

/** Estado mínimo para que `ingestCall` llegue hasta los efectos del resultado. */
function ingestState(t: test.TestContext, lead: Record<string, unknown> = LEAD) {
  const state = { calls: [] as any[], leadUpdates: [] as any[], campaignUpdates: [] as any[], meetings: [] as any[], tasks: [] as any[], lead: { ...lead } }
  const stubs: Models = {
    lead: {
      findFirst: async () => state.lead,
      updateMany: async (q: any) => {
        const allowed = q.where.status?.in ?? (q.where.status ? [q.where.status] : null)
        if (allowed && !allowed.includes(state.lead.status)) return { count: 0 }
        state.lead = { ...state.lead, ...q.data }; state.leadUpdates.push(q.data); return { count: 1 }
      },
    },
    agent: { findFirst: async () => AGENT },
    campaign: { findFirst: async () => CAMPAIGN, updateMany: async (q: any) => { state.campaignUpdates.push(q.data); return { count: 1 } } },
    call: {
      findUnique: async (q: any) => state.calls.find(call => call.externalCallId === q.where.orgId_externalCallId?.externalCallId) ?? null,
      // Como Prisma: cada lectura devuelve un objeto nuevo, no la fila viva.
      findFirst: async (q: any) => { const row = state.calls.find(call => call.id === q.where.id); return row ? { ...row } : null },
      create: async (q: any) => { const row = { id: `call-${state.calls.length + 1}`, outcome: 'none', ...q.data }; state.calls.push(row); return { ...row } },
      update: async (q: any) => { const row = state.calls.find(call => call.id === q.where.id); Object.assign(row, q.data); return { ...row } },
    },
    conversation: { findUnique: async () => null, upsert: async () => ({ id: 'conv-1' }), update: async () => ({ id: 'conv-1' }) },
    meeting: {
      createMany: async (q: any) => { if (state.meetings.some(row => row.id === q.data.id)) return { count: 0 }; state.meetings.push({ ...q.data }); return { count: 1 } },
      findFirst: async (q: any) => state.meetings.find(meeting => matches(meeting, q.where)) ?? null,
      create: async (q: any) => { const row = { id: q.data.id ?? `meeting-${state.meetings.length + 1}`, status: 'scheduled', ...q.data }; state.meetings.push(row); return row },
      update: async (q: any) => { const row = state.meetings.find(meeting => meeting.id === q.where.id); Object.assign(row, q.data); return row },
      updateMany: async (q: any) => { const rows = state.meetings.filter(row => matches(row, q.where)); rows.forEach(row => Object.assign(row, q.data)); return { count: rows.length } },
    },
    callTask: {
      findFirst: async (q: any) => state.tasks.find(task => matches(task, q.where)) ?? null,
      create: async (q: any) => { const row = { id: `task-${state.tasks.length + 1}`, userId: null, done: false, ...q.data }; state.tasks.push(row); return row },
      deleteMany: async (q: any) => { const before = state.tasks.length; state.tasks = state.tasks.filter(row => !matches(row, q.where)); return { count: before - state.tasks.length } },
      updateMany: async (q: any) => { const row = state.tasks.find(task => task.id === q.where.id); if (row) Object.assign(row, q.data); return { count: row ? 1 : 0 } },
    },
  }
  return { state, ready: stubPrisma(t, stubs) }
}

const TURNS = [
  { role: 'agente', text: 'Hola, soy Carlos de Vendrava. ¿Hablo con Ana?', atMs: 0 },
  { role: 'user', text: 'Sí, dime.', atMs: 2600 },
  { role: 'assistant', text: 'Le llamo por la demo.', atMs: 4100 },
]

test('normalizeTranscriptTurns acepta los roles de cualquier pipeline y descarta lo malformado', async () => {
  const { normalizeTranscriptTurns } = await import('../services/calls.service')
  const turns = normalizeTranscriptTurns([...TURNS, { role: 'agente', text: '   ' }, { role: 'sistema', text: 'x' }, null, { role: 'prospecto', text: 'ok', atMs: -5 }])
  assert.deepEqual(turns?.map(turn => turn.role), ['agente', 'prospecto', 'agente', 'prospecto'])
  assert.equal(turns?.[1].atMs, 2600)
  assert.equal(turns?.[3].atMs, 0)
  assert.equal(normalizeTranscriptTurns('agente: hola'), null)
  assert.equal(normalizeTranscriptTurns([]), null)
})

test('summarizeCallMetrics combina duración, turnos y la media de cada métrica de la traza', async () => {
  const { summarizeCallMetrics } = await import('../services/calls.service')
  const metrics = summarizeCallMetrics({ durationSeconds: 61, transcriptTurns: TURNS, sentimentScore: 0.4 }, [
    { metric: 'turn_latency', value: 400, unit: 'ms' }, { metric: 'turn_latency', value: 600, unit: 'ms' }, { metric: 'barge_ins', value: 2, unit: null },
  ])
  assert.deepEqual(metrics, { durationSeconds: 61, agentTurns: 2, prospectTurns: 1, sentimentScore: 0.4, turn_latency: '500 ms', barge_ins: 2 })
})

test('ingestCall guarda turnos, resumen y fechas; reunión con fecha real y lead cualificado', async t => {
  const { state, ready } = ingestState(t)
  await ready
  const { ingestCall } = await import('../services/calls.service')
  const meetingAt = new Date(Date.now() + 2 * 24 * 3600_000).toISOString()
  const call = await ingestCall(ORG, {
    externalCallId: 'zadarma:11111111-2222-4333-8444-555555555555', telephonyProvider: 'zadarma', leadId: 'lead-1', agentId: 'agent-1', campaignId: 'camp-1',
    duration: 95, transcript: 'agente: Hola', transcriptTurns: TURNS, outcome: 'meeting_scheduled', summary: 'Ana acepta una demo el jueves.',
    sentiment: 'positive', meetingAt, highIntent: true, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
  })
  assert.equal(call.outcome, 'meeting_scheduled')
  assert.equal(call.summary, 'Ana acepta una demo el jueves.')
  assert.equal(call.sentiment, 'positive')
  assert.equal((call.transcriptTurns as any[]).length, 3)
  assert.equal((call.transcriptTurns as any[])[1].role, 'prospecto')
  assert.equal(new Date(call.meetingAt as Date).toISOString(), meetingAt)
  assert.equal(state.lead.status, 'qualified')
  assert.equal(state.meetings.length, 1)
  assert.equal(state.meetings[0].scheduledAt.toISOString(), meetingAt)
  assert.ok(state.meetings[0].title.includes('Ana Pérez'))
  assert.deepEqual(state.campaignUpdates, [{ contacted: { increment: 1 } }, { meetingsScheduled: { increment: 1 } }])
})

test('ingestCall sin fecha de reunión no inventa ninguna; la petición de llamada crea la tarea con dueAt', async t => {
  const { state, ready } = ingestState(t)
  await ready
  const { ingestCall } = await import('../services/calls.service')
  const first = await ingestCall(ORG, { externalCallId: 'zadarma:a', telephonyProvider: 'zadarma', leadId: 'lead-1', agentId: 'agent-1', duration: 40, transcriptTurns: TURNS, outcome: 'meeting_scheduled' })
  assert.equal(first.outcome, 'meeting_scheduled')
  assert.equal(state.meetings.length, 0, 'sin meetingAt no se crea reunión')
  const callbackAt = new Date(Date.now() + 3600_000).toISOString()
  const second = await ingestCall(ORG, { externalCallId: 'zadarma:b', telephonyProvider: 'zadarma', leadId: 'lead-1', agentId: 'agent-1', duration: 30, transcriptTurns: TURNS, outcome: 'callback_requested', callbackAt })
  assert.equal(second.outcome, 'callback_requested')
  assert.equal(state.tasks.length, 1)
  assert.equal(state.tasks[0].title, 'Volver a llamar')
  assert.equal(state.tasks[0].dueAt.toISOString(), callbackAt)
  // Reingesta idempotente: la misma llamada no duplica la tarea.
  await ingestCall(ORG, { externalCallId: 'zadarma:b', telephonyProvider: 'zadarma', leadId: 'lead-1', agentId: 'agent-1', duration: 30, outcome: 'callback_requested', callbackAt })
  assert.equal(state.tasks.length, 1)
})

test('pedir una persona cualifica al lead y abre una tarea prioritaria; "llámame después" solo lo marca contactado', async t => {
  const { state, ready } = ingestState(t)
  const prisma = await ready
  const favorites: any[] = []
  ;(prisma as any).call.updateMany = async (q: any) => { favorites.push(q); return { count: 1 } }
  const { ingestCall } = await import('../services/calls.service')
  const later = new Date(Date.now() + 3600_000).toISOString()
  await ingestCall(ORG, { externalCallId: 'zadarma:cb', telephonyProvider: 'zadarma', leadId: 'lead-1', agentId: 'agent-1', campaignId: 'camp-1', duration: 30, transcriptTurns: TURNS, outcome: 'callback_requested', callbackAt: later })
  assert.equal(state.lead.status, 'contacted')
  assert.equal(favorites.length, 0)
  const human = await ingestCall(ORG, { externalCallId: 'zadarma:hr', telephonyProvider: 'zadarma', leadId: 'lead-1', agentId: 'agent-1', campaignId: 'camp-1', duration: 45, transcriptTurns: TURNS, outcome: 'transferido' })
  assert.equal(human.outcome, 'human_requested', 'el alias del motor se normaliza')
  assert.equal(state.lead.status, 'qualified')
  const task = state.tasks.find(item => item.callId === human.id)
  assert.equal(task?.title, 'Devolver llamada (pide persona)')
  assert.ok(task?.dueAt instanceof Date && task.dueAt.getTime() <= Date.now(), 'se devuelve cuanto antes')
  assert.deepEqual(favorites[0].data, { isFavorite: true })
  assert.equal(favorites[0].where.id, human.id)
})

test('corregir una llamada antigua reaplica reunión y tarea pero no revierte el estado actual del lead', async t => {
  const { state, ready } = ingestState(t, { ...LEAD, status: 'qualified' })
  const prisma = await ready
  ;(prisma as any).auditLog.create = async (q: any) => q.data
  // findFirst sin `id` es la búsqueda de la llamada más reciente del lead.
  ;(prisma as any).call.findFirst = async (q: any) => {
    if (q.where.id) { const row = state.calls.find(call => call.id === q.where.id); return row ? { ...row } : null }
    const rows = state.calls.filter(call => call.leadId === q.where.leadId).sort((a, b) => b.startedAt - a.startedAt)
    return rows[0] ? { id: rows[0].id } : null
  }
  const { updateCallResult } = await import('../services/calls.service')
  const old = { id: 'call-old', orgId: ORG, leadId: 'lead-1', campaignId: 'camp-1', outcome: 'none', status: 'completed', summary: null, callbackAt: null, meetingAt: null, durationSeconds: 40, startedAt: new Date('2026-09-20T10:00:00Z') }
  const latest = { ...old, id: 'call-new', outcome: 'interested', startedAt: new Date('2026-09-23T10:00:00Z') }
  state.calls.push(old, latest)
  // La llamada antigua pasa a "no interesado": el lead sigue cualificado por la posterior.
  const corrected = await updateCallResult(ORG, 'call-old', { outcome: 'not_interested' }, { userId: 'u1' })
  assert.equal(corrected?.call.outcome, 'not_interested')
  assert.equal(corrected?.effects.leadStatus, null)
  assert.equal(state.lead.status, 'qualified')
  // Y a "pide persona": la tarea sí se crea aunque el estado del lead no cambie.
  const human = await updateCallResult(ORG, 'call-old', { outcome: 'human_requested' }, { userId: 'u1' })
  assert.equal(human?.effects.taskCreated, true)
  assert.equal(human?.effects.leadStatus, null)
  // Corregir la más reciente sí mueve el lead.
  const recent = await updateCallResult(ORG, 'call-new', { outcome: 'not_interested' }, { userId: 'u1' })
  assert.equal(recent?.effects.leadStatus, 'unqualified')
  assert.equal(state.lead.status, 'unqualified')
})

test('listLiveCalls solo devuelve llamadas sin endedAt: los intentos no_answer|busy|failed del despacho no están "en curso"', async t => {
  const prisma = await stubPrisma(t, {})
  let where: any
  ;(prisma as any).call.findMany = async (q: any) => { where = q.where; return [] }
  const { listLiveCalls } = await import('../services/calls.service')
  await listLiveCalls(ORG)
  assert.equal(where.orgId, ORG)
  assert.equal(where.endedAt, null)
  assert.deepEqual(where.status, { not: 'completed' })
})

test('buzón o no contesta: el lead sigue en new y la campaña no suma contactados', async t => {
  const { state, ready } = ingestState(t)
  await ready
  const { ingestCall } = await import('../services/calls.service')
  await ingestCall(ORG, { externalCallId: 'zadarma:vm', telephonyProvider: 'zadarma', leadId: 'lead-1', agentId: 'agent-1', campaignId: 'camp-1', duration: 12, outcome: 'voicemail', contactClassification: 'VOICEMAIL' })
  assert.equal(state.lead.status, 'new')
  assert.deepEqual(state.campaignUpdates, [])
  await ingestCall(ORG, { externalCallId: 'zadarma:ni', telephonyProvider: 'zadarma', leadId: 'lead-1', agentId: 'agent-1', campaignId: 'camp-1', duration: 50, transcriptTurns: TURNS, outcome: 'not_interested' })
  assert.equal(state.lead.status, 'unqualified')
  assert.deepEqual(state.campaignUpdates, [{ contacted: { increment: 1 } }])
})

test('updateCallResult reaplica los efectos, deja auditoría y rechaza resultados desconocidos', async t => {
  const { state, ready } = ingestState(t, { ...LEAD, status: 'contacted' })
  const prisma = await ready
  const audits: any[] = []
  ;(prisma as any).auditLog.create = async (q: any) => { audits.push(q.data); return q.data }
  const { updateCallResult, InvalidCallOutcomeError } = await import('../services/calls.service')
  state.calls.push({ id: 'call-9', orgId: ORG, leadId: 'lead-1', campaignId: 'camp-1', outcome: 'none', status: 'completed', summary: null, callbackAt: null, meetingAt: null, durationSeconds: 70 })
  assert.equal(await updateCallResult(ORG, 'missing', { outcome: 'interested' }, { userId: 'u1' }), null)
  await assert.rejects(updateCallResult(ORG, 'call-9', { outcome: 'demo_agendada_x' }, { userId: 'u1' }), InvalidCallOutcomeError)
  const meetingAt = new Date(Date.now() + 86_400_000).toISOString()
  const result = await updateCallResult(ORG, 'call-9', { outcome: 'reunion_agendada', meetingAt, summary: 'Corregido a mano', notes: 'Confirmado por teléfono' }, { userId: 'u1', name: 'Silvia' })
  assert.equal(result?.call.outcome, 'meeting_scheduled')
  assert.equal(result?.effects.leadStatus, 'qualified')
  assert.equal(result?.effects.meetingCreated, true)
  assert.equal(state.meetings[0].scheduledAt.toISOString(), meetingAt)
  assert.equal(audits.length, 1)
  assert.equal(audits[0].action, 'call.result.update')
  assert.equal(audits[0].actorUserId, 'u1')
  assert.equal(audits[0].before.outcome, 'none')
  assert.equal(audits[0].after.outcome, 'meeting_scheduled')
  // Cambiar solo la fecha de una reunión ya agendada la mueve sin crear otra.
  const later = new Date(Date.now() + 2 * 86_400_000).toISOString()
  const moved = await updateCallResult(ORG, 'call-9', { meetingAt: later }, { userId: 'u1' })
  assert.equal(moved?.effects.meetingCreated, false)
  assert.equal(state.meetings.length, 1)
  assert.equal(state.meetings[0].scheduledAt.toISOString(), later)
})

test('getCall expone la evaluación, las métricas y los turnos normalizados', async t => {
  const prisma = await stubPrisma(t, {})
  ;(prisma as any).call.findFirst = async () => ({
    id: 'call-1', orgId: ORG, durationSeconds: 80, sentimentScore: 0.2, transcriptTurns: TURNS, lead: LEAD, agent: AGENT, campaign: null, meetings: [],
    voiceEvaluation: { status: 'completed', overall: 81, dimensions: { greeting: 100 }, criticalErrors: [], trainingTag: 'needs_review', judgeModel: 'heuristic', rubricVersion: '1', updatedAt: new Date() },
    voiceMetrics: [{ metric: 'turn_latency', value: 520, unit: 'ms' }],
  })
  const { getCall } = await import('../services/calls.service')
  const call = await getCall(ORG, 'call-1')
  assert.ok(call)
  assert.equal(call.evaluation?.approved, true)
  assert.equal(call.transcriptTurns.length, 3)
  assert.equal(call.metrics.turn_latency, '520 ms')
  assert.equal(call.metrics.prospectTurns, 1)
  assert.ok(!('voiceEvaluation' in call))
})


test('corrections cancel and restore only automatic meetings and balance the campaign counter', async t => {
  const { state, ready } = ingestState(t)
  await ready
  const { updateCallResult } = await import('../services/calls.service')
  state.calls.push({ id: 'corrected', orgId: ORG, leadId: LEAD.id, campaignId: 'camp-1', outcome: 'none', status: 'completed', callbackAt: null, meetingAt: null })
  const date = new Date(Date.now() + 86400_000).toISOString()
  await updateCallResult(ORG, 'corrected', { outcome: 'meeting_scheduled', meetingAt: date }, { userId: 'u1' })
  const automatic = state.meetings[0]
  state.meetings.push({ id: 'manual', orgId: ORG, callId: 'corrected', status: 'scheduled' })
  await updateCallResult(ORG, 'corrected', { outcome: 'not_interested' }, { userId: 'u1' })
  await updateCallResult(ORG, 'corrected', { outcome: 'not_interested' }, { userId: 'u1' })
  assert.equal(automatic.status, 'cancelled')
  assert.equal(state.meetings[1].status, 'scheduled', 'manual meeting preserved')
  assert.deepEqual(state.campaignUpdates.map(row => row.meetingsScheduled), [{ increment: 1 }, { decrement: 1 }])
  await updateCallResult(ORG, 'corrected', { outcome: 'meeting_scheduled', meetingAt: date }, { userId: 'u1' })
  assert.equal(automatic.status, 'scheduled')
  assert.equal(state.meetings.length, 2, 'restore without duplication')
  await updateCallResult(ORG, 'corrected', { meetingAt: null }, { userId: 'u1' })
  assert.equal(automatic.status, 'cancelled', 'clearing the date removes the scheduled meeting')
  assert.deepEqual(state.campaignUpdates.map(row => row.meetingsScheduled), [{ increment: 1 }, { decrement: 1 }, { increment: 1 }, { decrement: 1 }])
})

test('corrections remove obsolete pending tasks, clear callback dates and preserve authored/completed work', async t => {
  const { state, ready } = ingestState(t)
  await ready
  const { updateCallResult } = await import('../services/calls.service')
  state.calls.push({ id: 'corrected', orgId: ORG, leadId: LEAD.id, outcome: 'none', callbackAt: null, meetingAt: null })
  const date = new Date(Date.now() + 86400_000).toISOString()
  await updateCallResult(ORG, 'corrected', { outcome: 'callback_requested', callbackAt: date }, { userId: 'u1' })
  assert.equal(state.tasks[0].dueAt.toISOString(), date)
  await updateCallResult(ORG, 'corrected', { callbackAt: null }, { userId: 'u1' })
  assert.equal(state.tasks[0].dueAt, null)
  state.tasks.push(
    { id: 'manual', orgId: ORG, callId: 'corrected', title: 'Volver a llamar', userId: 'u1', done: false },
    { id: 'completed', orgId: ORG, callId: 'corrected', title: 'Volver a llamar', userId: null, done: true },
  )
  await updateCallResult(ORG, 'corrected', { outcome: 'human_requested' }, { userId: 'u1' })
  assert.equal(state.tasks.length, 3)
  assert.equal(state.tasks.filter(task => task.title === 'Devolver llamada (pide persona)').length, 1)
  await updateCallResult(ORG, 'corrected', { outcome: 'not_interested' }, { userId: 'u1' })
  assert.deepEqual(state.tasks.map(task => task.id), ['manual', 'completed'])
})

test('completed meetings and meetings cancelled by a person are not reopened by corrections', async t => {
  const { state, ready } = ingestState(t)
  await ready
  const { applyCallOutcomeEffects } = await import('../services/calls.service')
  for (const status of ['completed', 'cancelled']) {
    state.meetings = [{ id: 'auto-call-preserve', orgId: ORG, callId: 'preserve', status, outcome: null }]
    await applyCallOutcomeEffects(ORG, { callId: 'preserve', leadId: LEAD.id, campaignId: 'camp-1', outcome: 'meeting_scheduled', meetingAt: new Date() })
    assert.equal(state.meetings[0].status, status)
  }
  assert.equal(state.campaignUpdates.length, 0)
})
