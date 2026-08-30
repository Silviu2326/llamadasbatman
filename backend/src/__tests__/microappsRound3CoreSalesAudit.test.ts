process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import { PERMISSIONS } from '../access-control/catalog'
import { ensureProvidersRegistered } from '../providers'
import { bindingsFor, getCapabilityContract, registerProvider } from '../providers/registry'
import { getMicroapp } from '../microapps/registry'
import { validateMicroappResultEnvelope } from '../microapps/quality'
import type { MicroappCtx } from '../microapps/types'
import '../microapps/apps/companyResearch360'
import '../microapps/apps/callPrep'
import '../microapps/apps/prospectDiagnosis'
import '../microapps/apps/podcastGuestResearch'
import '../microapps/apps/voiceOfCustomer'
import '../microapps/apps/contentMultiplier'
import '../microapps/apps/modelPicker'
import '../microapps/apps/cinemaConcepts'
import { OPEN_PLATFORM_WAVE1_IDS } from '../microapps/apps/openPlatformWave1'
import { GROWTH_SALES_PACK_A_IDS } from '../microapps/apps/growthSalesPackA'
import { GROWTH_SALES_PACK_B_IDS } from '../microapps/apps/growthSalesPackB'

ensureProvidersRegistered()

registerProvider({
  id: 'r5-a-byok-zero', displayName: 'R5 BYOK Zero', auth: { modes: ['byok'] },
  commercialUseAllowed: true, tosReviewedAt: '2026-08-19', docsUrl: 'https://example.com/r5-byok',
  capabilities: [{ capability: 'llm.generate', qualityTier: 'standard', limits: {}, async estimateCost() { return { cents: 0, confidence: 'exact' } }, async execute() { return { output: { text: '' } } } }],
})
registerProvider({
  id: 'r5-b-managed-zero', displayName: 'R5 Managed Zero', auth: { modes: ['managed'] },
  commercialUseAllowed: true, tosReviewedAt: '2026-08-19', docsUrl: 'https://example.com/r5-managed',
  capabilities: [{ capability: 'llm.generate', qualityTier: 'standard', limits: {}, async estimateCost() { return { cents: 0, confidence: 'exact' } }, async execute() { return { output: { text: '' } } } }],
})
registerProvider({
  id: 'r5-video-a', displayName: 'R5 Video A', auth: { modes: ['managed'] },
  commercialUseAllowed: true, tosReviewedAt: '2026-08-19', docsUrl: 'https://example.com/r5-video-a',
  capabilities: [{ capability: 'video.generate', qualityTier: 'standard', limits: {}, async estimateCost(input) { return { cents: (input as { quality?: string }).quality === 'draft' ? 0 : 10, confidence: 'exact' } }, async execute() { return { output: {} } } }],
})
registerProvider({
  id: 'r5-video-b', displayName: 'R5 Video B', auth: { modes: ['managed'] },
  commercialUseAllowed: true, tosReviewedAt: '2026-08-19', docsUrl: 'https://example.com/r5-video-b',
  capabilities: [{ capability: 'video.generate', qualityTier: 'standard', limits: {}, async estimateCost(input) { return { cents: (input as { quality?: string }).quality === 'draft' ? 4 : 3, confidence: 'exact' } }, async execute() { return { output: {} } } }],
})

const CORE_IDS = [
  'company-research-360', 'call-prep', 'prospect-diagnosis', 'podcast-guest-research',
  'voice-of-customer', 'content-multiplier', 'model-picker', 'cinema-concepts',
] as const
const IDS = [...CORE_IDS, ...OPEN_PLATFORM_WAVE1_IDS, ...GROWTH_SALES_PACK_A_IDS, ...GROWTH_SALES_PACK_B_IDS]
const BASE = 'Texto de ejemplo suficientemente concreto y verificable.'

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as ZodTypeAny)
  if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType as ZodTypeAny)
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema as ZodTypeAny)
  return schema
}

