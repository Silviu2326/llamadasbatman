import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createTestOrg, createTestLead, cleanupOrgs } from './testHelpers'
import { prisma } from '../lib/prisma'
import { assertEmailSendAllowed, recordEmailComplianceEvent } from '../lib/emailCompliance'

/**
 * P0-05/EM-02: assertEmailSendAllowed es la barrera única que deben
 * respetar envío manual, automatización y campaña — sin consentimiento
 * explícito ('granted'), o tras un bounce/unsubscribe, nunca debe permitir
 * el envío.
 */

let org: Awaited<ReturnType<typeof createTestOrg>>

before(async () => {
  org = await createTestOrg()
})

after(async () => {
  await cleanupOrgs([org.id])
})

test('sin ningún ContactConsent, el envío queda bloqueado (no_consent)', async () => {
  const lead = await createTestLead(org.id)
  const decision = await assertEmailSendAllowed(org.id, lead.id, 'contact')
  assert.equal(decision.allowed, false)
  if (!decision.allowed) assert.equal(decision.reason, 'no_consent')
})

test('con consentimiento granted, el envío está permitido', async () => {
  const lead = await createTestLead(org.id)
  await prisma.contactConsent.create({
    data: { orgId: org.id, leadId: lead.id, channel: 'email', purpose: 'contact', status: 'granted', source: 'test' },
  })
  const decision = await assertEmailSendAllowed(org.id, lead.id, 'contact')
  assert.equal(decision.allowed, true)
})

test('tras recordEmailComplianceEvent(bounced), el envío se bloquea aunque antes estuviera granted', async () => {
  const lead = await createTestLead(org.id)
  await prisma.contactConsent.create({
    data: { orgId: org.id, leadId: lead.id, channel: 'email', purpose: 'contact', status: 'granted', source: 'test' },
  })
  await recordEmailComplianceEvent(org.id, lead.id, 'bounced', 'test_webhook', 'contact')
  const decision = await assertEmailSendAllowed(org.id, lead.id, 'contact')
  assert.equal(decision.allowed, false)
  if (!decision.allowed) assert.equal(decision.reason, 'bounced')
})

test('tras recordEmailComplianceEvent(revoked/unsubscribe), el envío se bloquea', async () => {
  const lead = await createTestLead(org.id)
  await prisma.contactConsent.create({
    data: { orgId: org.id, leadId: lead.id, channel: 'email', purpose: 'contact', status: 'granted', source: 'test' },
  })
  await recordEmailComplianceEvent(org.id, lead.id, 'revoked', 'test_webhook', 'contact')
  const decision = await assertEmailSendAllowed(org.id, lead.id, 'contact')
  assert.equal(decision.allowed, false)
  if (!decision.allowed) assert.equal(decision.reason, 'unsubscribed')
})
