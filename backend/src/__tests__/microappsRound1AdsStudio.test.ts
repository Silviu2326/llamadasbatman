process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import { prisma } from '../lib/prisma'
import { PERMISSIONS } from '../access-control/catalog'
import { ensureProvidersRegistered } from '../providers'
import { audioTtsOutput } from '../providers/capabilities'
import { getMicroapp } from '../microapps/registry'
import { validateMicroappResultEnvelope } from '../microapps/quality'
import type { MicroappCtx } from '../microapps/types'
import { ADS_GROWTH_EXAMPLES, ADS_GROWTH_MICROAPP_IDS } from '../microapps/apps/adsGrowthPack'
import { CONTENT_AUTHORITY_EXAMPLES, CONTENT_AUTHORITY_MICROAPP_IDS } from '../microapps/apps/contentAuthorityPack'
import { STUDIO_MEDIA_AUXILIARY_IDS } from '../microapps/apps/studioMediaPack'
import { STUDIO_OPS_49_TO_66_MAP } from '../microapps/apps/studioOpsPack49to66'
import { bindingsFor, getCapabilityContract } from '../providers/registry'

ensureProvidersRegistered()

function sample(schema: ZodTypeAny, salt = 'x'): unknown {
  const current = schema as any
  if (current instanceof z.ZodEffects) return sample(current._def.schema, salt)
  if (current instanceof z.ZodDefault) return current.parse(undefined)
  if (current instanceof z.ZodOptional) return undefined
  if (current instanceof z.ZodNullable) return null
  if (current instanceof z.ZodLiteral) return current._def.value
  if (current instanceof z.ZodEnum) return current.options[0]
  if (current instanceof z.ZodBoolean) return true
  if (current instanceof z.ZodNumber) {
    const checks = current._def.checks as Array<{ kind: string; value?: number; inclusive?: boolean }>
    const lowerChecks = checks.filter(check => check.kind === 'min')
    const upperChecks = checks.filter(check => check.kind === 'max')
    let value = lowerChecks.length ? Math.max(...lowerChecks.map(check => Number(check.value ?? 0) + (check.inclusive === false ? 1 : 0))) : 1
    if (upperChecks.length) value = Math.min(value, ...upperChecks.map(check => Number(check.value ?? 0)))
    return checks.some(check => check.kind === 'int') ? Math.ceil(value) : value
  }
  if (current instanceof z.ZodString) {
    const checks = current._def.checks as Array<{ kind: string; value?: number }>
    if (checks.some(check => check.kind === 'datetime')) return '2026-08-19T12:00:00.000Z'
    if (checks.some(check => check.kind === 'url')) return 'https://example.com/source'
    const minimum = Math.max(1, ...checks.filter(check => check.kind === 'min').map(check => Number(check.value ?? 0)))
    const maximum = Math.min(Infinity, ...checks.filter(check => check.kind === 'max').map(check => Number(check.value ?? Infinity)))
    const base = `dato-${salt}-especifico`
    return `${base}${'q'.repeat(Math.max(0, minimum - base.length))}`.slice(0, maximum)
  }
  if (current instanceof z.ZodArray) {
    const minimum = Number(current._def.exactLength?.value ?? current._def.minLength?.value ?? 0)
    return Array.from({ length: minimum }, (_, index) => sample(current._def.type, `${salt}${index}`))
  }
  if (current instanceof z.ZodObject) {
    return Object.fromEntries(Object.entries(current.shape as Record<string, ZodTypeAny>).map(([key, child]) => [key, sample(child, key)]))
  }
  if (current instanceof z.ZodRecord) return {}
  if (current instanceof z.ZodUnion || current instanceof z.ZodDiscriminatedUnion) return sample(current._def.options[0] ?? [...current.options.values()][0], salt)
  if (current instanceof z.ZodUnknown || current instanceof z.ZodAny) return {}
  throw new Error(`No hay fixture para ${current?._def?.typeName ?? typeof current}`)
}

const structuredIds = new Set([
  'character-continuity-guardian', 'product-continuity-guardian', 'virtual-camera-director',
  'soundtrack-sfx-designer', 'audiovisual-qc-inspector', 'virtual-creative-director',
  'production-continuity-inspector', 'video-ad-inspector', 'trailer-cutdown-generator',
  'audiovisual-localizer', 'intelligent-format-adapter',
])

