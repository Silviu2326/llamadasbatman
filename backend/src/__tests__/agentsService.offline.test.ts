// Readiness, publicación, ciclo de vida y límites operativos del agente sin
// base de datos: se sustituyen los delegados de Prisma por una memoria
// mínima y el catálogo de voces por un `fetch` simulado.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/agents_offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import assert from 'node:assert/strict'
import test from 'node:test'

const ORG = 'org-1'
const PUBLIC_VOICE = 'a'.repeat(32)
const PRIVATE_VOICE = 'b'.repeat(32)
const FOREIGN_VOICE = 'c'.repeat(32)
const CALLER_ID = '+34919931802'

function stub(t: any, target: any, key: string, impl: unknown) {
  const original = target[key]
  target[key] = impl
  t.after(() => { target[key] = original })
}

function env(t: any, values: Record<string, string | undefined>) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
}

type Memory = ReturnType<typeof makeMemory>

function makeMemory(agentOverrides: Record<string, unknown> = {}) {
  const agent: Record<string, any> = {
    id: 'agent-1', orgId: ORG, name: 'Carlos', role: 'Ventas', description: null, agentType: 'sales', callDirection: 'both',
    personality: null, voiceId: PUBLIC_VOICE, systemPrompt: 'Preséntate y agenda una reunión.', language: 'es', isActive: true,
    phoneNumber: CALLER_ID, lifecycleStatus: 'draft', monthlyMinuteLimit: null, settings: { strategyId: 'permission_diagnosis' },
    createdAt: new Date('2026-09-01T10:00:00Z'), updatedAt: new Date('2026-09-01T10:00:00Z'), ...agentOverrides,
  }
  const versions: any[] = [{ id: 'v1', orgId: ORG, agentId: 'agent-1', version: 1, createdAt: new Date('2026-09-01T10:00:00Z'), changedFields: ['name', 'voiceId', 'systemPrompt', 'settings'], snapshot: { ...agent }, actorUserId: null, actor: null }]
  const calls: any[] = []
  const consents: any[] = [{ id: 'consent-1', orgId: ORG, kind: 'voice', status: 'active', revokedAt: null, expiresAt: null, subjectName: 'Isa', scope: { agentIds: ['agent-1'] }, grantedAt: new Date(), createdAt: new Date() }]
  const jobs: any[] = [{ id: 'job-1', orgId: ORG, kind: 'agent.voice.create', status: 'succeeded', output: { id: PRIVATE_VOICE, name: 'Isa' } }]
  const audits: any[] = []
  return { agent, versions, calls, consents, jobs, audits }
}

