process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { ensureProvidersRegistered } from '../providers'
import { isPermission } from '../access-control/permissions'
import { getMicroapp } from '../microapps/registry'
import type { MicroappCtx } from '../microapps/types'
import { STUDIO_OPS_49_TO_66_MAP } from '../microapps/apps/studioOpsPack49to66'
import { validateMicroappResultEnvelope } from '../microapps/quality'

ensureProvidersRegistered()

const expected = {
  49: 'virtual-creative-director', 50: 'consented-synthetic-casting', 51: 'production-continuity-inspector', 52: 'video-ad-inspector',
  53: 'studio-broll-generator', 54: 'intelligent-format-adapter', 55: 'trailer-cutdown-generator', 56: 'audiovisual-localizer',
  57: 'product-video-generator', 58: 'blind-provider-comparator', 59: 'ai-spend-auditor', 60: 'ai-stack-optimizer',
  61: 'provider-change-monitor', 62: 'declarative-microapp-generator', 63: 'flow-auditor', 64: 'ai-cost-simulator',
  65: 'broken-automation-detector', 66: 'client-compliance-pack',
}

test('49–66 tienen un slug único, manifiesto completo y dependencias autorizables', () => {
  assert.deepEqual(STUDIO_OPS_49_TO_66_MAP, expected)
  const ids = Object.values(STUDIO_OPS_49_TO_66_MAP)
  assert.equal(ids.length, 18)
  assert.equal(new Set(ids).size, 18)
  for (const id of ids) {
    const manifest = getMicroapp(id)
    assert.ok(manifest, `falta ${id}`)
    assert.equal(manifest.version, '1.3.0')
    assert.ok(manifest.promise.length > 20)
    assert.ok(manifest.uiSchema.length > 0)
    assert.ok(manifest.uiSchema.every(field => field.key && field.label && field.widget))
    assert.ok(manifest.dataAccess.every(isPermission), `${id} declara un permiso fuera del catálogo`)
    assert.equal(typeof manifest.estimateCost, 'function')
    assert.equal(typeof manifest.run, 'function')
  }
})

test('el generador de vídeo estima coste conservador y encola un job con routing explícito', async () => {
  const manifest = getMicroapp('product-video-generator')!
  const input = { product: 'Botella de acero reutilizable, capacidad declarada de 750 ml', objective: 'Mostrar apertura y cierre', referenceAssetIds: ['asset-product'], providerId: 'runway', referenceRightsConfirmed: true, maxGenerationCostCents: 10_000 }
  const estimate = await manifest.estimateCost(input)
  assert.ok(estimate.cents > 0)
  const calls: unknown[] = []
  const ctx: MicroappCtx = { orgId: 'org-1', jobId: 'parent', capability: async () => ({}), enqueueCapability: async (...args) => { calls.push(args); return { jobId: 'video-child' } }, log() {} }
  const assetDelegate = prisma.asset as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = assetDelegate.findMany
  let where: unknown
  assetDelegate.findMany = async (args: any) => { where = args.where; return [{ id: 'asset-product', expiresAt: null, license: { kind: 'test' } }] }
  try {
    const result = await manifest.run(ctx, input)
    validateMicroappResultEnvelope(manifest.id, result)
    assert.equal((result.data as { jobId: string }).jobId, 'video-child')
    assert.equal(calls.length, 1)
    assert.deepEqual((calls[0] as any[])[2], { providerId: 'runway', maxCostCents: estimate.cents })
    assert.equal(result.evidence[0].sourceRef?.id, 'video-child')
    assert.deepEqual(where, { orgId: 'org-1', id: { in: ['asset-product'] } })
  } finally { assetDelegate.findMany = original }
})

