// Tests offline del pack de microapps de contenido/datos/studio de la ola 1:
// voice-of-customer, content-multiplier, model-picker y cinema-concepts.
//
// Sin base de datos ni proveedor externo: una DATABASE_URL de mentira fijada
// antes de importar (mismo patrón que providerRouter.test.ts) basta porque los
// manifiestos no tocan Postgres hasta run(), y aquí solo se ejecuta la única
// receta que no necesita ni BD ni LLM (model-picker).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ZodTypeAny } from 'zod'
// Adapters reales del registro: model-picker y los estimadores de coste deben
// funcionar contra el catálogo de verdad, no contra dobles.
import '../providers/adapters/deepseek'
import '../providers/adapters/openaiImage'
import '../providers/adapters/voice'
import '../providers/adapters/brave'
import '../providers/adapters/magnific'
import '../microapps/apps/voiceOfCustomer'
import '../microapps/apps/contentMultiplier'
import '../microapps/apps/modelPicker'
import '../microapps/apps/cinemaConcepts'
import { getMicroapp } from '../microapps/registry'
import type { MicroappCtx } from '../microapps/types'
import { prisma } from '../lib/prisma'
import { validateMicroappResultEnvelope } from '../microapps/quality'

const PACK = ['voice-of-customer', 'content-multiplier', 'model-picker', 'cinema-concepts'] as const

/** Claves de primer nivel de un inputSchema, atravesando defaults y effects. */
function shapeKeys(schema: ZodTypeAny): string[] {
  const def = schema._def as { typeName?: string; schema?: ZodTypeAny; innerType?: ZodTypeAny; shape?: () => Record<string, unknown> }
  if (def.typeName === 'ZodEffects' && def.schema) return shapeKeys(def.schema)
  if (def.typeName === 'ZodDefault' && def.innerType) return shapeKeys(def.innerType)
  if (def.typeName === 'ZodObject' && def.shape) return Object.keys(def.shape())
  throw new Error(`inputSchema con forma inesperada: ${def.typeName}`)
}

const SAMPLE_INPUT: Record<(typeof PACK)[number], unknown> = {
  'voice-of-customer': { daysBack: 30 },
  'content-multiplier': { sourceText: 'Un artículo de ejemplo sobre plazos de entrega.', channels: ['linkedin', 'email'] },
  'model-picker': { task: 'llm.generate', quality: 'standard' },
  'cinema-concepts': { objective: 'Explicar el producto', audience: 'Dueños de talleres', channel: 'reels', durationS: 15 },
}

test('las cuatro microapps del pack están registradas con su contrato completo', () => {
  for (const id of PACK) {
    const manifest = getMicroapp(id)
    assert.ok(manifest, `falta ${id} en el registro`)
    assert.equal(manifest.id, id)
    assert.equal(manifest.version, '1.3.0', `${id}: versión mejorada no trazable`)
    assert.ok(manifest.promise.length > 10)
    assert.ok(Array.isArray(manifest.uiSchema) && manifest.uiSchema.length > 0)
    assert.ok(Array.isArray(manifest.followUps))
    assert.equal(manifest.effects, 'local')
  }
  assert.equal(getMicroapp('voice-of-customer')?.category, 'content')
  assert.equal(getMicroapp('content-multiplier')?.category, 'content')
  assert.equal(getMicroapp('model-picker')?.category, 'data')
  assert.equal(getMicroapp('cinema-concepts')?.category, 'studio')
})

test('el uiSchema cubre exactamente los campos del inputSchema', () => {
  for (const id of PACK) {
    const manifest = getMicroapp(id)!
    const expected = new Set(shapeKeys(manifest.inputSchema))
    const declared = manifest.uiSchema.map((field) => field.key)
    assert.deepEqual(new Set(declared), expected, `uiSchema de ${id} no coincide con su inputSchema`)
    assert.equal(new Set(declared).size, declared.length, `uiSchema de ${id} repite claves`)
    // Todo select declara sus opciones: sin ellas el runner genérico no puede
    // montar el formulario.
    for (const field of manifest.uiSchema) {
      if (field.widget === 'select') {
        assert.ok(field.options && field.options.length > 0, `select ${id}.${field.key} sin opciones`)
      }
    }
  }
})

test('estimateCost devuelve céntimos finitos y no negativos; model-picker cuesta 0', async () => {
  for (const id of PACK) {
    const manifest = getMicroapp(id)!
    const { cents } = await manifest.estimateCost(SAMPLE_INPUT[id])
    assert.ok(Number.isFinite(cents) && cents >= 0, `estimateCost de ${id} devolvió ${cents}`)
  }
  const picker = await getMicroapp('model-picker')!.estimateCost(SAMPLE_INPUT['model-picker'])
  assert.equal(picker.cents, 0)
})