async function wire(t: any, memory: Memory) {
  const { prisma } = await import('../lib/prisma')
  const matchesOrg = (where: any) => !where?.orgId || where.orgId === memory.agent.orgId
  stub(t, prisma.agent, 'findFirst', async ({ where }: any) => (where.id === memory.agent.id || !where.id) && matchesOrg(where) ? { ...memory.agent } : null)
  stub(t, prisma.agent, 'update', async ({ data }: any) => { Object.assign(memory.agent, data); return { ...memory.agent } })
  stub(t, prisma.agent, 'updateMany', async ({ data }: any) => { Object.assign(memory.agent, data); return { count: 1 } })
  stub(t, prisma.agentVersion, 'findFirst', async ({ where }: any) => {
    if (where.id) return memory.versions.find(version => version.id === where.id && version.agentId === where.agentId && version.orgId === where.orgId) ?? null
    return [...memory.versions].sort((a, b) => b.version - a.version)[0] ?? null
  })
  stub(t, prisma.agentVersion, 'findMany', async () => [...memory.versions].sort((a, b) => b.version - a.version))
  stub(t, prisma.agentVersion, 'create', async ({ data }: any) => { const version = { ...data, id: `v${data.version}`, createdAt: new Date(), actor: null }; memory.versions.push(version); return version })
  stub(t, prisma.auditLog, 'create', async ({ data }: any) => { memory.audits.push(data); return data })
  stub(t, prisma.campaign, 'findMany', async () => [])
  stub(t, prisma.call, 'findMany', async () => [...memory.calls].sort((a, b) => b.createdAt - a.createdAt))
  stub(t, prisma.call, 'count', async () => 0)
  stub(t, prisma.consentGrant, 'findMany', async ({ where }: any) => matchesOrg(where) ? memory.consents : [])
  stub(t, prisma.consentGrant, 'update', async ({ where, data }: any) => { const consent = memory.consents.find(item => item.id === where.id); Object.assign(consent, data); return consent })
  stub(t, prisma.consentGrant, 'create', async ({ data }: any) => { const consent = { id: `consent-${memory.consents.length + 1}`, revokedAt: null, expiresAt: null, status: 'active', createdAt: new Date(), ...data }; memory.consents.push(consent); return consent })
  stub(t, prisma.voiceCallEvent, 'findMany', async () => [])
  stub(t, prisma.voiceTestNumber, 'findMany', async () => [{ id: 'number-1', phone: '+34683529629', label: 'Móvil', attestation: 'Es mi móvil personal y autorizo la prueba.', leadId: 'lead-t', revokedAt: null, createdAt: new Date() }])
  stub(t, prisma.opportunity, 'findMany', async () => [])
  stub(t, prisma.job, 'findFirst', async ({ where }: any) => memory.jobs.find(job => job.orgId === where.orgId && job.kind === where.kind && job.status === where.status && job.output?.id === where.output?.equals) ?? null)
  stub(t, prisma, '$transaction', async (operations: any) => Array.isArray(operations) ? Promise.all(operations) : operations(prisma))
  // Catálogo de Fish Audio: solo PUBLIC_VOICE es pública; FOREIGN_VOICE es privada de otra cuenta.
  env(t, { FISH_API_KEY: 'test-key', CEREBRAS_API_KEY: 'x', DEEPGRAM_API_KEY: 'x', ZADARMA_CALLER_ID: CALLER_ID })
  t.mock.method(globalThis, 'fetch', async (url: any) => {
    const id = String(url).split('/').pop()
    if (id === PUBLIC_VOICE) return Response.json({ _id: id, title: 'Makoto', visibility: 'public', type: 'tts', state: 'trained', languages: ['es'], tags: [], author: { nickname: 'Fish' }, licensed: true })
    if (id === FOREIGN_VOICE) return Response.json({ _id: id, title: 'Ajena', visibility: 'private', type: 'tts', state: 'trained' })
    return new Response('not found', { status: 404 })
  })
  return import('../services/agents.service')
}

function evaluatedCall(id: string, createdAt: Date, overall: number, extra: Record<string, unknown> = {}) {
  return { id, status: 'completed', durationSeconds: 60, outcome: 'meeting_scheduled', transcript: '', createdAt, leadId: 'lead-t', campaignId: null, isTest: true, meetings: [], voiceEvaluation: { status: 'completed', overall, criticalErrors: [], dimensions: {} }, ...extra }
}

