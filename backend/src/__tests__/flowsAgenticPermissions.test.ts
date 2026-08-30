process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Prisma } from '@prisma/client'
import '../providers'
import { prisma } from '../lib/prisma'
import { flowEventIdempotencyKey, publishFlowVersion, startFlowRun } from '../services/flows.service'
import { parseFlowRunRequest } from '../controllers/flows.controller'
import { agenticFlowTemplateFor } from '../microapps/agenticFlowTemplate'
import { getMicroapp } from '../microapps/registry'
import { registerCoreCapabilityContracts } from '../providers/capabilities'

registerCoreCapabilityContracts()

test('un Flow agentic no permite saltarse los permisos de datos de su microapp', async () => {
  const manifest = getMicroapp('opportunity-close-plan')
  assert.ok(manifest)
  const template = agenticFlowTemplateFor(manifest)
  const originals = {
    flowFindFirst: prisma.flow.findFirst,
    versionFindUnique: prisma.flowVersion.findUnique,
    organizationFindUnique: prisma.organization.findUnique,
    membershipFindFirst: prisma.organizationMembership.findFirst,
    flowRunCreate: prisma.flowRun.create,
  }
  let created = false
  ;(prisma.flow as any).findFirst = async () => ({ id: 'flow-1', currentVersionId: 'version-1' })
  ;(prisma.flowVersion as any).findUnique = async () => ({ id: 'version-1', graph: template.graph })
  ;(prisma.organization as any).findUnique = async () => ({ plan: 'pro' })
  ;(prisma.organizationMembership as any).findFirst = async () => ({ role: 'guest' })
  ;(prisma.flowRun as any).create = async () => { created = true; return { id: 'run-1' } }
  try {
    await assert.rejects(
      () => startFlowRun({ orgId: 'org-1', flowId: 'flow-1', createdById: 'user-1', variables: { input: {} } }),
      (error: unknown) => (error as { code?: string }).code === 'FLOW_DATA_ACCESS_DENIED',
    )
    assert.equal(created, false)

    ;(prisma.organizationMembership as any).findFirst = async () => ({ role: 'owner' })
    const run = await startFlowRun({ orgId: 'org-1', flowId: 'flow-1', createdById: 'owner-1', variables: { input: {} } })
    assert.deepEqual(run, { id: 'run-1' })
    assert.equal(created, true)
  } finally {
    ;(prisma.flow as any).findFirst = originals.flowFindFirst
    ;(prisma.flowVersion as any).findUnique = originals.versionFindUnique
    ;(prisma.organization as any).findUnique = originals.organizationFindUnique
    ;(prisma.organizationMembership as any).findFirst = originals.membershipFindFirst
    ;(prisma.flowRun as any).create = originals.flowRunCreate
  }
})

test('un Flow tenant no puede publicarse sin principal y el trigger explícito conserva actor', async () => {
  const manifest = getMicroapp('opportunity-close-plan')
  assert.ok(manifest)
  const template = agenticFlowTemplateFor(manifest)
  await assert.rejects(
    () => publishFlowVersion({ orgId: 'org-1', slug: 'sin-actor', name: 'Sin actor', graph: template.graph }),
    (error: unknown) => (error as { code?: string }).code === 'FLOW_CREATOR_REQUIRED',
  )

  const originals = {
    flowFindFirst: prisma.flow.findFirst,
    versionFindUnique: prisma.flowVersion.findUnique,
    membershipFindFirst: prisma.organizationMembership.findFirst,
    organizationFindUnique: prisma.organization.findUnique,
    flowRunCreate: prisma.flowRun.create,
  }
  let persistedTrigger: unknown
  ;(prisma.flow as any).findFirst = async () => ({ id: 'flow-1', orgId: 'org-1', currentVersionId: 'version-1' })
  ;(prisma.flowVersion as any).findUnique = async () => ({ id: 'version-1', createdById: 'creator-1', graph: template.graph })
  ;(prisma.organizationMembership as any).findFirst = async () => ({ role: 'owner' })
  ;(prisma.organization as any).findUnique = async () => ({ plan: 'pro' })
  ;(prisma.flowRun as any).create = async ({ data }: { data: { trigger: unknown } }) => {
    persistedTrigger = data.trigger
    return { id: 'run-1' }
  }
  try {
    await startFlowRun({
      orgId: 'org-1',
      flowId: 'flow-1',
      createdById: 'actor-1',
      trigger: { type: 'synthetic', caseId: 'case-1' },
    })
    assert.deepEqual(persistedTrigger, { type: 'synthetic', caseId: 'case-1', createdById: 'actor-1' })
  } finally {
    ;(prisma.flow as any).findFirst = originals.flowFindFirst
    ;(prisma.flowVersion as any).findUnique = originals.versionFindUnique
    ;(prisma.organizationMembership as any).findFirst = originals.membershipFindFirst
    ;(prisma.organization as any).findUnique = originals.organizationFindUnique
    ;(prisma.flowRun as any).create = originals.flowRunCreate
  }
})