test('defaults y validaciones de entrada', () => {
  const voice = getMicroapp('voice-of-customer')!
  assert.equal((voice.inputSchema.parse({}) as { daysBack: number }).daysBack, 30)

  const multiplier = getMicroapp('content-multiplier')!
  // Sin fuente no hay microapp: ni texto ni llamada es entrada inválida.
  assert.equal(multiplier.inputSchema.safeParse({ channels: ['linkedin'] }).success, false)
  const parsed = multiplier.inputSchema.parse({ sourceText: 'Texto fuente suficientemente concreto para crear piezas útiles.' }) as { channels: string[] }
  assert.ok(parsed.channels.length >= 6, 'sin canales elegidos se generan todos')
  const fromTextarea = multiplier.inputSchema.parse({ sourceText: 'Texto fuente suficientemente concreto para crear piezas útiles.', channels: 'linkedin, email\nlinkedin' }) as { channels: string[] }
  assert.deepEqual(fromTextarea.channels, ['linkedin', 'email'])

  const cinema = getMicroapp('cinema-concepts')!
  // El select del runner manda strings: la duración se coacciona a número.
  const coerced = cinema.inputSchema.parse({ ...(SAMPLE_INPUT['cinema-concepts'] as object), durationS: '30' }) as { durationS: number }
  assert.equal(coerced.durationS, 30)
  assert.equal(cinema.inputSchema.safeParse({ ...(SAMPLE_INPUT['cinema-concepts'] as object), durationS: 45 }).success, false)
})

test('voice-of-customer ejecuta queries tenant-safe y declara ausencia sin llamar al LLM', async () => {
  const callFindMany = prisma.call.findMany
  const conversationFindMany = prisma.conversation.findMany
  const seen: unknown[] = []
  ;(prisma.call as any).findMany = async (args: unknown) => { seen.push(args); return [] }
  ;(prisma.conversation as any).findMany = async (args: unknown) => { seen.push(args); return [] }
  try {
    const ctx: MicroappCtx = { orgId: 'org-isolated', jobId: 'job-voc', log: () => {}, capability: async () => { throw new Error('sin material no debe llamar al LLM') } }
    const result = await getMicroapp('voice-of-customer')!.run(ctx, { daysBack: 14 })
    validateMicroappResultEnvelope('voice-of-customer', result)
    const output = getMicroapp('voice-of-customer')!.outputSchema.parse(result.data) as { themes: unknown[]; note: string | null }
    assert.deepEqual(output.themes, [])
    assert.match(output.note ?? '', /No hay llamadas/)
    assert.equal(seen.length, 2)
    for (const args of seen as Array<{ where?: { orgId?: string } }>) assert.equal(args.where?.orgId, 'org-isolated')
  } finally {
    ;(prisma.call as any).findMany = callFindMany
    ;(prisma.conversation as any).findMany = conversationFindMany
  }
})

