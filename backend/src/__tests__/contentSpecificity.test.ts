import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BrandFact, clauseFor, factsInstructions, pieceTextFields, reviewPieceBody, reviewSpecificity,
} from '../services/contentSpecificity.service'

/**
 * Chequeo de especificidad — idea 27 y día 3 de `docs/vendrava/semana.md`.
 *
 * Lo que se prueba aquí es la promesa entera: lo genérico se marca, se sustituye
 * **solo** con datos de la base de conocimiento, y nada se inventa cuando no los
 * hay.
 */

const fact = (kind: BrandFact['kind'], text: string, sourceName = 'Ficha de empresa'): BrandFact =>
  ({ kind, text, sourceId: `kb-${kind}`, sourceName })

test('lo genérico se sustituye por el dato de la base de conocimiento', () => {
  const review = reviewSpecificity(
    'Contamos con amplia experiencia en aerotermia.',
    [fact('experiencia', 'Instalamos aerotermia desde 2019')],
  )

  assert.equal(review.text, 'Contamos con experiencia desde 2019 en aerotermia.')
  assert.equal(review.replaced, 1)
  assert.equal(review.unresolved, 0)
  // Y se puede señalar de dónde salió: sin la cita, la sustitución sería
  // indistinguible de una invención.
  assert.equal(review.flags[0].sourceQuote, 'Instalamos aerotermia desde 2019')
  assert.equal(review.flags[0].sourceName, 'Ficha de empresa')
})

test('sin dato en la base de conocimiento se marca y NO se inventa', () => {
  // Es la mitad que hace honesta a la idea 27: el hueco se enseña, no se rellena
  // con un número plausible.
  const review = reviewSpecificity('Ofrecemos precios competitivos y máxima garantía.', [])

  assert.equal(review.text, 'Ofrecemos precios competitivos y máxima garantía.')
  assert.equal(review.replaced, 0)
  assert.equal(review.unresolved, 2)
  assert.deepEqual(review.flags.map(flag => flag.replacedWith), [null, null])
  for (const flag of review.flags) assert.ok(flag.why.length > 0, 'la marca tiene que explicar por qué')
})

test('un dato de otra clase no sirve para tapar el hueco', () => {
  // Tener el horario no autoriza a decir cuánto cuesta: el enganche entre
  // vaguedad y dato es lo que impide que la sustitución mienta.
  const review = reviewSpecificity('Ofrecemos precios competitivos.', [
    fact('horario', 'Atendemos de lunes a viernes de 8:00 a 20:00'),
  ])

  assert.equal(review.text, 'Ofrecemos precios competitivos.')
  assert.equal(review.unresolved, 1)
})

test('la frase sustituida sigue siendo español, no un pegote del documento', () => {
  // El documento dice una frase entera; en el hueco solo cabe la parte que
  // encaja. Pegar la frase completa daría "Damos Garantía de 5 años en todas
  // nuestras instalaciones en todos los trabajos".
  const review = reviewSpecificity('Damos máxima garantía en todos los trabajos.', [
    fact('garantia', 'Garantía de 5 años en todas nuestras instalaciones'),
  ])

  assert.equal(review.text, 'Damos garantía de 5 años en todos los trabajos.')
})

test('la sustitución conserva el sustantivo de la frase original', () => {
  const review = reviewSpecificity('Respuesta rápida a cualquier aviso.', [
    fact('plazo', 'Respondemos a los avisos en 24 horas'),
  ])

  assert.equal(review.text, 'Respuesta en 24 horas a cualquier aviso.')
})

test('hay vaguedades que solo se marcan porque ningún dato las sustituye', () => {
  // "Somos líderes del sector" no se arregla con una cifra: cambiarla por
  // "Somos 340 instalaciones" diría otra cosa. Se marca y decide la persona.
  const review = reviewSpecificity('Somos líderes del sector y damos soluciones a medida.', [
    fact('volumen', 'Llevamos 340 instalaciones hechas'),
    fact('cobertura', 'Trabajamos en toda la provincia de Alicante'),
  ])

  assert.equal(review.text, 'Somos líderes del sector y damos soluciones a medida.')
  assert.equal(review.unresolved, 2)
})

