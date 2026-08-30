process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import '../providers/adapters/deepseek'
import '../providers/adapters/brave'
import { PERMISSIONS } from '../access-control/catalog'
import {
  ADS_GROWTH_EXAMPLES,
  ADS_GROWTH_MICROAPP_IDS,
} from '../microapps/apps/adsGrowthPack'
import {
  CONTENT_AUTHORITY_EXAMPLES,
  CONTENT_AUTHORITY_MICROAPP_IDS,
} from '../microapps/apps/contentAuthorityPack'
import { getMicroapp } from '../microapps/registry'
import { bindingsFor, getCapabilityContract } from '../providers/registry'
import { registerCoreCapabilityContracts } from '../providers/capabilities'
import type { MicroappCtx } from '../microapps/types'
import { validateMicroappResultEnvelope } from '../microapps/quality'

const IDS = [...ADS_GROWTH_MICROAPP_IDS, ...CONTENT_AUTHORITY_MICROAPP_IDS] as const
registerCoreCapabilityContracts()
const EXAMPLES: Record<string, { input: unknown; output: unknown }> = {
  ...ADS_GROWTH_EXAMPLES,
  ...CONTENT_AUTHORITY_EXAMPLES,
}

const EXPECTED_BY_NUMBER = {
  30: 'ad-angle-miner', 31: 'ad-policy-risk-review', 32: 'controlled-ad-variants',
  33: 'ad-to-landing-translator', 34: 'weak-promise-detector', 35: 'ugc-campaign-builder',
  36: 'multichannel-campaign-adapter', 37: 'ad-library-analyzer', 38: 'form-friction-optimizer',
  39: 'ab-test-hypothesis-designer', 40: 'attribution-repairer', 41: 'authority-report',
  42: 'original-study-builder', 43: 'generic-content-detector', 44: 'executive-opinion-engine',
  45: 'personalized-newsletter-builder', 46: 'content-refresh-auditor',
  47: 'commercial-editorial-planner', 48: 'sales-asset-generator',
} as const

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as ZodTypeAny)
  if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType as ZodTypeAny)
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema as ZodTypeAny)
  return schema
}

function inputShape(schema: ZodTypeAny): Record<string, ZodTypeAny> {
  const current = unwrap(schema)
  assert.ok(current instanceof z.ZodObject)
  return current.shape as Record<string, ZodTypeAny>
}

function shapeKeys(schema: ZodTypeAny): string[] {
  const def = schema._def as { typeName?: string; schema?: ZodTypeAny; innerType?: ZodTypeAny; shape?: () => Record<string, unknown> }
  if (def.typeName === 'ZodEffects' && def.schema) return shapeKeys(def.schema)
  if (def.typeName === 'ZodDefault' && def.innerType) return shapeKeys(def.innerType)
  if (def.typeName === 'ZodObject' && def.shape) return Object.keys(def.shape())
  throw new Error(`inputSchema con forma inesperada: ${def.typeName}`)
}

test('pack 30–48 registra 19 microapps únicas, completas y sin efectos externos', () => {
  assert.equal(IDS.length, 19)
  assert.equal(new Set(IDS).size, 19)
  assert.deepEqual(Object.values(EXPECTED_BY_NUMBER), IDS)
  for (const id of IDS) {
    const manifest = getMicroapp(id)
    assert.ok(manifest, `falta ${id}`)
    assert.equal(manifest.id, id)
    assert.equal(manifest.version, '1.3.0')
    assert.ok(manifest.name.length > 5)
    assert.ok(manifest.promise.length > 25)
    assert.ok(manifest.capabilities.includes('llm.generate'))
    assert.ok(Array.isArray(manifest.dataAccess))
    for (const capability of manifest.capabilities) {
      assert.ok(getCapabilityContract(capability), `${id}: capability sin contrato: ${capability}`)
      assert.ok(bindingsFor(capability).some(({ binding }) => binding.routable !== false), `${id}: capability sin proveedor enrutable: ${capability}`)
    }
    for (const permission of manifest.dataAccess) {
      assert.ok(PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number]), `${id}: permiso desconocido: ${permission}`)
    }
    assert.equal(manifest.effects, 'local')
    assert.ok(Array.isArray(manifest.followUps))
  }
})