function inputFor(id: string, schema: ZodTypeAny): unknown {
  if (id === 'character-continuity-guardian') return { characterName: 'Personaje', isRealPerson: false, traits: 'Cabello oscuro y chaqueta azul', observations: [{ shot: 's1', detail: 'Chaqueta azul', sourceAssetId: 'asset-1' }] }
  if (id === 'audiovisual-qc-inspector') return { assetId: 'asset-master-campaign', durationS: 30, channel: 'youtube', measured: { width: 1920, height: 1080, fps: 25, peakDb: -1, integratedLufs: -14, subtitleCoverage: 0.95 }, observations: [{ timecodeS: 3, kind: 'subtitle', detail: 'El subtítulo termina demasiado cerca del corte', source: 'revisión humana QA-17' }], requiredSpecs: 'Master 1920x1080, 25 fps, -14 LUFS y subtítulos legibles', claimsRegister: ['Organiza el trabajo de campaña'] }
  if (id === 'contextual-broll-generator') return { script: 'El equipo recibe una consulta y confirma una reunión con el cliente.', sector: 'software', generateCount: 1, maxGenerationCostCents: 10_000 }
  if (id === 'authorized-presenter') return { presenterName: 'Ana', consentGrantId: 'grant-1', faceReferenceAssetId: 'asset-face', script: 'Presentación autorizada del producto.', language: 'es', channel: 'web', purpose: 'demo', intendedRegion: 'ES', rightsConfirmed: true, generateVisualDraft: false, maxGenerationCostCents: 10_000 }
  if (id === 'visual-localization-dubbing') return { sourceScript: 'Presentación autorizada del producto.', sourceLanguage: 'es', targetLanguages: ['en'], generateNarration: false, maxGenerationCostCents: 10_000 }
  if (id === 'trailers-cutdowns') return { masterAssetId: 'asset-master', masterDurationS: 30, moments: [{ startS: 0, endS: 10, description: 'Apertura', verifiedClaim: 'Demostración' }], audience: 'Equipos de marketing', channels: ['youtube'], generateThumbnails: false, sourceRightsConfirmed: true, maxGenerationCostCents: 10_000 }
  if (id === 'consented-synthetic-casting') return { roles: [{ id: 'host', description: 'Presentador principal', actingRequirements: ['tono claro'] }], candidates: [{ id: 'synthetic-1', synthetic: true, traits: ['tono claro'], allowedRegions: ['ES'], allowedChannels: ['web'], exclusions: [] }], targetRegions: ['ES'], targetChannels: ['web'] }
  if (id === 'studio-broll-generator') return { script: 'El equipo recibe una consulta y confirma una reunión con el cliente.', generateCount: 1, referenceRightsConfirmed: true, maxGenerationCostCents: 10_000 }
  if (id === 'product-video-generator') return { product: 'Botella de acero reutilizable con capacidad declarada de 750 ml', objective: 'Mostrar apertura y cierre', referenceAssetIds: ['asset-product'], referenceRightsConfirmed: true, maxGenerationCostCents: 10_000 }
  if (id === 'blind-provider-comparator') return { capability: 'llm.generate', normalizedInput: { prompt: 'resumen' }, samples: [], weights: { quality: 0.6, cost: 0.25, latency: 0.15 } }
  if (id === 'declarative-microapp-generator') return { name: 'Resumen seguro', promise: 'Resume un texto sin inventar datos ni omitir las limitaciones', inputs: [{ key: 'prompt', type: 'string', required: true, description: 'Texto original' }], outputs: [{ key: 'text', type: 'string', description: 'Resumen trazable' }], allowedCapabilities: ['llm.generate'], permissions: [], maxCostCentsPerCapability: 25, recipeDescription: 'Genera un resumen fiel y devuelve únicamente la salida estructurada.' }
  if (id === 'flow-auditor') return { graph: { nodes: [{ key: 'start', type: 'input' }], edges: [] } }
  if (id === 'ai-cost-simulator') return { volume: 10, steps: [{ id: 'llm', capability: 'llm.generate', normalizedInput: { prompt: 'hola' }, executionsPerUnit: 1 }], contingencyPercent: 15, budgetLimitCents: 10_000 }
  return schema.parse(sample(schema, id.slice(0, 4)))
}