test('readiness: todos los checks y la prueba ligada a la versión', async t => {
  const memory = makeMemory()
  const service = await wire(t, memory)
  const keys = (workspace: any) => Object.fromEntries(workspace.readiness.checks.map((check: any) => [check.key, check.ready]))

  let workspace = await service.getAgentWorkspace(ORG, 'agent-1')
  assert.deepEqual(keys(workspace), { voice: true, instructions: true, phone: true, outboundNumber: true, runtimeCredentials: true, consent: true, test: false })
  assert.equal(workspace!.readiness.ready, false)
  assert.match(workspace!.readiness.checks.find(check => check.key === 'test')!.detail, /Todavía no hay/)

  // Una prueba evaluada después de la última versión relevante cuenta.
  memory.calls.push(evaluatedCall('call-1', new Date('2026-09-02T10:00:00Z'), 90))
  workspace = await service.getAgentWorkspace(ORG, 'agent-1')
  assert.equal(keys(workspace).test, true)
  assert.equal(workspace!.readiness.ready, true)
  assert.equal(workspace!.latestEvaluation?.callId, 'call-1')

  // Cambiar el guion después de la prueba la invalida y el detalle lo explica.
  await service.updateAgent(ORG, 'agent-1', { systemPrompt: 'Nuevo guion.' }, 'user-1')
  workspace = await service.getAgentWorkspace(ORG, 'agent-1')
  assert.equal(keys(workspace).test, false)
  assert.equal(workspace!.latestEvaluation, null)
  assert.equal(workspace!.staleEvaluation?.callId, 'call-1')
  assert.match(workspace!.readiness.checks.find(check => check.key === 'test')!.detail, /anterior a los cambios/)

  // Un cambio de settings que no toca estrategia ni playbook no invalida nada.
  const tick = () => new Promise(resolve => setTimeout(resolve, 5))
  await tick()
  memory.calls.push(evaluatedCall('call-2', new Date(), 80))
  await tick()
  await service.updateAgent(ORG, 'agent-1', { settings: { ...memory.agent.settings, keyMessages: 'Nada nuevo' } }, 'user-1')
  workspace = await service.getAgentWorkspace(ORG, 'agent-1')
  assert.equal(keys(workspace).test, true)
  // Cambiar la estrategia sí.
  await service.updateAgent(ORG, 'agent-1', { settings: { ...memory.agent.settings, strategyId: 'warm_reactivation' } }, 'user-1')
  workspace = await service.getAgentWorkspace(ORG, 'agent-1')
  assert.equal(keys(workspace).test, false)

  // Una nota baja o errores críticos no aprueban; una llamada sin campaña ni prueba no cuenta.
  memory.calls.push(evaluatedCall('call-3', new Date(Date.now() + 2000), 60))
  workspace = await service.getAgentWorkspace(ORG, 'agent-1')
  assert.equal(keys(workspace).test, false)
  assert.match(workspace!.readiness.checks.find(check => check.key === 'test')!.detail, /60\/100/)
  memory.calls.push(evaluatedCall('call-4', new Date(Date.now() + 3000), 95, { isTest: false, campaignId: null }))
  workspace = await service.getAgentWorkspace(ORG, 'agent-1')
  assert.equal(workspace!.latestEvaluation?.callId, 'call-3')
  memory.calls.push(evaluatedCall('call-5', new Date(Date.now() + 4000), 95, { isTest: false, campaignId: 'camp-1' }))
  workspace = await service.getAgentWorkspace(ORG, 'agent-1')
  assert.equal(keys(workspace).test, true)
})

test('readiness: número de salida y credenciales del runtime', async t => {
  const memory = makeMemory({ phoneNumber: '+34600000000', settings: { runtime: { primaryLlm: { provider: 'groq', model: 'llama' } } } })
  const service = await wire(t, memory)
  env(t, { GROQ_API_KEY: undefined })
  const workspace = await service.getAgentWorkspace(ORG, 'agent-1')
  const check = (key: string) => workspace!.readiness.checks.find(item => item.key === key)!
  assert.equal(check('outboundNumber').ready, false)
  assert.match(check('outboundNumber').detail, /\+34919931802/)
  assert.equal(check('runtimeCredentials').ready, false)
  assert.match(check('runtimeCredentials').detail, /GROQ_API_KEY/)
  assert.equal(workspace!.testCall.blockers.some((item: string) => /pasarela/.test(item)), true)

  // Sin número configurado en el entorno el check es informativo y no bloquea.
  env(t, { ZADARMA_CALLER_ID: undefined, GROQ_API_KEY: 'x' })
  const relaxed = await service.getAgentWorkspace(ORG, 'agent-1')
  const outbound = relaxed!.readiness.checks.find(item => item.key === 'outboundNumber')!
  assert.equal(outbound.ready, true)
  assert.equal(outbound.informative, true)
  assert.equal(relaxed!.readiness.checks.find(item => item.key === 'runtimeCredentials')!.ready, true)
})

