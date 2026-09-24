import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:9/lead_call_dispatch_offline'
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
process.env.REDIS_ENABLED = 'false'
process.env.WORKER_QUEUE_BACKEND = 'postgres'
process.env.ZADARMA_GATEWAY_ENABLED = 'true'
process.env.ZADARMA_ORG_ID = 'org-calls'
process.env.ZADARMA_GATEWAY_TOKEN = 'offline-gateway-token-'.repeat(3)
process.env.ZADARMA_GATEWAY_URL = 'http://127.0.0.1:9093'
// Horario legal abierto todo el día: el test no depende de la hora a la que corra.
process.env.CALL_HOUR_START = '0'
process.env.CALL_HOUR_END = '24'

const ORG = 'org-calls'
const AGENT = { id: 'agent-1', orgId: ORG, isActive: true, lifecycleStatus: 'active', voiceId: 'voice-1', systemPrompt: 'Hola', phoneNumber: '+34919931802', callDirection: 'outbound' }
const CAMPAIGN = { id: 'camp-1', orgId: ORG, status: 'active', agent: AGENT }

function makeLead(overrides: Record<string, unknown> = {}) {
  return { id: 'lead-1', orgId: ORG, phone: '+525512345678', company: 'Acme', attempts: 0, campaignId: 'camp-1', campaign: CAMPAIGN, customFields: {}, ...overrides }
}

type Stub = Record<string, (...args: any[]) => any>

async function stubPrisma(t: test.TestContext, models: Record<string, Stub>) {
  const { prisma } = await import('../lib/prisma')
  const restore: Array<() => void> = []
  for (const [model, methods] of Object.entries(models)) {
    const delegate = (prisma as any)[model]
    for (const [name, impl] of Object.entries(methods)) {
      const original = delegate[name]
      delegate[name] = impl
      restore.push(() => { delegate[name] = original })
    }
  }
  t.after(() => restore.forEach(fn => fn()))
  return prisma
}

/** Estado mínimo de base de datos para que el despacho llegue hasta la pasarela. */
function dialReadyState(t: test.TestContext, options: { lead?: Record<string, unknown>; consents?: unknown[] } = {}) {
  const state = {
    lead: makeLead(options.lead),
    leadUpdates: [] as any[],
    calls: [] as any[],
    audits: [] as any[],
    activities: [] as any[],
    queued: [] as any[],
  }
  const stubs = {
    lead: {
      findFirst: async (query: any) => query.select?.customFields ? { customFields: state.lead.customFields } : state.lead,
      update: async (query: any) => { state.leadUpdates.push(query.data); return state.lead },
    },
    call: {
      count: async () => 0,
      aggregate: async () => ({ _sum: { durationSeconds: 0 } }),
      create: async (query: any) => { const row = { id: `call-${state.calls.length + 1}`, ...query.data }; state.calls.push(row); return row },
      findUniqueOrThrow: async () => state.calls[0],
    },
    consentGrant: { findMany: async () => options.consents ?? [{ scope: { agentIds: [AGENT.id] }, status: 'active', revokedAt: null, expiresAt: null }] },
    organization: { findUnique: async () => ({ plan: 'enterprise' }) },
    optOut: { findUnique: async () => null },
    contactConsent: { findFirst: async () => ({ status: 'granted', expiresAt: null }) },
    agencyClient: { findUnique: async () => null },
    whiteLabelUsage: { findUnique: async () => null },
    auditLog: { create: async (query: any) => { state.audits.push(query.data); return query.data } },
    salesActivity: { upsert: async (query: any) => { state.activities.push(query.create); return query.create }, create: async (query: any) => { state.activities.push(query.data); return query.data } },
    workerQueueJob: { create: async (query: any) => { state.queued.push(query.data); return query.data } },
  }
  return { state, ready: stubPrisma(t, stubs) }
}

function gatewayResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockGateway(t: test.TestContext, respond: (body: any) => Response | Promise<Response>) {
  const requests: any[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(String(init.body))
    requests.push(body)
    return respond(body)
  }) as typeof fetch
  t.after(() => { globalThis.fetch = original })
  return requests
}

test('attempts only count once the gateway confirms the dial, with a stable requestId per job', async t => {
  const { state, ready } = dialReadyState(t)
  await ready
  const requests = mockGateway(t, () => gatewayResponse(200, { status: 'iniciada', sid: 'zadarma:abc', to: '+525512345678' }))
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')
  const { stableRequestId } = await import('../voice/telephony/outbound')

  await processLeadCallJob({ orgId: ORG, leadId: 'lead-1' }, { jobId: 'job-7' })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].requestId, stableRequestId('lead-call', ORG, 'lead-1', 'camp-1', 'job-7'))
  assert.match(requests[0].requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(requests[0].campaignId, 'camp-1')
  assert.deepEqual(state.leadUpdates, [{ attempts: { increment: 1 }, lastAttemptAt: state.leadUpdates[0].lastAttemptAt }])
  assert.equal(state.calls.length, 0)
})

test('gateway capacity requeues the same job after 20-30 s without spending an attempt or recording a block', async t => {
  const { state, ready } = dialReadyState(t)
  await ready
  mockGateway(t, () => gatewayResponse(429, { error: 'ZADARMA_CAPACITY_REACHED', code: 'ZADARMA_CAPACITY_REACHED', retryable: true, dialed: false, retryAfterMs: 25_000 }))
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')
  const { isQueueRetryError } = await import('../lib/databaseQueue')

  let thrown: unknown
  try { await processLeadCallJob({ orgId: ORG, leadId: 'lead-1' }, { jobId: 'job-8' }) } catch (error) { thrown = error }
  assert.ok(isQueueRetryError(thrown), 'capacity must ask the queue for a delayed retry')
  assert.equal((thrown as any).code, 'ZADARMA_CAPACITY_REACHED')
  assert.equal((thrown as any).countAttempt, false)
  assert.equal((thrown as any).delayMs, 25_000)
  assert.equal(state.leadUpdates.length, 0, 'no attempt spent')
  assert.equal(state.calls.length, 0)
  assert.equal(state.audits.length, 0, 'capacity is not a lead block')
})

test('an unanswered originate creates a minimal Call, spends the attempt and reschedules 15-30 minutes later', async t => {
  const { state, ready } = dialReadyState(t, { lead: { attempts: 1 } })
  await ready
  mockGateway(t, () => gatewayResponse(409, { error: 'ORIGINATE_REJECTED', code: 'ORIGINATE_REJECTED', retryable: false, dialed: true, cause: 'no_answer' }))
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')

  await processLeadCallJob({ orgId: ORG, leadId: 'lead-1' }, { jobId: 'job-9' })
  assert.equal(state.calls.length, 1)
  assert.equal(state.calls[0].status, 'no_answer')
  assert.equal(state.calls[0].outcome, 'none')
  assert.equal(state.calls[0].leadId, 'lead-1')
  assert.equal(state.calls[0].campaignId, 'camp-1')
  assert.match(state.calls[0].externalCallId, /^zadarma:attempt:/)
  assert.deepEqual(state.leadUpdates[0].attempts, { increment: 1 })
  assert.equal(state.queued.length, 1)
  assert.equal(state.queued[0].kind, 'call-retry')
  assert.equal(state.queued[0].dedupeKey, 'retry:org-calls:lead-1:2')
  const delay = new Date(state.queued[0].availableAt).getTime() - Date.now()
  assert.ok(delay >= 29 * 60_000 && delay <= 31 * 60_000, `second attempt retries in ~30 min, got ${Math.round(delay / 60_000)} min`)
  assert.ok(state.activities.some(item => item.type === 'call' && item.metadata?.status === 'no_answer'))
})

