process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import { PERMISSIONS } from '../access-control/catalog'
import { prisma } from '../lib/prisma'
import { WAVE2_CONTENT_MEDIA_FIXTURES, WAVE2_CONTENT_MEDIA_IDS, parseSrt } from '../microapps/apps/wave2ContentMediaPack'
import { WAVE2_DATA_AIOPS_FIXTURES, WAVE2_DATA_AIOPS_IDS } from '../microapps/apps/wave2DataAiOpsPack'
import { getMicroapp } from '../microapps/registry'
import { validateMicroappResultEnvelope } from '../microapps/quality'
import type { MicroappCtx } from '../microapps/types'
import { ensureProvidersRegistered } from '../providers'
import { getCapabilityContract } from '../providers/registry'

ensureProvidersRegistered()

const IDS = { ...WAVE2_CONTENT_MEDIA_IDS, ...WAVE2_DATA_AIOPS_IDS }
const FIXTURES: Record<string, unknown> = { ...WAVE2_CONTENT_MEDIA_FIXTURES, ...WAVE2_DATA_AIOPS_FIXTURES }

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as ZodTypeAny)
  if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType as ZodTypeAny)
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema as ZodTypeAny)
  return schema
}

async function runValidated(app: NonNullable<ReturnType<typeof getMicroapp>>, runCtx: MicroappCtx, input: unknown) {
  const result = await app.run(runCtx, input)
  validateMicroappResultEnvelope(app.id, result)
  app.outputSchema.parse(result.data)
  return result
}

test('el mapa 41–60 contiene exactamente los IDs aprobados y veinte manifiestos únicos', () => {
  assert.deepEqual(Object.keys(IDS).map(Number), Array.from({ length: 20 }, (_, index) => index + 41))
  assert.equal(new Set(Object.values(IDS)).size, 20)
  assert.equal(IDS[41], 'seo-cluster-builder')
  assert.equal(IDS[47], 'interface-demo-video')
  assert.equal(IDS[60], 'byok-managed-comparator')
  for (const id of Object.values(IDS)) assert.ok(getMicroapp(id), `Falta registrar ${id}`)
})

test('cada manifest tiene schema/UI propio, permisos/capabilities conocidos, coste y fixture válido', async () => {
  const inputSchemas = new Set<ZodTypeAny>(); const outputSchemas = new Set<ZodTypeAny>()
  for (const id of Object.values(IDS)) {
    const app = getMicroapp(id)!
    assert.match(app.version, /^\d+\.\d+\.\d+$/)
    const version15 = new Set(['interface-demo-video', 'delivery-package-builder', 'audiovisual-rights-inspector', 'knowledge-base-builder', 'workflow-synthetic-evaluator'])
    const version14 = new Set(['seo-cluster-builder', 'seo-overlap-auditor', 'webinar-campaign-builder', 'podcast-producer', 'publishable-moment-finder', 'csv-excel-doctor', 'knowledge-base-builder', 'workflow-synthetic-evaluator', 'prompt-drift-detector'])
    assert.equal(app.version, version15.has(id) ? '1.5.0' : version14.has(id) ? '1.4.0' : '1.3.0', `${id}: versión no refleja su contrato vigente`)
    assert.ok(app.promise.length > 30)
    assert.ok(app.followUps.length > 0, `${id}: sin siguiente acción`)
    assert.ok(app.uiSchema.some(field => field.help?.trim() || field.placeholder?.trim() || field.options?.length), `${id}: formulario sin orientación`)
    assert.equal(new Set(app.dataAccess).size, app.dataAccess.length, `${id}: permisos duplicados`)
    inputSchemas.add(app.inputSchema); outputSchemas.add(app.outputSchema)
    const schema = unwrap(app.inputSchema)
    assert.ok(schema instanceof z.ZodObject, id)
    assert.deepEqual(new Set(app.uiSchema.map(item => item.key)), new Set(Object.keys(schema.shape)), `${id}: formulario incompleto`)
    for (const field of app.uiSchema) {
      assert.ok(field.label)
      if (field.widget === 'select') assert.ok(field.options?.length, `${id}.${field.key}: select sin opciones`)
    }
    for (const permission of app.dataAccess) assert.ok(PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number]), `${id}: permiso ${permission}`)
    for (const capability of app.capabilities) assert.ok(getCapabilityContract(capability), `${id}: capability ${capability}`)
    assert.ok(app.inputSchema.safeParse(FIXTURES[id]).success, `${id}: fixture inválido`)
    const cost = await app.estimateCost(FIXTURES[id])
    assert.ok(Number.isFinite(cost.cents) && cost.cents >= 0, `${id}: coste ${cost.cents}`)
  }
  assert.equal(inputSchemas.size, 20)
  assert.equal(outputSchemas.size, 20)
})

test('el inspector SRT interpreta cues y detecta velocidad, solape y términos sensibles', async () => {
  const source = `1\n00:00:00,000 --> 00:00:01,000\nEste texto es demasiado largo para un segundo\n\n2\n00:00:00,900 --> 00:00:03,000\nPalabra prohibida`
  assert.equal(parseSrt(source).cues.length, 2)
  const app = getMicroapp('subtitle-inspector')!
  const result = await runValidated(app, ctx(), { srt: source, language: 'es', videoDurationS: 4, maxCharsPerLine: 20, maxLines: 2, maxCharsPerSecond: 15, sensitiveTerms: ['prohibida'], safeAreaNotes: '' })
  const output = app.outputSchema.parse(result.data) as { issues: Array<{ code: string }>; metrics: { overlaps: number }; normalizedSrt: string }
  assert.ok(output.issues.some(issue => issue.code === 'TOO_FAST'))
  assert.ok(output.issues.some(issue => issue.code === 'OVERLAP'))
  assert.ok(output.issues.some(issue => issue.code === 'SENSITIVE_TERM'))
  assert.equal(output.metrics.overlaps, 1)
  assert.match(output.normalizedSrt, /00:00:00,000/)
})

test('el inspector SRT reordena cronológicamente antes de calcular cobertura y solapes', async () => {
  const source = `2\n00:00:01,000 --> 00:00:03,000\nSegundo\n\n1\n00:00:00,000 --> 00:00:02,000\nPrimero`
  const app = getMicroapp('subtitle-inspector')!
  const output = app.outputSchema.parse((await runValidated(app, ctx(), { srt: source, language: 'es', videoDurationS: 4, maxCharsPerLine: 42, maxLines: 2, maxCharsPerSecond: 20, sensitiveTerms: [], safeAreaNotes: '' })).data) as any
  assert.equal(output.coverage.firstS, 0)
  assert.equal(output.coverage.lastS, 3)
  assert.equal(output.metrics.overlaps, 1)
  assert.match(output.normalizedSrt, /^1\n00:00:00,000/m)
  assert.ok(output.parseErrors.some((message: string) => /orden cronológico/.test(message)))
})