test('publish bloquea con los checks pendientes y solo publica con todo listo', async t => {
  const memory = makeMemory()
  const service = await wire(t, memory)
  const blocked = await service.publishAgent(ORG, 'agent-1', 'user-1')
  assert.equal(blocked.status, 'blocked')
  assert.deepEqual((blocked as any).blockers.map((item: any) => item.key), ['test'])
  assert.equal(memory.agent.lifecycleStatus, 'draft')

  memory.calls.push(evaluatedCall('call-1', new Date(), 88))
  const published = await service.publishAgent(ORG, 'agent-1', 'user-1')
  assert.equal(published.status, 'published')
  assert.equal(memory.agent.lifecycleStatus, 'active')
  assert.equal(memory.agent.isActive, true)
  assert.equal(memory.audits.at(-1).action, 'agent.publish')
})

test('PUT no cambia el ciclo de vida y un PUT parcial no borra el número', async t => {
  const memory = makeMemory()
  const service = await wire(t, memory)
  await service.updateAgent(ORG, 'agent-1', { lifecycleStatus: 'active', isActive: true, name: 'Carlos 2' } as any, 'user-1')
  assert.equal(memory.agent.lifecycleStatus, 'draft')
  assert.equal(memory.agent.name, 'Carlos 2')
  await service.updateAgent(ORG, 'agent-1', { description: 'Solo la descripción' }, 'user-1')
  assert.equal(memory.agent.phoneNumber, CALLER_ID)
  await service.updateAgent(ORG, 'agent-1', { phoneNumber: '' }, 'user-1')
  assert.equal(memory.agent.phoneNumber, null)
  await service.updateAgent(ORG, 'agent-1', { phoneNumber: CALLER_ID }, 'user-1')
  assert.equal(memory.agent.phoneNumber, CALLER_ID)
})

test('pausar solo desde active; reanudar vuelve a draft salvo readiness completo', async t => {
  const memory = makeMemory()
  const service = await wire(t, memory)
  assert.equal((await service.pauseAgent(ORG, 'agent-1')).status, 'invalid_state')
  memory.agent.lifecycleStatus = 'active'
  assert.equal((await service.pauseAgent(ORG, 'agent-1')).status, 'paused')
  assert.equal(memory.agent.isActive, false)
  assert.equal((await service.pauseAgent(ORG, 'agent-1')).status, 'invalid_state')

  const resumed = await service.resumeAgent(ORG, 'agent-1')
  assert.equal(resumed.status, 'resumed')
  assert.equal((resumed as any).lifecycleStatus, 'draft')
  assert.equal(memory.agent.isActive, true)
  assert.equal((await service.resumeAgent(ORG, 'agent-1')).status, 'invalid_state')

  memory.agent.lifecycleStatus = 'paused'; memory.agent.isActive = false
  memory.calls.push(evaluatedCall('call-1', new Date(), 90))
  const direct = await service.resumeAgent(ORG, 'agent-1')
  assert.equal((direct as any).lifecycleStatus, 'active')
})