test('busy maps to a busy Call and the last allowed attempt is not rescheduled', async t => {
  const { state, ready } = dialReadyState(t, { lead: { attempts: 2 } })
  await ready
  mockGateway(t, () => gatewayResponse(409, { error: 'ORIGINATE_REJECTED', code: 'ORIGINATE_REJECTED', retryable: false, dialed: true, cause: 'busy' }))
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')
  await processLeadCallJob({ orgId: ORG, leadId: 'lead-1' }, { jobId: 'job-10' })
  assert.equal(state.calls[0].status, 'busy')
  assert.equal(state.queued.length, 0, 'MAX_CALL_ATTEMPTS reached: no further retry')
})

test('a compliance block is persisted on the lead, audited and shown in the timeline without touching attempts', async t => {
  const { state, ready } = dialReadyState(t)
  await ready
  const prisma = await ready
  ;(prisma as any).optOut.findUnique = async () => ({ phone: '+525512345678' })
  const requests = mockGateway(t, () => { throw new Error('must not dial') })
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')

  await processLeadCallJob({ orgId: ORG, leadId: 'lead-1' }, { jobId: 'job-11' })
  assert.equal(requests.length, 0)
  assert.equal(state.leadUpdates.length, 1)
  assert.equal(state.leadUpdates[0].attempts, undefined)
  assert.equal(state.leadUpdates[0].customFields.lastCallBlock.reason, 'optout')
  assert.ok(state.leadUpdates[0].customFields.lastCallBlock.at)
  assert.equal(state.audits[0].action, 'lead.call_blocked')
  assert.equal(state.audits[0].entityId, 'lead-1')
  assert.equal(state.audits[0].correlationId, 'job-11')
  assert.equal(state.activities[0].source, 'call-dispatch')
  assert.equal(state.activities[0].metadata.reason, 'optout')
})

test('an agent without a current voice consent is not dialed', async t => {
  const { state, ready } = dialReadyState(t, { consents: [{ scope: { agentIds: [AGENT.id] }, status: 'active', revokedAt: null, expiresAt: new Date(Date.now() - 1000) }] })
  await ready
  const requests = mockGateway(t, () => { throw new Error('must not dial') })
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')
  await processLeadCallJob({ orgId: ORG, leadId: 'lead-1' }, { jobId: 'job-12' })
  assert.equal(requests.length, 0)
  assert.equal(state.leadUpdates[0].customFields.lastCallBlock.reason, 'agent_voice_consent_missing')
  assert.equal(state.leadUpdates[0].attempts, undefined)
})

