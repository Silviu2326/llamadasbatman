import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import {
  enrollSalesSequence,
  pauseSalesSequence,
  processSalesSequenceTick,
  resumeSalesSequence,
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

// EM-113: un paso de llamada o de WhatsApp sobre un lead sin teléfono no puede
// ejecutarse nunca. Se dice al matricular, no días después en un log que nadie
// mira, y la secuencia no se queda "activa" prometiendo algo que no hará.
test('a call step blocks enrolment when the lead has no phone', async () => {
  const org = await createTestOrg('test-sequence-call')
  orgIds.push(org.id)
  const lead = await createTestLead(org.id, { name: 'Lead sin teléfono' })
  const program = await prisma.growthProgram.create({
    data: {
      orgId: org.id,
      type: 'sales_sequence',
      name: 'Secuencia con llamada',
      status: 'draft',
      config: {
        leadIds: [lead.id],
        steps: [{ key: 'llamada', type: 'call', delayDays: 0 }],
      },
    },
  })

  const result = await enrollSalesSequence(org.id, program.id, [lead.id], 'test-user')
  assert.equal(result.created, 0)
  assert.equal(result.blocked, 1)

  const enrollment = await prisma.salesSequenceEnrollment.findUnique({
    where: { programId_leadId: { programId: program.id, leadId: lead.id } },
  })
  assert.equal(enrollment?.status, 'blocked')
  assert.equal(enrollment?.stopReason, 'LEAD_PHONE_MISSING')

  // Y el paso no queda pendiente: el worker no debe reclamarlo jamás.
  const pending = await prisma.salesSequenceStepRun.count({ where: { programId: program.id, status: 'pending' } })
  assert.equal(pending, 0)
})

test('a WhatsApp step without an approved template is rejected at configuration time', async () => {
  const org = await createTestOrg('test-sequence-whatsapp')
  orgIds.push(org.id)
  const lead = await createTestLead(org.id, { name: 'Lead WhatsApp' })
  const program = await prisma.growthProgram.create({
    data: {
      orgId: org.id,
      type: 'sales_sequence',
      name: 'Secuencia WhatsApp',
      status: 'draft',
      config: {
        leadIds: [lead.id],
        // Sin contentSid: fuera de la ventana de 24 h Twilio rechazaría el
        // texto libre, así que se corta al configurar y no en ejecución.
        steps: [{ key: 'wa', type: 'whatsapp', delayDays: 1, body: 'Hola' }],
      },
    },
  })

  await assert.rejects(
    () => enrollSalesSequence(org.id, program.id, [lead.id], 'test-user'),
    (error: Error & { code?: string }) => error.code === 'SEQUENCE_TEMPLATE_REQUIRED',
  )
})

test('resuming a sequence preserves each pending step wait', async () => {
  const org = await createTestOrg('test-sequence-resume-delay')
  orgIds.push(org.id)
  const lead = await createTestLead(org.id, { name: 'Lead con espera' })
  const program = await prisma.growthProgram.create({
    data: {
      orgId: org.id,
      type: 'sales_sequence',
      name: 'Secuencia con espera',
      status: 'draft',
      config: {
        leadIds: [lead.id],
        steps: [
          { key: 'first', type: 'task', delayDays: 0, title: 'Primer paso' },
          { key: 'second', type: 'task', delayDays: 5, title: 'Segundo paso' },
        ],
      },
    },
  })

  await enrollSalesSequence(org.id, program.id, [lead.id], 'test-user')
  await pauseSalesSequence(org.id, program.id)
  await resumeSalesSequence(org.id, program.id)

  const second = await prisma.salesSequenceStepRun.findFirstOrThrow({
    where: { programId: program.id, leadId: lead.id, stepKey: 'second' },
  })
  assert.equal(second.status, 'pending')
  assert.ok(second.availableAt.getTime() >= second.dueAt.getTime())
  assert.ok(second.availableAt.getTime() > Date.now())
})