function llmPayloadFor(id: string, manifest: NonNullable<ReturnType<typeof getMicroapp>>, input: any): unknown {
  if (id === 'virtual-camera-director') return { cameraPlan: { framing: 'Plano medio', lens: '50mm', movement: 'Dolly suave', depthOfField: 'Media', lighting: 'Key lateral', rhythm: 'Continuo' }, technicalPrompt: 'Plano medio con dolly suave', negativePrompt: 'Sin artefactos', diagram: { subjectPosition: 'Centro', cameraPosition: 'Frontal', movementPath: 'Avance', lightPositions: ['Lateral'] }, alternatives: [{ name: 'Estático', tradeoff: 'Menos energía', promptDelta: 'Cámara fija' }, { name: 'Angular', tradeoff: 'Más tensión', promptDelta: 'Ángulo bajo' }], generationInput: { prompt: 'Plano medio con dolly suave', durationS: input.durationS, aspectRatio: input.aspectRatio, refAssetIds: input.referenceAssetIds } }
  if (id === 'contextual-broll-generator') return { shots: [{ id: 'shot-1', insertion: '00:02', purpose: 'Contextualizar', durationS: 4, prompt: 'Equipo atendiendo una consulta', source: 'generate', libraryAssetId: null, licenseNote: 'Generación nueva' }] }
  if (id === 'visual-localization-dubbing') return { masters: [{ language: 'en', adaptedScript: 'Authorized product presentation.', subtitlesSrt: '1\n00:00:00,000 --> 00:00:02,000\nAuthorized product presentation.', transcript: 'Authorized product presentation.', glossaryDecisions: [], legalDifferences: [], linguisticQa: [{ check: 'meaning', status: 'ok', note: 'Reviewed' }] }] }
  if (id === 'trailers-cutdowns') return { variants: [{ channel: 'youtube', format: '16:9', durationS: 8, title: 'Apertura', copy: 'Demostración', edl: [{ sourceInS: 0, sourceOutS: 8, destinationInS: 0, purpose: 'Hook' }], thumbnailPrompt: 'Producto en uso' }] }
  if (id === 'consented-synthetic-casting') return { casting: [{ roleId: 'host', candidateId: 'synthetic-1', fitReasons: ['Cumple el tono'], rightsStatus: 'eligible', rightsReasons: [], rehearsalPrompt: 'Presentar con claridad' }], unresolvedRoles: [] }
  if (id === 'studio-broll-generator') return { shots: [{ id: 'shot-1', insertion: '00:02', purpose: 'Contextualizar', prompt: 'Equipo atendiendo una consulta', durationS: 4 }] }
  if (id === 'soundtrack-sfx-designer') return { cueSheet: [], stemsPlan: ['dialogue', 'music', 'sfx'], preliminaryMix: { targetLufs: input.deliveryLufs, dialoguePriority: true, notes: ['Mezcla preliminar'] }, licenseRegister: [], missingAssets: ['Música y efectos por seleccionar'] }
  if (id === 'virtual-creative-director') return { creativeThesis: 'Una dirección creativa producible dentro del brief', concepts: ['Concepto A', 'Concepto B', 'Concepto C'].map(name => ({ name, logline: `${name} desarrolla el objetivo`, audienceInsight: 'Hipótesis basada solo en el brief', visualSystem: 'Sistema visual sobrio', narrativeBeats: ['Problema', 'Demostración', 'CTA'], requiredAssetIds: [], newAssets: ['Master visual'], channelAdaptations: input.channels.map((channel: string) => ({ channel, adaptation: 'Adaptación específica' })), risks: ['Validar la hipótesis con audiencia'] })), recommendation: { conceptName: 'Concepto A', rationale: 'Es el más directo y producible', assumptions: ['La audiencia reconoce el problema'] }, productionBrief: { deliverables: ['Master'], acceptanceCriteria: ['Respeta el brief'], unresolvedQuestions: ['Confirmar referencia visual'] } }
  if (id === 'production-continuity-inspector') return { findings: [], continuityMatrix: input.bible.map((rule: any) => ({ bibleRuleId: rule.id, checkedShotIds: input.shotObservations.map((shot: any) => shot.shotId), status: 'consistent' })), blockedShots: [], regenerationInstructions: [], limitations: ['Basado en observaciones aportadas'] }
  if (id === 'intelligent-format-adapter') return { sourceAssetId: input.masterAssetId, renderingStatus: 'instructions_ready', variants: input.targets.map((target: any) => ({ channel: target.channel, aspectRatio: target.aspectRatio, durationS: Math.min(input.durationS, target.maxDurationS), cropPlan: [], cutPlan: [], subtitlePlan: 'Mantener subtítulos en safe area', copyAdaptation: 'Copy sin claims nuevos', renderInstruction: 'Aplicar en editor y revisar', blockers: [] })) }
  if (id === 'trailer-cutdown-generator') return { sourceAssetId: input.masterAssetId, excludedClaims: [], variants: input.targets.map((target: any) => ({ channel: target.channel, title: 'Versión autorizada', copy: 'Copy sin claims nuevos', durationS: Math.min(input.durationS, target.maxDurationS), aspectRatio: target.aspectRatio, edl: [{ sourceInS: input.authorizedMoments[0].startS, sourceOutS: Math.min(input.authorizedMoments[0].endS, input.authorizedMoments[0].startS + Math.min(input.durationS, target.maxDurationS)), destinationInS: 0, purpose: 'Hook' }], hook: 'Hook autorizado', thumbnailBrief: 'Miniatura sin claims', renderStatus: 'edl_ready' })) }
  if (id === 'audiovisual-localizer') return { masters: input.targetMarkets.map((target: any) => ({ language: target.language, region: target.region, adaptedScript: input.sourceScript, subtitlesSrt: '1\n00:00:00,000 --> 00:00:01,000\nTexto', transcript: input.sourceScript, glossaryDecisions: [], legalReviewItems: target.legalNotes, durationFit: 'review', linguisticQa: [{ check: 'Revisión nativa', status: 'review', note: 'Pendiente' }] })), voiceConsentGrantId: input.voiceConsentGrantId ?? null, lipSyncStatus: 'requires_supported_provider', unresolvedTerms: [] }
  if (id === 'declarative-microapp-generator') return { schemaVersion: 1, kind: 'microapp', entrypoint: 'result', permissions: [], capabilities: ['llm.generate'], inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] }, outputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, recipe: { nodes: [{ id: 'generate', type: 'capability', capability: 'llm.generate', input: { prompt: '$.input.prompt' }, config: { maxCostCents: 25 } }, { id: 'result', type: 'output', input: { text: '$.nodes.generate.text' } }], edges: [{ from: 'generate', to: 'result' }] } }
  return sample(manifest.outputSchema, id.slice(0, 4))
}