test('b-roll produce shots estructurados y un job hijo por clip', async () => {
  const manifest = getMicroapp('studio-broll-generator')!
  const calls: unknown[] = []
  const ctx: MicroappCtx = {
    orgId: 'org-1', jobId: 'parent-broll', log() {},
    capability: async () => ({ text: JSON.stringify({ shots: [
      { id: 's1', insertion: '00:02', purpose: 'Demostrar contexto', prompt: 'Oficina recibiendo una llamada', durationS: 4 },
      { id: 's2', insertion: '00:08', purpose: 'Mostrar resultado', prompt: 'Agenda con una cita confirmada', durationS: 4 },
    ] }) }),
    enqueueCapability: async (...args) => { calls.push(args); return { jobId: `child-${calls.length}` } },
  }
  const result = await manifest.run(ctx, { script: 'Una llamada perdida se convierte en una cita.', generateCount: 2, referenceRightsConfirmed: true, maxGenerationCostCents: 10_000 })
  validateMicroappResultEnvelope(manifest.id, result)
  const output = manifest.outputSchema.parse(result.data) as { jobs: unknown[] }
  assert.equal(output.jobs.length, 2)
  assert.equal(calls.length, 2)
  for (const call of calls as any[][]) assert.ok(Number(call[2]?.maxCostCents) >= 0, 'cada clip debe llegar al router con tope propio')
  assert.equal(result.evidence.length, 2)
})

test('el generador de microapps solo acepta manifiesto declarativo validado y calcula checksum', async () => {
  const manifest = getMicroapp('declarative-microapp-generator')!
  const generated = {
    schemaVersion: 1, kind: 'microapp', entrypoint: 'result', permissions: [], capabilities: ['llm.generate'],
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
    outputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    recipe: { nodes: [
      { id: 'generate', type: 'capability', capability: 'llm.generate', input: { prompt: '$.input.prompt' }, config: { maxCostCents: 25 } },
      { id: 'result', type: 'output', input: { text: '$.nodes.generate.text' } },
    ], edges: [{ from: 'generate', to: 'result' }] },
  }
  const ctx: MicroappCtx = { orgId: 'org-1', jobId: 'manifest-job', capability: async () => ({ text: JSON.stringify(generated) }), log() {} }
  const result = await manifest.run(ctx, { name: 'Resumen seguro', promise: 'Resume un texto sin inventar ningún dato del original', inputs: [{ key: 'prompt', type: 'string', required: true, description: 'Texto original' }], outputs: [{ key: 'text', type: 'string', description: 'Resumen trazable' }], allowedCapabilities: ['llm.generate'], permissions: [], maxCostCentsPerCapability: 25, recipeDescription: 'Generar un resumen fiel y devolver solamente el texto estructurado.' })
  validateMicroappResultEnvelope(manifest.id, result)
  const output = manifest.outputSchema.parse(result.data) as { checksum: string; validation: { arbitraryCode: boolean; valid: boolean } }
  assert.match(output.checksum, /^sha256:[a-f0-9]{64}$/)
  assert.equal(output.validation.valid, true)
  assert.equal(output.validation.arbitraryCode, false)
})

test('casting fuerza bloqueo si el grant real no existe en la organización', async () => {
  const manifest = getMicroapp('consented-synthetic-casting')!
  const consentDelegate = prisma.consentGrant as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = consentDelegate.findMany
  let where: unknown
  consentDelegate.findMany = async (args: any) => { where = args.where; return [] }
  try {
    const ctx: MicroappCtx = { orgId: 'org-tenant', jobId: 'casting-job', log() {}, capability: async () => ({ text: JSON.stringify({ casting: [{ roleId: 'host', candidateId: 'real-1', fitReasons: ['Buen tono'], rightsStatus: 'eligible', rightsReasons: [], rehearsalPrompt: 'Presentar' }], unresolvedRoles: [] }) }) }
    const result = await manifest.run(ctx, { roles: [{ id: 'host', description: 'Presentador', actingRequirements: [] }], candidates: [{ id: 'real-1', synthetic: false, traits: ['claro'], consentGrantId: 'grant-foreign', allowedRegions: ['ES'], allowedChannels: ['web'], exclusions: [] }], targetRegions: ['ES'], targetChannels: ['web'] })
    validateMicroappResultEnvelope(manifest.id, result)
    const output = manifest.outputSchema.parse(result.data) as { casting: Array<{ rightsStatus: string }>; consentChecklist: Array<{ status: string }> }
    assert.equal(output.casting[0].rightsStatus, 'blocked')
    assert.equal(output.consentChecklist[0].status, 'missing')
    assert.deepEqual(where, { orgId: 'org-tenant', id: { in: ['grant-foreign'] } })
  } finally { consentDelegate.findMany = original }
})