test('restaurar una versión no reactiva el agente y sin consentimiento de la voz lo deja en borrador', async t => {
  const memory = makeMemory({ lifecycleStatus: 'paused', isActive: false })
  const service = await wire(t, memory)
  memory.versions.push({ id: 'v0', orgId: ORG, agentId: 'agent-1', version: 0, createdAt: new Date('2026-08-01T10:00:00Z'), changedFields: ['name'], snapshot: { ...memory.agent, name: 'Antiguo', lifecycleStatus: 'active', isActive: true }, actorUserId: null, actor: null })
  assert.equal(await service.restoreAgentVersion(ORG, 'agent-1', 'v0', 'user-1'), true)
  assert.equal(memory.agent.name, 'Antiguo')
  assert.equal(memory.agent.lifecycleStatus, 'paused')
  assert.equal(memory.agent.isActive, false)

  // Un agente activo que restaura una voz sin consentimiento vigente vuelve a borrador.
  memory.agent.lifecycleStatus = 'active'; memory.agent.isActive = true
  memory.versions.push({ id: 'v-voice', orgId: ORG, agentId: 'agent-1', version: 0, createdAt: new Date('2026-08-02T10:00:00Z'), changedFields: ['voiceId'], snapshot: { ...memory.agent, voiceId: PRIVATE_VOICE, lifecycleStatus: 'active', isActive: true }, actorUserId: null, actor: null })
  memory.consents[0].scope = { voiceIds: [PUBLIC_VOICE] }
  assert.equal(await service.restoreAgentVersion(ORG, 'agent-1', 'v-voice', 'user-1'), true)
  assert.equal(memory.agent.voiceId, PRIVATE_VOICE)
  assert.equal(memory.agent.lifecycleStatus, 'draft')
  assert.equal(await service.restoreAgentVersion('org-2', 'agent-1', 'v0', 'user-1'), false)
})

test('voiceId ajeno rechazado; voz pública y voz privada propia aceptadas', async t => {
  const memory = makeMemory()
  const service = await wire(t, memory)
  await assert.rejects(service.updateAgent(ORG, 'agent-1', { voiceId: FOREIGN_VOICE }), (error: any) => error.statusCode === 422 && error.code === 'VOICE_NOT_ASSIGNABLE')
  await assert.rejects(service.updateAgent(ORG, 'agent-1', { voiceId: 'd'.repeat(32) }), { statusCode: 422 })
  assert.equal(memory.agent.voiceId, PUBLIC_VOICE)
  await service.updateAgent(ORG, 'agent-1', { voiceId: PRIVATE_VOICE })
  assert.equal(memory.agent.voiceId, PRIVATE_VOICE)
  await service.updateAgent(ORG, 'agent-1', { voiceId: PUBLIC_VOICE })
  assert.equal(memory.agent.voiceId, PUBLIC_VOICE)
  // Sin catálogo conectado no se puede comprobar una voz que no es propia.
  env(t, { FISH_API_KEY: undefined })
  await assert.rejects(service.updateAgent(ORG, 'agent-1', { voiceId: 'e'.repeat(32) }), { statusCode: 503 })
  // El consentimiento de una voz privada ajena tampoco se registra.
  memory.agent.voiceId = FOREIGN_VOICE
  env(t, { FISH_API_KEY: 'test-key' })
  await assert.rejects(service.createAgentConsent(ORG, 'agent-1', 'user-1', { subjectName: 'Alguien' }), { statusCode: 422 })
  memory.agent.voiceId = PRIVATE_VOICE
  const consent = await service.createAgentConsent(ORG, 'agent-1', 'user-1', { subjectName: 'Isa' })
  assert.deepEqual((consent as any).scope.voiceIds, [PRIVATE_VOICE])
})