test('ronda 1 ejecuta y valida el envelope de las 27 microapps Studio/Ops', async () => {
  const ids = [...STUDIO_MEDIA_AUXILIARY_IDS, ...Object.values(STUDIO_OPS_49_TO_66_MAP)]
  assert.equal(ids.length, 27)
  assert.equal(new Set(ids).size, 27)

  const delegates: Array<[any, string, any]> = []
  const mock = (target: any, method: string, implementation: any) => { delegates.push([target, method, target[method]]); target[method] = implementation }
  mock(prisma.usageRecord as any, 'findMany', async () => [])
  mock(prisma.job as any, 'findMany', async () => [])
  mock(prisma.automation as any, 'findMany', async () => [])
  mock(prisma.contactConsent as any, 'count', async () => 0)
  mock(prisma.consentGrant as any, 'count', async () => 0)
  mock(prisma.consentGrant as any, 'findFirst', async () => ({ id: 'grant-1', orgId: 'org-round-1', kind: 'face', status: 'active', revokedAt: null, expiresAt: null, scope: { channels: ['web'], purposes: ['demo'], regions: ['ES'] } }))
  mock(prisma.optOut as any, 'count', async () => 0)
  mock(prisma.asset as any, 'findMany', async (args: any) => {
    const ids = args?.where?.id?.in
    return Array.isArray(ids) ? ids.map((id: string) => ({ id, expiresAt: null, license: { kind: 'test' } })) : []
  })
  mock(prisma.asset as any, 'findFirst', async () => ({ id: 'asset-face', consentGrantId: 'grant-1', expiresAt: null, license: { kind: 'test' } }))

  try {
    for (const id of ids) {
      const manifest = getMicroapp(id)
      assert.ok(manifest, `falta ${id}`)
      assert.equal(manifest.version, '1.3.0', `${id}: versión inesperada tras endurecimiento`)
      const input = inputFor(id, manifest.inputSchema)
      const ctx: MicroappCtx = {
        orgId: 'org-round-1', jobId: `job-${id}`, log() {},
        capability: async name => {
          if (name === 'audio.tts') return sample(audioTtsOutput, 'audio')
          if (name === 'llm.generate') return { text: JSON.stringify(llmPayloadFor(id, manifest, input)) }
          throw new Error(`${id}: capability síncrona inesperada ${name}`)
        },
        enqueueCapability: async () => ({ jobId: `child-${id}` }),
      }
      const result = await manifest.run(ctx, input)
      manifest.outputSchema.parse(result.data)
      validateMicroappResultEnvelope(id, result)
      assert.ok(result.suggestedActions?.length, `${id}: sin siguiente paso`)
      assert.equal(result.suggestedActions?.[0]?.params?.sourceMicroappId, id, `${id}: acción sin origen`)
      assert.equal(result.suggestedActions?.[0]?.params?.sourceJobId, `job-${id}`, `${id}: acción sin job de origen`)
    }
  } finally {
    for (const [target, method, original] of delegates.reverse()) target[method] = original
  }
})

test('guardas críticas bloquean rights, inputs ambiguos, escalada declarativa y presupuestos', async () => {
  assert.equal(getMicroapp('authorized-presenter')!.inputSchema.safeParse({ presenterName: 'Ana' }).success, false)
  assert.equal(getMicroapp('flow-auditor')!.inputSchema.safeParse({ flowVersionId: 'v1', graph: { nodes: [{ key: 'a', type: 'x' }], edges: [] } }).success, false)
  assert.equal(getMicroapp('blind-provider-comparator')!.inputSchema.safeParse({ capability: 'llm.generate', normalizedInput: {}, weights: { quality: 0, cost: 0, latency: 0 } }).success, false)
  await assert.rejects(() => getMicroapp('product-video-generator')!.estimateCost({ product: 'Botella de acero reutilizable con capacidad declarada de 750 ml', objective: 'Mostrar cierre', referenceAssetIds: ['asset'], referenceRightsConfirmed: true, maxGenerationCostCents: 1 }), (error: unknown) => (error as { code?: string }).code === 'MICROAPP_BUDGET_EXCEEDED')
  await assert.rejects(() => getMicroapp('contextual-broll-generator')!.estimateCost({ script: 'El equipo prepara y valida una campaña completa antes de publicarla.', sector: 'software', generateCount: 1, videoProviderId: 'provider-inexistente', maxGenerationCostCents: 10_000 }), (error: unknown) => (error as { code?: string }).code === 'MICROAPP_PROVIDER_NOT_ROUTABLE')
})