test('auditor de flujo detecta ciclos y capability ausente sin consultar base de datos', async () => {
  const manifest = getMicroapp('flow-auditor')!
  const ctx: MicroappCtx = { orgId: 'org-1', jobId: 'flow-job', capability: async () => ({}), log() {} }
  const result = await manifest.run(ctx, { graph: { nodes: [{ key: 'a', type: 'capability', capability: 'does.notexist' }, { key: 'b', type: 'output' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] } })
  validateMicroappResultEnvelope(manifest.id, result)
  const output = manifest.outputSchema.parse(result.data) as { valid: boolean; cycles: unknown[]; missingCapabilities: string[] }
  assert.equal(output.valid, false)
  assert.ok(output.cycles.length)
  assert.deepEqual(output.missingCapabilities, ['does.notexist'])
  assert.ok(result.evidence.length)
})

test('detector de automatizaciones siempre emite evidencia de snapshot aunque todo esté sano', async () => {
  const manifest = getMicroapp('broken-automation-detector')!
  const delegate = prisma.automation as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = delegate.findMany
  delegate.findMany = async () => []
  try {
    const ctx: MicroappCtx = { orgId: 'org-1', jobId: 'automation-job', capability: async () => ({}), log() {} }
    const result = await manifest.run(ctx, {})
    validateMicroappResultEnvelope(manifest.id, result)
    assert.ok(result.evidence.length >= 1)
    assert.equal(result.evidence[0].sourceRef?.kind, 'automation-snapshot')
  } finally { delegate.findMany = original }
})

test('casting normaliza mayúsculas de región/canal sin relajar tenant ni vigencia', async () => {
  const app = getMicroapp('consented-synthetic-casting')!
  const consentDelegate = prisma.consentGrant as any
  const assetDelegate = prisma.asset as any
  const originalConsent = consentDelegate.findMany
  const originalAssets = assetDelegate.findMany
  consentDelegate.findMany = async () => [{ id: 'grant-es', kind: 'face', status: 'active', revokedAt: null, expiresAt: null, scope: { regions: ['es'], channels: ['WEB'] } }]
  assetDelegate.findMany = async () => []
  try {
    const result = await app.run({ orgId: 'org-1', jobId: 'casting-case', log() {}, capability: async () => ({ text: JSON.stringify({ casting: [{ roleId: 'host', candidateId: 'real-1', fitReasons: ['Tono'], rightsStatus: 'eligible', rightsReasons: [], rehearsalPrompt: 'Ensayar' }], unresolvedRoles: [] }) }) }, { roles: [{ id: 'host', description: 'Presentador principal', actingRequirements: [] }], candidates: [{ id: 'real-1', synthetic: false, traits: ['claro'], consentGrantId: 'grant-es', allowedRegions: ['es'], allowedChannels: ['web'], exclusions: [] }], targetRegions: ['ES'], targetChannels: ['Web'] })
    const output = app.outputSchema.parse(result.data) as any
    assert.equal(output.casting[0].rightsStatus, 'eligible')
    assert.equal(output.consentChecklist[0].status, 'verified')
  } finally { consentDelegate.findMany = originalConsent; assetDelegate.findMany = originalAssets }
})

test('auditor de gasto aplica filtros tenant-safe y evita conciliación parcial de jobs', async () => {
  const app = getMicroapp('ai-spend-auditor')!
  const usageDelegate = prisma.usageRecord as any
  const jobDelegate = prisma.job as any
  const originalUsage = usageDelegate.findMany
  const originalJobs = jobDelegate.findMany
  let usageWhere: any
  let jobsCalled = false
  usageDelegate.findMany = async (args: any) => { usageWhere = args.where; return [{ provider: 'runway', capability: 'video.generate', billingMode: 'managed', quantity: 1, costCents: 100, priceCents: 90, jobId: 'job-1' }] }
  jobDelegate.findMany = async () => { jobsCalled = true; return [] }
  try {
    const result = await app.run({ orgId: 'org-filter', jobId: 'spend-filter', log() {}, capability: async () => ({}) }, { daysBack: 7, providerIds: ['runway'], capabilities: ['video.generate'], billingModes: ['managed'], minimumAnomalyCents: 5, mismatchToleranceCents: 1 })
    const output = app.outputSchema.parse(result.data) as any
    assert.equal(usageWhere.orgId, 'org-filter')
    assert.deepEqual(usageWhere.provider, { in: ['runway'] })
    assert.deepEqual(usageWhere.capability, { in: ['video.generate'] })
    assert.deepEqual(usageWhere.billingMode, { in: ['managed'] })
    assert.equal(jobsCalled, false)
    assert.equal(output.scope.jobReconciliationIncluded, false)
    assert.equal(output.anomalies[0].amountCents, 10)
    assert.ok(output.limitations.length)
  } finally { usageDelegate.findMany = originalUsage; jobDelegate.findMany = originalJobs }
})

test('monitor de proveedor filtra alcance y no inventa cambios por reordenación de arrays', async () => {
  const app = getMicroapp('provider-change-monitor')!
  const ctx: MicroappCtx = { orgId: 'org-1', jobId: 'provider-monitor', log() {}, capability: async () => ({}) }
  const baseline = await app.run(ctx, {})
  const first = (baseline.data as any).currentSnapshot[0]
  assert.ok(first)
  const reordered = { ...first, regions: [...first.regions].reverse(), authModes: [...first.authModes].reverse(), capabilities: [...first.capabilities].reverse().map((item: any) => ({ ...item, models: [...item.models].reverse() })) }
  const result = await app.run(ctx, { previousSnapshot: [reordered], providerIds: [first.providerId], areas: ['regions', 'authModes', 'capabilities'], minimumSeverity: 'low', includeNewAndRemoved: false })
  const output = app.outputSchema.parse(result.data) as any
  assert.deepEqual(output.scope.providerIds, [first.providerId])
  assert.deepEqual(output.changes, [])
  assert.deepEqual(output.newProviders, [])
  assert.deepEqual(output.removedProviders, [])
})

test('compliance no presenta retención como aprobada y trata licencia vacía como ausente', async () => {
  const app = getMicroapp('client-compliance-pack')!
  const delegates: Array<[any, string, any]> = []
  const mock = (target: any, method: string, fn: any) => { delegates.push([target, method, target[method]]); target[method] = fn }
  mock(prisma.contactConsent as any, 'count', async () => 1)
  mock(prisma.consentGrant as any, 'count', async () => 0)
  mock(prisma.optOut as any, 'count', async () => 0)
  mock(prisma.asset as any, 'findMany', async () => [{ license: {} }])
  try {
    const result = await app.run({ orgId: 'org-1', jobId: 'compliance', log() {}, capability: async () => ({}) }, { clientName: 'Cliente', regions: ['ES'], channels: ['web'], purposes: ['marketing'] })
    const output = app.outputSchema.parse(result.data) as any
    assert.equal(output.inventory.assetsMissingLicense, 1)
    assert.equal(output.controls.find((item: any) => item.control.includes('Revocaciones')).status, 'review')
    assert.ok(output.blockers.includes('Assets publicados con licencia'))
  } finally { for (const [target, method, original] of delegates.reverse()) target[method] = original }
})

test('flow auditor bloquea grafos sin input/output declarados', async () => {
  const app = getMicroapp('flow-auditor')!
  const result = await app.run({ orgId: 'org-1', jobId: 'flow-io', log() {}, capability: async () => ({}) }, { graph: { nodes: [{ key: 'work', type: 'capability', capability: 'llm.generate' }], edges: [] } })
  const output = app.outputSchema.parse(result.data) as any
  assert.equal(output.valid, false)
  assert.ok(output.findings.some((item: any) => item.code === 'NO_INPUT_NODE'))
  assert.ok(output.findings.some((item: any) => item.code === 'NO_OUTPUT_NODE'))
})