test('R4 rechaza timecodes imposibles, placeholders desconocidos y segmentos ambiguos', () => {
  assert.equal(parseSrt('1\n00:99:00,000 --> 00:99:01,000\nInválido').cues.length,0)
  const delivery=getMicroapp('delivery-package-builder')!; const deliveryInput=structuredClone(FIXTURES['delivery-package-builder']) as any
  deliveryInput.namingPattern='{project}_{secret}.{format}'
  assert.equal(delivery.inputSchema.safeParse(deliveryInput).success,false)
  const moments=getMicroapp('publishable-moment-finder')!; const momentInput=structuredClone(FIXTURES['publishable-moment-finder']) as any
  momentInput.transcriptSegments[1].startS=5
  assert.equal(moments.inputSchema.safeParse(momentInput).success,false)
})

test('paquete de entrega calcula SHA-256 del manifiesto y bloquea licencias ausentes', async () => {
  const app = getMicroapp('delivery-package-builder')!
  const input = structuredClone(FIXTURES['delivery-package-builder']) as any
  input.files[0].licenseRef = null
  const first = app.outputSchema.parse((await runValidated(app, ctx(), input)).data) as any
  const second = app.outputSchema.parse((await runValidated(app, ctx(), input)).data) as any
  assert.match(first.manifestSha256, /^[a-f0-9]{64}$/)
  assert.equal(first.manifestSha256, second.manifestSha256)
  assert.ok(first.blockers.some((value: string) => value.includes('licencia')))
})

test('derechos audiovisuales bloquea territorio y paid media no autorizados', async () => {
  const app = getMicroapp('audiovisual-rights-inspector')!
  const input = structuredClone(FIXTURES['audiovisual-rights-inspector']) as any
  input.intendedUse.territories.push('US'); input.intendedUse.paidMedia = true
  const output = app.outputSchema.parse((await runValidated(app, ctx(), input)).data) as any
  assert.equal(output.status, 'bloqueado')
  assert.deepEqual(output.assets[0].missingTerritories, ['US'])
  assert.match(output.assets[0].paidMediaIssue, /no está autorizado/i)
})

test('derechos audiovisuales compara territorios y canales sin falsos negativos por mayúsculas', async () => {
  const app = getMicroapp('audiovisual-rights-inspector')!
  const input = structuredClone(FIXTURES['audiovisual-rights-inspector']) as any
  input.assets[0].allowedTerritories = ['es']
  input.assets[0].allowedChannels = ['WEB']
  const output = app.outputSchema.parse((await runValidated(app, ctx(), input)).data) as any
  assert.deepEqual(output.assets[0].missingTerritories, [])
  assert.deepEqual(output.assets[0].missingChannels, [])
  assert.deepEqual(getMicroapp('delivery-package-builder')!.dataAccess, [])
  assert.deepEqual(app.dataAccess, [])
})

