import assert from 'node:assert/strict'
import test from 'node:test'
import {
  VOICEOVER_CHARS_PER_SECOND,
  buildStoryboardPrompt,
  checkBudget,
  storyboardAspectRatio,
  voiceoverCharBudget,
  voiceoverSeconds,
} from '../services/studioPlanning'

// Studio de Cine v0 — reglas puras de preproducción, sin base de datos.

test('storyboard: canales verticales nativos van a 9:16', () => {
  assert.equal(storyboardAspectRatio('reels', 30), '9:16')
  assert.equal(storyboardAspectRatio('TikTok', 15), '9:16')
  assert.equal(storyboardAspectRatio('youtube shorts', 60), '9:16')
  assert.equal(storyboardAspectRatio('Instagram Stories', 15), '9:16')
})

test('storyboard: youtube es horizontal 16:9', () => {
  assert.equal(storyboardAspectRatio('youtube', 60), '16:9')
  assert.equal(storyboardAspectRatio('YouTube', 15), '16:9')
})

test('storyboard: ads elige por duración — corto vertical, largo cuadrado', () => {
  // Hasta 15 s el placement dominante es stories/reels (vertical).
  assert.equal(storyboardAspectRatio('ads', 6), '9:16')
  assert.equal(storyboardAspectRatio('meta ads', 15), '9:16')
  // Por encima de 15 s la pieza vive en feed: 1:1 conserva área en todos los
  // placements.
  assert.equal(storyboardAspectRatio('ads', 30), '1:1')
  assert.equal(storyboardAspectRatio('paid social', 60), '1:1')
})

test('storyboard: canal desconocido o vacío cae a vertical-first', () => {
  assert.equal(storyboardAspectRatio('linkedin', 30), '9:16')
  assert.equal(storyboardAspectRatio(undefined, undefined), '9:16')
  assert.equal(storyboardAspectRatio('', 30), '9:16')
})

test('locución: ~15 caracteres por segundo, redondeo hacia arriba', () => {
  assert.equal(VOICEOVER_CHARS_PER_SECOND, 15)
  assert.equal(voiceoverSeconds(''), 0)
  assert.equal(voiceoverSeconds('   '), 0)
  assert.equal(voiceoverSeconds('a'.repeat(15)), 1)
  assert.equal(voiceoverSeconds('a'.repeat(16)), 2)
  assert.equal(voiceoverSeconds('a'.repeat(150)), 10)
  // El trim evita cobrar segundos por espacios de relleno.
  assert.equal(voiceoverSeconds('  hola  '), 1)
})

test('locución: presupuesto de caracteres de una pieza', () => {
  assert.equal(voiceoverCharBudget(30), 450)
  assert.equal(voiceoverCharBudget(6), 90)
  assert.equal(voiceoverCharBudget(0), 0)
  assert.equal(voiceoverCharBudget(-5), 0)
})

test('presupuesto: sin budgetCents no hay límite', () => {
  const check = checkBudget(null, 5_000, 100_000)
  assert.equal(check.ok, true)
  assert.equal(check.remainingCents, null)
  assert.equal(check.shortfallCents, 0)
  assert.equal(checkBudget(undefined, 0, 1).ok, true)
})

test('presupuesto: gastado + estimado dentro del límite pasa, y justo al límite también', () => {
  assert.equal(checkBudget(1_000, 400, 500).ok, true)
  // Regla "spent + estimate <= budget": el igual exacto se permite.
  assert.equal(checkBudget(1_000, 400, 600).ok, true)
})

test('presupuesto: superar el límite se rechaza con el faltante calculado', () => {
  const check = checkBudget(1_000, 800, 500)
  assert.equal(check.ok, false)
  assert.equal(check.remainingCents, 200)
  assert.equal(check.shortfallCents, 300)
})

test('presupuesto: producción ya pasada de presupuesto no puede lanzar nada', () => {
  const check = checkBudget(1_000, 1_200, 1)
  assert.equal(check.ok, false)
  assert.equal(check.remainingCents, -200)
  assert.equal(check.shortfallCents, 201)
})

test('prompt de storyboard: incluye las partes y respeta el tope del contrato', () => {
  const prompt = buildStoryboardPrompt({
    framing: 'plano medio',
    movement: 'travelling lateral',
    action: 'la protagonista abre la caja del producto',
    styleNotes: ['paleta cálida'],
    characterNotes: ['Ana: 30 años, chaqueta azul'],
  })
  assert.match(prompt, /plano medio/)
  assert.match(prompt, /travelling lateral/)
  assert.match(prompt, /fotograma inicial/)
  assert.match(prompt, /paleta cálida/)
  assert.match(prompt, /chaqueta azul/)
  // Tope de imageGenerateInput.prompt (providers/capabilities.ts): 4000.
  const enorme = buildStoryboardPrompt({
    framing: 'x'.repeat(5000),
    movement: 'estático',
    action: 'acción',
  })
  assert.ok(enorme.length <= 4000)
})