test('auditoría cruzada: las 46 Ads/Studio tienen contratos, permisos, UI y estimaciones coherentes', async () => {
  const studioIds = [...STUDIO_MEDIA_AUXILIARY_IDS, ...Object.values(STUDIO_OPS_49_TO_66_MAP)]
  const adsIds = [...ADS_GROWTH_MICROAPP_IDS, ...CONTENT_AUTHORITY_MICROAPP_IDS]
  const ids = [...adsIds, ...studioIds]
  assert.equal(ids.length, 46)
  assert.equal(new Set(ids).size, 46)

  for (const id of ids) {
    const app = getMicroapp(id)
    assert.ok(app, `falta ${id}`)
    assert.equal(app.version, '1.3.0', `${id}: versión obsoleta`)
    assert.equal(app.effects, 'local', `${id}: efecto externo no declarado para aprobación`)
    assert.equal(app.approvalAction, undefined, `${id}: approvalAction innecesaria con effects=local`)
    assert.ok(app.uiSchema.length > 0, `${id}: formulario vacío`)
    for (const field of app.uiSchema) {
      assert.ok(field.label.trim(), `${id}.${field.key}: etiqueta vacía`)
      assert.ok(field.help?.trim() || field.placeholder?.trim() || field.options?.length, `${id}.${field.key}: sin guía útil`)
      if (field.widget === 'select') assert.ok(field.options?.length, `${id}.${field.key}: select sin opciones`)
    }
    for (const permission of app.dataAccess) {
      assert.ok(PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number]), `${id}: permiso desconocido ${permission}`)
    }
    for (const capability of app.capabilities) {
      assert.ok(getCapabilityContract(capability), `${id}: capability sin contrato ${capability}`)
      assert.ok(bindingsFor(capability).some(({ binding }) => binding.routable !== false), `${id}: capability sin ruta ${capability}`)
    }
    const raw = id in ADS_GROWTH_EXAMPLES
      ? ADS_GROWTH_EXAMPLES[id as keyof typeof ADS_GROWTH_EXAMPLES].input
      : id in CONTENT_AUTHORITY_EXAMPLES
        ? CONTENT_AUTHORITY_EXAMPLES[id as keyof typeof CONTENT_AUTHORITY_EXAMPLES].input
        : inputFor(id, app.inputSchema)
    const estimate = await app.estimateCost(raw)
    assert.ok(Number.isFinite(estimate.cents) && estimate.cents >= 0, `${id}: estimateCost inválido`)
  }
})

test('generadores no filtran referencias de otro tenant y rechazan proveedor fijado no enrutable', async () => {
  const originalFindMany = (prisma.asset as any).findMany
  const queries: any[] = []
  ;(prisma.asset as any).findMany = async (args: any) => { queries.push(args); return [] }
  let enqueued = false
  const ctx: MicroappCtx = {
    orgId: 'org-segura', jobId: 'job-rights', log() {},
    capability: async () => ({ text: JSON.stringify({ shots: [{ id: 'shot-1', insertion: '00:02', purpose: 'Contexto', prompt: 'Plano de equipo', durationS: 4 }] }) }),
    enqueueCapability: async () => { enqueued = true; return { jobId: 'no-deberia-crearse' } },
  }
  const productInput = { product: 'Botella de acero reutilizable con capacidad declarada de 750 ml', objective: 'Mostrar apertura y cierre', referenceAssetIds: ['asset-ajeno'], referenceRightsConfirmed: true, maxGenerationCostCents: 10_000 }
  try {
    await assert.rejects(() => getMicroapp('product-video-generator')!.run(ctx, productInput), (error: unknown) => (error as { code?: string }).code === 'REFERENCE_ASSET_NOT_AUTHORIZED')
    await assert.rejects(() => getMicroapp('studio-broll-generator')!.run(ctx, { script: 'El equipo recibe una consulta y confirma una reunión con el cliente.', generateCount: 1, referenceAssetIds: ['asset-ajeno'], referenceRightsConfirmed: true, maxGenerationCostCents: 10_000 }), (error: unknown) => (error as { code?: string }).code === 'REFERENCE_ASSET_NOT_AUTHORIZED')
    await assert.rejects(() => getMicroapp('trailers-cutdowns')!.run(ctx, { masterAssetId: 'asset-ajeno', masterDurationS: 30, moments: [{ startS: 0, endS: 10, description: 'Apertura', verifiedClaim: 'Demostración' }], audience: 'Equipos de marketing', channels: ['youtube'], generateThumbnails: false, sourceRightsConfirmed: true, maxGenerationCostCents: 10_000 }), (error: unknown) => (error as { code?: string }).code === 'LIBRARY_ASSET_NOT_AUTHORIZED')
    assert.equal(enqueued, false)
    assert.ok(queries.every(query => query.where.orgId === 'org-segura'))
    await assert.rejects(() => getMicroapp('product-video-generator')!.estimateCost({ ...productInput, providerId: 'proveedor-inexistente' }), (error: unknown) => (error as { code?: string }).code === 'MICROAPP_PROVIDER_NOT_ROUTABLE')
  } finally {
    ;(prisma.asset as any).findMany = originalFindMany
  }
})

