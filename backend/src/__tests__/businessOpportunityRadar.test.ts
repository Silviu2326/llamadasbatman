process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../microapps/apps/businessOpportunityRadar'
import { getMicroapp, listMicroapps } from '../microapps/registry'
import { classifyBusinessVertical, buildResearchLenses } from '../services/businessIntelligence.service'
import type { MicroappCtx } from '../microapps/types'

const hotelInput = {
  company: { name: 'Hotel Horizonte', website: 'https://hotel.example', industry: 'Hotel boutique', address: 'Valencia, España', currency: 'EUR' },
  businessDescription: 'Hotel boutique para viajeros de ocio y pequeñas empresas.',
  idealCustomer: 'Viajeros europeos y equipos que organizan retiros.',
  valueProposition: 'Atención inmediata por teléfono y una experiencia local cuidada.',
  differentiators: ['Atención 24 horas'],
  offers: [{ name: 'Habitación con desayuno', description: 'Estancia y desayuno local.' }],
  vertical: 'Hoteles y alojamientos',
  lens: 'costs_suppliers' as const,
  lensTitle: 'Proveedores y ahorro',
  queryAngles: ['proveedores para hoteles amenities lavandería limpieza', 'ahorro energético hoteles'],
  focus: 'Encontrar alternativas de lavandería con cobertura en Valencia.',
}

test('detecta un hotel y genera una agenda específica de hospitality', () => {
  const vertical = classifyBusinessVertical({ industry: 'Hotel boutique', description: 'Alojamiento turístico en Valencia' })
  assert.deepEqual(vertical, { key: 'hospitality', label: 'Hoteles y alojamientos', confidence: 'high' })
  const lenses = buildResearchLenses(vertical.key)
  assert.match(lenses.find(item => item.key === 'costs_suppliers')?.description ?? '', /lavandería/)
  assert.ok(lenses.find(item => item.key === 'demand_growth')?.queryAngles.some(query => /ocupación hotelera/.test(query)))
  assert.ok(lenses.find(item => item.key === 'automation')?.queryAngles.some(query => /huésped/.test(query)))
})

test('el radar interno no altera el catálogo público de 147 microapps', () => {
  const radar = getMicroapp('business-opportunity-radar')
  assert.ok(radar)
  assert.equal(radar.visibility, 'internal')
  assert.equal(listMicroapps().some(item => item.id === radar.id), false)
})

test('solo publica hechos, oportunidades y proveedores vinculados a fuentes recuperadas', async () => {
  const radar = getMicroapp('business-opportunity-radar')!
  let llmCalls = 0
  const ctx: MicroappCtx = {
    orgId: 'org-hotel', jobId: 'job-hotel', log() {},
    async capability(name) {
      if (name === 'web.search') return { results: [{ title: 'Lavandería Levante para hoteles', url: 'https://supplier.example/hoteles', snippet: 'Servicio de lavandería industrial para hoteles de Valencia.' }] }
      llmCalls += 1
      return { text: JSON.stringify({
        executiveBrief: 'Existe un candidato local que merece una petición de oferta, pero no hay precio publicado.',
        facts: [
          { claim: 'El proveedor declara servicio para hoteles de Valencia.', source: 1, confidence: 'medium' },
          { claim: 'Ahorra un 40%.', source: 99, confidence: 'high' },
        ],
        inferences: [{ claim: 'Podría reducir tiempos logísticos.', sources: [1], confidence: 'low', whatToVerify: 'SLA y frecuencia de recogida.' }],
        opportunities: [
          { title: 'Solicitar oferta comparable', category: 'Compras', rationale: 'Hay cobertura sectorial y geográfica.', impact: 'medium', effort: 'low', confidence: 'medium', sources: [1], firstAction: 'Enviar un pliego con volumen mensual.', successMetric: 'Coste por kilogramo comparable.' },
          { title: 'Ahorro inventado', category: 'Compras', rationale: 'Sin fuente.', impact: 'high', effort: 'low', confidence: 'high', sources: [99], firstAction: 'Comprar.', successMetric: 'Ahorro.' },
        ],
        suppliers: [{ name: 'Lavandería Levante', category: 'Lavandería', source: 1, whyRelevant: 'Declara cobertura hotelera local.', priceSignal: null, validationStatus: 'price_evidenced' }],
        risks: [], nextQuestions: ['¿Cuál es el volumen mensual?'], gaps: ['No hay tarifas públicas.'],
      }) }
    },
  }
  const result = await radar.run(ctx, hotelInput)
  const data = radar.outputSchema.parse(result.data) as any
  assert.ok(llmCalls > 0)
  assert.equal(data.facts.length, 1, 'los hechos sin fuente recuperada se descartan')
  assert.equal(data.opportunities.length, 1, 'las oportunidades sin evidencia se descartan')
  assert.equal(data.suppliers[0].validationStatus, 'candidate_to_validate')
  assert.equal(data.suppliers[0].priceSignal, null)
  assert.ok(result.evidence.every(item => item.sourceUrl === 'https://supplier.example/hoteles'))
})

