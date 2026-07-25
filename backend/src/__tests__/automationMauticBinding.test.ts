import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createTestLead, createTestOrg, cleanupOrgs } from './testHelpers'
import { prisma } from '../lib/prisma'
import { createAutomation, runAutomationsForEvent } from '../services/automations.service'

let orgA: Awaited<ReturnType<typeof createTestOrg>>
let orgB: Awaited<ReturnType<typeof createTestOrg>>
let leadA: Awaited<ReturnType<typeof createTestLead>>

before(async () => {
  orgA = await createTestOrg()
  orgB = await createTestOrg()
  leadA = await createTestLead(orgA.id)
})

after(async () => {
  await cleanupOrgs([orgA.id, orgB.id])
})

async function getOnlyStepError(automationId: string) {
  const run = await prisma.automationRun.findFirstOrThrow({ where: { orgId: orgA.id, automationId } })
  const step = await prisma.automationStepRun.findFirstOrThrow({ where: { runId: run.id } })
  return { run, step }
}

test('un segmento de otra organización nunca se usa por una automatización', async () => {
  await prisma.mauticAssetBinding.create({
    data: { orgId: orgB.id, assetType: 'segment', externalId: 'shared-looking-alias', name: 'Segmento B' },
  })
  const automation = await createAutomation(orgA.id, {
    name: 'Segmento no autorizado',
    trigger: { event: 'lead.created' },
    actions: [{ type: 'send_to_mautic_segment', params: { segmentAlias: 'shared-looking-alias' } }],
  })

  await runAutomationsForEvent(orgA.id, 'lead.created', { eventId: `segment-${automation.id}`, leadId: leadA.id })

  const { step } = await getOnlyStepError(automation.id)
  assert.equal(step.status, 'blocked')
  assert.equal(step.errorCode, 'MAUTIC_ASSET_UNAUTHORIZED')
})

test('una plantilla inactiva de la propia organización no se usa para enviar email', async () => {
  await prisma.mauticAssetBinding.create({
    data: { orgId: orgA.id, assetType: 'template', externalId: 'inactive-template', name: 'Plantilla retirada', isActive: false },
  })
  const automation = await createAutomation(orgA.id, {
    name: 'Plantilla inactiva',
    trigger: { event: 'lead.created' },
    actions: [{ type: 'send_email_template', params: { emailId: 'inactive-template' } }],
  })

  await runAutomationsForEvent(orgA.id, 'lead.created', { eventId: `template-${automation.id}`, leadId: leadA.id })

  const { step } = await getOnlyStepError(automation.id)
  assert.equal(step.status, 'blocked')
  assert.equal(step.errorCode, 'MAUTIC_ASSET_UNAUTHORIZED')
})
