import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groundedCandidates, radarDefaults, radarQueries, radarSearchSchema, radarSetup } from '../services/opportunityRadar'
import { dispatchRadarSchedules, nextRadarRun, setRadarScheduleActive, RADAR_SCHEDULE_RULE } from '../services/radarSchedules.service'
import { prisma } from '../lib/prisma'
function stub(t: { after: (fn: () => void) => void }, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method]
  target[method] = implementation
  t.after(() => { target[method] = original })
}

const salonSearch = { kind: 'clients' as const, target: 'Peluquerías', location: 'Madrid', criteria: '' }
test('varios objetivos conservan criterios propios y búsquedas equilibradas', () => {
  const radar = radarSearchSchema.parse({ ...salonSearch, businessType: 'software', name: 'Expansión', objectives: [
    { kind: 'clients', target: 'Peluquerías', criteria: 'Reservas', signals: ['Nueva apertura'], channels: ['linkedin'], exclusions: 'Franquicias' },
    { kind: 'suppliers', target: 'Hosting', criteria: 'Servidores europeos', channels: ['web'] },
  ] })
  const queries = radarQueries(radar)
  assert.equal(queries.length, 8)
  assert.match(queries[0], /Peluquerías.*Nueva apertura.*site:linkedin.com/)
  assert.match(queries[1], /Hosting.*Servidores europeos/)
  assert.equal(radar.objectives![0].exclusions, 'Franquicias')
  assert.equal(radarSearchSchema.safeParse({ ...radar, objectives: [...radar.objectives!, radar.objectives![0]] }).success, false)
  assert.equal(radarSearchSchema.safeParse({ ...radar, objectives: [radar.objectives![0], { kind: 'properties', target: 'Pisos' }] }).success, false)
  assert.equal(radarSearchSchema.safeParse({ ...radar, objectives: [] }).success, false)
  const sources = [{ title: 'Salón Lúa', snippet: 'Salón Lúa Madrid', url: 'https://salon.example' }, { title: 'Hosting Azul', snippet: 'Hosting Azul servidores europeos', url: 'https://hosting.example' }]
  const candidates = groundedCandidates([{ name: 'Salón Lúa', kind: 'clients', source: 1, rationale: 'Posible comprador' }, { name: 'Hosting Azul', kind: 'suppliers', source: 2, rationale: 'Posible proveedor' }, { name: 'Salón Lúa', kind: 'influencers', source: 1, rationale: 'Tipo no seleccionado' }], sources, radar, '2026-09-09')
  assert.deepEqual(candidates.map(item => item.kind), ['clients', 'suppliers'])
})
test('configura objetivos por actividad y no confunde al comprador con el negocio', () => {
  const setup = radarSetup({ company: { industry: 'Tecnología inmobiliaria' }, profile: { description: 'Software para agencias inmobiliarias.', idealCustomer: 'Agencias inmobiliarias' } })
  assert.equal(setup.suggestedType, 'software')
  const software = setup.businesses.find(item => item.id === 'software')!
  assert.equal(software.goals[0].target, 'Agencias inmobiliarias')
  assert.ok(software.goals.every(goal => goal.kind !== 'properties'))
  assert.ok(setup.businesses.filter(item => item.id !== 'real_estate').every(item => item.goals.every(goal => goal.kind !== 'properties')))
  assert.equal(setup.businesses.find(item => item.id === 'real_estate')!.goals[0].kind, 'properties')
  assert.equal(radarSetup({ company: { industry: 'Agencia de marketing' }, profile: { description: 'Servicios de marketing para inmobiliarias.', idealCustomer: 'Inmobiliarias' } }).suggestedType, 'services')
})
test('permite corregir un perfil desconocido sin inventar clientes ni localización', () => {
  const setup = radarSetup({ company: {}, profile: { description: '', idealCustomer: '' } })
  assert.equal(setup.suggestedType, 'other')
  assert.equal(setup.businesses.find(item => item.id === 'other')!.goals[0].target, '')
  assert.equal(radarSearchSchema.safeParse({ ...salonSearch, businessType: 'software', kind: 'properties' }).success, false)
  assert.equal(radarSearchSchema.safeParse({ ...salonSearch, businessType: 'real_estate', kind: 'properties' }).success, true)
  assert.equal(radarSearchSchema.parse({ ...salonSearch, businessType: 'software' }).businessType, 'software')
})
test('software para peluquerías busca compradores y no proveedores de software', () => {
  const defaults = radarDefaults({ company: { industry: 'Software de gestión', address: 'Madrid' }, profile: { description: 'Software de citas para peluquerías y salones.', idealCustomer: 'Peluquerías y salones' } })
  assert.equal(defaults.kind, 'clients'); assert.equal(defaults.target, 'Peluquerías y salones')
  assert.ok(radarQueries({ ...defaults, criteria: '' }).every(query => !query.includes('Software')))
})
test('inmobiliaria propone inmuebles; software inmobiliario propone clientes', () => {
  const profile = { description: 'Captación de pisos en Madrid', idealCustomer: 'Propietarios' }
  assert.equal(radarDefaults({ company: { industry: 'Agencia inmobiliaria' }, profile }).kind, 'properties')
  assert.equal(radarDefaults({ company: { industry: 'Software inmobiliario' }, profile }).kind, 'clients')
  assert.equal(radarDefaults({ company: { industry: 'Sector inmobiliario' }, profile: { description: 'Software para agencias inmobiliarias.', idealCustomer: 'Agencias inmobiliarias' } }).kind, 'clients')
})
test('no inventa un mercado y extrae el destinatario de una descripción explícita', () => {
  const defaults = radarDefaults({ company: { industry: 'SaaS' }, profile: { description: 'Software para peluquerías y salones. Agenda digital.', idealCustomer: '' } })
  assert.equal(defaults.target, 'peluquerías y salones'); assert.equal(defaults.location, '')
  assert.equal(radarSearchSchema.safeParse({ ...defaults, criteria: '' }).success, false)
})
test('influencers, proveedores e inmuebles producen consultas distintas y acotadas', () => {
  assert.ok(radarQueries({ ...salonSearch, kind: 'influencers' }).some(query => query.includes('site:instagram.com')))
  assert.ok(radarQueries({ ...salonSearch, kind: 'properties' }).some(query => query.includes('particular')))
  assert.ok(radarQueries({ ...salonSearch, kind: 'suppliers' }).some(query => query.includes('mayorista')))
  assert.ok(radarQueries({ ...salonSearch, target: 'x'.repeat(300), criteria: 'y'.repeat(600) }).every(query => query.length <= 380))
})
test('nombres y datos de la tabla deben aparecer en una fuente recuperada', () => {
  const source = { title: 'Salón Lúa', snippet: 'Salón Lúa en Madrid. Especialistas en coloración.', url: 'https://salon.example/contacto' }
  const result = groundedCandidates([
    { name: 'Salón Lúa', source: 1, rationale: 'Posible encaje con gestión de citas', location: 'Madrid', detail: 'Especialistas en coloración' },
    { name: 'Salón Lúa', source: 1, rationale: 'Duplicado' },
    { name: 'Empresa inventada', source: 1, rationale: 'Sin evidencia' },
    { name: 'Salón Lúa', source: 99, rationale: 'Fuente inventada' },
  ], [source], salonSearch, '2026-09-08T12:00:00Z')
  assert.equal(result.length, 1); assert.equal(result[0].location, 'Madrid'); assert.equal(result[0].status, 'candidate')
  const unsupported = groundedCandidates([{ name: 'Salón Lúa', source: 1, rationale: 'Posible encaje', location: 'Barcelona', detail: '10000 seguidores' }], [source], salonSearch, '2026-09-08T12:00:00Z')
  assert.equal(unsupported[0].location, null); assert.equal(unsupported[0].detail, null)
  assert.deepEqual(groundedCandidates([{ name: 'Salón Lúa', source: 1, rationale: 'x' }], [{ ...source, url: 'javascript:alert(1)' }], salonSearch, ''), [])
})
test('la recurrencia salta intervalos perdidos sin generar una ráfaga de búsquedas', () => {
  assert.equal(nextRadarRun(new Date('2026-09-01T09:00Z'), 24, new Date('2026-09-08T10:00Z')).toISOString(), '2026-09-09T09:00:00.000Z')
  assert.equal(nextRadarRun(new Date('2026-09-01T09:00Z'), 168, new Date('2026-09-08T09:00Z')).toISOString(), '2026-09-15T09:00:00.000Z')
})
test('el scheduler reclama de forma condicional y no ejecuta si otro worker ganó', async (t) => {
  const dueAt = new Date('2026-09-08T09:00Z')
  stub(t, prisma.scheduledTrigger, 'findMany', async (query: any) => {
    assert.equal(query.where.ruleKey, RADAR_SCHEDULE_RULE)
    assert.deepEqual(query.where.status.in, ['radar_pending', 'radar_running'])
    return [{ id: 'schedule-1', orgId: 'org-1', status: 'radar_pending', dueAt, payload: { radar: salonSearch, intervalHours: 24, createdById: 'user-1', allowExternalReview: true } }]
  })
  stub(t, prisma.scheduledTrigger, 'updateMany', async (query: any) => { assert.equal(query.where.orgId, 'org-1'); assert.equal(query.where.dueAt, dueAt); return { count: 0 } })
  stub(t, prisma.organizationMembership, 'findUnique', async () => { assert.fail('No se debe iniciar una búsqueda sin claim') })
  await dispatchRadarSchedules(new Date('2026-09-08T10:00Z'))
})
test('no permite pausar la programación de otra organización', async (t) => {
  stub(t, prisma.scheduledTrigger, 'findFirst', async (query: any) => { assert.equal(query.where.orgId, 'org-other'); assert.equal(query.where.ruleKey, RADAR_SCHEDULE_RULE); return null })
  await assert.rejects(setRadarScheduleActive('org-other', 'schedule-1', false), /no encontrada/)
})
test('permisos revocados detienen la programación en vez de generar otro trabajo', async (t) => {
  const writes: any[] = []
  stub(t, prisma.scheduledTrigger, 'findMany', async () => [{ id: 'schedule-1', orgId: 'org-1', status: 'radar_pending', dueAt: new Date('2026-09-08T09:00Z'), payload: { radar: salonSearch, intervalHours: 24, createdById: 'user-1', allowExternalReview: true } }])
  stub(t, prisma.scheduledTrigger, 'updateMany', async (query: any) => { writes.push(query); return { count: 1 } })
  stub(t, prisma.organizationMembership, 'findUnique', async () => null)
  await dispatchRadarSchedules(new Date('2026-09-08T10:00Z'))
  assert.equal(writes[1].data.status, 'radar_error'); assert.match(writes[1].data.payload.lastError, /permiso/)
  assert.equal(writes[1].where.status, 'radar_running')
})