test('sin fuentes no llama al modelo ni fabrica oportunidades', async () => {
  const radar = getMicroapp('business-opportunity-radar')!
  let llmCalls = 0
  const ctx: MicroappCtx = {
    orgId: 'org-empty', jobId: 'job-empty', log() {},
    async capability(name) {
      if (name === 'web.search') return { results: [] }
      llmCalls += 1
      throw new Error('no debería invocarse')
    },
  }
  const result = await radar.run(ctx, hotelInput)
  const data = radar.outputSchema.parse(result.data) as any
  assert.equal(llmCalls, 0)
  assert.deepEqual(data.opportunities, [])
  assert.deepEqual(data.suppliers, [])
  assert.ok(data.gaps.length > 0)
})

test('ejecuta todos los objetivos, conserva sus tipos y declara los que no tienen evidencia', async () => {
  const app = getMicroapp('business-opportunity-radar')!
  const queries: string[] = []
  const radar = { businessType: 'software', kind: 'clients', target: 'Salones', location: 'Madrid', criteria: '', objectives: [{ kind: 'clients', target: 'Salones', criteria: '' }, { kind: 'suppliers', target: 'Hosting', criteria: 'Europa' }, { kind: 'partners', target: 'Integradores', criteria: '' }] }
  const ctx: MicroappCtx = { orgId: 'org-multi', jobId: 'job-multi', log() {}, async capability(name, raw) {
    const input = raw as any
    if (name === 'web.search') {
      queries.push(input.query)
      return { results: input.query.includes('Salones') ? [{ title: 'Salón Lúa', url: 'https://salon.example', snippet: 'Salón Lúa Madrid' }] : input.query.includes('Hosting') ? [{ title: 'Hosting Azul', url: 'https://hosting.example', snippet: 'Hosting Azul servidores en Europa' }] : [] }
    }
    assert.match(input.prompt, /Objetivos independientes/)
    assert.match(input.prompt, /Integradores/)
    return { text: JSON.stringify({ executiveBrief: 'Dos candidatos con fuentes.', candidates: [{ name: 'Salón Lúa', kind: 'clients', source: 1, rationale: 'Posible comprador' }, { name: 'Hosting Azul', kind: 'suppliers', source: 2, rationale: 'Posible proveedor' }], facts: [], inferences: [], opportunities: [], suppliers: [], risks: [], gaps: [], nextQuestions: [] }) }
  } }
  const result = await app.run(ctx, { ...hotelInput, radar })
  const data = app.outputSchema.parse(result.data) as any
  assert.equal(queries.length, 12)
  assert.deepEqual(data.candidates.map((item: any) => item.kind), ['clients', 'suppliers'])
  assert.ok(data.gaps.some((gap: string) => gap.includes('Integradores')))
})