test('un Flow con microapps falla cerrado sin entitlement aunque llegue por el motor', async () => {
  const manifest = getMicroapp('opportunity-close-plan')
  assert.ok(manifest)
  const template = agenticFlowTemplateFor(manifest)
  const originals = {
    flowFindFirst: prisma.flow.findFirst,
    versionFindUnique: prisma.flowVersion.findUnique,
    organizationFindUnique: prisma.organization.findUnique,
    flowRunCreate: prisma.flowRun.create,
  }
  let created = false
  ;(prisma.flow as any).findFirst = async () => ({ id: 'flow-1', orgId: 'org-1', currentVersionId: 'version-1' })
  ;(prisma.flowVersion as any).findUnique = async () => ({ id: 'version-1', createdById: 'creator-1', graph: template.graph })
  ;(prisma.organization as any).findUnique = async () => ({ plan: 'free' })
  ;(prisma.flowRun as any).create = async () => { created = true; return { id: 'run-1' } }
  try {
    await assert.rejects(
      () => startFlowRun({ orgId: 'org-1', flowId: 'flow-1' }),
      (error: unknown) => (error as { code?: string }).code === 'FLOW_MICROAPPS_ENTITLEMENT_REQUIRED',
    )
    assert.equal(created, false)
  } finally {
    ;(prisma.flow as any).findFirst = originals.flowFindFirst
    ;(prisma.flowVersion as any).findUnique = originals.versionFindUnique
    ;(prisma.organization as any).findUnique = originals.organizationFindUnique
    ;(prisma.flowRun as any).create = originals.flowRunCreate
  }
})

test('la API resuelve una única clave entre body y cabecera y rechaza colisiones', () => {
  assert.deepEqual(parseFlowRunRequest({ variables: { x: 1 }, idempotencyKey: 'body-key-123' }, undefined), {
    variables: { x: 1 },
    idempotencyKey: 'body-key-123',
  })
  assert.equal(parseFlowRunRequest({}, 'header-key-123').idempotencyKey, 'header-key-123')
  assert.throws(
    () => parseFlowRunRequest({ idempotencyKey: 'body-key-123' }, 'header-key-456'),
    (error: unknown) => (error as { code?: string; statusCode?: number }).code === 'FLOW_IDEMPOTENCY_KEY_CONFLICT'
      && (error as { statusCode?: number }).statusCode === 409,
  )
  assert.throws(
    () => parseFlowRunRequest({}, 'short'),
    (error: unknown) => (error as { code?: string }).code === 'FLOW_IDEMPOTENCY_KEY_INVALID',
  )
  assert.throws(
    () => parseFlowRunRequest({ dryRun: 'yes' }, undefined),
    (error: unknown) => (error as { code?: string }).code === 'FLOW_RUN_CONFIG_INVALID',
  )
})