function sample(schema: ZodTypeAny, key = 'value'): unknown {
  if (schema instanceof z.ZodNullable) return null
  const current = unwrap(schema)
  if (current instanceof z.ZodObject) return Object.fromEntries(Object.entries(current.shape as Record<string, ZodTypeAny>).map(([name, child]) => [name, sample(child, name)]))
  if (current instanceof z.ZodArray) {
    const count = current._def.exactLength?.value ?? current._def.minLength?.value ?? 1
    return Array.from({ length: Math.max(1, count) }, (_, index) => sample(current._def.type, `${key}-${index + 1}`))
  }
  if (current instanceof z.ZodEnum) return current.options[0]
  if (current instanceof z.ZodLiteral) return current.value
  if (current instanceof z.ZodBoolean) return true
  if (current instanceof z.ZodNumber) {
    const checks = current._def.checks as Array<{ kind: string; value?: number }>
    const min = checks.find(check => check.kind === 'min')?.value ?? 1
    const max = checks.find(check => check.kind === 'max')?.value
    return max == null ? Math.max(1, min) : Math.min(max, Math.max(1, min))
  }
  if (current instanceof z.ZodString) return current._def.checks.some((check: { kind: string }) => check.kind === 'url') ? 'https://example.com/source' : `${key} de ejemplo`
  throw new Error(`Fixture no soportado: ${current._def.typeName}`)
}

test('R4 inventaría exactamente las 41 Core/Sales y audita contratos, routing y permisos', () => {
  assert.equal(IDS.length, 41)
  assert.equal(new Set(IDS).size, 41)
  for (const id of IDS) {
    const app = getMicroapp(id)
    assert.ok(app, `falta ${id}`)
    const upgraded = new Set(['voice-of-customer', 'content-multiplier', 'model-picker', 'cinema-concepts', 'voice-agent-designer', 'call-compliance-inspector'])
    assert.equal(app.version, upgraded.has(id) ? '1.3.0' : '1.2.0', `${id}: versión obsoleta`)
    assert.equal(app.effects, 'local', `${id}: efecto externo no gobernado`)
    assert.equal(app.approvalAction, undefined, `${id}: aprobación incoherente con effects=local`)
    assert.ok(app.followUps.length, `${id}: sin siguiente acción`)
    assert.ok(app.uiSchema.some(field => field.help?.trim() || field.placeholder?.trim() || field.options?.length), `${id}: formulario sin guía`)
    for (const permission of app.dataAccess) assert.ok(PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number]), `${id}: permiso desconocido ${permission}`)
    for (const capability of app.capabilities) {
      assert.ok(getCapabilityContract(capability), `${id}: capability sin contrato ${capability}`)
      assert.ok(bindingsFor(capability).some(({ binding }) => binding.routable !== false), `${id}: capability sin routing ${capability}`)
    }
  }
})

test('R4 bloquea destinos SSRF y procedencia ambigua antes de ejecutar', () => {
  const diagnosis = getMicroapp('prospect-diagnosis')!
  for (const website of ['http://127.0.0.1', 'http://2130706433', 'http://[::1]', 'http://[fd00::1]', 'http://[fe80::1]', 'http://service.internal', 'https://example.com:8443']) {
    assert.equal(diagnosis.inputSchema.safeParse({ website }).success, false, `aceptó destino no auditable: ${website}`)
  }
  assert.equal(diagnosis.inputSchema.safeParse({ website: 'https://example.com' }).success, true)

  const companyResearch = getMicroapp('company-research-360')!
  assert.equal(companyResearch.inputSchema.safeParse({ companyName: 'Acme Industrial', website: 'no-es-url' }).success, false)
  assert.equal(companyResearch.inputSchema.safeParse({ companyName: 'Acme Industrial', website: 'ftp://example.com/file' }).success, false)
  assert.equal(companyResearch.inputSchema.safeParse({ companyName: 'Acme Industrial', website: 'https://user:secret@example.com' }).success, false)

  const podcast = getMicroapp('podcast-guest-research')!
  assert.equal(podcast.inputSchema.safeParse({ guestName: 'Ada Lovelace', links: 'https://example.com\nfile:///etc/passwd' }).success, false)
  assert.equal(podcast.inputSchema.safeParse({ guestName: 'Ada Lovelace', links: 'https://example.com https://example.com' }).success, false)

  const visualCompetitors = getMicroapp('visual-competitive-analyzer')!
  const visualBase = { brand: BASE, brandPositioning: BASE, audience: BASE }
  assert.equal(visualCompetitors.inputSchema.safeParse({ ...visualBase, competitorUrls: 'ftp://example.com\nhttps://user:secret@example.org' }).success, false)
  assert.equal(visualCompetitors.inputSchema.safeParse({ ...visualBase, competitorUrls: 'https://one.example\nhttps://one.example' }).success, false)

  const multiplier = getMicroapp('content-multiplier')!
  assert.equal(multiplier.inputSchema.safeParse({ channels: ['email'] }).success, false)
  assert.equal(multiplier.inputSchema.safeParse({ sourceText: BASE, callId: 'call-1', channels: ['email'] }).success, false)
  assert.equal(multiplier.inputSchema.safeParse({ sourceText: BASE, channels: ['email'] }).success, true)
})

