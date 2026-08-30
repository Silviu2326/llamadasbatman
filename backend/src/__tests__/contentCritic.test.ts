import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskPii, rewriteKeepsShape, reviewPiece } from '../services/contentCritic.service'
import { BrandFact, clauseFor, reviewPieceBody, reviewSpecificity } from '../services/contentSpecificity.service'
import { alreadyRanThisWeek, weeklyNotice } from '../services/contentCadence.service'
import { escapeXml, renderCarouselSlides, wrapText } from '../services/brandCarousel.service'
import { DEFAULT_BRAND, brandKitSchema } from '../services/brandKit.service'
import { estimateSeconds, voiceoverScript, wavFromPcm16 } from '../services/contentVoiceover.service'
import { hashToken } from '../services/contentApprovalLink.service'

/**
 * Reglas de la fase 2 y la fase 3 de `docs/vendrava/roadmap.md`: editor adversario,
 * chequeo de especificidad, plantilla de marca, locución y cadencia semanal.
 */

const FACTS: BrandFact[] = [
  { kind: 'experiencia', text: 'Fundada en 1998 en Alicante, especializada en aerotermia', sourceId: 'kb-1', sourceName: 'Quiénes somos' },
  { kind: 'plazo', text: 'Instalamos en 5 días desde la firma', sourceId: 'kb-2', sourceName: 'Proceso' },
]

test('lo genérico se sustituye por el dato y lo demás queda marcado', () => {
  // Las dos mitades de la idea 27: sustituir donde hay dato, marcar donde no.
  const review = reviewSpecificity('Tenemos amplia experiencia y precios competitivos.', FACTS)
  assert.match(review.text, /experiencia desde 1998/)
  assert.equal(review.replaced, 1)
  // No hay ningún dato de precio en la base de conocimiento: no se inventa.
  assert.equal(review.unresolved, 1)
  assert.match(review.text, /precios competitivos/)
  const priceFlag = review.flags.find(flag => flag.kind === 'precio')
  assert.equal(priceFlag?.replacedWith, null)
})

test('el dato sustituido cita el documento del que sale', () => {
  // Sin la cita, "desde 1998" es un número que alguien tendría que creerse.
  const review = reviewSpecificity('Contamos con amplia experiencia.', FACTS)
  assert.equal(review.flags[0].sourceName, 'Quiénes somos')
  assert.equal(review.flags[0].sourceQuote, FACTS[0].text)
})

test('un dato no se repite en dos campos de la misma pieza', () => {
  // Repetir "desde 1998" en el título y en tres slides no lo hace más concreto.
  const review = reviewPieceBody('carousel', {
    title: 'Amplia experiencia',
    slides: ['Amplia experiencia', 'Otra cosa'],
  }, FACTS)
  assert.equal(review.replaced, 1)
  assert.equal(review.unresolved, 1)
})

test('del documento se extrae la parte que cabe en la frase', () => {
  // Pegar la frase entera daría "Contamos con Fundada en 1998 en Alicante…".
  assert.equal(clauseFor(FACTS[0]), 'experiencia desde 1998')
  assert.equal(clauseFor(FACTS[1]), 'en 5 días')
  // Un dato del que no se puede extraer una cláusula limpia no se usa.
  assert.equal(clauseFor({ kind: 'precio', text: 'Somos honestos con el precio', sourceId: 'x', sourceName: 'y' }), null)
})

test('la PII que se cuela en una pieza se enmascara, y la del negocio no', () => {
  const masked = maskPii('Escríbenos a ana.perez@gmail.com o llama al 611 22 33 44. Nuestro fijo es 965 12 34 56.', {
    phone: '965123456',
  })
  assert.match(masked.text, /\[dato eliminado\]/)
  // El teléfono del propio negocio es una llamada a la acción, no una fuga.
  assert.match(masked.text, /965 12 34 56/)
  assert.ok(masked.found.includes('EMAIL'))
  assert.ok(masked.found.includes('TEL'))
  // El informe cuenta lo que pasó, pero nunca guarda el valor encontrado.
  assert.ok(!JSON.stringify(masked.found).includes('ana.perez'))
})

test('una reescritura que no conserva la forma de la pieza se descarta', () => {
  const original = { title: 'Título', slides: ['una', 'dos', 'tres'] }
  assert.ok(rewriteKeepsShape('carousel', original, { title: 'Otro', slides: ['a', 'b', 'c'] }))
  // Media slide vacía es media pieza rota.
  assert.equal(rewriteKeepsShape('carousel', original, { title: 'Otro', slides: ['a', '', 'c'] }), false)
  assert.equal(rewriteKeepsShape('carousel', original, { text: 'otra cosa' }), false)
})

