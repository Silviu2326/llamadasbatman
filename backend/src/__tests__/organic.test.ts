import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { prisma } from '../lib/prisma'
import {
  createOrganicActionFromOpportunity,
  createOrganicAssetDraft,
  createOrganicProject,
  getOrganicOverview,
  OrganicOpportunityNotFoundError,
} from '../services/organic.service'
import { cleanupOrgs, createTestOrg, createTestUser } from './testHelpers'

const orgIds: string[] = []

afterEach(async () => {
  if (!orgIds.length) return
  const where = { orgId: { in: orgIds } }
  await prisma.organicIntegration.deleteMany({ where })
  await prisma.organicAction.deleteMany({ where })
  await prisma.organicAsset.deleteMany({ where })
  await prisma.organicOpportunity.deleteMany({ where })
  await prisma.organicProject.deleteMany({ where })
  await cleanupOrgs(orgIds.splice(0))
})

test('Organic Leads devuelve setupRequired y KPIs cero sin inventar datos', async () => {
  const org = await createTestOrg()
  orgIds.push(org.id)
  const beforeProject = await getOrganicOverview(org.id)
  assert.equal(beforeProject.project, null)
  assert.equal(beforeProject.setupRequired, true)
  assert.equal(beforeProject.kpis.opportunities, 0)
  assert.deepEqual(beforeProject.opportunities, [])

  const user = await createTestUser(org.id, 'admin')
  const project = await createOrganicProject(org.id, user.id, {
    name: 'Clínica de prueba',
    website: 'https://example.com',
    services: ['Implantes'],
    locations: ['Valencia'],
  })
  assert.equal(project.integrations.length, 3)
  const emptyProject = await getOrganicOverview(org.id)
  assert.equal(emptyProject.kpis.organicLeads, 0)
  assert.equal(emptyProject.kpis.estimatedValueCents, 0)
  assert.equal(emptyProject.setupRequired, true)
})

test('Organic Leads crea activos y acciones bajo el proyecto del tenant', async () => {
  const org = await createTestOrg()
  orgIds.push(org.id)
  const user = await createTestUser(org.id, 'admin')
  const project = await createOrganicProject(org.id, user.id, { name: 'Proyecto orgánico' })
  const opportunity = await prisma.organicOpportunity.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      title: 'Dentista urgente Valencia',
      query: 'dentista urgente valencia',
      score: 82,
      estimatedValueCents: 24000,
    },
  })

  const asset = await createOrganicAssetDraft(org.id, user.id, {
    projectId: project.id,
    opportunityId: opportunity.id,
    type: 'service_page',
    title: 'Página de servicio',
    content: { status: 'draft' },
  })
  const action = await createOrganicActionFromOpportunity(org.id, user.id, opportunity.id, {
    type: 'create_asset',
    title: 'Crear página de servicio',
    priority: 10,
  })

  const overview = await getOrganicOverview(org.id)
  assert.equal(overview.kpis.opportunities, 1)
  assert.equal(overview.kpis.openOpportunities, 1)
  assert.equal(overview.kpis.estimatedValueCents, 24000)
  assert.equal(overview.kpis.assets, 1)
  assert.equal(overview.kpis.draftAssets, 1)
  assert.equal(overview.kpis.actions, 1)
  assert.equal(overview.kpis.pendingActions, 1)
  assert.equal(overview.assets[0]?.id, asset.id)
  assert.equal(overview.actions[0]?.id, action.id)
  assert.equal(overview.setupRequired, false)

  const audits = await prisma.auditLog.findMany({
    where: { orgId: org.id, action: { startsWith: 'organic.' } },
  })
  assert.equal(audits.length, 3)
})

test('Organic Leads no permite reutilizar oportunidades de otro tenant', async () => {
  const orgA = await createTestOrg()
  const orgB = await createTestOrg()
  orgIds.push(orgA.id, orgB.id)
  const userA = await createTestUser(orgA.id, 'admin')
  const userB = await createTestUser(orgB.id, 'admin')
  const project = await createOrganicProject(orgA.id, userA.id, { name: 'Tenant A' })
  const opportunity = await prisma.organicOpportunity.create({
    data: { orgId: orgA.id, projectId: project.id, title: 'Solo A' },
  })

  await assert.rejects(
    () => createOrganicActionFromOpportunity(orgB.id, userB.id, opportunity.id, { type: 'review', title: 'No permitido' }),
    OrganicOpportunityNotFoundError,
  )
  const overviewB = await getOrganicOverview(orgB.id)
  assert.equal(overviewB.project, null)
  assert.equal(overviewB.kpis.opportunities, 0)
})