test('límites operativos: horario, días activos, máximo diario y minutos mensuales', async () => {
  const { checkAgentOperationalLimits, agentOperationalLimitsSchema } = await import('../voice/agentLimits')
  const agent = { settings: { operationalLimits: { maxCallsPerDay: 50, activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'], schedule: { start: '09:00', end: '18:00' }, timezone: 'Europe/Madrid' } } }
  // Martes 22-09-2026 a las 10:30 en Madrid (08:30Z).
  const tuesdayMorning = new Date('2026-09-22T08:30:00Z')
  assert.deepEqual(checkAgentOperationalLimits(agent, { now: tuesdayMorning, callsToday: 3 }), { allowed: true, timeZone: 'Europe/Madrid' })

  const tooEarly = checkAgentOperationalLimits(agent, { now: new Date('2026-09-22T06:30:00Z'), callsToday: 0 })
  assert.equal(tooEarly.reason, 'outside_schedule')
  assert.equal(tooEarly.nextWindow?.toISOString(), '2026-09-22T07:00:00.000Z')

  const tooLate = checkAgentOperationalLimits(agent, { now: new Date('2026-09-22T17:00:00Z'), callsToday: 0 })
  assert.equal(tooLate.reason, 'outside_schedule')
  assert.equal(tooLate.nextWindow?.toISOString(), '2026-09-23T07:00:00.000Z')

  // Sábado: siguiente ventana el lunes a las 9:00 (07:00Z).
  const saturday = checkAgentOperationalLimits(agent, { now: new Date('2026-09-26T10:00:00Z'), callsToday: 0 })
  assert.equal(saturday.reason, 'inactive_day')
  assert.equal(saturday.nextWindow?.toISOString(), '2026-09-28T07:00:00.000Z')

  const exhausted = checkAgentOperationalLimits(agent, { now: tuesdayMorning, callsToday: 50 })
  assert.equal(exhausted.reason, 'daily_limit')
  assert.equal(exhausted.nextWindow?.toISOString(), '2026-09-23T07:00:00.000Z')

  assert.equal(checkAgentOperationalLimits({ ...agent, monthlyMinuteLimit: 100 }, { now: tuesdayMorning, minutesThisMonth: 100 }).reason, 'monthly_minutes')
  assert.equal(checkAgentOperationalLimits({ ...agent, monthlyMinuteLimit: 100 }, { now: tuesdayMorning, minutesThisMonth: 40 }).allowed, true)

  // Sin límites, o con datos antiguos en texto libre, siempre se permite.
  assert.equal(checkAgentOperationalLimits({ settings: {} }, { now: saturday.nextWindow }).allowed, true)
  assert.equal(checkAgentOperationalLimits({ settings: { operationalLimits: { maxCallsPerDay: 'muchas', activeDays: 'Lun-Vie' } } }, { now: tuesdayMorning, callsToday: 999 }).allowed, true)

  // El esquema limpia cadenas vacías y rechaza franjas invertidas.
  assert.deepEqual(JSON.parse(JSON.stringify(agentOperationalLimitsSchema.parse({ maxCallsPerDay: '', schedule: null, timezone: '' }))), {})
  assert.equal(agentOperationalLimitsSchema.parse({ maxCallsPerDay: '25' }).maxCallsPerDay, 25)
  assert.equal(agentOperationalLimitsSchema.safeParse({ schedule: { start: '18:00', end: '09:00' } }).success, false)
  assert.equal(agentOperationalLimitsSchema.safeParse({ timezone: 'Marte/Olympus' }).success, false)
})

test('guardar la ficha del agente no pisa settings.knowledgeIds', async t => {
  const memory = makeMemory({ settings: { strategyId: 'permission_diagnosis', knowledgeIds: ['doc-1', 'doc-2'] } })
  await wire(t, memory)
  const service = await import('../services/agents.service')
  // La ficha manda `settings` sin knowledgeIds: se conservan los que había.
  await service.updateAgent(ORG, 'agent-1', { settings: { strategyId: 'permission_diagnosis', keyMessages: 'Nuevo' } }, 'user-1')
  assert.deepEqual(memory.agent.settings.knowledgeIds, ['doc-1', 'doc-2'])
  assert.equal(memory.agent.settings.keyMessages, 'Nuevo')
  // Knowledge sí puede cambiarlos explícitamente, incluso vaciarlos.
  await service.updateAgent(ORG, 'agent-1', { settings: { ...memory.agent.settings, knowledgeIds: [] } }, 'user-1')
  assert.deepEqual(memory.agent.settings.knowledgeIds, [])
})
