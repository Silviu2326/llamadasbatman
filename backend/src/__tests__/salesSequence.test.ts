import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import {
  enrollSalesSequence,
  processSalesSequenceTick,
} from '../services/salesSequence.service'
import { cleanupOrgs, createTestLead, createTestOrg } from './testHelpers'

const orgIds: string[] = []

before(async () => {
  // The pretest guard supplies an isolated TEST_DATABASE_URL before this file
  // imports any Prisma-backed helper.
})

after(async () => {
  await cleanupOrgs(orgIds)
  await prisma.$disconnect()
})

test('enrolment and worker are idempotent for a CRM task sequence', async () => {
  const org = await createTestOrg('test-sales-sequence')
  orgIds.push(org.id)
  const lead = await createTestLead(org.id, { name: 'Sequence Lead' })
  const program = await prisma.growthProgram.create({
    data: {
      orgId: org.id,
      type: 'sales_sequence',
      name: 'Secuencia de prueba',
      status: 'draft',
      config: {
        leadIds: [lead.id],
        steps: [{ key: 'call-task', type: 'task', delayDays: 0, title: 'Llamar al lead', priority: 'high' }],
      },
    },
  })

  const first = await enrollSalesSequence(org.id, program.id, [lead.id], 'test-user')
  const replay = await enrollSalesSequence(org.id, program.id, [lead.id], 'test-user')
  assert.equal(first.created, 1)
  assert.equal(replay.created, 0)
  assert.equal(replay.alreadyEnrolled, 1)

  const tick = await processSalesSequenceTick(10, 'test-sequence-worker')
  assert.equal(tick.claimed, 1)
  const replayTick = await processSalesSequenceTick(10, 'test-sequence-worker')
  assert.equal(replayTick.claimed, 0)

  const [taskCount, enrollment] = await Promise.all([
    prisma.task.count({ where: { orgId: org.id, source: 'sequence' } }),
    prisma.salesSequenceEnrollment.findUnique({ where: { programId_leadId: { programId: program.id, leadId: lead.id } } }),
  ])
  assert.equal(taskCount, 1)
  assert.equal(enrollment?.status, 'completed')
})
