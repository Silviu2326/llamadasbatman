import { test } from 'node:test'
import assert from 'node:assert/strict'
import { channelMix, mixDistance } from '../services/landingBaseline.service'
import { opportunitiesFrom, priorityOf, termOverlap, terms } from '../services/landingDiagnostics.service'

/**
 * Reglas de la fase 2 de docs/xarly/landings.md: línea base (§3.4) y prioridad
 * económica de los diagnósticos (§5.1). Lo que se protege aquí es la honestidad
 * de los números, que es lo único que hace útil a esta página.
 */

const row = (source: string, sessions: number, variantId = '') => ({
  day: new Date('2026-07-01'), source, variantId, sessions, views: sessions,
  scroll50: 0, ctaClicks: 0, formStarts: 0, formSubmits: 0,
})

test('la misma mezcla de canales no dispara ajuste por tráfico', () => {
  const before = channelMix([row('meta', 60), row('google', 40)])
  const after = channelMix([row('meta', 120), row('google', 80)])
  assert.equal(mixDistance(before, after), 0)
})

test('un cambio total de canal da distancia máxima', () => {
  const before = channelMix([row('google', 100)])
  const after = channelMix([row('meta', 100)])
  assert.equal(mixDistance(before, after), 1)
})

test('la entrada de tráfico frío se detecta como cambio de mezcla', () => {
  // El caso de §3.4: la landing convertía con tráfico de búsqueda y empieza a
  // recibir Meta. La caída de conversión no es culpa de la landing.
  const before = channelMix([row('google', 90), row('meta', 10)])
  const after = channelMix([row('google', 40), row('meta', 60)])
  assert.ok((mixDistance(before, after) ?? 0) >= 0.25, 'debería superar el umbral de ajuste por canal')
})

test('sin datos en una de las ventanas no hay distancia que calcular', () => {
  assert.equal(mixDistance(channelMix([]), channelMix([row('meta', 10)])), null)
})

test('el tráfico en experimento no entra en la mezcla de la versión principal', () => {
  // §3.4: mientras un experimento corre, la mitad de los visitantes ve otra
  // página. Si contara, la landing competiría contra su propia variante.
  const rows = [row('google', 100), row('google', 100, 'variante-b')]
  const principal = rows.filter(current => !current.variantId)
  assert.equal(principal.length, 1)
  assert.equal(channelMix(principal).get('google'), 1)
})

test('la prioridad premia el impacto alto con poco esfuerzo (§5.1)', () => {
  const impact = { minLeads: 20, maxLeads: 40, minOpportunities: null, maxOpportunities: null }
  const cheap = priorityOf(impact, 'high', 'low')
  const expensive = priorityOf(impact, 'high', 'high')
  assert.ok(cheap > expensive, 'el mismo impacto con más esfuerzo debe bajar en la lista')
})

test('la confianza baja hunde la prioridad aunque el impacto sea grande', () => {
  const big = { minLeads: 100, maxLeads: 200, minOpportunities: null, maxOpportunities: null }
  const small = { minLeads: 10, maxLeads: 20, minOpportunities: null, maxOpportunities: null }
  // 150 × 0,3 ÷ 4 = 11,25 frente a 15 × 1 ÷ 1 = 15.
  assert.ok(priorityOf(small, 'high', 'low') > priorityOf(big, 'low', 'high'))
})

test('sin tasa de cualificación medida no se inventan oportunidades', () => {
  assert.equal(opportunitiesFrom(40, null), null)
  assert.equal(opportunitiesFrom(40, 0.25), 10)
})

test('los términos se comparan sin acentos ni palabras vacías', () => {
  const promise = terms('Instalación rápida garantizada')
  assert.ok(promise.has('instalacion'), 'debería plegar los acentos')
  assert.ok(!promise.has('de'), 'no debería incluir palabras vacías')
})

test('promesas distintas dan solapamiento bajo; iguales, alto', () => {
  const advert = terms('Instalamos tu caldera en 24 horas')
  const alignedHero = terms('Instalamos tu caldera en 24 horas, garantizado')
  const otherHero = terms('El mejor precio del mercado en financiación')
  assert.ok((termOverlap(advert, alignedHero) ?? 0) > 0.5)
  assert.equal(termOverlap(advert, otherHero), 0)
})

test('sin texto que comparar no hay señal de desalineación', () => {
  assert.equal(termOverlap(terms(null), terms('lo que sea')), null)
})