test('R4 los 41 estimadores validan entrada antes de presupuestar', async () => {
  for (const id of IDS) {
    const app = getMicroapp(id)!
    await assert.rejects(() => app.estimateCost(null), `${id}: estimateCost aceptó una entrada que run rechazaría`)
  }
})

test('R4 rechaza outputs comercialmente peligrosos aunque cumplan Zod', async () => {
  const cases: Array<{ id: string; input: unknown; mutate: (output: any) => void }> = [
    {
      id: 'explainable-prospect-scoring', input: { prospectData: BASE, idealCustomerProfile: BASE, disqualifiers: BASE },
      mutate(output) { output.dimensions.forEach((item: any) => { item.dimension = 'fit'; item.weight = 0.25; item.score = 50 }); output.totalScore = 99 },
    },
    {
      id: 'call-compliance-inspector', input: { transcript: BASE, jurisdiction: 'España', policy: BASE },
      mutate(output) { output.verdict = 'pass'; output.consentAssessment.status = 'documented'; output.incidents[0].excerpt = 'frase que nunca ocurrió' },
    },
    {
      id: 'post-call-followup-generator', input: { transcript: BASE, participants: BASE, callObjective: BASE, crmStage: 'Discovery', communicationChannels: 'email' },
      mutate(output) { output.summary.exactCommitments[0].evidenceExcerpt = 'promesa inventada por el modelo' },
    },
    {
      id: 'objection-lab', input: { offer: BASE, audience: BASE, agentInstructions: BASE, knownObjections: BASE, scenarioCount: 10 },
      mutate(output) { output.scenariosGenerated = 30; output.scenarios.forEach((item: any) => { item.id = 'duplicado' }) },
    },
    {
      id: 'voice-agent-designer', input: { useCase: BASE, audience: BASE, objective: BASE, brandVoice: BASE, availableTools: 'crm_lookup', complianceRequirements: BASE, transferRules: BASE },
      mutate(output) { output.conversationStates[0].exits[0].nextState = 'estado_que_no_existe' },
    },
    {
      id: 'call-opening-optimizer', input: { openingSamples: BASE, outcomes: BASE, audience: BASE, objective: BASE, complianceDisclosure: BASE },
      mutate(output) { output.variants.forEach((variant: any) => { variant.opening = 'Hola, te llamo para comentar una oportunidad concreta.'; variant.complianceIncluded = true }) },
    },
    {
      id: 'won-customer-growth-engine', input: { customer: BASE, purchase: BASE, achievedOutcome: BASE, evidence: BASE, permissions: 'No hay permiso público; está pendiente de aprobación.' },
      mutate(output) { output.proofInventory[0].publishable = true },
    },
  ]
  for (const item of cases) {
    const app = getMicroapp(item.id)!
    const output = sample(app.outputSchema) as any
    item.mutate(output)
    assert.ok(app.outputSchema.safeParse(output).success, `${item.id}: el caso debe superar Zod para probar la guarda semántica`)
    const ctx: MicroappCtx = { orgId: 'org-r3', jobId: `job-${item.id}`, log() {}, capability: async () => ({ text: JSON.stringify(output) }) }
    await assert.rejects(() => app.run(ctx, item.input), (error: unknown) => (error as { code?: string }).code === 'MICROAPP_OUTPUT_SEMANTIC_INVALID', `${item.id}: aceptó output semánticamente peligroso`)
  }
})

