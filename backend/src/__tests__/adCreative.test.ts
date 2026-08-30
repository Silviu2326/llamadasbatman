import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { AdPlanConflictError } from '../services/adPlan.service'
import {
  CreativeValidationError,
  approveCreative,
  createBrief,
  createCreative,
  rejectCreative,
  setBriefStatus,
  submitCreative,
  updateCreative,
} from '../services/adCreative.service'
import { cleanupOrgs, createTestOrg, createTestUser } from './testHelpers'

const orgIds: string[] = []

async function cleanupCreativeData() {
  const where = { orgId: { in: orgIds } }
  await prisma.adCreative.deleteMany({ where })
  await prisma.creativeBrief.deleteMany({ where })
  await prisma.adAudience.deleteMany({ where })
  await prisma.adActivation.deleteMany({ where })
  await prisma.campaign.deleteMany({ where })
}

after(async () => {
  await cleanupCreativeData()
  await cleanupOrgs(orgIds)
  await prisma.$disconnect()
})

function conflictWith(code: string) {
  return (error: unknown) => error instanceof AdPlanConflictError && error.code === code
}

test('un brief sin creatividades no puede marcarse como entregado', async () => {
  const org = await createTestOrg('test-ad-brief-delivered')
  orgIds.push(org.id)
  const campaign = await prisma.campaign.create({
    data: { orgId: org.id, name: 'Brief', status: 'draft', landingSlug: `test-landing-${randomUUID()}` },
  })

  const brief = await createBrief(org.id, { campaignId: campaign.id })
  assert.ok(brief)
  assert.equal(brief.status, 'draft')
  // Sin destino explícito, el brief hereda la landing de la campaña global.
  assert.equal(brief.destination, campaign.landingSlug)

  await assert.rejects(
    () => setBriefStatus(org.id, brief.id, 'delivered'),
    conflictWith('BRIEF_WITHOUT_CREATIVES')
  )

  // Con una pieza producida, entregar ya es legítimo.
  const creative = await createCreative(org.id, { campaignId: campaign.id, briefId: brief.id, headline: 'Hola' })
  assert.ok(creative)
  const delivered = await setBriefStatus(org.id, brief.id, 'delivered')
  assert.equal(delivered?.status, 'delivered')
})

test('crear creatividades versiona dentro del brief y lo pasa a in_studio', async () => {
  const org = await createTestOrg('test-ad-creative-version')
  orgIds.push(org.id)
  const campaign = await prisma.campaign.create({ data: { orgId: org.id, name: 'Versiones', status: 'draft' } })
  const brief = await createBrief(org.id, { campaignId: campaign.id, format: 'imagen' })
  assert.ok(brief)

  const first = await createCreative(org.id, { campaignId: campaign.id, briefId: brief.id })
  const second = await createCreative(org.id, { campaignId: campaign.id, briefId: brief.id })
  assert.equal(first?.version, 1)
  assert.equal(second?.version, 2)
  assert.equal(first?.approvalStatus, 'draft')

  const inStudio = await prisma.creativeBrief.findUnique({ where: { id: brief.id } })
  assert.equal(inStudio?.status, 'in_studio')

  // Sin brief no hay serie que continuar: la pieza suelta siempre es v1.
  const loose = await createCreative(org.id, { campaignId: campaign.id })
  assert.equal(loose?.version, 1)
})

test('el flujo draft→in_review→approved/rejected exige orden y motivo', async () => {
  const org = await createTestOrg('test-ad-creative-flow')
  orgIds.push(org.id)
  const user = await createTestUser(org.id, 'admin')
  const campaign = await prisma.campaign.create({ data: { orgId: org.id, name: 'Aprobación', status: 'draft' } })

  const creative = await createCreative(org.id, { campaignId: campaign.id, headline: 'v1' })
  assert.ok(creative)

  // Aprobar en borrador se salta la revisión: transición inválida.
  await assert.rejects(
    () => approveCreative(org.id, user.id, creative.id),
    conflictWith('INVALID_STATUS_TRANSITION')
  )

  const submitted = await submitCreative(org.id, creative.id)
  assert.equal(submitted?.approvalStatus, 'in_review')
  await assert.rejects(() => submitCreative(org.id, creative.id), conflictWith('INVALID_STATUS_TRANSITION'))

  // Rechazar sin motivo no enseña nada: se corta antes de tocar la pieza.
  await assert.rejects(
    () => rejectCreative(org.id, user.id, creative.id, '  '),
    (error: unknown) => error instanceof CreativeValidationError
  )

  const rejected = await rejectCreative(org.id, user.id, creative.id, 'El titular promete algo que la landing no ofrece')
  assert.equal(rejected?.approvalStatus, 'rejected')
  assert.equal(rejected?.rejectedReason, 'El titular promete algo que la landing no ofrece')

  // Editar la rechazada la devuelve a draft y limpia el veredicto anterior.
  const revised = await updateCreative(org.id, creative.id, { headline: 'v2' })
  assert.equal(revised?.approvalStatus, 'draft')
  assert.equal(revised?.rejectedReason, null)

  await submitCreative(org.id, creative.id)
  const approved = await approveCreative(org.id, user.id, creative.id)
  assert.equal(approved?.approvalStatus, 'approved')
  assert.equal(approved?.approvedById, user.id)
  assert.ok(approved?.approvedAt)

  // Una aprobada ya no se edita: habría que crear la siguiente versión.
  await assert.rejects(
    () => updateCreative(org.id, creative.id, { headline: 'v3' }),
    conflictWith('CREATIVE_NOT_EDITABLE')
  )

  // Aprobación y rechazo dejan rastro en la auditoría de Ads.
  const trail = await prisma.auditLog.findMany({
    where: { orgId: org.id, entityType: 'AdCreative', entityId: creative.id },
    orderBy: { createdAt: 'asc' },
    select: { action: true, actorUserId: true },
  })
  assert.deepEqual(trail.map(entry => entry.action), ['ads.creative.rejected', 'ads.creative.approved'])
  assert.ok(trail.every(entry => entry.actorUserId === user.id))
})

test('briefs y creatividades están aislados por organización', async () => {
  const orgA = await createTestOrg('test-ad-creative-org-a')
  const orgB = await createTestOrg('test-ad-creative-org-b')
  orgIds.push(orgA.id, orgB.id)
  const userB = await createTestUser(orgB.id, 'admin')
  const campaign = await prisma.campaign.create({ data: { orgId: orgA.id, name: 'De la org A', status: 'draft' } })
  const brief = await createBrief(orgA.id, { campaignId: campaign.id })
  const creative = await createCreative(orgA.id, { campaignId: campaign.id, briefId: brief?.id })
  assert.ok(creative)

  assert.equal(await createBrief(orgB.id, { campaignId: campaign.id }), null)
  assert.equal(await createCreative(orgB.id, { campaignId: campaign.id }), null)
  assert.equal(await setBriefStatus(orgB.id, brief?.id as string, 'archived'), null)
  assert.equal(await submitCreative(orgB.id, creative.id), null)
  assert.equal(await approveCreative(orgB.id, userB.id, creative.id), null)

  // Un brief tampoco puede colgar de una audiencia de otra organización.
  const foreignAudience = await prisma.adAudience.create({ data: { orgId: orgB.id, name: 'Ajena' } })
  assert.equal(await createBrief(orgA.id, { campaignId: campaign.id, audienceId: foreignAudience.id }), null)
})
