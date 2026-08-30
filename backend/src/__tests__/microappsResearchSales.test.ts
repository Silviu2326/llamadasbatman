// Tests de contrato de las microapps de investigación y ventas de la ola 1
// (company-research-360, call-prep, prospect-diagnosis, podcast-guest-research).
// Offline: mismo truco que providerRouter.test.ts — una DATABASE_URL de
// mentira fijada ANTES de importar los módulos, porque call-prep importa
// lib/prisma y este exige la env al cargarse (el cliente no conecta hasta la
// primera query, que estos tests no hacen).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ZodObject, ZodRawShape } from 'zod'
import '../microapps/apps/companyResearch360'
import '../microapps/apps/callPrep'
import '../microapps/apps/prospectDiagnosis'
import '../microapps/apps/podcastGuestResearch'
import { getMicroapp } from '../microapps/registry'
import { prisma } from '../lib/prisma'
import type { MicroappCtx } from '../microapps/types'
import { validateMicroappResultEnvelope } from '../microapps/quality'

// Entrada válida mínima por microapp para estimar coste sin BD ni proveedor.
const SAMPLES: Record<string, unknown> = {
  'company-research-360': { companyName: 'Acme Logística SL', sector: 'logística', focus: 'expansión' },
  'call-prep': { leadId: 'lead_123', objective: 'cerrar reunión de demo' },
  'prospect-diagnosis': { website: 'https://ejemplo.example' },
  'podcast-guest-research': { guestName: 'Jane Doe', topic: 'IA aplicada' },
}

for (const [id, sample] of Object.entries(SAMPLES)) {
  test(`${id}: registrada con uiSchema completo y coste estimado > 0`, async () => {
    const manifest = getMicroapp(id)
    assert.ok(manifest, `la microapp ${id} debe registrarse al importar su módulo`)
    assert.equal(manifest.version, '1.2.0', `${id} debe persistir ejecuciones con la versión mejorada`)

    // El inputSchema acepta su entrada de ejemplo.
    const parsed = manifest.inputSchema.safeParse(sample)
    assert.ok(parsed.success, `la entrada de ejemplo de ${id} debe ser válida`)

    // uiSchema cubre exactamente las claves del inputSchema: el runner
    // genérico del frontend no puede pintar campos que no conoce, ni al revés.
    const shape = (manifest.inputSchema as unknown as ZodObject<ZodRawShape>).shape
    const schemaKeys = Object.keys(shape).sort()
    const uiKeys = manifest.uiSchema.map((field) => field.key).sort()
    assert.deepEqual(uiKeys, schemaKeys, `el uiSchema de ${id} debe cubrir las claves del inputSchema`)
    for (const field of manifest.uiSchema) {
      assert.ok(field.label.trim(), `el campo ${field.key} de ${id} necesita label`)
    }

    // Coste honesto: siempre mayor que cero (tokens estimados × tarifa env).
    const estimate = await manifest.estimateCost(sample)
    assert.ok(estimate.cents > 0, `estimateCost de ${id} debe ser > 0 (fue ${estimate.cents})`)

    // Higiene del manifiesto: caducidad declarada y capabilities anunciadas.
    assert.ok(manifest.freshnessDays && manifest.freshnessDays > 0)
    assert.ok(manifest.capabilities.includes('llm.generate'), `${id} sintetiza con llm.generate`)
    assert.equal(manifest.effects, 'local')
  })
}

test('call-prep declara el acceso a datos que consume', () => {
  const manifest = getMicroapp('call-prep')
  assert.ok(manifest)
  assert.deepEqual([...manifest.dataAccess].sort(), ['calls.read', 'leads.read'])
})