test('voice-of-customer trata transcripciones como datos no confiables y conserva ids reales', async () => {
  const callFindMany = prisma.call.findMany
  const conversationFindMany = prisma.conversation.findMany
  ;(prisma.call as any).findMany = async () => [{
    id: 'call-voc-1',
    transcript: 'El equipo tarda demasiado en responder y eso hace que perdamos oportunidades.',
    lead: { name: null, status: 'QUALIFIED' },
  }]
  ;(prisma.conversation as any).findMany = async () => []
  try {
    const ctx: MicroappCtx = {
      orgId: 'org-isolated', jobId: 'job-voc-material', log: () => {},
      capability: async (_name, payload) => {
        assert.match(String((payload as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/)
        return { text: JSON.stringify({ themes: [{
          theme: 'Velocidad de respuesta', segment: 'QUALIFIED',
          expressions: [{ kind: 'miedo', paraphrase: 'Temen perder oportunidades por una respuesta lenta', sourceIds: ['call-voc-1'] }],
        }] }) }
      },
    }
    const manifest = getMicroapp('voice-of-customer')!
    const result = await manifest.run(ctx, { daysBack: 14 })
    validateMicroappResultEnvelope('voice-of-customer', result)
    const output = manifest.outputSchema.parse(result.data) as { themes: Array<{ frequency: number; expressions: Array<{ sourceIds: string[] }> }> }
    assert.equal(output.themes[0]?.frequency, 1)
    assert.deepEqual(output.themes[0]?.expressions[0]?.sourceIds, ['call-voc-1'])
    assert.ok(result.evidence.some(item => item.sourceRef?.id === 'call-voc-1'))
  } finally {
    ;(prisma.call as any).findMany = callFindMany
    ;(prisma.conversation as any).findMany = conversationFindMany
  }
})

test('content-multiplier ejecuta una fuente propia y deja acciones y evidencia trazables', async () => {
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-content', log: () => {},
    capability: async (_name, payload) => (assert.match(String((payload as { system?: unknown }).system ?? ''), /DATO NO CONFIABLE/), { text: JSON.stringify({ pieces: [
      { kind: 'post_linkedin', content: { text: 'Una reflexión concreta sobre cómo reducir las llamadas perdidas.' }, basis: 'La fuente explica el coste operativo de no atender a tiempo.' },
      { kind: 'cta_pack', content: { ctas: ['post', 'email', 'landing', 'vídeo'].map(context => ({ context, text: `Revisa tu proceso desde ${context}` })) }, basis: 'La fuente propone revisar el proceso de respuesta.' },
      { kind: 'quotes', content: { quotes: ['Responder antes cambia la conversación', 'La velocidad reduce oportunidades perdidas', 'La cita se reserva en el momento'] }, basis: 'Síntesis del argumento central de la fuente.' },
    ] }) }),
  }
  const result = await getMicroapp('content-multiplier')!.run(ctx, {
    sourceText: 'Cada llamada perdida tarda horas en recuperarse. Un proceso rápido permite responder y reservar la cita en el mismo momento.',
    channels: 'linkedin',
  })
  validateMicroappResultEnvelope('content-multiplier', result)
  const output = getMicroapp('content-multiplier')!.outputSchema.parse(result.data) as { pieces: unknown[]; source: { kind: string } }
  assert.equal(output.source.kind, 'text')
  assert.equal(output.pieces.length, 3)
  assert.ok(result.evidence.every((item) => item.sourceRef?.id === 'job-content'))
  assert.equal(result.suggestedActions?.[0].params?.sourceJobId, 'job-content')
})

test('content-multiplier descarta formatos incompletos y declara exactamente lo que falta', async () => {
  const manifest = getMicroapp('content-multiplier')!
  const sourceText = 'Este caso explica con detalle cómo responder antes reduce el trabajo manual y mejora la conversión comercial.'
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-content-partial', log: () => {},
    capability: async () => ({ text: JSON.stringify({ pieces: [
      { kind: 'post_linkedin', content: {}, basis: 'El caso explica una mejora de conversión.' },
      { kind: 'cta_pack', content: { ctas: ['post', 'email', 'landing', 'vídeo'].map(context => ({ context, text: `Actúa desde ${context}` })) }, basis: 'El caso propone actuar sobre la respuesta.' },
      { kind: 'quotes', content: { quotes: ['solo una'] }, basis: 'Resumen del caso.' },
    ] }) }),
  }
  const result = await manifest.run(ctx, { sourceText, channels: ['linkedin'] })
  validateMicroappResultEnvelope('content-multiplier', result)
  const parsed = manifest.outputSchema.parse(result.data) as { pieces: Array<{ kind: string }>; missing: string[] }
  assert.deepEqual(parsed.pieces.map(piece => piece.kind), ['cta_pack'])
  assert.deepEqual(parsed.missing, ['post_linkedin', 'quotes'])

  const noValidCtx: MicroappCtx = { ...ctx, capability: async () => ({ text: JSON.stringify({ pieces: [{ kind: 'quotes', content: { quotes: [] }, basis: 'vacío' }] }) }) }
  await assert.rejects(() => manifest.run(noValidCtx, { sourceText, channels: ['linkedin'] }), /Ninguna pieza superó la verificación/)
})

test('content-multiplier no cruza tenants al resolver una llamada', async () => {
  const original = prisma.call.findFirst
  let capabilityCalled = false
  ;(prisma.call as any).findFirst = async (args: { where: { id: string; orgId: string } }) => {
    assert.deepEqual(args.where, { id: 'call-foreign', orgId: 'org-owner' })
    return null
  }
  try {
    const ctx: MicroappCtx = { orgId: 'org-owner', jobId: 'job-tenant', log: () => {}, capability: async () => { capabilityCalled = true; return { text: '{}' } } }
    await assert.rejects(() => getMicroapp('content-multiplier')!.run(ctx, { callId: 'call-foreign', channels: ['email'] }), /no existe|organización/)
    assert.equal(capabilityCalled, false)
  } finally {
    ;(prisma.call as any).findFirst = original
  }
})