test('startFlowRun recupera atómicamente el run ganador ante P2002', async () => {
  const manifest = getMicroapp('opportunity-close-plan')
  assert.ok(manifest)
  const template = agenticFlowTemplateFor(manifest)
  const originals = {
    flowFindFirst: prisma.flow.findFirst,
    versionFindUnique: prisma.flowVersion.findUnique,
    organizationFindUnique: prisma.organization.findUnique,
    membershipFindFirst: prisma.organizationMembership.findFirst,
    flowRunCreate: prisma.flowRun.create,
    flowRunFindUnique: prisma.flowRun.findUnique,
  }
  let createData: Record<string, unknown> | undefined
  let replayWhere: unknown
  const existing = {
    id: 'run-winner', orgId: 'org-1', flowId: 'flow-1', flowVersionId: 'version-1',
    idempotencyKey: 'retry-key-123', budgetCents: null, dryRun: false,
    variables: { ...template.graph.variables, input: {} },
    trigger: { type: 'manual', createdById: 'owner-1' },
  }
  ;(prisma.flow as any).findFirst = async () => ({ id: 'flow-1', orgId: 'org-1', currentVersionId: 'version-1' })
  ;(prisma.flowVersion as any).findUnique = async () => ({ id: 'version-1', createdById: 'owner-1', graph: template.graph })
  ;(prisma.organization as any).findUnique = async () => ({ plan: 'pro' })
  ;(prisma.organizationMembership as any).findFirst = async () => ({ role: 'owner' })
  ;(prisma.flowRun as any).create = async ({ data }: { data: Record<string, unknown> }) => {
    createData = data
    throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.16.0' })
  }
  ;(prisma.flowRun as any).findUnique = async ({ where }: { where: unknown }) => { replayWhere = where; return existing }
  try {
    const run = await startFlowRun({
      orgId: 'org-1', flowId: 'flow-1', createdById: 'owner-1', variables: { input: {} }, idempotencyKey: ' retry-key-123 ',
    })
    assert.equal(run, existing)
    assert.equal(createData?.idempotencyKey, 'retry-key-123')
    assert.deepEqual(replayWhere, {
      orgId_flowId_idempotencyKey: { orgId: 'org-1', flowId: 'flow-1', idempotencyKey: 'retry-key-123' },
    })

    existing.variables = { ...template.graph.variables, input: { changed: true } }
    await assert.rejects(
      () => startFlowRun({
        orgId: 'org-1', flowId: 'flow-1', createdById: 'owner-1', variables: { input: {} }, idempotencyKey: 'retry-key-123',
      }),
      (error: unknown) => (error as { code?: string; statusCode?: number }).code === 'FLOW_IDEMPOTENCY_KEY_REUSED'
        && (error as { statusCode?: number }).statusCode === 409,
    )
  } finally {
    ;(prisma.flow as any).findFirst = originals.flowFindFirst
    ;(prisma.flowVersion as any).findUnique = originals.versionFindUnique
    ;(prisma.organization as any).findUnique = originals.organizationFindUnique
    ;(prisma.organizationMembership as any).findFirst = originals.membershipFindFirst
    ;(prisma.flowRun as any).create = originals.flowRunCreate
    ;(prisma.flowRun as any).findUnique = originals.flowRunFindUnique
  }
})

test('los eventos usan clave compacta determinista y no hacen find-then-create', () => {
  const first = flowEventIdempotencyKey('opportunity.won', 'event-1')
  assert.equal(first, flowEventIdempotencyKey('opportunity.won', 'event-1'))
  assert.notEqual(first, flowEventIdempotencyKey('opportunity.won', 'event-2'))
  assert.notEqual(first, flowEventIdempotencyKey('lead.created', 'event-1'))
  assert.match(first, /^event:[a-f0-9]{64}$/)

  const source = readFileSync(resolve(process.cwd(), 'src/services/flows.service.ts'), 'utf8')
  assert.match(source, /idempotencyKey: eventId \? flowEventIdempotencyKey\(topic, eventId\) : undefined/)
  assert.doesNotMatch(source, /trigger:\s*\{\s*path:\s*\['eventId'\]/)
})

test('la persistencia declara unicidad tenant-safe sin modificar migraciones anteriores', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8')
  const migration = readFileSync(resolve(process.cwd(), 'prisma/migrations/20260819190000_flow_run_root_idempotency/migration.sql'), 'utf8')
  assert.match(schema, /model FlowRun[\s\S]*?idempotencyKey\s+String\?[\s\S]*?@@unique\(\[orgId, flowId, idempotencyKey\]\)/)
  assert.match(migration, /ALTER TABLE "FlowRun" ADD COLUMN "idempotencyKey" TEXT/)
  assert.match(migration, /UNIQUE INDEX "FlowRun_orgId_flowId_idempotencyKey_key"/)
})
