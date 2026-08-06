import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { prisma } from '../lib/prisma'
import {
  channelFromGa4Group,
  foldGbpTimeSeries,
  getIngestFreshness,
  getTopOrganicPages,
  getTrafficByChannel,
  syncBusinessProfile,
  syncGa4Traffic,
} from '../services/organicGoogleIngest.service'
import { getUnifiedFunnel } from '../services/organicChannels.service'
import { getOrganicDataQuality } from '../services/organicDataQuality.service'
import { cleanupOrgs, createTestOrg } from './testHelpers'

/**
 * Ingesta de GA4 y del Perfil de Empresa — fase 1 de `docs/vendrava/organico.md`.
 *
 * No se puede llamar a Google desde aquí: hace falta una cuenta real conectada.
 * Lo que sí se prueba es todo lo que rodea a esa llamada, que es donde vive la
 * lógica y donde los fallos serían silenciosos: el mapeo de canales (que es lo
 * que impide que el tráfico de pago se cuele en el embudo orgánico), el plegado
 * de las series temporales de Google, la agregación por canal y por página, y
 * los caminos de rechazo cuando la integración no está lista.
 */

const orgIds: string[] = []

afterEach(async () => {
  if (!orgIds.length) return
  const where = { orgId: { in: orgIds } }
  await prisma.organicTrafficDaily.deleteMany({ where })
  await prisma.organicChannelSnapshot.deleteMany({ where })
  await prisma.organicIntegration.deleteMany({ where })
  await prisma.organicOpportunity.deleteMany({ where })
  await prisma.organicProject.deleteMany({ where })
  await cleanupOrgs(orgIds.splice(0))
})

async function orgWithProject() {
  const org = await createTestOrg()
  orgIds.push(org.id)
  const project = await prisma.organicProject.create({
    data: { orgId: org.id, name: 'Proyecto', website: 'https://example.com' },
  })
  return { org, project }
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

// ─── Mapeo de canales ────────────────────────────────────────────────────────

test('el tráfico de pago de GA4 nunca entra en el embudo orgánico', () => {
  for (const group of ['Paid Search', 'Paid Social', 'Cross-network', 'Display', 'Paid Shopping', 'Affiliates']) {
    assert.equal(channelFromGa4Group(group), null, `${group} no puede contarse como orgánico`)
  }
})

test('las agrupaciones orgánicas caen en su canal y el resto en no identificado', () => {
  assert.equal(channelFromGa4Group('Organic Search'), 'search')
  assert.equal(channelFromGa4Group('Organic Social'), 'social')
  assert.equal(channelFromGa4Group('Organic Video'), 'social')
  assert.equal(channelFromGa4Group('Direct'), 'unattributed')
  assert.equal(channelFromGa4Group('Referral'), 'unattributed')
  // Una agrupación que Google añada mañana entra como desconocida, nunca como
  // orgánica por descuido.
  assert.equal(channelFromGa4Group('Canal Que No Existe'), 'unattributed')
  assert.equal(channelFromGa4Group(''), null)
})

// ─── Series temporales del Perfil de Empresa ────────────────────────────────

test('las cuatro métricas de impresiones se suman como vistas de ficha', () => {
  const folded = foldGbpTimeSeries({
    multiDailyMetricTimeSeries: [{
      dailyMetricTimeSeries: [
        {
          dailyMetric: 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
          timeSeries: { datedValues: [{ date: { year: 2026, month: 7, day: 1 }, value: '10' }] },
        },
        {
          dailyMetric: 'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
          timeSeries: { datedValues: [{ date: { year: 2026, month: 7, day: 1 }, value: '5' }] },
        },
        {
          dailyMetric: 'CALL_CLICKS',
          timeSeries: { datedValues: [{ date: { year: 2026, month: 7, day: 1 }, value: '2' }] },
        },
        {
          dailyMetric: 'WEBSITE_CLICKS',
          // Un día sin actividad llega sin `value`: es un cero medido.
          timeSeries: { datedValues: [{ date: { year: 2026, month: 7, day: 1 } }] },
        },
      ],
    }],
  })
  assert.deepEqual(folded.get('2026-07-01'), { views: 15, calls: 2, websiteClicks: 0 })
})

test('una respuesta vacía o con otra forma no revienta el plegado', () => {
  assert.equal(foldGbpTimeSeries({}).size, 0)
  assert.equal(foldGbpTimeSeries({ multiDailyMetricTimeSeries: 'no es una lista' }).size, 0)
  assert.equal(foldGbpTimeSeries({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [{ dailyMetric: 'CALL_CLICKS' }] }] }).size, 0)
})

// ─── Caminos de rechazo ──────────────────────────────────────────────────────

test('no se sincroniza una integración sin conectar', async () => {
  const { org } = await orgWithProject()
  await assert.rejects(
    () => syncGa4Traffic(org.id, null, { startDate: '2026-07-01', endDate: '2026-07-31' }),
    /Conecta primero/i,
  )
})

test('no se sincroniza sin haber elegido la propiedad o la ubicación', async () => {
  const { org, project } = await orgWithProject()
  await prisma.organicIntegration.createMany({
    data: [
      { orgId: org.id, projectId: project.id, provider: 'ga4', status: 'connected' },
      { orgId: org.id, projectId: project.id, provider: 'google_business_profile', status: 'connected' },
    ],
  })
  await assert.rejects(
    () => syncGa4Traffic(org.id, null, { startDate: '2026-07-01', endDate: '2026-07-31' }),
    /propiedad de Analytics/i,
  )
  await assert.rejects(
    () => syncBusinessProfile(org.id, null, { startDate: '2026-07-01', endDate: '2026-07-31' }),
    /ubicación del Perfil/i,
  )
})

