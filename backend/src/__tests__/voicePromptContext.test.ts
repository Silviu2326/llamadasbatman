import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditSection, defaultPersona } from '../voice/intelligence/promptContext'

/**
 * Lo que el agente sabe del prospecto antes de abrir la boca.
 *
 * El guion de la campaña abre con "I ran a check on your website this morning",
 * y las reglas de voz le prohíben inventarse hechos de la empresa. Si estos
 * datos no llegan al prompt, el agente se queda mudo justo en la apertura — así
 * que lo que se fija aquí es que llegan, y que no llega nada que no sea cierto.
 */

const FULL_AUDIT = {
  website: 'https://acmeroofing.com',
  webAlive: true,
  webInfo: { isHttps: false, loadMs: 6_400 },
  publicScore: 31,
  opportunities: [
    { title: 'No contact form', pitch: 'Visitors on mobile have no way to reach you', impact: 'ALTO' },
    { title: 'Missing sitemap', pitch: 'Google indexes fewer pages', impact: 'MEDIO' },
    { title: 'No schema markup', pitch: 'No rich results', impact: 'BAJO' },
    { title: 'Cuarto hallazgo', pitch: 'No debería aparecer', impact: 'BAJO' },
  ],
  benchmark: { sector: 'roofing', city: 'Raleigh', avgRating: 4.6, avgReviews: 118 },
  auditedAt: '2026-08-17T09:00:00.000Z',
}

const FIELDS = { website: 'https://acmeroofing.com', rating: 4.2, userRatingCount: 31, sector: 'roofing', city: 'Raleigh' }

test('la auditoría llega al prompt con los datos que usa el guion', () => {
  const section = auditSection(FULL_AUDIT, FIELDS)
  assert.ok(section, 'con auditoría completa tiene que haber sección')

  // El dato de apertura, en segundos y no en milisegundos.
  assert.match(section!, /6\.4 seconds/)
  assert.match(section!, /Not secure/, 'la falta de HTTPS es argumento de venta')
  assert.match(section!, /31\/100/)
  assert.match(section!, /No contact form/)

  // La comparación con su gremio: su número contra el de sus competidores.
  assert.match(section!, /4\.2 vs 4\.6/)
  assert.match(section!, /31 reviews vs 118/)

  // Tope de hallazgos: en una llamada no caben cuatro.
  assert.ok(!section!.includes('Cuarto hallazgo'), 'solo entran los tres primeros')

  // Y la instrucción que evita que los recite todos de carrerilla.
  assert.match(section!, /Use ONE of these to open/)
  assert.match(section!, /Never state a figure that is not on this list/)
})

test('una web rápida no genera el argumento de la velocidad', () => {
  // Google marca en rojo por encima de 2,5 s. Por debajo no es un problema, y
  // decirlo sería regalarle al prospecto un motivo para colgar.
  const section = auditSection({ ...FULL_AUDIT, webInfo: { isHttps: true, loadMs: 900 } }, FIELDS)
  // Se busca la línea medida, no la palabra: la instrucción final del bloque
  // lleva "seconds" dentro de su ejemplo y no es un dato del prospecto.
  assert.ok(!/Loads in .* seconds/.test(section ?? ''), 'no se menciona un tiempo de carga que está bien')
  assert.ok(!/Not secure/.test(section ?? ''), 'con HTTPS no se avisa de HTTPS')
})

test('una auditoría vieja o incompleta no rompe la llamada', () => {
  // LeadAudit.result es un Json histórico: una auditoría de hace meses puede no
  // traer los campos nuevos. Preferimos menos contexto que una llamada caída.
  assert.doesNotThrow(() => auditSection({}, {}))
  assert.equal(auditSection({}, {}), null, 'sin nada que decir, no se añade sección vacía')
  assert.equal(auditSection({ webInfo: null, opportunities: null, benchmark: null }, {}), null)

  // Con un solo dato útil, sí hay sección.
  assert.match(auditSection({ website: 'https://x.com' }, {}) ?? '', /Their website: https:\/\/x\.com/)
})

test('no se cuela un número que no esté en la auditoría', () => {
  // Sin valoración propia en customFields no se puede comparar con la media:
  // media sin su número es una comparación a medias, y el agente la diría igual.
  const section = auditSection(FULL_AUDIT, { website: 'https://acmeroofing.com' })
  assert.ok(!/vs 4\.6/.test(section ?? ''), 'sin su valoración no se compara')
  assert.ok(!/vs 118/.test(section ?? ''))
})

test('la persona por defecto usa la empresa de la organización, no una marca fija', () => {
  assert.equal(
    defaultPersona('Alex', 'SprintMarkt'),
    'You are Alex, an AI voice assistant calling on behalf of SprintMarkt.'
  )
  // Sin nombre configurado hay uno por defecto, pero la marca nunca se inventa.
  assert.match(defaultPersona(null, 'SprintMarkt') ?? '', /^You are Alex/)
  assert.equal(defaultPersona('Alex', null), null, 'sin empresa no se compone identidad')
  assert.equal(defaultPersona('Alex', '   '), null)
})