test('vídeo-demo valida assets y encola únicamente el número solicitado de Jobs hijos', async () => {
  const app = getMicroapp('interface-demo-video')!
  const input = { ...(FIXTURES['interface-demo-video'] as any), renderScenes: 1 }
  const queued: unknown[] = []
  const runCtx = ctx(async (name, payload) => {
    assert.equal(name, 'llm.generate')
    assert.match(String((payload as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/)
    return { text: JSON.stringify({ narrative: { hook: 'Mira', problem: 'Demora', demonstration: 'Panel', cta: 'Pruébalo' }, scenes: [{ id: 's1', startS: 0, durationS: 5, interfaceAssetId: 'asset-1', action: 'Abrir', narration: 'Abre el panel', visualDirection: 'Zoom suave', generationPrompt: 'Animar captura sin cambiar texto' }], editDecisionList: [{ sceneId: 's1', sourceAssetId: 'asset-1', inS: 0, outS: 5, overlay: 'Panel' }], limitations: ['Borrador'] }) }
  }, async (...args) => { queued.push(args); return { jobId: 'video-child-1' } })
  const output = await withAccessibleAssets(['asset-1'], async () => app.outputSchema.parse((await runValidated(app, runCtx, input)).data) as any)
  assert.equal(output.renderJobs[0].jobId, 'video-child-1')
  assert.equal(queued.length, 1)
  assert.deepEqual((queued[0] as any[])[2], { maxCostCents: 10000 })
})

test('vídeo-demo rechaza assets duplicados, pasos ajenos y planes fuera de duración', async () => {
  const app = getMicroapp('interface-demo-video')!
  const fixture = structuredClone(FIXTURES['interface-demo-video']) as any
  assert.equal(app.inputSchema.safeParse({ ...fixture, interfaceAssetIds: ['asset-1', 'asset-1'] }).success, false)
  const foreignStep = structuredClone(fixture); foreignStep.interactionSteps[0].assetId = 'asset-other'
  assert.equal(app.inputSchema.safeParse(foreignStep).success, false)
  await withAccessibleAssets(['asset-1'], async () => assert.rejects(() => app.run(ctx(async () => ({ text: JSON.stringify({ narrative: { hook: 'H', problem: 'P', demonstration: 'D', cta: 'C' }, scenes: [{ id: 's1', startS: 18, durationS: 5, interfaceAssetId: 'asset-1', action: 'A', narration: 'N', visualDirection: 'V', generationPrompt: 'G' }], editDecisionList: [{ sceneId: 's1', sourceAssetId: 'asset-1', inS: 18, outS: 23, overlay: 'O' }], limitations: [] }) })), fixture), /excede la duración/))
})

test('vídeo-demo bloquea capturas ajenas antes de LLM/render y acota el presupuesto', async () => {
  const app = getMicroapp('interface-demo-video')!
  const fixture = structuredClone(FIXTURES['interface-demo-video']) as any
  assert.equal(app.inputSchema.safeParse({ ...fixture, maxGenerationCostCents: 0 }).success, false)
  let capabilityCalled = false
  const delegate = prisma.asset as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = delegate.findMany
  delegate.findMany = async args => { assert.equal(args.where.orgId, 'org-pack'); return [] }
  try {
    await assert.rejects(() => app.run(ctx(async () => { capabilityCalled = true; return {} }), fixture), (error: any) => error?.code === 'ASSET_NOT_AVAILABLE')
    assert.equal(capabilityCalled, false)
  } finally { delegate.findMany = original }
})

test('entregas y derechos rechazan identificadores, nombres y ventanas ambiguos', async () => {
  const delivery = getMicroapp('delivery-package-builder')!
  const deliveryFixture = structuredClone(FIXTURES['delivery-package-builder']) as any
  const duplicateAsset = structuredClone(deliveryFixture); duplicateAsset.files.push({ ...duplicateAsset.files[0] })
  assert.equal(delivery.inputSchema.safeParse(duplicateAsset).success, false)
  const nameCollision = structuredClone(deliveryFixture); nameCollision.files.push({ ...nameCollision.files[0], assetId: 'a2', checksumSha256: 'b'.repeat(64) })
  assert.equal(delivery.inputSchema.safeParse(nameCollision).success, false)

  const rights = getMicroapp('audiovisual-rights-inspector')!
  const rightsFixture = structuredClone(FIXTURES['audiovisual-rights-inspector']) as any
  rightsFixture.assets[0].validFrom = '2031-01-01T00:00:00.000Z'; rightsFixture.assets[0].validTo = '2030-01-01T00:00:00.000Z'
  assert.equal(rights.inputSchema.safeParse(rightsFixture).success, false)
  await assert.rejects(() => rights.estimateCost(rightsFixture))
  await assert.rejects(() => rights.run(ctx(), rightsFixture))
})

test('R5 Media rechaza planes SEO que pasan Zod pero rompen el grafo editorial', async () => {
  const cluster = getMicroapp('seo-cluster-builder')!
  const incompleteOrder = { clusters: [{ pillar: 'CRM', intent: 'comercial', rationale: 'Arquitectura', pages: [{ title: 'Guía', slug: 'guia', primaryQuery: 'crm', secondaryQueries: [], funnelStage: 'consideracion', sourceNumbers: [], existingUrl: null }, { title: 'Comprar', slug: 'comprar', primaryQuery: 'comprar crm', secondaryQueries: [], funnelStage: 'decision', sourceNumbers: [], existingUrl: null }] }], internalLinks: [], publicationOrder: [{ position: 1, slug: 'guia', dependency: null, expectedLearning: 'Demanda' }], measurement: [{ metric: 'clics', event: 'click', reviewAfterDays: 30 }, { metric: 'leads', event: 'lead', reviewAfterDays: 60 }], assumptions: [] }
  assert.equal(cluster.outputSchema.safeParse(incompleteOrder).success, true)
  await assert.rejects(() => cluster.run(ctx(async name => name === 'web.search' ? { results: [] } : { text: JSON.stringify(incompleteOrder) }), FIXTURES['seo-cluster-builder']), (error: any) => error?.code === 'MICROAPP_OUTPUT_SEMANTIC_INVALID' && JSON.stringify(error.details).includes('orden editorial'))

  const overlap = getMicroapp('seo-overlap-auditor')!
  const outsideCanonical = { conflicts: [{ urls: ['https://example.com/a', 'https://example.com/b'], sharedIntent: 'CRM', severity: 'media', evidence: ['Misma intención'], recommendation: 'redirigir', canonicalUrl: 'https://example.com/outsider', migrationSteps: ['Redirigir'] }], protectedDecisions: [], contentGaps: [], validationPlan: [{ check: 'clics', afterDays: 30, successSignal: 'Estables' }, { check: 'leads', afterDays: 60, successSignal: 'Mejoran' }] }
  const overlapInput = { domain: 'https://example.com', pages: [{ url: 'https://example.com/a', title: 'A', targetQuery: 'crm', contentSummary: 'A' }, { url: 'https://example.com/b', title: 'B', targetQuery: 'crm', contentSummary: 'B' }], protectedUrls: [], businessPriorities: 'Leads' }
  assert.equal(overlap.outputSchema.safeParse(outsideCanonical).success, true)
  await assert.rejects(() => overlap.run(ctx(async () => ({ text: JSON.stringify(outsideCanonical) })), overlapInput), (error: any) => error?.code === 'MICROAPP_OUTPUT_SEMANTIC_INVALID' && JSON.stringify(error.details).includes('canonicalUrl'))
})

test('R5 Media valida cobertura, speaker y timecodes aunque el JSON del LLM sea tipado', async () => {
  const app = getMicroapp('publishable-moment-finder')!
  const invalid = { moments: [{ startS: 10, endS: 25, exactOpening: 'Idea principal concreta', speaker: 'A', whyItWorks: 'Concreto', hook: 'Idea', contextBefore: 'Antes', channel: 'linkedin', editPlan: [], riskFlags: [], confidence: 'alta' }], rejectedMoments: [], coverage: { transcriptDurationS: 39, segmentsReviewed: 2, limitations: [] } }
  assert.equal(app.outputSchema.safeParse(invalid).success, true)
  await assert.rejects(() => app.run(ctx(async () => ({ text: JSON.stringify(invalid) })), FIXTURES['publishable-moment-finder']), (error: any) => error?.code === 'MICROAPP_OUTPUT_SEMANTIC_INVALID' && /speaker|cobertura/i.test(JSON.stringify(error.details)))
})

test('R5 Media valida calendario y dependencias del webinar y timecodes del podcast', async () => {
  const webinar = getMicroapp('webinar-campaign-builder')!
  const invalidDate = { concept: { title: 'T', promise: 'P', audienceFit: 'A', approvedClaimsUsed: [] }, agenda: [{ startMinute: 0, durationMinutes: 5, segment: 'A', owner: 'Ana', purpose: 'A' }, { startMinute: 5, durationMinutes: 30, segment: 'B', owner: 'Ana', purpose: 'B' }, { startMinute: 35, durationMinutes: 10, segment: 'C', owner: 'Ana', purpose: 'C' }], landing: { headline: 'H', subheadline: 'S', bullets: [], formFields: [], faq: [], cta: 'C' }, runOfShow: [{ minute: 0, speaker: 'Ana', script: 'A', visualCue: 'A', interaction: 'A' }, { minute: 5, speaker: 'Ana', script: 'B', visualCue: 'B', interaction: 'B' }, { minute: 35, speaker: 'Ana', script: 'C', visualCue: 'C', interaction: 'C' }], emails: [{ timing: 'A', subject: 'A', body: 'A', cta: 'A' }, { timing: 'B', subject: 'B', body: 'B', cta: 'B' }, { timing: 'C', subject: 'C', body: 'C', cta: 'C' }], ads: [], operations: [{ dueAt: '2029-02-31', owner: 'Ops', task: 'A', dependency: null }, { dueAt: '2029-12-02', owner: 'Ops', task: 'B', dependency: 'C' }, { dueAt: '2029-12-03', owner: 'Ops', task: 'C', dependency: null }, { dueAt: '2030-01-01', owner: 'Ops', task: 'D', dependency: 'C' }], repurposing: [{ asset: 'A', sourceSegment: 'A', channel: 'email', objective: 'A' }, { asset: 'B', sourceSegment: 'B', channel: 'email', objective: 'B' }, { asset: 'C', sourceSegment: 'C', channel: 'email', objective: 'C' }] }
  assert.equal(webinar.outputSchema.safeParse(invalidDate).success, false)
  invalidDate.operations[0].dueAt = '2029-12-01'
  assert.equal(webinar.outputSchema.safeParse(invalidDate).success, true)
  await assert.rejects(() => webinar.run(ctx(async () => ({ text: JSON.stringify(invalidDate) })), FIXTURES['webinar-campaign-builder']), (error: any) => error?.code === 'MICROAPP_OUTPUT_SEMANTIC_INVALID' && JSON.stringify(error.details).includes('Dependencia operativa'))

  const podcast = getMicroapp('podcast-producer')!
  const malformed = { researchBrief: { verifiedFacts: [], unknowns: [], angles: [] }, episodeThesis: 'T', rundown: [{ startMinute: 0, durationMinutes: 10, section: 'A', purpose: 'A' }, { startMinute: 10, durationMinutes: 10, section: 'B', purpose: 'B' }, { startMinute: 20, durationMinutes: 10, section: 'C', purpose: 'C' }], questions: Array.from({ length: 8 }, (_, index) => ({ question: `P${index}`, purpose: 'P', followUps: ['F'], sensitivity: 'baja' })), hostScript: { intro: 'I', transitions: [], outro: 'O' }, chapterPlan: [{ plannedTimecode: '00:00', title: 'A', description: 'A' }, { plannedTimecode: '99:99', title: 'B', description: 'B' }, { plannedTimecode: '20:00', title: 'C', description: 'C' }], promotion: [{ channel: 'a', copy: 'a', requiredEpisodeEvidence: 'a' }, { channel: 'b', copy: 'b', requiredEpisodeEvidence: 'b' }, { channel: 'c', copy: 'c', requiredEpisodeEvidence: 'c' }], guestFollowUp: { thankYou: 'T', approvalRequest: 'A', sharingKit: [] } }
  assert.equal(podcast.outputSchema.safeParse(malformed).success, false)
})

test('R5 Studio rechaza escenas solapadas y EDL con asset de otra escena', async () => {
  const app = getMicroapp('interface-demo-video')!
  const input = { ...(FIXTURES['interface-demo-video'] as any), interfaceAssetIds: ['asset-1', 'asset-2'], interactionSteps: [{ order: 1, action: 'Uno', outcome: 'Uno', assetId: 'asset-1' }, { order: 2, action: 'Dos', outcome: 'Dos', assetId: 'asset-2' }] }
  const base = { narrative: { hook: 'H', problem: 'P', demonstration: 'D', cta: 'C' }, scenes: [{ id: 's1', startS: 0, durationS: 6, interfaceAssetId: 'asset-1', action: 'A', narration: 'N', visualDirection: 'V', generationPrompt: 'G' }, { id: 's2', startS: 5, durationS: 5, interfaceAssetId: 'asset-2', action: 'A2', narration: 'N2', visualDirection: 'V2', generationPrompt: 'G2' }], editDecisionList: [{ sceneId: 's1', sourceAssetId: 'asset-1', inS: 0, outS: 6, overlay: 'O' }], limitations: [] }
  await withAccessibleAssets(input.interfaceAssetIds, async () => assert.rejects(() => app.run(ctx(async () => ({ text: JSON.stringify(base) })), input), /solapa escenas/i))
  const mismatched = structuredClone(base) as any
  mismatched.scenes[1].startS = 6
  mismatched.editDecisionList[0].sourceAssetId = 'asset-2'
  await withAccessibleAssets(input.interfaceAssetIds, async () => assert.rejects(() => app.run(ctx(async () => ({ text: JSON.stringify(mismatched) })), input), /lista de edición/i))
})

test('R5 Studio no eleva IDs aportados por usuario a assets tenant-verificados', async () => {
  for (const id of ['delivery-package-builder', 'audiovisual-rights-inspector']) {
    const app = getMicroapp(id)!
    const result = await runValidated(app, ctx(), FIXTURES[id])
    assert.equal(result.assets, undefined, `${id} no debe publicar asset IDs sin resolverlos contra el tenant`)
  }
})

test('las seis recetas editoriales ejecutan su handler, validan JSON y producen evidencia', async () => {
  const outputs: Record<string, unknown> = {
    'seo-cluster-builder': { clusters: [{ pillar: 'CRM B2B', intent: 'comercial', rationale: 'Ayuda a evaluar', pages: [{ title: 'Guía CRM', slug: 'guia-crm', primaryQuery: 'crm b2b', secondaryQueries: ['crm ventas'], funnelStage: 'consideracion', sourceNumbers: [1], existingUrl: null }, { title: 'Comparar CRM', slug: 'comparar-crm', primaryQuery: 'comparativa crm', secondaryQueries: [], funnelStage: 'decision', sourceNumbers: [], existingUrl: null }] }], internalLinks: [{ fromSlug: 'guia-crm', toSlug: 'comparar-crm', anchor: 'comparar CRM', reason: 'Avanza intención' }], publicationOrder: [{ position: 1, slug: 'guia-crm', dependency: null, expectedLearning: 'Demanda' }, { position: 2, slug: 'comparar-crm', dependency: 'guia-crm', expectedLearning: 'Intención de compra' }], measurement: [{ metric: 'clics', event: 'organic_click', reviewAfterDays: 30 }, { metric: 'demos', event: 'demo_request', reviewAfterDays: 60 }], assumptions: [] },
    'seo-overlap-auditor': { conflicts: [{ urls: ['https://example.com/a', 'https://example.com/b'], sharedIntent: 'Elegir CRM', severity: 'media', evidence: ['Consultas similares'], recommendation: 'diferenciar', canonicalUrl: null, migrationSteps: ['Separar intención'] }], protectedDecisions: [], contentGaps: [], validationPlan: [{ check: 'clics', afterDays: 30, successSignal: 'Sin caída' }, { check: 'conversión', afterDays: 60, successSignal: 'Mejora' }] },
    'webinar-campaign-builder': { concept: { title: 'IA comercial', promise: 'Aprender un método', audienceFit: 'Revenue leaders', approvedClaimsUsed: [] }, agenda: [{ startMinute: 0, durationMinutes: 5, segment: 'Inicio', owner: 'Ana', purpose: 'Contexto' }, { startMinute: 5, durationMinutes: 30, segment: 'Método', owner: 'Ana', purpose: 'Educar' }, { startMinute: 35, durationMinutes: 10, segment: 'Preguntas', owner: 'Ana', purpose: 'Resolver' }], landing: { headline: 'IA comercial', subheadline: 'Método práctico', bullets: ['Aplicable'], formFields: ['email'], faq: [{ question: '¿Cuándo?', answer: 'En la fecha indicada' }], cta: 'Registrarme' }, runOfShow: [{ minute: 0, speaker: 'Ana', script: 'Bienvenida', visualCue: 'Título', interaction: 'Saludo' }, { minute: 5, speaker: 'Ana', script: 'Método', visualCue: 'Diagrama', interaction: 'Encuesta' }, { minute: 35, speaker: 'Ana', script: 'Preguntas', visualCue: 'Q&A', interaction: 'Preguntas' }], emails: [{ timing: '7 días antes', subject: 'Invitación', body: 'Contenido', cta: 'Registro' }, { timing: '1 día antes', subject: 'Recordatorio', body: 'Mañana', cta: 'Añadir' }, { timing: 'Después', subject: 'Gracias', body: 'Grabación', cta: 'Ver' }], ads: [], operations: [{ dueAt: '2029-12-01', owner: 'Marketing', task: 'Landing', dependency: null }, { dueAt: '2029-12-02', owner: 'Ana', task: 'Guion', dependency: 'Landing' }, { dueAt: '2029-12-03', owner: 'Ops', task: 'Ensayo', dependency: 'Guion' }, { dueAt: '2030-01-01', owner: 'Ops', task: 'Directo', dependency: 'Ensayo' }], repurposing: [{ asset: 'Clip', sourceSegment: 'Método', channel: 'linkedin', objective: 'Alcance' }, { asset: 'Artículo', sourceSegment: 'Método', channel: 'blog', objective: 'SEO' }, { asset: 'Email', sourceSegment: 'Preguntas', channel: 'email', objective: 'Nutrir' }] },
    'report-to-campaign': { findings: [{ id: 'f1', finding: 'Hallazgo uno', sourceExcerpt: 'Este informe analiza una muestra propia', confidence: 'alta', safeClaim: 'Se analizó una muestra' }, { id: 'f2', finding: 'Hallazgo dos', sourceExcerpt: 'documenta tres hallazgos verificables', confidence: 'media', safeClaim: 'Hay hallazgos documentados' }, { id: 'f3', finding: 'Hallazgo tres', sourceExcerpt: 'audiencia profesional', confidence: 'media', safeClaim: 'Dirigido a profesionales' }], narrative: { tension: 'Falta claridad', thesis: 'Usar evidencia', proofSequence: ['f1', 'f2'], action: 'Descargar' }, landing: { headline: 'Informe', value: 'Datos propios', findingIds: ['f1'], cta: 'Descargar' }, campaignAssets: [{ channel: 'linkedin', format: 'post', hook: 'Datos', bodyOrBrief: 'Resumen', findingIds: ['f1'], publishDay: 1 }, { channel: 'email', format: 'email', hook: 'Informe', bodyOrBrief: 'Descarga', findingIds: ['f2'], publishDay: 5 }, { channel: 'sales', format: 'one-pager', hook: 'Hallazgos', bodyOrBrief: 'Apoyo', findingIds: ['f3'], publishDay: 10 }], webinarOutline: [{ segment: 'Inicio', findingIds: ['f1'], takeaway: 'Contexto' }, { segment: 'Datos', findingIds: ['f2'], takeaway: 'Evidencia' }, { segment: 'Cierre', findingIds: ['f3'], takeaway: 'Acción' }], salesAssets: [{ asset: 'One-pager', useCase: 'Discovery', findingIds: ['f1'] }, { asset: 'Slide', useCase: 'Demo', findingIds: ['f2'] }], unsupportedClaims: [] },
    'podcast-producer': { researchBrief: { verifiedFacts: [{ fact: 'Contexto aportado', sourceNumber: null }], unknowns: ['Trayectoria no verificada'], angles: ['Operaciones'] }, episodeThesis: 'Cómo operar mejor', rundown: [{ startMinute: 0, durationMinutes: 5, section: 'Inicio', purpose: 'Contexto' }, { startMinute: 5, durationMinutes: 30, section: 'Conversación', purpose: 'Aprender' }, { startMinute: 35, durationMinutes: 10, section: 'Cierre', purpose: 'Síntesis' }], questions: Array.from({ length: 8 }, (_, index) => ({ question: `Pregunta ${index + 1}`, purpose: 'Profundizar', followUps: ['¿Por qué?'], sensitivity: 'baja' })), hostScript: { intro: 'Bienvenida', transitions: ['Seguimos'], outro: 'Gracias' }, chapterPlan: [{ plannedTimecode: '00:00', title: 'Inicio', description: 'Contexto' }, { plannedTimecode: '05:00', title: 'Método', description: 'Aprendizaje' }, { plannedTimecode: '35:00', title: 'Cierre', description: 'Resumen' }], promotion: [{ channel: 'linkedin', copy: 'Próximo episodio', requiredEpisodeEvidence: 'Confirmar tras grabar' }, { channel: 'email', copy: 'Nueva conversación', requiredEpisodeEvidence: 'Confirmar tras grabar' }, { channel: 'web', copy: 'Episodio', requiredEpisodeEvidence: 'Confirmar tras grabar' }], guestFollowUp: { thankYou: 'Gracias', approvalRequest: 'Revisa datos', sharingKit: ['Enlace'] } },
    'publishable-moment-finder': { moments: [{ startS: 10, endS: 25, exactOpening: 'Idea principal concreta', speaker: 'B', whyItWorks: 'Es concreto', hook: 'Una idea', contextBefore: 'Tras apertura', channel: 'linkedin', editPlan: ['Cortar silencios'], riskFlags: [], confidence: 'alta' }], rejectedMoments: [], coverage: { transcriptDurationS: 40, segmentsReviewed: 3, limitations: ['Selección editorial; no se renderizó vídeo'] } },
  }
  for (const [id, output] of Object.entries(outputs)) {
    const calls: string[] = []
    const runCtx = ctx(async name => {
      calls.push(name)
      if (name === 'web.search') return { results: [{ title: 'Fuente', url: 'https://example.com/source', snippet: 'Contexto' }] }
      return { text: JSON.stringify(output) }
    })
    const app = getMicroapp(id)!
    const result = await runValidated(app, runCtx, FIXTURES[id])
    assert.ok(app.outputSchema.safeParse(result.data).success, id)
    assert.ok(calls.includes('llm.generate'), id)
    assert.ok(result.evidence.length, id)
  }
})

test('médico CSV normaliza fecha/teléfono y conserva un informe reproducible', async () => {
  const app = getMicroapp('csv-excel-doctor')!
  const output = app.outputSchema.parse((await runValidated(app, ctx(), FIXTURES['csv-excel-doctor'])).data) as any
  assert.equal(output.delimiter, ';')
  assert.match(output.cleanedCsv, /2030-02-01/)
  assert.match(output.cleanedCsv, /\+34600000000/)
  assert.ok(output.summary.normalizedCells >= 2)
})

test('médico CSV neutraliza fórmulas de Excel sin convertir negativos decimales en texto', async () => {
  const app = getMicroapp('csv-excel-doctor')!
  const input = { delimitedText: 'name,amount\n=2+2,-12.5', sourceFormat: 'csv', delimiter: ',', requiredColumns: [], dateColumns: [], phoneColumns: [], decimalColumns: ['amount'], trimWhitespace: true }
  const output = app.outputSchema.parse((await runValidated(app, ctx(), input)).data) as any
  assert.ok(output.issues.some((issue: any) => issue.code === 'FORMULA_INJECTION'))
  assert.match(output.cleanedCsv, /'=2\+2/)
  assert.match(output.cleanedCsv, /,-12\.5$/m)
})

test('médico CSV conserva columnas duplicadas con nombres deterministas en vez de pisarlas', async () => {
  const app = getMicroapp('csv-excel-doctor')!
  const input = { delimitedText: 'email,email,name\na@uno.test,b@dos.test,Ana', sourceFormat: 'csv', delimiter: ',', requiredColumns: [], dateColumns: [], phoneColumns: [], decimalColumns: [], trimWhitespace: true }
  const output = app.outputSchema.parse((await runValidated(app, ctx(), input)).data) as any
  assert.deepEqual(output.columns, ['email', 'email__2', 'name'])
  assert.match(output.cleanedCsv, /a@uno\.test,b@dos\.test,Ana/)
  assert.ok(output.issues.some((issue: any) => issue.code === 'DUPLICATE_HEADER' && issue.normalized === 'email__2'))
})

test('deduplicador propone maestro por completitud, explica y nunca fusiona', async () => {
  const app = getMicroapp('explainable-record-deduplicator')!
  const output = app.outputSchema.parse((await runValidated(app, ctx(), FIXTURES['explainable-record-deduplicator'])).data) as any
  assert.equal(output.groups.length, 1)
  assert.equal(output.groups[0].suggestedMasterId, '1')
  assert.equal(output.groups[0].action, 'review_required')
  assert.deepEqual(output.reversiblePlan[0].archiveIds, ['2'])
})

test('R4 deduplicación usa enlace completo y no fusiona cadenas A≈B≈C', async () => {
  const app=getMicroapp('explainable-record-deduplicator')!
  const input={records:[{id:'A',email:'uno@test.com',phone:'1111111',name:'',company:'',completeness:90},{id:'B',email:'uno@test.com',phone:'2222222',name:'',company:'',completeness:80},{id:'C',email:'tres@test.com',phone:'2222222',name:'',company:'',completeness:70}],threshold:.5,emailWeight:.5,phoneWeight:.5,nameWeight:0,companyWeight:0}
  const output=app.outputSchema.parse((await runValidated(app,ctx(),input)).data) as any
  assert.ok(output.groups.every((group:any)=>group.recordIds.length<3))
  assert.ok(output.unmatchedIds.includes('C'))
})

test('schema mapper usa alias, informa pérdidas y no mueve registros', async () => {
  const app = getMicroapp('schema-mapper')!
  const input = structuredClone(FIXTURES['schema-mapper']) as any
  input.sourceFields.push({ name: 'legacy_note', type: 'string', required: false, aliases: [] })
  const output = app.outputSchema.parse((await runValidated(app, ctx(), input)).data) as any
  assert.equal(output.mappings[0].target, 'email_address')
  assert.ok(output.unmappedSource.includes('legacy_note'))
  assert.ok(output.informationLoss.some((item: any) => item.source === 'legacy_note'))
})

test('schema mapper impide que dos mapeos explícitos sobrescriban el mismo destino', () => {
  const app = getMicroapp('schema-mapper')!
  const input = { sourceSystem: 'A', targetSystem: 'B', sourceFields: [{ name: 'email', type: 'email' }, { name: 'backup', type: 'email' }], targetFields: [{ name: 'email_address', type: 'email' }], explicitMappings: [{ source: 'email', target: 'email_address', transform: 'identity' }, { source: 'backup', target: 'email_address', transform: 'identity' }] }
  assert.equal(app.inputSchema.safeParse(input).success, false)
})

test('constructor KB usa fuente inline, valida refs y no persiste si persistDrafts=false', async () => {
  const app = getMicroapp('knowledge-base-builder')!
  const delegate = prisma.knowledgeBase as unknown as { create: (...args: any[]) => Promise<any> }
  const original = delegate.create; let created = 0
  delegate.create = async () => { created++; return { id: 'draft' } }
  try {
    const runCtx = ctx(async (_name, payload) => {
      assert.match(String((payload as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/)
      return { text: JSON.stringify({ articles: [{ title: 'Soporte', category: 'soporte', bodyMarkdown: '# Soporte', faq: [{ question: '¿Horario?', answer: 'Laboral' }], sourceRefs: ['input:1'], conflicts: [], reviewRequired: false }], conflicts: [], gaps: [] }) }
    })
    const output = app.outputSchema.parse((await runValidated(app, runCtx, FIXTURES['knowledge-base-builder'])).data) as any
    assert.equal(output.sourceCount, 1); assert.deepEqual(output.persistedDraftIds, []); assert.equal(created, 0)
  } finally { delegate.create = original }
})

test('constructor KB falla de forma tenant-safe si una fuente solicitada no está disponible', async () => {
  const app = getMicroapp('knowledge-base-builder')!
  const delegate = prisma.knowledgeBase as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = delegate.findMany
  delegate.findMany = async args => { assert.equal(args.where.orgId, 'org-pack'); return [] }
  try {
    await assert.rejects(() => app.run(ctx(async () => { throw new Error('No debe invocar LLM') }), { sourceIds: ['source-outside-tenant'], inlineDocuments: [], audience: 'Clientes', taxonomy: [], persistDrafts: false }), (error: any) => error?.code === 'KNOWLEDGE_SOURCES_NOT_FOUND' && /esta organización/.test(error.message))
  } finally { delegate.findMany = original }
})

test('R5 Data rechaza URLs no públicas, refs duplicadas y parámetros ignorados por acción', () => {
  const kb = getMicroapp('knowledge-base-builder')!
  const ftp = structuredClone(FIXTURES['knowledge-base-builder']) as any
  ftp.inlineDocuments[0].sourceUrl = 'ftp://user:secret@example.com/politica.txt'
  assert.equal(kb.inputSchema.safeParse(ftp).success, false)
  assert.equal(kb.outputSchema.safeParse({ articles: [{ title: 'A', category: 'soporte', bodyMarkdown: '# A', faq: [], sourceRefs: ['input:1', 'input:1'], conflicts: [], reviewRequired: false }], conflicts: [], gaps: [], persistedDraftIds: [], sourceCount: 1 }).success, false)

  const workflow = getMicroapp('workflow-synthetic-evaluator')!
  const staleRun = { ...(FIXTURES['workflow-synthetic-evaluator'] as any), flowRunIds: ['old-run'] }
  const prematureBaseline = { ...(FIXTURES['workflow-synthetic-evaluator'] as any), baseline: [{ caseId: 'happy', status: 'succeeded', failedStepKeys: [] }] }
  assert.equal(workflow.inputSchema.safeParse(staleRun).success, false)
  assert.equal(workflow.inputSchema.safeParse(prematureBaseline).success, false)
})

test('auditor webhook filtra orgId y calcula fallos, firmas y latencia reales', async () => {
  const app = getMicroapp('webhook-auditor')!
  const delegate = prisma.webhookEvent as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = delegate.findMany; let where: any
  delegate.findMany = async args => { where = args.where; return [{ id: 'e1', orgId: 'org-pack', provider: 'runway', externalEventId: 'x', status: 'failed', attempts: 2, signatureValid: false, errorCode: 'BAD', error: null, receivedAt: new Date('2030-01-01T00:00:00Z'), processedAt: new Date('2030-01-01T00:01:00Z') }] }
  try {
    const output = app.outputSchema.parse((await runValidated(app, ctx(), FIXTURES['webhook-auditor'])).data) as any
    assert.equal(where.orgId, 'org-pack'); assert.equal(output.totals.failed, 1); assert.equal(output.totals.invalidSignatures, 1)
    assert.ok(output.issues.some((item: any) => item.code === 'HIGH_LATENCY'))
  } finally { delegate.findMany = original }
})

test('auditor webhook informa clock skew sin producir latencias negativas', async () => {
  const app = getMicroapp('webhook-auditor')!
  const delegate = prisma.webhookEvent as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = delegate.findMany
  delegate.findMany = async () => [{ id: 'e-skew', provider: 'runway', externalEventId: 'skew', status: 'processed', attempts: 1, signatureValid: true, errorCode: null, error: null, receivedAt: new Date('2030-01-01T00:00:10Z'), processedAt: new Date('2030-01-01T00:00:00Z') }]
  try {
    const output = app.outputSchema.parse((await runValidated(app, ctx(), FIXTURES['webhook-auditor'])).data) as any
    assert.ok(output.issues.some((item: any) => item.code === 'CLOCK_SKEW'))
    assert.equal(output.byProvider[0].averageLatencyMs, null)
  } finally { delegate.findMany = original }
})

test('R4 auditor webhook prueba truncado con una fila centinela', async () => {
  const app=getMicroapp('webhook-auditor')!; const delegate=prisma.webhookEvent as unknown as {findMany:(...args:any[])=>Promise<any[]>}; const original=delegate.findMany; let take=0
  const event=(id:string)=>({id,provider:'runway',externalEventId:id,status:'processed',attempts:1,signatureValid:true,errorCode:null,error:null,receivedAt:new Date('2030-01-01T00:00:00Z'),processedAt:new Date('2030-01-01T00:00:01Z')})
  delegate.findMany=async args=>{take=args.take;return [event('e1'),event('e2')]}
  try{const input={...(FIXTURES['webhook-auditor'] as any),maxEvents:1};const output=app.outputSchema.parse((await runValidated(app,ctx(),input)).data) as any;assert.equal(take,2);assert.equal(output.totals.events,1);assert.equal(output.truncated,true)}finally{delegate.findMany=original}
})

test('probador no presenta como probada una integración desconocida', async () => {
  const app = getMicroapp('integration-tester')!
  const output = app.outputSchema.parse((await runValidated(app, ctx(), { providerIds: ['not-a-provider'], timeoutMs: 1000 })).data) as any
  assert.equal(output.results[0].status, 'unsupported')
  assert.equal(output.results[0].testedExternally, false)
  assert.equal(output.summary.externallyTested, 0)
})

test('monitor de credenciales consulta por tenant y detecta vencimiento sin leer secretos', async () => {
  const app = getMicroapp('credential-health-monitor')!
  const delegate = prisma.organizationIntegrationCredential as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = delegate.findMany; let where: any
  delegate.findMany = async args => { where = args.where; return [{ id: 'c1', provider: 'runway', slot: 'default', status: 'connected', revokedAt: null, lastError: null, accessTokenExpiresAt: new Date(0), refreshTokenExpiresAt: null, lastUsedAt: new Date(), secretEnc: 'never-returned' }] }
  try {
    const output = app.outputSchema.parse((await runValidated(app, ctx(), { providerIds: ['runway', 'missing'], warningDays: 14, staleDays: 90 })).data) as any
    assert.equal(where.orgId, 'org-pack'); assert.equal(output.credentials[0].health, 'broken'); assert.deepEqual(output.missingProviders, ['missing'])
    assert.equal(JSON.stringify(output).includes('never-returned'), false)
  } finally { delegate.findMany = original }
})

test('workflow collect solo usa dry-runs del tenant y detecta regresión', async () => {
  const app = getMicroapp('workflow-synthetic-evaluator')!
  const delegate = prisma.flowRun as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = delegate.findMany; let where: any
  delegate.findMany = async args => { where = args.where; return [{ id: 'run-1', status: 'failed', trigger: { type: 'synthetic_evaluation', microappJobId: 'job-start', caseId: 'happy' }, error: { code: 'X' }, steps: [{ nodeKey: 'start', status: 'failed' }] }] }
  try {
    const input = { action: 'collect', flowId: 'flow-1', cases: [{ id: 'happy', name: 'Camino', variables: {}, expectedStatus: 'succeeded', requiredStepKeys: ['start'] }], flowRunIds: ['run-1'], baseline: [{ caseId: 'happy', status: 'succeeded', failedStepKeys: [] }] }
    const output = app.outputSchema.parse((await runValidated(app, ctx(), input)).data) as any
    assert.deepEqual(where, { orgId: 'org-pack', flowId: 'flow-1', id: { in: ['run-1'] }, dryRun: true })
    assert.equal(output.results[0].passed, false); assert.equal(output.regressions.length, 1)
  } finally { delegate.findMany = original }
})

test('workflow collect rechaza dry-runs sin procedencia sintética', async () => {
  const app = getMicroapp('workflow-synthetic-evaluator')!
  const delegate = prisma.flowRun as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = delegate.findMany
  delegate.findMany = async () => [{ id: 'run-manual', status: 'succeeded', trigger: { type: 'manual', caseId: 'happy' }, error: null, steps: [] }]
  try {
    const input = { action: 'collect', flowId: 'flow-1', cases: [{ id: 'happy', name: 'Camino', variables: {}, expectedStatus: 'succeeded', requiredStepKeys: [] }], flowRunIds: ['run-manual'], baseline: [] }
    await assert.rejects(() => app.run(ctx(), input), (error: any) => error?.code === 'FLOW_RUN_PROVENANCE_INVALID')
  } finally { delegate.findMany = original }
})

test('workflow start declara el permiso de escritura que requiere para crear FlowRuns', () => {
  const app = getMicroapp('workflow-synthetic-evaluator')!
  assert.ok(app.dataAccess.includes('automations.read'))
  assert.ok(app.dataAccess.includes('automations.write'))
})

test('drift de prompts rechaza pass→fail y BYOK calcula horizonte/breakeven', async () => {
  const drift = getMicroapp('prompt-drift-detector')!
  const driftInput = structuredClone(FIXTURES['prompt-drift-detector']) as any
  driftInput.resultsB[0].passed = false; driftInput.resultsB[0].score = 60; driftInput.resultsB[0].safetyFlags = ['pii']
  const driftOut = drift.outputSchema.parse((await runValidated(drift, ctx(), driftInput)).data) as any
  assert.equal(driftOut.verdict, 'reject'); assert.ok(driftOut.regressions[0].codes.includes('PASS_TO_FAIL'))
  const comparator = getMicroapp('byok-managed-comparator')!
  const comparison = comparator.outputSchema.parse((await runValidated(comparator, ctx(), FIXTURES['byok-managed-comparator'])).data) as any
  assert.equal(comparison.horizon.months, 12); assert.equal(comparison.byCapability.length, 1); assert.ok(comparison.controlMatrix.length >= 4)
})

test('drift exige datasets idénticos y BYOK no mezcla setup con coste mensual', async () => {
  const drift = getMicroapp('prompt-drift-detector')!
  const mismatched = structuredClone(FIXTURES['prompt-drift-detector']) as any
  mismatched.resultsB[0].caseId = 'case-different'
  assert.equal(drift.inputSchema.safeParse(mismatched).success, false)

  const comparator = getMicroapp('byok-managed-comparator')!
  const input = structuredClone(FIXTURES['byok-managed-comparator']) as any
  input.setupCostCents = 50_000
  const output = comparator.outputSchema.parse((await runValidated(comparator, ctx(), input)).data) as any
  const expectedMonthly = output.monthly.byokProviderCents + output.monthly.byokOperationsCents + input.byokPlatformFeeCents
  assert.equal(output.monthly.byokTotalCents, expectedMonthly)
  assert.equal(output.horizon.byokTotalCents, expectedMonthly * input.months + input.setupCostCents)
})

test('R4 BYOK recomienda sobre el horizonte incluyendo setup', async () => {
  const app=getMicroapp('byok-managed-comparator')!
  const input={monthlyUsage:[{capability:'llm.generate',quantity:1,managedUnitCostCents:100,byokUnitCostCents:0,managedIncludedUnits:0}],platformFeeCents:0,byokPlatformFeeCents:0,setupCostCents:2000,byokOpsHoursPerMonth:0,hourlyOpsCostCents:0,privacyRequirements:[],supportPreference:'mixto',months:12}
  const output=app.outputSchema.parse((await runValidated(app,ctx(),input)).data) as any
  assert.equal(output.monthly.byokTotalCents,0);assert.equal(output.horizon.managedTotalCents,1200);assert.equal(output.horizon.byokTotalCents,2000);assert.equal(output.recommendation,'managed')
})

test('drift no inventa porcentajes ni cambio de salida cuando el baseline carece de denominador/hash', async () => {
  const app = getMicroapp('prompt-drift-detector')!
  const input = structuredClone(FIXTURES['prompt-drift-detector']) as any
  input.resultsA[0].costCents = 0; input.resultsA[0].latencyMs = 0; input.resultsA[0].outputHash = ''
  input.resultsB[0].costCents = 1; input.resultsB[0].latencyMs = 10; input.resultsB[0].outputHash = ''
  const output = app.outputSchema.parse((await runValidated(app, ctx(), input)).data) as any
  assert.equal(output.aggregate.costDeltaPct, null)
  assert.equal(output.aggregate.latencyDeltaPct, null)
  assert.equal(output.aggregate.outputComparableCases, 0)
  assert.equal(output.aggregate.outputChangeRate, null)
  assert.equal(output.verdict, 'review')
})

function ctx(
  capability: MicroappCtx['capability'] = async () => ({}),
  enqueueCapability?: MicroappCtx['enqueueCapability'],
): MicroappCtx {
  return { orgId: 'org-pack', jobId: 'job-pack', createdById: 'user-1', capability, enqueueCapability, log() {} }
}

async function withAccessibleAssets<T>(ids: string[], action: () => Promise<T>): Promise<T> {
  const delegate = prisma.asset as unknown as { findMany: (...args: any[]) => Promise<any[]> }
  const original = delegate.findMany
  delegate.findMany = async () => ids.map(id => ({ id }))
  try { return await action() } finally { delegate.findMany = original }
}
