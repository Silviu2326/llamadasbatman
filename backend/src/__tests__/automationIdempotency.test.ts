import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createTestOrg, cleanupOrgs } from './testHelpers'
import { prisma } from '../lib/prisma'
import { createAutomation, runAutomationsForEvent, publishAutomation } from '../services/automations.service'

/**
 * P0-07/AU-02: un run se reclama por (orgId, automationId, triggerEventId) —
 * procesar el mismo evento dos veces (el outbox reintenta, un webhook llega
 * duplicado) no debe crear un segundo run ni re-ejecutar las acciones si el
 * primero ya tuvo éxito.
 */

let org: Awaited<ReturnType<typeof createTestOrg>>

before(async () => {
  org = await createTestOrg()
})

after(async () => {
  await cleanupOrgs([org.id])
})

test('runAutomationsForEvent no duplica el run para el mismo triggerEventId', async () => {
  const automation = await createAutomation(org.id, {
    name: 'Test log on lead.created',
    trigger: { event: 'lead.created' },
    actions: [{ type: 'log' }],
  })

  const eventId = `test-event-${automation.id}`
  await runAutomationsForEvent(org.id, 'lead.created', { eventId, leadId: 'fake-lead-id' })
  await runAutomationsForEvent(org.id, 'lead.created', { eventId, leadId: 'fake-lead-id' })

  const runs = await prisma.automationRun.findMany({ where: { orgId: org.id, automationId: automation.id } })
  assert.equal(runs.length, 1, 'debe existir un único AutomationRun para el mismo triggerEventId')
  assert.equal(runs[0].status, 'succeeded')

  const stepRuns = await prisma.automationStepRun.findMany({ where: { runId: runs[0].id } })
  assert.equal(stepRuns.length, 1, 'la acción "log" debe tener un único AutomationStepRun, no uno por intento')
  assert.equal(stepRuns[0].attempt, 1, 'el segundo runAutomationsForEvent no debe reintentar un paso ya succeeded')
})

test('eventos no reconocidos en el catálogo canónico no disparan ningún run (documenta el comportamiento, no un bug)', async () => {
  const result = await runAutomationsForEvent(org.id, 'evento.inventado.sin.alias', { eventId: 'x' })
  assert.equal(result.triggered, 0)
})

test('los eventos de oportunidad publicados por pipeline sí llegan al motor', async () => {
  const automation = await createAutomation(org.id, {
    name: 'Test opportunity.created',
    trigger: { event: 'opportunity.created' },
    actions: [{ type: 'log' }],
  })

  const result = await runAutomationsForEvent(org.id, 'opportunity.created', {
    eventId: `test-opportunity-${automation.id}`,
    opportunityId: 'fake-opportunity-id',
  })

  assert.equal(result.triggered, 1)
  const run = await prisma.automationRun.findFirst({ where: { orgId: org.id, automationId: automation.id } })
  assert.ok(run)
  assert.equal(run!.status, 'succeeded')
})

test('un run ejecuta el snapshot de AutomationVersion, no automation.actions en vivo tras editarla', async () => {
  const automation = await createAutomation(org.id, {
    name: 'Test versioned log',
    trigger: { event: 'message.received' },
    actions: [{ type: 'log' }],
  })
  const version1 = await publishAutomation(org.id, undefined, automation.id)
  assert.equal(version1.version, 1)

  // Editar la automatización EN VIVO tras publicar (sin publicar una v2) no
  // debe afectar qué actions ejecuta un run que se ata a la v1 publicada.
  await prisma.automation.update({
    where: { id: automation.id },
    data: { actions: [{ type: 'log' }, { type: 'log' }, { type: 'log' }] as any },
  })

  const eventId = `test-versioned-${automation.id}`
  await runAutomationsForEvent(org.id, 'message.received', { eventId })

  const run = await prisma.automationRun.findFirst({ where: { orgId: org.id, automationId: automation.id } })
  assert.ok(run, 'debe existir un run')
  assert.equal(run!.automationVersionId, version1.id, 'el run debe quedar atado a la versión publicada')

  const stepRuns = await prisma.automationStepRun.findMany({ where: { runId: run!.id } })
  assert.equal(stepRuns.length, 1, 'debe ejecutar solo 1 paso (el snapshot de la v1 publicada), no los 3 de automation.actions en vivo')
})