test('company-research-360 ejecuta investigación con citas válidas y acciones contextualizadas', async () => {
  const manifest = getMicroapp('company-research-360')!
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-company', log: () => {},
    capability: async (name, payload) => name === 'web.search'
      ? { results: [{ title: 'Acme abre nueva delegación', url: 'https://news.example/acme', snippet: 'La empresa amplía operaciones en Madrid.' }] }
      : (assert.match(String((payload as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/), { text: JSON.stringify({ resumen: 'Acme amplía operaciones.', cronologia: [{ fecha: '2026', hito: 'Nueva delegación', fuente: 1 }], senales: [{ senal: 'Expansión', tipo: 'crecimiento', base: 'hecho', fuente: 1 }], responsables: [], iniciativas: ['Nueva delegación'], oportunidades: [{ oportunidad: 'Automatizar captación', porQue: 'La expansión aumenta el volumen.' }], lagunas: ['Sin cifras financieras.'] }) }),
  }
  const result = await manifest.run(ctx, SAMPLES['company-research-360'])
  validateMicroappResultEnvelope('company-research-360', result)
  const output = manifest.outputSchema.parse(result.data) as { senales: Array<{ fuenteUrl: string | null }> }
  assert.equal(output.senales[0]?.fuenteUrl, 'https://news.example/acme')
  assert.ok(result.evidence.every((item) => item.fetchedAt))
  assert.equal(result.suggestedActions?.[0].params?.companyName, 'Acme Logística SL')
})

test('investigación sin resultados no llama al LLM ni convierte URLs no descargadas en hechos', async () => {
  for (const [id, input] of [
    ['company-research-360', { companyName: 'Empresa verificable inexistente' }],
    ['podcast-guest-research', { guestName: 'Persona verificable inexistente', links: 'https://example.test/perfil' }],
  ] as const) {
    let llmCalls = 0
    const ctx: MicroappCtx = {
      orgId: 'org-test', jobId: `job-empty-${id}`, log: () => {},
      capability: async (name) => {
        if (name === 'web.search') return { results: [] }
        llmCalls += 1
        throw new Error('sin fuentes no se debe sintetizar')
      },
    }
    const manifest = getMicroapp(id)!
    const result = await manifest.run(ctx, input)
    validateMicroappResultEnvelope(id, result)
    manifest.outputSchema.parse(result.data)
    assert.equal(llmCalls, 0)
    assert.equal(result.suggestedActions?.[0].params?.sourceJobId, `job-empty-${id}`)
    if (id === 'podcast-guest-research') {
      assert.ok(result.evidence.some(item => item.sourceUrl === 'https://example.test/perfil' && item.confidence === 'low'))
    }
  }
})

test('call-prep ejecuta el brief tenant-safe y exige cinco preguntas distintas', async () => {
  const original = prisma.lead.findFirst
  let query: any
  ;(prisma.lead as any).findFirst = async (args: unknown) => {
    query = args
    return {
      id: 'lead_123', name: 'Lucía', company: 'Acme', status: 'CONTACTED', source: 'web', attempts: 2,
      calls: [{ id: 'call-1', createdAt: new Date('2026-08-01T10:00:00Z'), startedAt: new Date('2026-08-01T10:00:00Z'), summary: 'Pidió información de integración.', transcript: null, status: 'COMPLETED', outcome: 'FOLLOW_UP', durationSeconds: 180, sentiment: 'positive' }],
      notes: [{ id: 'note-1', createdAt: new Date('2026-08-02T10:00:00Z'), authorName: 'Ana', text: 'Enviar caso de uso de clínicas.' }],
    }
  }
  try {
    const ctx: MicroappCtx = {
      orgId: 'org-isolated', jobId: 'job-call-prep', log: () => {},
      capability: async (_name, payload) => (assert.match(String((payload as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/), { text: JSON.stringify({ resumenCuenta: 'La cuenta pidió información sobre integración.', apertura: 'Retomo la integración que comentamos.', preguntas: [1, 2, 3, 4, 5].map((n) => `¿Pregunta concreta número ${n} para avanzar?`), objeciones: [{ objecion: 'Tiempo de implantación', respuesta: 'Acordemos alcance y dependencias.' }, { objecion: 'Carga del equipo', respuesta: 'Definamos responsabilidades mínimas.' }, { objecion: 'Riesgo técnico', respuesta: 'Validemos primero con una prueba controlada.' }], siguientePaso: 'Agendar revisión técnica.' }) }),
    }
    const result = await manifestRun('call-prep', ctx, SAMPLES['call-prep'])
    validateMicroappResultEnvelope('call-prep', result)
    const output = getMicroapp('call-prep')!.outputSchema.parse(result.data) as { preguntas: string[] }
    assert.equal(output.preguntas.length, 5)
    assert.equal(query.where.orgId, 'org-isolated')
    assert.ok(result.evidence.every((item) => item.fetchedAt))
  } finally {
    ;(prisma.lead as any).findFirst = original
  }
})

test('prospect-diagnosis bloquea destinos privados y ejecuta una auditoría pública determinista', async () => {
  const manifest = getMicroapp('prospect-diagnosis')!
  assert.equal(manifest.inputSchema.safeParse({ website: 'http://127.0.0.1/admin' }).success, false)
  assert.equal(manifest.inputSchema.safeParse({ website: 'http://192.168.1.20/' }).success, false)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => new Response('<html><head><title>Clínica Acme</title><meta name="description" content="Clínica con reserva online"><meta name="viewport"></head><body><a href="tel:+34123456789">Llámanos</a><form></form>'.padEnd(300, ' ') + '</body></html>', { status: 200, headers: { 'content-type': 'text/html' } })
  try {
    const ctx: MicroappCtx = { orgId: 'org-test', jobId: 'job-diagnosis', log: () => {}, capability: async (_name, payload) => (assert.match(String((payload as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/), { text: JSON.stringify({ explicacion: 'La auditoría detecta una base web operativa y oportunidades concretas.', ofertaAconsejada: 'Optimizar conversión antes de ampliar campañas.', pitch: 'Hemos detectado fricciones comprobables en la conversión móvil.' }) }) }
    const result = await manifest.run(ctx, SAMPLES['prospect-diagnosis'])
    validateMicroappResultEnvelope('prospect-diagnosis', result)
    const output = manifest.outputSchema.parse(result.data) as { puntuacion: { total: number }; website: string | null }
    assert.ok(output.puntuacion.total >= 0 && output.puntuacion.total <= 100)
    assert.equal(output.website, 'https://ejemplo.example')
    assert.ok(result.evidence.some((item) => item.sourceUrl === 'https://ejemplo.example'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('podcast-guest-research ejecuta exactamente veinte preguntas únicas y trazables', async () => {
  const manifest = getMicroapp('podcast-guest-research')!
  const bloques = Array.from({ length: 4 }, (_, block) => ({
    bloque: `Bloque ${block + 1}`,
    preguntas: Array.from({ length: 5 }, (_, index) => ({ pregunta: `¿Qué aprendiste en el ángulo ${block + 1}.${index + 1} que aún no has contado?`, porQue: 'Abre una respuesta específica.', repregunta: '¿Qué evidencia cambió tu opinión?' })),
  }))
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-podcast', log: () => {},
    capability: async (name, payload) => name === 'web.search'
      ? { results: [{ title: 'Perfil profesional de Jane Doe', url: 'https://profile.example/jane', snippet: 'Trabaja en IA aplicada.' }] }
      : (assert.match(String((payload as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/), { text: JSON.stringify({ cronologia: [{ periodo: '2024', hecho: 'Publicó un proyecto de IA aplicada.', tipo: 'hecho', fuente: 1 }], mapaTemas: [{ tema: 'IA aplicada', cobertura: 'poco tratado', angulo: 'Decisiones detrás del proyecto' }], bloques, temasSensibles: [], rompehielos: ['Tu proyecto reciente cambia una práctica concreta.', 'La decisión técnica que más sorprendió al equipo.', 'El aprendizaje que ahora aplicarías primero.'], lagunas: [] }) }),
  }
  const result = await manifest.run(ctx, SAMPLES['podcast-guest-research'])
  validateMicroappResultEnvelope('podcast-guest-research', result)
  const output = manifest.outputSchema.parse(result.data) as { bloques: Array<{ preguntas: unknown[] }> }
  assert.equal(output.bloques.flatMap((block) => block.preguntas).length, 20)
  assert.equal(result.suggestedActions?.[0].params?.sourceJobId, 'job-podcast')
})

async function manifestRun(id: string, ctx: MicroappCtx, input: unknown) {
  const manifest = getMicroapp(id)
  assert.ok(manifest)
  return manifest.run(ctx, input)
}
