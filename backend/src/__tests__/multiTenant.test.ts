import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createTestOrg, createTestUser, createTestLead, cleanupOrgs } from './testHelpers'
import { createOpportunity, OwnershipError as PipelineOwnershipError } from '../services/pipeline.service'
import { createMeeting, OwnershipError as MeetingOwnershipError } from '../services/meetings.service'
import { createLead, OwnershipError as LeadOwnershipError } from '../services/leads.service'

/**
 * P0-01/VE-01: ninguna mutación debe aceptar un id de otra organización solo
 * porque la FK apunta a una fila que existe — tiene que existir Y pertenecer
 * a la misma orgId. Estas pruebas ejercitan el código real de servicio
 * (no mocks) contra la base de datos de desarrollo.
 */

let orgA: Awaited<ReturnType<typeof createTestOrg>>
let orgB: Awaited<ReturnType<typeof createTestOrg>>
let leadInOrgB: Awaited<ReturnType<typeof createTestLead>>
let userInOrgB: Awaited<ReturnType<typeof createTestUser>>

before(async () => {
  orgA = await createTestOrg()
  orgB = await createTestOrg()
  leadInOrgB = await createTestLead(orgB.id)
  userInOrgB = await createTestUser(orgB.id)
})

after(async () => {
  await cleanupOrgs([orgA.id, orgB.id])
})

test('createOpportunity rechaza un leadId de otra organización', async () => {
  await assert.rejects(
    () => createOpportunity(orgA.id, userInOrgB.id, 'admin', { leadId: leadInOrgB.id, name: 'Cross-tenant opp' }),
    PipelineOwnershipError
  )
})

test('createOpportunity rechaza un assignedTo (User) de otra organización', async () => {
  const leadInOrgA = await createTestLead(orgA.id)
  await assert.rejects(
    () => createOpportunity(orgA.id, userInOrgB.id, 'admin', { leadId: leadInOrgA.id, assignedTo: userInOrgB.id, name: 'Cross-tenant owner' }),
    PipelineOwnershipError
  )
})

test('createMeeting rechaza un leadId de otra organización', async () => {
  await assert.rejects(
    () => createMeeting(orgA.id, userInOrgB.id, 'admin', { leadId: leadInOrgB.id, title: 'Cross-tenant meeting', scheduledAt: new Date(Date.now() + 3600_000).toISOString() }),
    MeetingOwnershipError
  )
})

test('createLead rechaza un campaignId de otra organización', async () => {
  const campaignInOrgB = await import('../lib/prisma').then(({ prisma }) =>
    prisma.campaign.create({ data: { orgId: orgB.id, name: 'Campaign B' } })
  )
  await assert.rejects(
    () => createLead(orgA.id, null, { name: 'Cross-tenant lead', campaignId: campaignInOrgB.id }),
    LeadOwnershipError
  )
  const { prisma } = await import('../lib/prisma')
  await prisma.campaign.delete({ where: { id: campaignInOrgB.id } })
})

test('createOpportunity SÍ acepta referencias de la misma organización', async () => {
  const leadInOrgA = await createTestLead(orgA.id)
  const userInOrgA = await createTestUser(orgA.id)
  const opportunity = await createOpportunity(orgA.id, userInOrgA.id, 'admin', {
    leadId: leadInOrgA.id,
    assignedTo: userInOrgA.id,
    name: 'Same-tenant opp',
  })
  assert.equal(opportunity.orgId, orgA.id)
  assert.equal(opportunity.leadId, leadInOrgA.id)
})