test('cinema-concepts ejecuta tres direcciones distintas y conserva el job para Studio', async () => {
  const concepts = [1, 2, 3].map((index) => ({
    title: `Dirección ${index}`,
    logline: `Una historia visual distinta número ${index}`,
    treatment: `Tratamiento completo y producible para la dirección creativa número ${index}.`,
    visualWorld: `Paleta y lenguaje de cámara exclusivos ${index}`,
    emotion: `Emoción principal ${index}`,
    risk: { level: 'medio', why: `Riesgo de producción identificado ${index}` },
  }))
  const ctx: MicroappCtx = { orgId: 'org-test', jobId: 'job-cinema', log: () => {}, capability: async (_name, payload) => (assert.match(String((payload as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/), { text: JSON.stringify({ concepts }) }) }
  const result = await getMicroapp('cinema-concepts')!.run(ctx, SAMPLE_INPUT['cinema-concepts'])
  validateMicroappResultEnvelope('cinema-concepts', result)
  const output = getMicroapp('cinema-concepts')!.outputSchema.parse(result.data) as { concepts: unknown[] }
  assert.equal(output.concepts.length, 3)
  assert.equal(result.suggestedActions?.[0].params?.sourceJobId, 'job-cinema')
})

test('model-picker recomienda desde el registro real, sin LLM y con evidencia alta', async () => {
  const manifest = getMicroapp('model-picker')!
  const ctx: MicroappCtx = {
    orgId: 'org-test',
    jobId: 'job-test',
    // Si la receta intentase llamar a un proveedor, el test debe reventar: la
    // promesa es que solo lee el registro.
    capability: async () => {
      throw new Error('model-picker no debe invocar capabilities')
    },
    log: () => {},
  }

  const result = await manifest.run(ctx, { task: 'llm.generate', quality: 'premium' })
  validateMicroappResultEnvelope('model-picker', result)
  const parsed = manifest.outputSchema.parse(result.data) as {
    recommendation: { providerId: string; estimatedCents: number | null } | null
    reasons: string[]
  }
  assert.ok(parsed.recommendation, 'con deepseek registrado debe haber recomendación para llm.generate')
  assert.equal(parsed.recommendation!.providerId, 'deepseek')
  assert.ok(parsed.reasons.length >= 2)
  assert.ok(result.evidence.length > 0)
  for (const item of result.evidence) {
    assert.equal(item.confidence, 'high')
    assert.equal(item.sourceRef?.kind, 'provider-registry')
  }

  // Capability sin proveedor registrado (vídeo): la ausencia se declara.
  const empty = await manifest.run(ctx, { task: 'video.generate', quality: 'standard' })
  const emptyParsed = manifest.outputSchema.parse(empty.data) as { recommendation: unknown; note: string | null }
  assert.equal(emptyParsed.recommendation, null)
  assert.match(emptyParsed.note ?? '', /Ningún proveedor/)
})

test('las salidas de ejemplo validan contra su outputSchema', () => {
  // Contrato de forma: si estos fixtures dejan de validar, la UI y el runtime
  // (MICROAPP_OUTPUT_INVALID) romperían igual — mejor descubrirlo aquí.
  const voice = getMicroapp('voice-of-customer')!
  assert.ok(
    voice.outputSchema.safeParse({
      daysBack: 30,
      focus: null,
      analyzed: { calls: 2, conversations: 1, discarded: 0 },
      themes: [
        {
          theme: 'Plazos de entrega',
          frequency: 2,
          segment: 'new',
          expressions: [{ kind: 'objecion', paraphrase: 'Varias personas dudan de llegar a tiempo', sourceIds: ['c1', 'c2'] }],
        },
      ],
      note: null,
    }).success,
  )

  const cinema = getMicroapp('cinema-concepts')!
  const concept = {
    title: 'T',
    logline: 'L',
    treatment: 'Tr',
    visualWorld: 'V',
    emotion: 'E',
    risk: { level: 'medio', why: 'W' },
    productionEstimateCents: null,
  }
  assert.ok(
    cinema.outputSchema.safeParse({
      objective: 'O',
      audience: 'A',
      channel: 'reels',
      durationS: 15,
      constraints: null,
      concepts: [concept, concept, concept],
      productionCost: { available: false, providerId: null, totalCents: null, note: 'sin proveedor de vídeo' },
    }).success,
  )
  // La promesa son exactamente tres direcciones.
  assert.equal(
    cinema.outputSchema.safeParse({
      objective: 'O',
      audience: 'A',
      channel: 'reels',
      durationS: 15,
      constraints: null,
      concepts: [concept, concept],
      productionCost: { available: false, providerId: null, totalCents: null, note: 'n' },
    }).success,
    false,
  )
})
