process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureProvidersRegistered } from '../providers'
import { listProviders } from '../providers/registry'
import { route, RoutingError } from '../providers/router'
import { getMicroapp, listMicroapps } from '../microapps/registry'
import type { MicroappCtx } from '../microapps/types'
import { validateMicroappResultEnvelope } from '../microapps/quality'
import { prisma } from '../lib/prisma'

const IDS = ['ad-factory', 'provider-benchmark', 'storyboard-shotlist', 'magnific-enhancer']
const SAMPLES: Record<string, unknown> = {
  'ad-factory': { offer: 'Atención telefónica 24/7', audience: 'Clínicas privadas', generateImage: false },
  'provider-benchmark': { capability: 'llm.generate' },
  'storyboard-shotlist': { concept: 'Una llamada perdida se transforma en una cita', generateFrames: false },
  'magnific-enhancer': { assetId: 'asset_123', rightsConfirmed: true },
}

ensureProvidersRegistered()

test('el registro abierto describe al menos 10 proveedores y un segundo LLM BYOK', () => {
  const providers = listProviders()
  assert.ok(providers.length >= 10, `solo hay ${providers.length} proveedores`)
  const llms = providers.filter(provider => provider.capabilities.some(binding => binding.capability === 'llm.generate' && binding.routable !== false))
  assert.ok(llms.length >= 2)
  const openai = providers.find(provider => provider.id === 'openai-chat')
  assert.ok(openai?.auth.modes.includes('byok'))
  assert.ok(openai?.auth.byokFields?.some(field => field.key === 'apiKey' && field.kind === 'secret'))
  assert.ok(openai?.auth.byokFields?.some(field => field.key === 'model'))
  for (const id of ['twilio', 'resend', 'metricool', 'meta']) {
    const provider = providers.find(item => item.id === id)
    assert.ok(provider)
    assert.ok(provider.capabilities.every(binding => binding.routable === false))
  }
})

test('el router bloquea una voz identificada sin consentimiento antes de crear el job', async () => {
  await assert.rejects(
    route({ orgId: 'org-test', capability: 'audio.tts', input: { text: 'hola', voiceId: 'voz-clonada' } }),
    (error: unknown) => error instanceof RoutingError && error.code === 'CONSENT_REQUIRED' && error.statusCode === 403,
  )
})

test('la ola 1 sigue publicada aunque el catálogo incorpore nuevas microapps', async () => {
  assert.ok(listMicroapps().length >= 12)
  for (const id of IDS) {
    const manifest = getMicroapp(id)
    assert.ok(manifest, `falta ${id}`)
    assert.equal(manifest.version, '1.2.0', `${id}: versión mejorada no trazable`)
    assert.ok(manifest.inputSchema.safeParse(SAMPLES[id]).success)
    const fields = Object.keys((manifest.inputSchema as any)._def.shape())
    assert.deepEqual(new Set(manifest.uiSchema.map(item => item.key)), new Set(fields))
    const estimate = await manifest.estimateCost(SAMPLES[id])
    assert.ok(Number.isFinite(estimate.cents) && estimate.cents >= 0)
    assert.ok(manifest.followUps.length > 0, `${id} necesita al menos un siguiente paso`)
  }
})

test('ad-factory ejecuta el contrato completo, preserva trazabilidad y rechaza variantes duplicadas', async () => {
  const manifest = getMicroapp('ad-factory')!
  const variants = [1, 2, 3].map((index) => ({
    headline: `Titular específico ${index}`,
    primaryText: `Texto publicitario específico y verificable para el ángulo número ${index}.`,
    cta: 'Reservar demo',
    angle: `Ángulo comercial ${index}`,
  }))
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-ad', log: () => {},
    capability: async (name) => {
      assert.equal(name, 'llm.generate')
      return { text: JSON.stringify({ variants, imagePrompt: 'Fotografía editorial de una recepción clínica profesional' }) }
    },
  }
  const result = await manifest.run(ctx, SAMPLES['ad-factory'])
  validateMicroappResultEnvelope('ad-factory', result)
  const output = manifest.outputSchema.parse(result.data) as { variants: unknown[]; imagePrompt: string | null; imageAssetIds: string[] }
  assert.equal(output.variants.length, 3)
  assert.equal(output.imagePrompt, null, 'sin generación de imagen no se presenta un prompt como asset producido')
  assert.deepEqual(output.imageAssetIds, [])
  assert.equal(result.evidence[0]?.sourceRef?.id, 'job-ad')

  const duplicated = { ...ctx, capability: async () => ({ text: JSON.stringify({ variants: [variants[0], variants[0], variants[0]], imagePrompt: 'Fotografía editorial suficientemente detallada' }) }) }
  await assert.rejects(() => manifest.run(duplicated, SAMPLES['ad-factory']), /distintos/)
})