test('outside legal hours the block is recorded and the job is requeued for the next window without an attempt', async t => {
  const { state, ready } = dialReadyState(t, { lead: { phone: '+34600000000', customFields: { callTimeZone: 'Europe/Madrid' } } })
  await ready
  mockGateway(t, () => { throw new Error('must not dial') })
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')
  const { isQueueRetryError } = await import('../lib/databaseQueue')
  const compliance = await import('../voice/compliance')
  // Se fuerza «fuera de horario» buscando un instante de fin de semana en Madrid
  // (el horario abierto por env no anula la regla de sábado/domingo para +34).
  const saturday = new Date()
  while (new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' }).format(saturday) !== 'Sat') saturday.setTime(saturday.getTime() + 24 * 3600_000)
  saturday.setUTCHours(10, 0, 0, 0)
  assert.equal(compliance.withinLegalHours('+34600000000', saturday, 'Europe/Madrid'), false)
  const originalNow = Date.now
  Date.now = () => saturday.getTime()
  const OriginalDate = Date
  ;(globalThis as any).Date = class extends OriginalDate {
    constructor(...args: any[]) { if (args.length) super(...(args as [number])); else super(saturday.getTime()) }
    static now() { return saturday.getTime() }
  }
  t.after(() => { (globalThis as any).Date = OriginalDate; Date.now = originalNow })

  let thrown: unknown
  try { await processLeadCallJob({ orgId: ORG, leadId: 'lead-1' }, { jobId: 'job-13' }) } catch (error) { thrown = error }
  assert.ok(isQueueRetryError(thrown), 'outside hours must reschedule')
  assert.equal((thrown as any).code, 'CALL_OUTSIDE_HOURS')
  assert.equal((thrown as any).countAttempt, false)
  assert.ok((thrown as any).delayMs > 0)
  const next = new OriginalDate(saturday.getTime() + (thrown as any).delayMs)
  assert.equal(compliance.withinLegalHours('+34600000000', next, 'Europe/Madrid'), true)
  assert.equal(state.leadUpdates[0].customFields.lastCallBlock.reason, 'outside_hours')
})

test('a typed pre-dial rejection from the gateway is persisted with its real code and does not spend an attempt', async t => {
  const { state, ready } = dialReadyState(t)
  await ready
  mockGateway(t, () => gatewayResponse(422, { error: 'ZADARMA_PHONE_MISMATCH', code: 'ZADARMA_PHONE_MISMATCH', retryable: false, dialed: false }))
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')
  await processLeadCallJob({ orgId: ORG, leadId: 'lead-1' }, { jobId: 'job-14' })
  assert.equal(state.leadUpdates.length, 1)
  assert.equal(state.leadUpdates[0].customFields.lastCallBlock.reason, 'gateway_rejected')
  assert.equal(state.leadUpdates[0].customFields.lastCallBlock.detail, 'ZADARMA_PHONE_MISMATCH')
  assert.equal(state.calls.length, 0)
})

test('outbound client surfaces the gateway error code, retry hint and cause', async t => {
  mockGateway(t, () => gatewayResponse(409, { error: 'ORIGINATE_REJECTED', code: 'ORIGINATE_REJECTED', retryable: false, dialed: true, cause: 'busy' }))
  const { startOutboundCall, isZadarmaGatewayCallError } = await import('../voice/telephony/outbound')
  let thrown: unknown
  try { await startOutboundCall({ toNumber: '+525512345678', orgId: ORG, campaignId: 'camp-1', agentId: AGENT.id, leadId: 'lead-1', requestId: '11111111-2222-5333-8444-555555555555' }) } catch (error) { thrown = error }
  assert.ok(isZadarmaGatewayCallError(thrown))
  assert.equal(thrown.code, 'ORIGINATE_REJECTED')
  assert.equal(thrown.status, 409)
  assert.equal(thrown.dialed, true)
  assert.equal(thrown.cause, 'busy')
})

test('agent operational limits block the dial, persist the reason and wait for the next window without an attempt', async t => {
  const limitedAgent = { ...AGENT, settings: { operationalLimits: { maxCallsPerDay: 1, timezone: 'Europe/Madrid' } } }
  const { state, ready } = dialReadyState(t, { lead: { campaign: { ...CAMPAIGN, agent: limitedAgent } } })
  const prisma = await ready
  ;(prisma as any).call.count = async () => 1
  const requests = mockGateway(t, () => { throw new Error('must not dial') })
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')
  const { isQueueRetryError } = await import('../lib/databaseQueue')
  let thrown: unknown
  try { await processLeadCallJob({ orgId: ORG, leadId: 'lead-1' }, { jobId: 'job-15' }) } catch (error) { thrown = error }
  assert.equal(requests.length, 0)
  assert.ok(isQueueRetryError(thrown))
  assert.equal((thrown as any).code, 'CALL_AGENT_LIMITS')
  assert.equal((thrown as any).countAttempt, false)
  assert.ok((thrown as any).delayMs > 0 && (thrown as any).delayMs <= 8 * 24 * 3600_000)
  assert.equal(state.leadUpdates[0].customFields.lastCallBlock.reason, 'agent_limits')
  assert.equal(state.leadUpdates[0].customFields.lastCallBlock.detail, 'daily_limit')
  assert.equal(state.leadUpdates[0].attempts, undefined)
})