test('cada uiSchema cubre exactamente su entrada y todos los select tienen opciones', () => {
  for (const id of IDS) {
    const manifest = getMicroapp(id)!
    const expected = new Set(shapeKeys(manifest.inputSchema))
    const actual = manifest.uiSchema.map(field => field.key)
    assert.deepEqual(new Set(actual), expected, `campos UI incorrectos en ${id}`)
    assert.equal(new Set(actual).size, actual.length, `campos UI duplicados en ${id}`)
    for (const field of manifest.uiSchema) {
      assert.ok(field.label.trim())
      if (field.widget === 'select') assert.ok(field.options?.length, `${id}.${field.key} necesita opciones`)
      assert.ok(!(field.widget === 'select' && unwrap(inputShape(manifest.inputSchema)[field.key]) instanceof z.ZodArray), `${id}.${field.key}: un select simple no puede editar una lista`)
    }
  }
})

test('los 19 ejemplos de entrada y entregable cumplen sus esquemas Zod', () => {
  for (const id of IDS) {
    const manifest = getMicroapp(id)!
    const example = EXAMPLES[id]
    assert.ok(example, `falta ejemplo para ${id}`)
    const input = manifest.inputSchema.safeParse(example.input)
    assert.ok(input.success, `input de ejemplo inválido en ${id}: ${input.success ? '' : input.error.message}`)
    const output = manifest.outputSchema.safeParse(example.output)
    assert.ok(output.success, `output de ejemplo inválido en ${id}: ${output.success ? '' : output.error.message}`)
  }
})

test('estimateCost enruta contra el registro real y devuelve céntimos finitos', async () => {
  for (const id of IDS) {
    const estimate = await getMicroapp(id)!.estimateCost(EXAMPLES[id].input)
    assert.ok(Number.isFinite(estimate.cents) && estimate.cents > 0, `${id} devolvió ${estimate.cents}`)
  }
})

test('cada handler ejecuta capabilities, valida su entregable y aporta evidencia', async () => {
  for (const id of IDS) {
    const manifest = getMicroapp(id)!
    const calls: string[] = []
    const systems: string[] = []
    const ctx: MicroappCtx = {
      orgId: 'org-test',
      jobId: `job-${id}`,
      capability: async (name, payload) => {
        calls.push(name)
        if (name === 'web.search') return { results: [] }
        if (name === 'llm.generate') { systems.push(String((payload as any)?.system ?? '')); return { text: JSON.stringify(EXAMPLES[id].output) } }
        throw new Error(`capability inesperada: ${name}`)
      },
      log: () => {},
    }
    const result = await manifest.run(ctx, EXAMPLES[id].input)
    validateMicroappResultEnvelope(id, result)
    const parsed = manifest.outputSchema.safeParse(result.data)
    assert.ok(parsed.success, `handler de ${id} produjo salida inválida`)
    assert.ok(calls.includes('llm.generate'), `${id} no ejecutó el router LLM`)
    assert.ok(systems.every(system => /datos no confiables/i.test(system)), `${id} no aísla prompt injection`)
    assert.ok(result.evidence.length > 0, `${id} no produjo evidencia`)
    assert.ok(result.suggestedActions?.length, `${id} no produjo siguiente acción`)
    assert.equal(result.suggestedActions?.[0]?.params?.sourceMicroappId, id)
    assert.equal(result.suggestedActions?.[0]?.params?.sourceJobId, `job-${id}`)
    for (const item of result.evidence) {
      assert.ok(item.claim.trim(), `${id} produjo una evidencia vacía`)
      assert.ok(item.sourceRef || item.sourceUrl, `${id} produjo evidencia sin procedencia`)
    }
  }
})

test('guardas R4 rechazan formularios de relleno aunque cada campo cumpla su longitud', () => {
  const authority = getMicroapp('authority-report')!
  const parsed = authority.inputSchema.safeParse({ brand: 'test', audience: 'test', expertise: ['test'], commercialGoals: 'test' })
  assert.equal(parsed.success, false)
  assert.match(parsed.success ? '' : parsed.error.message, /texto de relleno/)
})