test('R3 bloquea pins inválidos, escaladas declarativas y EDL/QC adversariales', async () => {
  const flow = getMicroapp('flow-auditor')!
  const flowResult = await flow.run({ orgId: 'org-r3', jobId: 'job-flow-r3', log() {}, capability: async () => ({}) }, {
    graph: { nodes: [{ key: 'start', type: 'capability', capability: 'llm.generate', providerId: 'proveedor-inexistente' }], edges: [] },
  })
  flow.outputSchema.parse(flowResult.data)
  validateMicroappResultEnvelope(flow.id, flowResult)
  assert.equal((flowResult.data as any).valid, false)
  assert.ok((flowResult.data as any).findings.some((finding: any) => finding.code === 'PINNED_PROVIDER_INVALID' && finding.severity === 'blocker'))

  await assert.rejects(() => getMicroapp('ai-cost-simulator')!.run({ orgId: 'org-r3', jobId: 'job-cost-r3', log() {}, capability: async () => ({}) }, {
    volume: 10, steps: [{ id: 'llm', capability: 'llm.generate', normalizedInput: { prompt: 'hola' }, executionsPerUnit: 1, providerId: 'proveedor-inexistente' }],
  }), (error: unknown) => (error as { code?: string }).code === 'MICROAPP_PROVIDER_NOT_ROUTABLE')
  await assert.rejects(() => getMicroapp('blind-provider-comparator')!.run({ orgId: 'org-r3', jobId: 'job-blind-r3', log() {}, capability: async () => ({}) }, {
    capability: 'llm.generate', normalizedInput: { prompt: 'benchmark' }, samples: [{ providerId: 'proveedor-inexistente', qualityScore: 90, latencyMs: 100, reviewerNotes: 'Muestra sin ruta' }],
  }), (error: unknown) => (error as { code?: string }).code === 'MICROAPP_PROVIDER_NOT_ROUTABLE')

  assert.equal(getMicroapp('declarative-microapp-generator')!.inputSchema.safeParse({
    name: 'App insegura', promise: 'Intenta ampliar las capabilities permitidas por la plataforma', kind: 'microapp',
    inputs: [{ key: 'prompt', type: 'string', required: true, description: 'Texto original' }], outputs: [{ key: 'text', type: 'string', description: 'Texto final' }],
    allowedCapabilities: ['root.execute'], permissions: ['admin.everything'], maxCostCentsPerCapability: 25, recipeDescription: 'Ejecuta una capability inexistente fuera del catálogo autorizado.',
  }).success, false)

  assert.equal(getMicroapp('trailers-cutdowns')!.inputSchema.safeParse({ masterAssetId: 'asset', masterDurationS: 30, moments: [{ startS: 0, endS: 10, description: 'Apertura' }], audience: 'Marketing', channels: ['youtube', 'youtube'], generateThumbnails: false, sourceRightsConfirmed: true }).success, false)
  assert.equal(getMicroapp('audiovisual-qc-inspector')!.inputSchema.safeParse({ assetId: 'asset', durationS: 10, channel: 'youtube', measured: { width: 1920, height: 1080, fps: 25, peakDb: -1, integratedLufs: -14, subtitleCoverage: 1 }, observations: [{ timecodeS: 11, kind: 'subtitle', detail: 'Fuera de rango', source: 'QA' }] }).success, false)
})

test('R3 no acepta una referencia facial sin vínculo exacto al grant', async () => {
  const originalConsentFindFirst = (prisma.consentGrant as any).findFirst
  const originalAssetFindFirst = (prisma.asset as any).findFirst
  ;(prisma.consentGrant as any).findFirst = async () => ({ id: 'grant-face', orgId: 'org-r3', kind: 'face', status: 'active', revokedAt: null, expiresAt: null, scope: { channels: ['web'], purposes: ['demo'], regions: ['ES'] } })
  ;(prisma.asset as any).findFirst = async () => ({ id: 'asset-face', consentGrantId: null, expiresAt: null })
  let called = false
  const ctx: MicroappCtx = { orgId: 'org-r3', jobId: 'job-presenter-r3', log() {}, capability: async () => { called = true; return {} } }
  try {
    await assert.rejects(() => getMicroapp('authorized-presenter')!.run(ctx, { presenterName: 'Ana', consentGrantId: 'grant-face', faceReferenceAssetId: 'asset-face', script: 'Presentación autorizada del producto.', language: 'es', channel: 'web', purpose: 'demo', intendedRegion: 'ES', rightsConfirmed: true, generateVisualDraft: false, maxGenerationCostCents: 10_000 }), (error: unknown) => (error as { code?: string }).code === 'FACE_REFERENCE_NOT_AUTHORIZED')
    assert.equal(called, false)
  } finally {
    ;(prisma.consentGrant as any).findFirst = originalConsentFindFirst
    ;(prisma.asset as any).findFirst = originalAssetFindFirst
  }
})