test('sin clave del modelo la pieza sigue pasando por PII y especificidad', async () => {
  // Es lo que hace que el editor adversario proteja también en la demo sin
  // clave: la crítica no corre, pero las dos comprobaciones deterministas sí.
  const previous = process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  try {
    const result = await reviewPiece('post', { text: 'Amplia experiencia. Llama al 611 22 33 44.' }, {
      evidence: null,
      facts: FACTS,
      voice: null,
    })
    assert.equal(result.report.critique.ran, false)
    assert.equal(result.report.pii.blocking, true)
    assert.equal(result.report.specificity.replaced, 1)
    // Con PII enmascarada la pieza no puede darse por buena sin mirarla.
    assert.equal(result.report.passed, false)
    assert.match(String(result.body.text), /experiencia desde 1998/)
    assert.ok(!String(result.body.text).includes('611'))
  } finally {
    if (previous) process.env.DEEPSEEK_API_KEY = previous
  }
})

test('el texto de una slide se parte para que quepa en el lienzo', () => {
  const lines = wrapText('Una frase larguísima que no cabe de ninguna manera en una sola línea del carrusel', 56, 6)
  assert.ok(lines.length > 1)
  for (const line of lines) assert.ok(line.length <= 30, `línea demasiado larga: ${line}`)
  // Lo que no cabe se recorta con puntos suspensivos, no se sale de la slide.
  assert.match(wrapText('palabra '.repeat(200), 56, 3).at(-1) ?? '', /…$/)
})

test('el texto de la marca se escapa antes de entrar en el SVG', async () => {
  assert.equal(escapeXml('5 < 10 & "sí"'), '5 &lt; 10 &amp; &quot;sí&quot;')
  const slides = await renderCarouselSlides({ ...DEFAULT_BRAND, logoUrl: null }, {
    title: 'Título con <script>alert(1)</script>',
    slides: ['una', 'dos'],
  })
  assert.equal(slides.length, 3)
  assert.equal(slides[0].kind, 'cover')
  assert.equal(slides.at(-1)?.kind, 'closing')
  for (const slide of slides) assert.ok(!slide.svg.includes('<script>'))
})

test('el libro de marca solo acepta colores y logos utilizables', () => {
  assert.ok(brandKitSchema.safeParse({ primary: '#101828', logoUrl: 'https://cdn.example.com/logo.png' }).success)
  for (const invalid of [{ primary: 'azul' }, { primary: 'rgb(1,2,3)' }, { logoUrl: 'data:image/png;base64,AAA' }]) {
    assert.equal(brandKitSchema.safeParse(invalid).success, false, `aceptado: ${JSON.stringify(invalid)}`)
  }
})

test('la locución sale del guion entero y con cabecera de audio', () => {
  assert.equal(voiceoverScript({ hook: 'Hook', body: 'Cuerpo', cta: 'Cierre' }), 'Hook\n\nCuerpo\n\nCierre')
  assert.ok(estimateSeconds('a'.repeat(150)) >= 10)
  // Sin cabecera WAV el archivo son muestras sueltas que nadie reproduce.
  const wav = wavFromPcm16(Buffer.alloc(48_000))
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF')
  assert.equal(wav.subarray(8, 12).toString(), 'WAVE')
  assert.equal(wav.readUInt32LE(24), 24_000)
  assert.equal(wav.length, 48_044)
})

test('la cadencia semanal no analiza dos veces la misma semana', () => {
  // El análisis cuesta una llamada al modelo por organización: un reintento del
  // job no puede pagarla otra vez.
  const monday = new Date('2026-08-03T00:00:00.000Z')
  const settings = { contentCadence: { lastWeek: monday.toISOString(), created: 4, ranAt: '2026-08-03T07:00:00.000Z' } }
  assert.equal(alreadyRanThisWeek(settings, new Date('2026-08-05T09:00:00.000Z')), true)
  // La semana siguiente sí toca.
  assert.equal(alreadyRanThisWeek(settings, new Date('2026-08-11T09:00:00.000Z')), false)
  assert.equal(alreadyRanThisWeek({}, new Date()), false)
})

test('el aviso semanal dice lo que hay, en singular y en plural', () => {
  assert.match(weeklyNotice(1, 40).subject, /1 oportunidad nueva/)
  assert.match(weeklyNotice(7, 40).subject, /7 oportunidades nuevas/)
  assert.match(weeklyNotice(7, 40).body, /40 conversaciones/)
})

test('el token del enlace de aprobación no se guarda en claro', () => {
  const token = 'un-token-de-prueba-suficientemente-largo'
  const hash = hashToken(token)
  assert.equal(hash.length, 64)
  assert.ok(!hash.includes(token))
  // Mismo token, mismo hash: es lo que permite resolverlo sin guardarlo.
  assert.equal(hash, hashToken(token))
})