test('newsletter acepta proveedor sin snippet y atribución/AB sustituyen cifras del modelo por cálculos', async () => {
  const newsletter = getMicroapp('personalized-newsletter-builder')!
  const calls: string[] = []
  await newsletter.run({
    orgId: 'org', jobId: 'job-news', log: () => {},
    capability: async name => {
      calls.push(name)
      return name === 'web.search'
        ? { results: [{ title: 'Fuente sin extracto', url: 'https://example.com/fuente' }] }
        : { text: JSON.stringify(CONTENT_AUTHORITY_EXAMPLES['personalized-newsletter-builder'].output) }
    },
  }, CONTENT_AUTHORITY_EXAMPLES['personalized-newsletter-builder'].input)
  assert.deepEqual(calls, ['web.search', 'llm.generate'])

  const ab = getMicroapp('ab-test-hypothesis-designer')!
  const abResult = await ab.run({
    orgId: 'org', jobId: 'job-ab', log: () => {},
    capability: async () => ({ text: JSON.stringify(ADS_GROWTH_EXAMPLES['ab-test-hypothesis-designer'].output) }),
  }, ADS_GROWTH_EXAMPLES['ab-test-hypothesis-designer'].input)
  const plan = (abResult.data as { statisticalPlan: { minimumSamplePerVariant: number; estimatedMinimumDays: number } }).statisticalPlan
  assert.equal(plan.minimumSamplePerVariant, 13512)
  assert.equal(plan.estimatedMinimumDays, 379)

  const attribution = getMicroapp('attribution-repairer')!
  const tampered = {
    ...(ADS_GROWTH_EXAMPLES['attribution-repairer'].output as Record<string, unknown>),
    linkAudit: [{ placement: 'inventado', originalUrl: 'x', status: 'ok', missingParams: [], correctedUrl: 'x' }],
  }
  const result = await attribution.run({
    orgId: 'org', jobId: 'job-attr', log: () => {}, capability: async () => ({ text: JSON.stringify(tampered) }),
  }, ADS_GROWTH_EXAMPLES['attribution-repairer'].input)
  const audited = result.data as { linkAudit: Array<{ placement: string; status: string; missingParams: string[] }> }
  assert.equal(audited.linkAudit[0].placement, 'anuncio-a')
  assert.equal(audited.linkAudit[0].status, 'missing_params')
  assert.deepEqual(audited.linkAudit[0].missingParams, ['utm_medium'])
})

test('el estudio retira columnas confidenciales antes de enviar el CSV al proveedor', async () => {
  const study = getMicroapp('original-study-builder')!
  let sentPrompt = ''
  const input = {
    ...(CONTENT_AUTHORITY_EXAMPLES['original-study-builder'].input as Record<string, unknown>),
    datasetCsv: 'campaign,email,hours\nA,persona@example.com,10\nB,otra@example.com,20',
    confidentialColumns: ['email'],
  }
  await study.run({
    orgId: 'org', jobId: 'job-study', log: () => {},
    capability: async (_name, payload) => {
      sentPrompt = String((payload as { prompt?: string }).prompt ?? '')
      return { text: JSON.stringify(CONTENT_AUTHORITY_EXAMPLES['original-study-builder'].output) }
    },
  }, input)
  assert.doesNotMatch(sentPrompt, /persona@example\.com|otra@example\.com/)
  assert.doesNotMatch(sentPrompt, /"email"\s*:/)
  assert.match(sentPrompt, /hours/)
})

test('policy preflight no presenta riesgo bajo ni omite revisión cuando faltan fuentes', async () => {
  const app = getMicroapp('ad-policy-risk-review')!
  const modelOutput = {
    riskLevel: 'bajo', issues: [], revisedCopy: 'Copy revisado', humanReviewRequired: false,
    disclaimer: 'Las políticas cambian y deben revisarse antes de publicar.',
  }
  const result = await app.run({
    orgId: 'org', jobId: 'job-policy', log: () => {},
    capability: async name => name === 'web.search' ? { results: [] } : { text: JSON.stringify(modelOutput) },
  }, ADS_GROWTH_EXAMPLES['ad-policy-risk-review'].input)
  validateMicroappResultEnvelope(app.id, result)
  const output = app.outputSchema.parse(result.data) as { riskLevel: string; humanReviewRequired: boolean }
  assert.equal(output.riskLevel, 'medio')
  assert.equal(output.humanReviewRequired, true)
})

test('R4 rechaza claims y enlaces sin procedencia literal', async () => {
  const weak = getMicroapp('weak-promise-detector')!
  const weakDraft = { ...(ADS_GROWTH_EXAMPLES['weak-promise-detector'].output as any), unsupportedClaims: ['garantía inexistente'] }
  await assert.rejects(() => weak.run({ orgId: 'org', jobId: 'weak-grounding', log() {}, capability: async () => ({ text: JSON.stringify(weakDraft) }) }, ADS_GROWTH_EXAMPLES['weak-promise-detector'].input), /claim que no aparece/)

  const refresh = getMicroapp('content-refresh-auditor')!
  const refreshDraft = { ...(CONTENT_AUTHORITY_EXAMPLES['content-refresh-auditor'].output as any), brokenOrReviewLinks: [{ url: 'https://inventada.example', reason: 'Rota', replacementUrl: null }] }
  await assert.rejects(() => refresh.run({ orgId: 'org', jobId: 'refresh-grounding', log() {}, capability: async name => name === 'web.search' ? { results: [] } : { text: JSON.stringify(refreshDraft) } }, CONTENT_AUTHORITY_EXAMPLES['content-refresh-auditor'].input), /inventó un enlace/)
})