// ─── Agregación ──────────────────────────────────────────────────────────────

test('los totales por canal suman los días y distinguen sin medición de cero', async () => {
  const { org, project } = await orgWithProject()
  await prisma.organicTrafficDaily.createMany({
    data: [
      { orgId: org.id, projectId: project.id, provider: 'ga4', date: day('2026-07-01'), channel: 'search', page: '/placas', sessions: 40, engagedSessions: 22 },
      { orgId: org.id, projectId: project.id, provider: 'ga4', date: day('2026-07-02'), channel: 'search', page: '/placas', sessions: 35, engagedSessions: 20 },
      { orgId: org.id, projectId: project.id, provider: 'ga4', date: day('2026-07-02'), channel: 'search', page: '/blog', sessions: 5, engagedSessions: 1 },
      { orgId: org.id, projectId: project.id, provider: 'ga4', date: day('2026-07-02'), channel: 'social', page: '/placas', sessions: 12, engagedSessions: 4 },
      { orgId: org.id, projectId: project.id, provider: 'google_business_profile', date: day('2026-07-02'), channel: 'gbp', page: '', views: 300, calls: 9 },
    ],
  })

  const byChannel = await getTrafficByChannel(org.id, project.id, day('2026-06-01'))
  assert.equal(byChannel.get('search')?.visits, 80)
  assert.equal(byChannel.get('social')?.visits, 12)
  assert.equal(byChannel.get('gbp')?.views, 300)
  assert.equal(byChannel.get('gbp')?.calls, 9)
  // La ficha de Google no entrega sesiones: eso es `null`, no cero.
  assert.equal(byChannel.get('gbp')?.visits, null)
  // Un canal sin ninguna fila no aparece: tampoco se inventa un cero.
  assert.equal(byChannel.get('prospecting'), undefined)

  const pages = await getTopOrganicPages(org.id, project.id, day('2026-06-01'))
  assert.equal(pages[0].page, '/placas')
  assert.equal(pages[0].sessions, 75)
  // La ficha de Google no es una página: no puede colarse en este ranking.
  assert.equal(pages.some(page => page.page === ''), false)

  const freshness = await getIngestFreshness(org.id, project.id)
  assert.equal(freshness.get('ga4')?.rows, 4)
  assert.deepEqual(freshness.get('google_business_profile')?.lastDate, day('2026-07-02'))
})

test('las visitas ingeridas llegan al embudo y sobreviven a reconstruir el snapshot', async () => {
  const { org, project } = await orgWithProject()
  await prisma.organicTrafficDaily.createMany({
    data: [
      { orgId: org.id, projectId: project.id, provider: 'ga4', date: new Date(Date.now() - 2 * 86_400_000), channel: 'search', page: '/placas', sessions: 120 },
      { orgId: org.id, projectId: project.id, provider: 'google_business_profile', date: new Date(Date.now() - 2 * 86_400_000), channel: 'gbp', page: '', views: 450, calls: 12 },
    ],
  })

  const first = await getUnifiedFunnel(org.id, project.id, '30d', 30)
  assert.equal(first.funnel.find(step => step.key === 'visit')?.value, 120)

  // La segunda llamada reconstruye o relee los snapshots. El dato tiene que
  // seguir ahí: si se perdiera, sería el mismo agujero que ya tuvieron las
  // horas invertidas.
  const second = await getUnifiedFunnel(org.id, project.id, '30d', 30)
  assert.equal(second.funnel.find(step => step.key === 'visit')?.value, 120)

  const gbp = second.channels.find(channel => channel.channel === 'gbp')
  assert.equal(gbp?.presence, 450)
  assert.equal(gbp?.presenceUnit, 'vistas de ficha')
})

test('sin ninguna fila ingerida las visitas siguen diciendo "sin medición"', async () => {
  const { org, project } = await orgWithProject()
  const funnel = await getUnifiedFunnel(org.id, project.id, '30d', 30)
  // `null`, nunca 0: "no se midió" y "no vino nadie" son afirmaciones distintas.
  assert.equal(funnel.funnel.find(step => step.key === 'visit')?.value, null)
})

// ─── Banda de integridad ─────────────────────────────────────────────────────

test('la banda distingue conectada sin datos de conectada midiendo', async () => {
  const { org, project } = await orgWithProject()
  await prisma.organicIntegration.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      provider: 'ga4',
      status: 'connected',
      externalPropertyId: 'properties/123',
      lastSyncedAt: new Date(),
    },
  })

  const before = await getOrganicDataQuality(org.id, project.id)
  const ga4Before = before.sources.find(source => source.key === 'ga4')
  assert.equal(ga4Before?.status, 'connected_no_ingest')
  assert.equal(ga4Before?.action, 'Sincronizar')

  await prisma.organicTrafficDaily.create({
    data: { orgId: org.id, projectId: project.id, provider: 'ga4', date: day('2026-07-02'), channel: 'search', page: '/', sessions: 10 },
  })
  const after = await getOrganicDataQuality(org.id, project.id)
  const ga4After = after.sources.find(source => source.key === 'ga4')
  assert.equal(ga4After?.status, 'ready')
  assert.match(ga4After?.detail ?? '', /1 días ingeridos/)
})

test('un error de la última sincronización se enseña, no se traga', async () => {
  const { org, project } = await orgWithProject()
  await prisma.organicIntegration.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      provider: 'google_business_profile',
      status: 'connected',
      externalPropertyId: 'locations/123',
      lastError: 'provider_authorization_failed',
    },
  })
  const quality = await getOrganicDataQuality(org.id, project.id)
  const gbp = quality.sources.find(source => source.key === 'google_business_profile')
  assert.equal(gbp?.status, 'error')
  assert.ok(quality.issues.some(issue => issue.includes('provider_authorization_failed')))
})
