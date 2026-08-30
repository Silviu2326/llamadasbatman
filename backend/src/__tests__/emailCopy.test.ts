import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COPY_RULES, VARIANTS, pickWinner, preheaderFrom, render, type VariantScore } from '../services/emailCopy.service'
import { EMAIL_STRATEGIES, availableStrategies, followupPlanFor, strategyById } from '../data/emailStrategies'

/**
 * Lo que protegen estas pruebas: la regla de desempate del juez y el montaje
 * final del email. Dos cosas que se rompen sin hacer ruido — un email firmado
 * dos veces o un ganador elegido por la puntuación equivocada no lanzan ningún
 * error, solo venden menos.
 */

const variant = (body: string, ps: string | null = null) => ({
  strategyId: 'diagnostico',
  strategyName: 'Diagnóstico consultivo',
  angle: '',
  subject: 'x',
  body,
  ps,
})

const score = (index: number, specificity: number, rest: number): VariantScore => ({
  index,
  specificity,
  credibility: rest,
  easyToReply: rest,
  naturalness: rest,
  total: specificity * 2 + rest * 3,
  verdict: '',
})

test('gana la puntuación total más alta', () => {
  assert.equal(pickWinner([score(0, 3, 5), score(1, 8, 5), score(2, 4, 5)]), 1)
})

test('la especificidad pesa doble: vence a una versión más pulida pero genérica', () => {
  // Genérica y redonda (0 de especificidad, 9 en todo lo demás) = 27.
  // Específica y algo más basta (8 de especificidad, 5 en el resto) = 31.
  const generic = score(0, 0, 9)
  const specific = score(1, 8, 5)
  assert.ok(specific.total > generic.total, `${specific.total} debería superar a ${generic.total}`)
  assert.equal(pickWinner([generic, specific]), 1)
})

test('sin puntuaciones gana la primera versión', () => {
  assert.equal(pickWinner([]), 0)
})

test('la firma no se duplica si el modelo ya firmó', () => {
  const output = render(variant('Hola.\n\nUn saludo,\nAgencia Sprintmarkt'), 'Agencia Sprintmarkt')
  assert.equal(output.match(/Sprintmarkt/g)?.length, 1)
})

test('la firma se añade cuando falta', () => {
  assert.ok(render(variant('Hola, una cosa rápida.'), 'Agencia Sprintmarkt').endsWith('Agencia Sprintmarkt'))
})

test('la posdata va al final y con su etiqueta', () => {
  const output = render(variant('Cuerpo.', 'Cerráis los lunes y el formulario promete 24h.'), 'Sprintmarkt')
  assert.ok(output.endsWith('P.D. Cerráis los lunes y el formulario promete 24h.'))
})

test('un nombre de agencia con caracteres de regex no rompe el montaje', () => {
  assert.doesNotThrow(() => render(variant('Cuerpo.'), 'Sprint (Markt) + Co.'))
})

test('el preheader es la primera frase, no el email entero', () => {
  assert.equal(
    preheaderFrom('Vi que cerráis los lunes por la mañana. Aun así el formulario promete respuesta en 24 horas.'),
    'Vi que cerráis los lunes por la mañana.',
  )
})

test('el preheader se corta a lo que cabe en la bandeja', () => {
  assert.ok(preheaderFrom('x'.repeat(400)).length <= 140)
})

test('el catálogo tiene estrategias suficientes para elegir y sin ids repetidos', () => {
  assert.ok(EMAIL_STRATEGIES.length >= VARIANTS)
  assert.equal(new Set(EMAIL_STRATEGIES.map(item => item.id)).size, EMAIL_STRATEGIES.length)
})

test('cada estrategia dice cuándo NO usarse', () => {
  // Sin `avoidWhen` el selector elige siempre la más llamativa.
  for (const strategy of EMAIL_STRATEGIES) {
    assert.ok(strategy.avoidWhen.length > 20, `${strategy.id} no dice cuándo evitarse`)
    assert.ok(strategy.useWhen.length > 20, `${strategy.id} no dice cuándo usarse`)
    assert.ok(strategy.targetWords[0] < strategy.targetWords[1], `${strategy.id} tiene un rango de longitud imposible`)
  }
})