test('un dato sin forma citable no se usa aunque sea de la clase correcta', () => {
  // "Tenemos mucha experiencia" está en la base de conocimiento, pero no trae
  // año ni cifra: sustituir una vaguedad por otra no es especificidad.
  assert.equal(clauseFor(fact('experiencia', 'Tenemos mucha experiencia en el sector')), null)
  const review = reviewSpecificity('Contamos con amplia experiencia.', [
    fact('experiencia', 'Tenemos mucha experiencia en el sector'),
  ])
  assert.equal(review.text, 'Contamos con amplia experiencia.')
  assert.equal(review.unresolved, 1)
})

test('el mismo dato no se repite en toda la pieza', () => {
  // Repetir "desde 2019" en el título y en tres slides no la hace más
  // concreta: la convierte en un eslogan.
  const check = reviewPieceBody('carousel', {
    title: 'Amplia experiencia en aerotermia',
    slides: ['Contamos con amplia experiencia', 'Y con amplia experiencia también en frío industrial'],
  }, [fact('experiencia', 'Instalamos aerotermia desde 2019')])

  const usos = JSON.stringify(check.body).match(/desde 2019/g) ?? []
  assert.equal(usos.length, 1)
  assert.equal(check.replaced, 1)
  assert.equal(check.unresolved, 2)
})

test('el chequeo llega a todos los campos de cada formato', () => {
  // Una vaguedad en la slide 4 o en el CTA del Reel es tan genérica como en el
  // titular: si el recorrido se dejara campos fuera, el informe mentiría.
  assert.deepEqual(pieceTextFields('post', { text: 'x' }).map(field => field.path), [['text']])
  assert.deepEqual(
    pieceTextFields('carousel', { title: 't', slides: ['a', 'b'] }).map(field => field.path.join('.')),
    ['title', 'slides.0', 'slides.1'],
  )
  assert.deepEqual(
    pieceTextFields('reel_script', { hook: 'h', body: 'b', cta: 'c' }).map(field => field.path.join('.')),
    ['hook', 'body', 'cta'],
  )

  const check = reviewPieceBody('reel_script', {
    hook: '¿Buscas una empresa de verdad?',
    body: 'Damos atención personalizada.',
    cta: 'Escríbenos y te respondemos con máxima garantía.',
  }, [
    fact('horario', 'Atendemos de lunes a viernes de 8:00 a 20:00'),
    fact('garantia', 'Garantía de 5 años en todas nuestras instalaciones'),
  ])

  assert.equal(check.body.body, 'Damos atención de lunes a viernes de 8:00 a 20:00.')
  assert.equal(check.body.cta, 'Escríbenos y te respondemos con garantía de 5 años.')
  assert.equal(check.replaced, 2)
})

test('el chequeo no toca lo que ya era concreto', () => {
  const concreto = 'Instalamos aerotermia desde 2019 y la garantía es de 5 años.'
  const check = reviewPieceBody('post', { text: concreto }, [fact('experiencia', 'Trabajamos desde 2019')])

  assert.equal(check.body.text, concreto)
  assert.equal(check.flags.length, 0)
})

test('los datos verificados entran en el prompt antes de escribir', () => {
  // Escribir concreto de primeras es más barato que reescribir después; y sin
  // datos no se le miente al modelo diciendo que los tiene.
  assert.equal(factsInstructions([]), null)
  const instructions = factsInstructions([fact('experiencia', 'Instalamos aerotermia desde 2019')])
  assert.match(instructions ?? '', /Instalamos aerotermia desde 2019/)
  assert.match(instructions ?? '', /ÚNICOS datos/)
})
