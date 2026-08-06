import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { prisma } from '../lib/prisma'
import { getLeadOrganicOrigin } from '../services/organicLeadOrigin.service'
import { cleanupOrgs, createTestLead, createTestOrg } from './testHelpers'

/**
 * Criterio de aceptación de §13 de `docs/vendrava/organico.md`: seguir un lead
 * desde la keyword, el post, la ficha, la prospección o el acontecimiento
 * vertical que lo trajo.
 *
 * Lo que protegen estas pruebas es sobre todo lo que **no** debe pasar: que un
 * lead pagado se cuele como orgánico y que un origen desconocido se presente
 * como si se supiera (§8).
 */

const orgIds: string[] = []

afterEach(async () => {
  if (!orgIds.length) return
  const where = { orgId: { in: orgIds } }
  await prisma.acquisitionEvent.deleteMany({ where })
  await prisma.contentPiece.deleteMany({ where })
  await prisma.organicOpportunity.deleteMany({ where })
  await prisma.organicProject.deleteMany({ where })
  await prisma.campaign.deleteMany({ where })
  await cleanupOrgs(orgIds.splice(0))
})

async function scenario() {
  const org = await createTestOrg()
  orgIds.push(org.id)
  const campaign = await prisma.campaign.create({ data: { orgId: org.id, name: 'Campaña de prueba' } })
  const lead = await createTestLead(org.id)
  return { org, campaign, lead }
}

test('sin eventos de captación el origen se declara ausente, no se inventa', async () => {
  const { org, lead } = await scenario()
  const origin = await getLeadOrganicOrigin(org.id, lead.id)
  assert.equal(origin.kind, 'none')
  assert.equal(origin.channel, null)
  assert.equal(origin.label, null)
})

test('la keyword de la búsqueda se nombra cuando viaja en el enlace', async () => {
  const { org, campaign, lead } = await scenario()
  await prisma.acquisitionEvent.create({
    data: {
      orgId: org.id,
      campaignId: campaign.id,
      leadId: lead.id,
      type: 'landing_lead',
      source: 'google',
      medium: 'organic',
      metadata: { utmTerm: 'instalación placas solares valencia', path: '/placas' },
    },
  })
  const origin = await getLeadOrganicOrigin(org.id, lead.id)
  assert.equal(origin.kind, 'keyword')
  assert.equal(origin.channel, 'search')
  assert.equal(origin.label, 'instalación placas solares valencia')
  assert.match(origin.detail, /instalación placas solares valencia/)
})

test('sin utm_term se dice el canal y qué falta, sin inventar la consulta', async () => {
  const { org, campaign, lead } = await scenario()
  await prisma.acquisitionEvent.create({
    data: {
      orgId: org.id,
      campaignId: campaign.id,
      leadId: lead.id,
      type: 'landing_lead',
      source: 'google',
      medium: 'organic',
      metadata: { path: '/placas' },
    },
  })
  const origin = await getLeadOrganicOrigin(org.id, lead.id)
  assert.equal(origin.kind, 'organic_unidentified')
  assert.equal(origin.channel, 'search')
  assert.equal(origin.label, null, 'no puede nombrar una keyword que no recibió')
  assert.match(origin.detail, /utm_term/)
})

test('el post concreto se identifica por su UTM propio', async () => {
  const { org, campaign, lead } = await scenario()
  await prisma.contentPiece.create({
    data: { orgId: org.id, format: 'carousel', body: { text: 'pieza' }, status: 'published', utmContent: 'pieza-abc', publishedAt: new Date('2026-07-01') },
  })
  await prisma.acquisitionEvent.create({
    data: {
      orgId: org.id,
      campaignId: campaign.id,
      leadId: lead.id,
      type: 'landing_lead',
      source: 'instagram',
      medium: 'organic_social',
      content: 'pieza-abc',
    },
  })
  const origin = await getLeadOrganicOrigin(org.id, lead.id)
  assert.equal(origin.kind, 'piece')
  assert.equal(origin.channel, 'social')
  assert.equal(origin.piece?.format, 'carousel')
  assert.match(origin.label ?? '', /carousel/)
})

test('un lote de prospección nombra sector y ciudad', async () => {
  const { org, campaign, lead } = await scenario()
  await prisma.acquisitionEvent.create({
    data: {
      orgId: org.id,
      campaignId: campaign.id,
      leadId: lead.id,
      type: 'prospect_import',
      source: 'prospecting',
      externalKey: 'place-123',
      metadata: { sector: 'gimnasios', city: 'Valencia' },
    },
  })
  const origin = await getLeadOrganicOrigin(org.id, lead.id)
  assert.equal(origin.kind, 'prospecting')
  assert.equal(origin.channel, 'prospecting')
  assert.match(origin.label ?? '', /gimnasios/)
  assert.match(origin.detail, /place-123/)
})

test('un acontecimiento vertical se nombra por su oportunidad', async () => {
  const { org, campaign, lead } = await scenario()
  const project = await prisma.organicProject.create({ data: { orgId: org.id, name: 'Proyecto' } })
  await prisma.organicOpportunity.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      title: 'Partido finalizado: Club A vs Club B',
      source: 'vertical_connector',
      sourceKind: 'vertical_event',
      channel: 'social',
      leadId: lead.id,
    },
  })
  await prisma.acquisitionEvent.create({
    data: {
      orgId: org.id,
      campaignId: campaign.id,
      leadId: lead.id,
      type: 'landing_lead',
      source: 'instagram',
      medium: 'organic_social',
    },
  })
  const origin = await getLeadOrganicOrigin(org.id, lead.id)
  assert.equal(origin.kind, 'vertical_event')
  assert.equal(origin.label, 'Partido finalizado: Club A vs Club B')
})

test('un toque pagado gana: el lead no se presenta como orgánico', async () => {
  const { org, campaign, lead } = await scenario()
  // Primero el anuncio, después una vuelta por búsqueda. El orgánico no puede
  // quedarse el lead que ya pagó Ads.
  await prisma.acquisitionEvent.create({
    data: { orgId: org.id, campaignId: campaign.id, leadId: lead.id, type: 'landing_view', source: 'meta', medium: 'paid_social', sessionId: 'sesion-1' },
  })
  await prisma.acquisitionEvent.create({
    data: { orgId: org.id, campaignId: campaign.id, leadId: lead.id, type: 'landing_lead', source: 'google', medium: 'organic', metadata: { utmTerm: 'placas solares' } },
  })
  const origin = await getLeadOrganicOrigin(org.id, lead.id)
  assert.equal(origin.kind, 'paid')
  assert.equal(origin.channel, 'ads')
  assert.match(origin.detail, /Ads/)
})

test('el tráfico sin origen reconocible se declara no identificado', async () => {
  const { org, campaign, lead } = await scenario()
  await prisma.acquisitionEvent.create({
    data: { orgId: org.id, campaignId: campaign.id, leadId: lead.id, type: 'landing_lead', source: 'direct' },
  })
  const origin = await getLeadOrganicOrigin(org.id, lead.id)
  assert.equal(origin.kind, 'organic_unidentified')
  assert.equal(origin.channel, 'unattributed')
  assert.match(origin.detail, /no identificado/)
})