test('Magnific presupuesta el mismo proveedor que fija al encolar', async () => {
  const app = getMicroapp('magnific-enhancer')!
  const input = { assetId: 'asset-image', mode: 'faithful', scale: 2, rightsConfirmed: true, maxGenerationCostCents: 100_000 }
  const binding = bindingsFor('image.upscale').find(({ provider, binding }) => provider.id === 'magnific' && binding.routable !== false)?.binding
  assert.ok(binding, 'Magnific debe estar registrado y enrutable')
  const expected = await binding.estimateCost(input)
  const actual = await app.estimateCost(input)
  assert.equal(actual.cents, expected.cents)
})

test('R5 no trata un binding BYOK gratuito como disponible para un tenant desconocido', async () => {
  const inputs: Record<string, unknown> = {
    'voice-of-customer': { daysBack: 30 },
    'content-multiplier': { sourceText: BASE, channels: ['email'] },
    'cinema-concepts': { objective: 'Explicar la propuesta', audience: 'Pymes industriales', channel: 'ads', durationS: 15 },
  }
  for (const [id, input] of Object.entries(inputs)) {
    const estimate = await getMicroapp(id)!.estimateCost(input)
    assert.ok(Number.isFinite(estimate.cents) && estimate.cents > 0, `${id}: presupuestó cero por un BYOK que el tenant no ha demostrado tener`)
  }
})

test('R5 Cinema elige proveedor con la misma fórmula de dos drafts que factura', async () => {
  const concepts = ['Demostración', 'Historia', 'Metáfora'].map((title, index) => ({
    title,
    logline: `Dirección creativa ${index + 1}`,
    treatment: `Tratamiento completo y producible ${index + 1}`,
    visualWorld: `Mundo visual ${index + 1}`,
    emotion: ['claridad', 'empatía', 'sorpresa'][index],
    risk: { level: 'medio', why: `Riesgo observable ${index + 1}` },
  }))
  const ctx: MicroappCtx = {
    orgId: 'org-r5', jobId: 'job-r5-cinema', log() {},
    capability: async () => ({ text: JSON.stringify({ concepts }) }),
  }
  const app = getMicroapp('cinema-concepts')!
  const result = await app.run(ctx, { objective: 'Explicar la propuesta', audience: 'Pymes industriales', channel: 'ads', durationS: 15 })
  validateMicroappResultEnvelope(app.id, result)
  const output = app.outputSchema.parse(result.data) as { productionCost: { providerId: string | null; totalCents: number | null } }
  assert.equal(output.productionCost.providerId, 'r5-video-a')
  assert.equal(output.productionCost.totalCents, 30, '3 planos × (2 drafts × 0 + 1 final × 10)')
})

test('R5 Model Picker etiqueta como excluidas las alternativas que incumplen BYOK', async () => {
  const app = getMicroapp('model-picker')!
  const result = await app.run({ orgId: 'org-r5', jobId: 'job-r5-picker', log() {}, capability: async () => { throw new Error('No usa capability') } }, {
    task: 'llm.generate', quality: 'standard', requireByok: true, maxEstimatedCostCents: 0,
  })
  const output = app.outputSchema.parse(result.data) as { recommendation: { providerId: string } | null; alternatives: Array<{ providerId: string; reason: string }> }
  assert.equal(output.recommendation?.providerId, 'r5-a-byok-zero')
  assert.match(output.alternatives.find(item => item.providerId === 'r5-b-managed-zero')?.reason ?? '', /^Excluido: no admite BYOK/)
})