test('R3 exige presupuesto finito en cada nodo capability generado', async () => {
  const app = getMicroapp('declarative-microapp-generator')!
  const input = { name: 'Resumen seguro', promise: 'Resume un texto sin inventar datos ni omitir limitaciones', inputs: [{ key: 'prompt', type: 'string', required: true, description: 'Texto original' }], outputs: [{ key: 'text', type: 'string', description: 'Resumen trazable' }], allowedCapabilities: ['llm.generate'], permissions: [], maxCostCentsPerCapability: 25, recipeDescription: 'Genera un resumen fiel y devuelve únicamente la salida estructurada.' }
  const manifestWithoutBudget = { schemaVersion: 1, kind: 'microapp', entrypoint: 'result', permissions: [], capabilities: ['llm.generate'], inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] }, outputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, recipe: { nodes: [{ id: 'generate', type: 'capability', capability: 'llm.generate', input: { prompt: '$.input.prompt' }, config: {} }, { id: 'result', type: 'output', input: { text: '$.nodes.generate.text' } }], edges: [{ from: 'generate', to: 'result' }] } }
  const ctx: MicroappCtx = { orgId: 'org-r3', jobId: 'job-generator-r3', log() {}, capability: async () => ({ text: JSON.stringify(manifestWithoutBudget) }) }
  await assert.rejects(() => app.run(ctx, input), (error: unknown) => ['MANIFEST_INVALID', 'MANIFEST_BUDGET_ESCALATION'].includes((error as { code?: string }).code ?? ''))
})

test('biblioteca y voz identificada exigen derechos tenant-safe antes de invocar proveedores', async () => {
  const originalAssetFindMany = (prisma.asset as any).findMany
  const originalConsentFindFirst = (prisma.consentGrant as any).findFirst
  ;(prisma.asset as any).findMany = async () => []
  ;(prisma.consentGrant as any).findFirst = async () => null
  let capabilityCalls = 0
  const ctx: MicroappCtx = {
    orgId: 'org-segura', jobId: 'job-consent', log() {},
    capability: async () => { capabilityCalls++; return { text: '{}' } },
  }
  try {
    await assert.rejects(() => getMicroapp('contextual-broll-generator')!.run(ctx, {
      script: 'El equipo recibe una consulta y confirma una reunión con el cliente.', sector: 'software',
      authorizedLibraryAssetIds: ['asset-foreign'], generateCount: 0, maxGenerationCostCents: 10_000,
    }), (error: unknown) => (error as { code?: string }).code === 'LIBRARY_ASSET_NOT_AUTHORIZED')
    await assert.rejects(() => getMicroapp('visual-localization-dubbing')!.run(ctx, {
      sourceScript: 'Presentación autorizada del producto.', sourceLanguage: 'es', targetLanguages: ['en'],
      voiceId: 'voice-real', consentGrantId: 'grant-foreign', channel: 'web', purpose: 'campaign',
      generateNarration: true, voiceRightsConfirmed: true, maxGenerationCostCents: 10_000,
    }), (error: unknown) => (error as { code?: string }).code === 'CONSENT_NOT_VALID')
    assert.equal(capabilityCalls, 0)
  } finally {
    ;(prisma.asset as any).findMany = originalAssetFindMany
    ;(prisma.consentGrant as any).findFirst = originalConsentFindFirst
  }
})

test('R4 propaga topes de gasto por clip al router asíncrono', async () => {
  const app = getMicroapp('contextual-broll-generator')!
  const calls: any[][] = []
  const result = await app.run({
    orgId: 'org-budget', jobId: 'broll-budget', log() {},
    capability: async () => ({ text: JSON.stringify({ shots: [{ id: 's-15', insertion: '00:02', purpose: 'Contexto', durationS: 15, prompt: 'Equipo preparando campaña', source: 'generate', libraryAssetId: null, licenseNote: 'Generación nueva' }] }) }),
    enqueueCapability: async (...args) => { calls.push(args); return { jobId: 'child-budget' } },
  }, { script: 'El equipo prepara una campaña y valida cada entrega antes de publicarla.', sector: 'software', generateCount: 1, maxGenerationCostCents: 10_000 })
  validateMicroappResultEnvelope(app.id, result)
  assert.equal(calls.length, 1)
  assert.ok(Number(calls[0][2]?.maxCostCents) >= 0)
  assert.equal(result.suggestedActions?.[0]?.params?.sourceJobId, 'broll-budget')
})

test('R4 bloquea licencia vacía y consentimiento de identidad de otro tenant antes del proveedor', async () => {
  const assetDelegate = prisma.asset as any
  const consentDelegate = prisma.consentGrant as any
  const originalAssets = assetDelegate.findMany
  const originalConsent = consentDelegate.findFirst
  let providerCalled = false
  assetDelegate.findMany = async (args: any) => (args?.where?.id?.in ?? []).map((id: string) => ({ id, expiresAt: null, license: {} }))
  consentDelegate.findFirst = async () => null
  const ctx: MicroappCtx = { orgId: 'org-safe', jobId: 'rights-r4', log() {}, capability: async () => { providerCalled = true; return { text: '{}' } }, enqueueCapability: async () => { providerCalled = true; return { jobId: 'bad' } } }
  try {
    await assert.rejects(() => getMicroapp('product-video-generator')!.run(ctx, { product: 'Botella de acero reutilizable con capacidad declarada de 750 ml', objective: 'Mostrar cierre', referenceAssetIds: ['asset-empty-license'], referenceRightsConfirmed: true, maxGenerationCostCents: 10_000 }), (error: unknown) => (error as any).code === 'REFERENCE_ASSET_NOT_AUTHORIZED')
    await assert.rejects(() => getMicroapp('character-continuity-guardian')!.run(ctx, { characterName: 'Ana', isRealPerson: true, consentGrantId: 'grant-foreign', traits: 'Presentadora con vestuario azul', observations: [{ shot: 's1', detail: 'Vestuario azul' }], intendedRegions: ['ES'], intendedChannels: ['web'] }), (error: unknown) => (error as any).code === 'CONSENT_NOT_VALID')
    assert.equal(providerCalled, false)
  } finally { assetDelegate.findMany = originalAssets; consentDelegate.findFirst = originalConsent }
})