test('la generación visual propaga límites de gasto al router y los inputs acotan presupuestos', async () => {
  const ad = getMicroapp('ad-factory')!
  assert.equal(ad.inputSchema.safeParse({ ...SAMPLES['ad-factory'] as object, maxGenerationCostCents: 0 }).success, false)
  assert.equal(ad.inputSchema.safeParse({ ...SAMPLES['ad-factory'] as object, maxGenerationCostCents: 100_001 }).success, false)

  const variants = [1, 2, 3].map((index) => ({
    headline: `Titular controlado ${index}`,
    primaryText: `Texto publicitario verificable para la variante controlada número ${index}.`,
    cta: 'Reservar demo',
    angle: `Ángulo controlado ${index}`,
  }))
  let imagePreferences: unknown
  const ctx: MicroappCtx = {
    orgId: 'org-budget', jobId: 'job-budget', log: () => {},
    capability: async (name, _payload, preferences) => {
      if (name === 'llm.generate') return { text: JSON.stringify({ variants, imagePrompt: 'Fotografía editorial de una recepción profesional con iluminación natural' }) }
      imagePreferences = preferences
      return { assetIds: ['asset-budget'] }
    },
  }
  const result = await ad.run(ctx, { offer: 'Atención telefónica medible para clínicas', audience: 'Clínicas privadas en España', generateImage: true, maxGenerationCostCents: 777 })
  validateMicroappResultEnvelope('ad-factory', result)
  assert.deepEqual(imagePreferences, { maxCostCents: 777 })
})

test('storyboard-shotlist normaliza orden y duración de forma determinista', async () => {
  const manifest = getMicroapp('storyboard-shotlist')!
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-story', log: () => {},
    capability: async () => ({ text: JSON.stringify({ shots: [
      { order: 8, durationS: 2, framing: 'Plano general', action: 'La recepción pierde una llamada entrante', audio: 'Tono de llamada', prompt: 'Recepción vacía con teléfono sonando, encuadre general cinematográfico' },
      { order: 3, durationS: 1, framing: 'Primer plano', action: 'La cita aparece confirmada automáticamente', audio: 'Confirmación suave', prompt: 'Pantalla con cita confirmada, primer plano y luz cálida cinematográfica' },
    ] }) }),
  }
  const result = await manifest.run(ctx, { ...SAMPLES['storyboard-shotlist'] as object, durationS: 15 })
  validateMicroappResultEnvelope('storyboard-shotlist', result)
  const output = manifest.outputSchema.parse(result.data) as { shots: Array<{ order: number; durationS: number }>; totalDurationS: number }
  assert.deepEqual(output.shots.map((shot) => shot.order), [1, 2])
  assert.equal(output.totalDurationS, 15)
  assert.equal(output.shots.reduce((sum, shot) => sum + shot.durationS, 0), 15)
  assert.equal(result.suggestedActions?.[0].params?.sourceJobId, 'job-story')
})

test('provider-benchmark genera datos y evidencia sin consumir un proveedor', async () => {
  const manifest = getMicroapp('provider-benchmark')!
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-test',
    capability: async () => { throw new Error('no debe ejecutar proveedor') },
    log: () => {},
  }
  const result = await manifest.run(ctx, { capability: 'llm.generate', scenario: 'budget' })
  validateMicroappResultEnvelope('provider-benchmark', result)
  const output = manifest.outputSchema.parse(result.data) as { candidates: unknown[]; winner: string | null }
  assert.ok(output.candidates.length >= 2)
  assert.ok(output.winner)
  assert.equal(result.evidence.length, output.candidates.length)
})

test('magnific-enhancer encola un job hijo y devuelve su referencia', async () => {
  const manifest = getMicroapp('magnific-enhancer')!
  const calls: unknown[] = []
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-parent', capability: async () => ({}), log: () => {},
    enqueueCapability: async (...args) => { calls.push(args); return { jobId: 'job-child' } },
  }
  const delegate = prisma.asset as unknown as { findFirst: (...args: any[]) => Promise<any> }
  const original = delegate.findFirst
  let where: unknown
  delegate.findFirst = async (args) => { where = args.where; return { id: 'asset_123', kind: 'image', expiresAt: null, license: { kind: 'owned' } } }
  try {
    const result = await manifest.run(ctx, { assetId: 'asset_123', rightsConfirmed: true })
    validateMicroappResultEnvelope('magnific-enhancer', result)
    assert.equal((result.data as { jobId: string }).jobId, 'job-child')
    assert.equal(calls.length, 1)
    assert.deepEqual(result.suggestedActions?.[0].params, { jobId: 'job-child' })
    assert.deepEqual(where, { id: 'asset_123', orgId: 'org-test' })
  } finally { delegate.findFirst = original }
})

test('magnific-enhancer rechaza assets ajenos o vencidos antes de encolar', async () => {
  const manifest = getMicroapp('magnific-enhancer')!
  const delegate = prisma.asset as unknown as { findFirst: (...args: any[]) => Promise<any> }
  const original = delegate.findFirst
  let enqueued = false
  const ctx: MicroappCtx = {
    orgId: 'org-owner', jobId: 'job-parent', capability: async () => ({}), log: () => {},
    enqueueCapability: async () => { enqueued = true; return { jobId: 'unexpected' } },
  }
  try {
    delegate.findFirst = async () => null
    await assert.rejects(() => manifest.run(ctx, { assetId: 'asset-other-org', rightsConfirmed: true }), (error: any) => error?.code === 'ASSET_NOT_AVAILABLE')
    delegate.findFirst = async () => ({ id: 'asset-expired', kind: 'image', expiresAt: new Date(Date.now() - 1000), license: { kind: 'owned' } })
    await assert.rejects(() => manifest.run(ctx, { assetId: 'asset-expired', rightsConfirmed: true }), (error: any) => error?.code === 'ASSET_NOT_AVAILABLE')
    assert.equal(enqueued, false)
  } finally { delegate.findFirst = original }
})
