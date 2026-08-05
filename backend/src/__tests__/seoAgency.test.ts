import assert from 'node:assert/strict'
import test from 'node:test'
import { buildChecklist, buildFallbackPlan, groupCannibalization, scoreFromChecklist } from '../services/seoAgency.service'
import type { DigitalAuditResult } from '../services/digitalAudit.service'

function fakeAudit(overrides: Partial<DigitalAuditResult> = {}): DigitalAuditResult {
  return {
    name: 'test', website: 'https://test.com', webAlive: true, webReachable: true,
    webInfo: { isHttps: true, finalUrl: 'https://test.com', loadMs: 1200, httpStatus: 200 },
    seo: {
      title: 'Clínica dental en Madrid | Sonrisas', titleLen: 38,
      metaDescription: 'Tu clínica dental de confianza en Madrid. Primera visita gratuita y financiación sin intereses.', metaDescriptionLen: 95,
      hasViewport: true, hasCanonical: false, hasOgImage: false,
      hasSchemaJsonld: false, hasAnalytics: true, hasMetaPixel: false,
    },
    socials: {}, tech: null, conversion: null,
    publicScore: 50, opsScore: null, opportunity: 50, leadOpportunityScore: 50,
    tier: 'WARM', opportunities: [], benchmark: null,
    commercialPitch: '', summary: '', auditedAt: new Date().toISOString(),
    ...overrides,
  }
}

test('checklist refleja las señales de la auditoría y el score es proporcional', () => {
  const checklist = buildChecklist(fakeAudit())
  assert.equal(checklist.length, 9)
  assert.ok(checklist.find((c) => c.id === 'https')?.ok)
  assert.ok(checklist.find((c) => c.id === 'title')?.ok)
  assert.equal(checklist.find((c) => c.id === 'canonical')?.ok, false)
  const score = scoreFromChecklist(checklist)
  assert.ok(score > 0 && score < 100)
  assert.equal(scoreFromChecklist([]), 0)
})

test('web caída no produce checklist ni score fantasma', () => {
  const checklist = buildChecklist(fakeAudit({ webAlive: false, seo: null }))
  assert.equal(checklist.length, 0)
})

test('la canibalización agrupa por query y exige al menos dos páginas con impresiones', () => {
  const rows = [
    { keys: ['dentista madrid', '/servicios'], clicks: 10, impressions: 200, position: 8.2 },
    { keys: ['dentista madrid', '/blog/precios'], clicks: 4, impressions: 150, position: 12.1 },
    { keys: ['ortodoncia', '/ortodoncia'], clicks: 20, impressions: 500, position: 3.4 },
    { keys: ['implantes', '/implantes'], clicks: 5, impressions: 0, position: null },
    { keys: ['implantes', '/blog/implantes'], clicks: 2, impressions: 0, position: null },
  ]
  const grouped = groupCannibalization(rows)
  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].query, 'dentista madrid')
  assert.equal(grouped[0].pages.length, 2)
  assert.equal(grouped[0].pages[0].page, '/servicios')
  assert.equal(grouped[0].totalClicks, 14)
})

test('el plan determinista usa sector y ciudad y propone arreglos de lo fallido', () => {
  const checklist = buildChecklist(fakeAudit())
  const plan = buildFallbackPlan({ url: 'https://test.com', sector: 'clínica dental', city: 'Madrid' }, checklist)
  assert.ok(plan.keywords.length >= 5)
  assert.ok(plan.keywords.some((k) => k.keyword.includes('Madrid')))
  assert.ok(plan.contentPlan.length >= 3)
  assert.ok(plan.technicalFixes.every((f) => checklist.some((c) => !c.ok && c.label === f.title)))
  assert.ok(plan.localSeo.length >= 3)
})

/**
 * El informe dejó de vivir en `localStorage` del navegador (`organico.md` fase
 * 0). Estas dos pruebas cubren lo que esa migración tiene que garantizar: que
 * se lee el último informe guardado y que no se lee el de otra organización.
 */
test('el último informe se lee de la base y respeta el aislamiento por organización', async () => {
  const { prisma } = await import('../lib/prisma')
  const { latestReport, reportById } = await import('../services/seoAgency.service')
  const { cleanupOrgs, createTestOrg } = await import('./testHelpers')

  const mine = await createTestOrg()
  const other = await createTestOrg()
  try {
    const older = await prisma.seoReport.create({
      data: { orgId: mine.id, url: 'https://mia.com', score: 40, report: { url: 'https://mia.com', score: 40 } },
    })
    await prisma.seoReport.create({
      data: { orgId: mine.id, url: 'https://mia.com', score: 72, report: { url: 'https://mia.com', score: 72 } },
    })
    const theirs = await prisma.seoReport.create({
      data: { orgId: other.id, url: 'https://ajena.com', score: 91, report: { url: 'https://ajena.com', score: 91 } },
    })

    const latest = await latestReport(mine.id)
    assert.equal(latest?.score, 72, 'tiene que devolver el más reciente, no el primero')
    assert.equal(await latestReport(mine.id, 'https://no-existe.com'), null)

    // Se puede volver a un informe anterior…
    assert.equal((await reportById(mine.id, older.id))?.score, 40)
    // …pero nunca al de otro tenant, aunque se acierte el id.
    assert.equal(await reportById(mine.id, theirs.id), null)
  } finally {
    await prisma.seoReport.deleteMany({ where: { orgId: { in: [mine.id, other.id] } } })
    await cleanupOrgs([mine.id, other.id])
  }
})