test('recupera un lease vencido usando la misma clave de ejecución y conserva la recurrencia', async (t) => {
  const writes: any[] = []
  stub(t, prisma.scheduledTrigger, 'findMany', async () => [{ id: 'schedule-1', orgId: 'org-1', status: 'radar_running', dueAt: new Date('2026-09-08T09:10Z'), payload: { radar: salonSearch, intervalHours: 24, createdById: 'user-1', allowExternalReview: true, slotAt: '2026-09-08T09:00:00.000Z' } }])
  stub(t, prisma.scheduledTrigger, 'updateMany', async (query: any) => { writes.push(query); return { count: 1 } })
  await dispatchRadarSchedules(new Date('2026-09-08T10:00Z'), async (orgId, userId, radar, key) => {
    assert.equal(orgId, 'org-1'); assert.equal(userId, 'user-1'); assert.deepEqual(radar, salonSearch)
    assert.equal(key, 'radar-schedule:schedule-1:2026-09-08T09:00:00.000Z')
    return { jobId: 'job-existing' }
  })
  assert.equal(writes[1].data.status, 'radar_pending'); assert.equal(writes[1].data.payload.lastJobId, 'job-existing')
  assert.equal(writes[1].data.payload.slotAt, undefined)
  assert.ok(writes[1].data.dueAt > new Date())
})