test('R4 rechaza timecodes fuera del master y EDL con solapes de destino', async () => {
  const continuity = getMicroapp('production-continuity-inspector')!
  assert.equal(continuity.inputSchema.safeParse({ masterDurationS: 10, bible: [{ id: 'rule-1', kind: 'rule', rule: 'Vestuario azul', referenceAssetIds: [] }], shotObservations: [{ shotId: 's1', timecodeS: 11, observation: 'Vestuario rojo', source: 'QA' }] }).success, false)

  const trailer = getMicroapp('trailer-cutdown-generator')!
  const assetDelegate = prisma.asset as any
  const original = assetDelegate.findMany
  assetDelegate.findMany = async (args: any) => (args?.where?.id?.in ?? []).map((id: string) => ({ id, expiresAt: null, license: { kind: 'master' } }))
  try {
    await assert.rejects(() => trailer.run({ orgId: 'org-edl', jobId: 'edl-overlap', log() {}, capability: async () => ({ text: JSON.stringify({ sourceAssetId: 'master-1', excludedClaims: [], variants: [{ channel: 'youtube', title: 'Corte', copy: 'Copy', durationS: 10, aspectRatio: '16:9', edl: [{ sourceInS: 0, sourceOutS: 6, destinationInS: 0, purpose: 'Hook' }, { sourceInS: 6, sourceOutS: 10, destinationInS: 5, purpose: 'Cierre' }], hook: 'Hook', thumbnailBrief: 'Miniatura', renderStatus: 'edl_ready' }] }) }) }, { masterAssetId: 'master-1', durationS: 10, authorizedMoments: [{ startS: 0, endS: 10, description: 'Todo', verifiedClaims: [] }], targets: [{ channel: 'youtube', maxDurationS: 10, aspectRatio: '16:9' }], audience: 'Equipos de marketing', sourceRightsConfirmed: true }), (error: unknown) => (error as any).code === 'MICROAPP_OUTPUT_SEMANTIC_INVALID')
  } finally { assetDelegate.findMany = original }
})

test('R4 no marca licencias territoriales ni idiomas de consentimiento fuera de alcance', async () => {
  const soundtrack = getMicroapp('soundtrack-sfx-designer')!
  const soundtrackInput = { scenes: [{ id: 's1', description: 'Apertura', startS: 0, endS: 5, dialogue: '' }], mood: 'Sobrio', licensedTracks: [{ id: 'track-us', title: 'Tema', license: 'Licencia declarada', territories: ['US'] }], deliveryTerritories: ['ES'], deliveryLufs: -14 }
  const soundtrackDraft = { cueSheet: [{ sceneId: 's1', inS: 0, outS: 5, kind: 'music', description: 'Tema', trackId: 'track-us', licenseStatus: 'verified_from_input' }], stemsPlan: ['music'], preliminaryMix: { targetLufs: -14, dialoguePriority: true, notes: [] }, licenseRegister: [{ trackId: 'track-us', declaredLicense: 'Licencia declarada', status: 'declared' }], missingAssets: [] }
  await assert.rejects(() => soundtrack.run({ orgId: 'org', jobId: 'soundtrack-rights', log() {}, capability: async () => ({ text: JSON.stringify(soundtrackDraft) }) }, soundtrackInput), (error: unknown) => (error as any).code === 'MICROAPP_OUTPUT_SEMANTIC_INVALID')

  const presenter = getMicroapp('authorized-presenter')!
  const consentDelegate = prisma.consentGrant as any
  const original = consentDelegate.findFirst
  consentDelegate.findFirst = async () => ({ id: 'grant-lang', kind: 'face', status: 'active', revokedAt: null, expiresAt: null, scope: { channels: ['web'], purposes: ['demo'], regions: ['ES'], languages: ['en'] } })
  let providerCalled = false
  try {
    await assert.rejects(() => presenter.run({ orgId: 'org', jobId: 'presenter-lang', log() {}, capability: async () => { providerCalled = true; return {} } }, { presenterName: 'Ana', consentGrantId: 'grant-lang', faceReferenceAssetId: 'face', script: 'Presentación del producto.', language: 'es', channel: 'web', purpose: 'demo', intendedRegion: 'ES', rightsConfirmed: true, generateVisualDraft: false, maxGenerationCostCents: 10_000 }), (error: unknown) => (error as any).code === 'CONSENT_SCOPE_MISMATCH')
    assert.equal(providerCalled, false)
  } finally { consentDelegate.findFirst = original }
})