test('sin casos reales no se ofrece la estrategia que los cuenta', () => {
  const withoutCases = availableStrategies(false)
  const withCases = availableStrategies(true)
  assert.ok(!withoutCases.some(strategy => strategy.id === 'caso_parecido'))
  assert.ok(withCases.some(strategy => strategy.id === 'caso_parecido'))
  assert.ok(withoutCases.length >= VARIANTS, 'sin casos siguen quedando estrategias suficientes')
})

test('el estilo Isra Bravo está en el catálogo y prohíbe las fórmulas de oficina', () => {
  const isra = strategyById('isra_bravo')
  assert.ok(isra)
  assert.ok(isra.guidance.includes('espero que estés bien'))
  assert.ok(isra.guidance.toLowerCase().includes('p.d.'), 'la posdata es obligatoria en este estilo')
})

test('el email de una sola pregunta es el más corto de los de primer contacto', () => {
  // Un seguimiento sí puede ser más corto: el recordatorio son dos líneas.
  const short = strategyById('una_pregunta')
  assert.ok(short)
  for (const other of EMAIL_STRATEGIES.filter(item => item.kind === 'outbound' && item.id !== 'una_pregunta')) {
    assert.ok(short.targetWords[1] <= other.targetWords[0], `${other.id} no es más largo que una_pregunta`)
  }
})

test('las reglas prohíben explícitamente lo que delata un email automático', () => {
  // No es decoración: si alguien recorta las reglas, esto cae.
  for (const forbidden of ['he visto en vuestra web', 'reunión de 30 minutos', 'gratis']) {
    assert.ok(COPY_RULES.toLowerCase().includes(forbidden.toLowerCase()), `falta la regla sobre "${forbidden}"`)
  }
})

// --- Seguimiento -------------------------------------------------------------

test('el catálogo de seguimiento y el de primer contacto no se mezclan', () => {
  const outbound = availableStrategies(true, 'outbound')
  const followup = availableStrategies(true, 'followup')
  assert.ok(outbound.length >= VARIANTS)
  assert.ok(followup.length >= VARIANTS)
  // Un cierre de hilo como primer contacto sería absurdo, y un diagnóstico
  // como cuarto seguimiento es repetir lo que ya no funcionó.
  assert.ok(outbound.every(strategy => strategy.kind === 'outbound'))
  assert.ok(followup.every(strategy => strategy.kind === 'followup'))
  assert.ok(!outbound.some(strategy => strategy.id === 'ruptura'))
})

test('el último intento siempre es el cierre del hilo', () => {
  assert.equal(followupPlanFor(1, 1), 'ruptura')
  assert.equal(followupPlanFor(3, 1), 'ruptura')
  assert.equal(followupPlanFor(9, 0), 'ruptura')
})

test('la secuencia de seguimiento va de recordar a cambiar de ángulo y regalar', () => {
  assert.equal(followupPlanFor(1, 4), 'recordatorio_corto')
  assert.equal(followupPlanFor(2, 3), 'angulo_nuevo')
  assert.equal(followupPlanFor(3, 2), 'valor_suelto')
})

test('un número de intento fuera de rango no rompe el plan', () => {
  assert.ok(strategyById(followupPlanFor(0, 5)))
  assert.ok(strategyById(followupPlanFor(99, 5)))
})

test('las dos estrategias de seguimiento que no piden nada existen y lo dicen', () => {
  // El juez puntúa la facilidad de responder; si estas dos dejaran de declarar
  // que no piden nada, las penalizaría por lo que precisamente las hace buenas.
  const ruptura = strategyById('ruptura')
  const valor = strategyById('valor_suelto')
  assert.ok(ruptura && valor)
  assert.ok(valor.guidance.includes('NO lleva pregunta'))
  assert.ok(ruptura.guidance.includes('no pide'))
})

test('el recordatorio corto prohíbe las muletillas de CRM', () => {
  const bump = strategyById('recordatorio_corto')
  assert.ok(bump)
  assert.ok(bump.guidance.includes('haciendo seguimiento'))
  assert.ok(bump.guidance.includes('recibiste mi email'))
})

test('todos los estilos nuevos de primer contacto están completos', () => {
  for (const id of ['carta_personal', 'cadena_de_si', 'dato_desnudo']) {
    const strategy = strategyById(id)
    assert.ok(strategy, `falta ${id}`)
    assert.equal(strategy.kind, 'outbound')
    assert.ok(strategy.guidance.length > 100, `${id} tiene una guía demasiado floja para diferenciarse`)
  }
})
