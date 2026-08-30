import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailCandidates, splitOwnerName } from '../services/emailDiscovery.service'
import { routeLead, timeZoneForState, type EnrichmentOutcome } from '../jobs/leadEnrichment'
import { stateFromAddress } from '../services/prospecting.service'
import { detectVoiceConsentReply, withinLegalHours } from '../voice/compliance'

/**
 * Lógica pura del enriquecimiento de leads (PROCESO_AUTOMATICO_LEADS.md).
 *
 * Lo que se fija aquí son las tres decisiones que, si se rompen, cuestan
 * dinero o una multa: cómo se deduce el correo del dueño, a qué cola va cada
 * lead, y a qué hora es legal llamar.
 */

test('el nombre del dueño se parte igual venga como venga del registro', () => {
  assert.deepEqual(splitOwnerName('JOHN SMITH'), { first: 'john', last: 'smith' })
  // Los registros estatales lo publican con el apellido delante y coma.
  assert.deepEqual(splitOwnerName('SMITH, JOHN'), { first: 'john', last: 'smith' })
  // La inicial del medio se ignora, no se confunde con el apellido.
  assert.deepEqual(splitOwnerName('John A. Smith'), { first: 'john', last: 'smith' })
  assert.deepEqual(splitOwnerName('SMITH JR, JOHN'), { first: 'john', last: 'smith' })

  assert.equal(splitOwnerName('ACME LLC'), null, 'quitada la forma societaria no queda nombre')
  assert.equal(splitOwnerName('Smith'), null, 'sin apellido no se puede componer nada')
  assert.equal(splitOwnerName('   '), null)
})

test('los candidatos de correo salen en orden de frecuencia y sin el www', () => {
  assert.deepEqual(emailCandidates('John Smith', 'https://www.acmeroofing.com/contact'), [
    'john@acmeroofing.com',
    'johnsmith@acmeroofing.com',
    'john.smith@acmeroofing.com',
    'jsmith@acmeroofing.com',
    'smith@acmeroofing.com',
  ])
})

test('sin nombre utilizable o sin dominio válido no se gasta ni una verificación', () => {
  assert.deepEqual(emailCandidates('ACME LLC', 'acme.com'), [])
  assert.deepEqual(emailCandidates('John Smith', 'localhost'), [])
  assert.deepEqual(emailCandidates('John Smith', ''), [])
  // El registro trae la razón social como titular: sus palabras están en el
  // propio dominio, así que no hay persona a la que escribir.
  assert.deepEqual(emailCandidates('ACME ROOFING LLC', 'acmeroofing.com'), [])
})

const base: EnrichmentOutcome = {
  discarded: false,
  lineType: 'unknown',
  callTimeZone: 'America/New_York',
  discoveredEmail: null,
  tier: 'HOT',
}

test('solo el fijo de empresa entra en la cola de llamada en frío', () => {
  assert.equal(routeLead({ ...base, lineType: 'landline' }), 'call')
  // Móvil y VoIP exigen consentimiento escrito: van por correo primero.
  assert.equal(routeLead({ ...base, lineType: 'mobile' }), 'email')
  assert.equal(routeLead({ ...base, lineType: 'voip' }), 'email')
  assert.equal(routeLead({ ...base, lineType: 'unknown' }), 'email')
})

test('el que ya tiene buena web se descarta antes de nada', () => {
  assert.equal(routeLead({ ...base, discarded: true, lineType: 'landline' }), 'discarded')
})

test('la zona horaria sale del estado, y los que no están no se inventan', () => {
  assert.equal(timeZoneForState('NY'), 'America/New_York')
  assert.equal(timeZoneForState('ga'), 'America/New_York', 'no distingue mayúsculas')
  assert.equal(timeZoneForState('CA'), 'America/Los_Angeles')

  // Estados partidos entre dos husos: fuera del mapa a propósito. Prefiere no
  // llamar a llamar a la hora equivocada — Florida tiene el panhandle en
  // Central, y Texas y Idaho también están divididos.
  assert.equal(timeZoneForState('FL'), null)
  assert.equal(timeZoneForState('TX'), null)
  assert.equal(timeZoneForState('ID'), null)
  assert.equal(timeZoneForState(undefined), null)
})

test('la hora legal se juzga en la zona de quien recibe, no en la nuestra', () => {
  // 16:00 UTC = 12:00 en Nueva York (legal) y 09:00 en Los Ángeles (legal).
  const midday = new Date('2026-08-17T16:00:00Z')
  assert.equal(withinLegalHours('+12125551234', midday, 'America/New_York'), true)
  assert.equal(withinLegalHours('+13105551234', midday, 'America/Los_Angeles'), true)

  // 13:00 UTC = 09:00 en Nueva York (legal) pero 06:00 en Los Ángeles (ilegal).
  const earlyMorning = new Date('2026-08-17T13:00:00Z')
  assert.equal(withinLegalHours('+12125551234', earlyMorning, 'America/New_York'), true)
  assert.equal(
    withinLegalHours('+13105551234', earlyMorning, 'America/Los_Angeles'),
    false,
    'llamar a California a las 6 de la mañana es lo que costaba 500 $ por llamada'
  )
})

test('una aceptación explícita es consentimiento; el interés a secas no', () => {
  for (const yes of ['YES', 'yes please', 'Sure', 'ok', 'Call me', 'you can call me', 'sí', 'Adelante']) {
    assert.equal(detectVoiceConsentReply(yes), true, `debería aceptar "${yes}"`)
  }

  // Interés sin permiso: la trampa que cuesta 500 $ por llamada.
  assert.equal(detectVoiceConsentReply('Sounds interesting, tell me more'), false)
  assert.equal(detectVoiceConsentReply('What are your prices?'), false)
  // Negaciones, aunque contengan una palabra afirmativa.
  assert.equal(detectVoiceConsentReply('no, do not call me'), false)
  assert.equal(detectVoiceConsentReply("ok but don't call"), false)
  assert.equal(detectVoiceConsentReply('stop calling'), false)
  // Un "ok" perdido dentro de un correo largo no es un consentimiento.
  assert.equal(
    detectVoiceConsentReply('Thanks for the report. It looks ok overall but we already have an agency handling this for us right now.'),
    false
  )
  assert.equal(detectVoiceConsentReply(''), false)
})

test('un número de EE. UU. sin zona horaria conocida no se marca', () => {
  const midday = new Date('2026-08-17T16:00:00Z')
  const previous = process.env.DEFAULT_CALL_TIMEZONE
  delete process.env.DEFAULT_CALL_TIMEZONE
  try {
    assert.equal(
      withinLegalHours('+12125551234', midday),
      false,
      'sin zona horaria no se puede probar la hora local: fallo seguro'
    )
    // México sigue resolviéndose por la lada, como antes.
    assert.equal(withinLegalHours('+525512345678', midday), true)
  } finally {
    if (previous === undefined) delete process.env.DEFAULT_CALL_TIMEZONE
    else process.env.DEFAULT_CALL_TIMEZONE = previous
  }
})

/**
 * El estado sale de la dirección de Places y es el eslabón que enlaza la
 * importación con la zona horaria: sin él, `timeZoneForState` devuelve null y
 * el test de arriba demuestra que entonces no se marca nunca. Se importaba sin
 * estado, así que la cadena estaba rota justo aquí.
 */
test('el estado se saca de la dirección de Places en sus tres formas', () => {
  assert.equal(stateFromAddress('123 Main St, Brooklyn, NY 11201, USA'), 'NY')
  assert.equal(stateFromAddress('4 Yawkey Way, Boston, MA 02215, United States'), 'MA')
  // Sin país al final.
  assert.equal(stateFromAddress('100 Peachtree St NW, Atlanta, GA 30303'), 'GA')
  // Sin código postal.
  assert.equal(stateFromAddress('Old Town, Alexandria, VA, USA'), 'VA')
  // Código postal largo.
  assert.equal(stateFromAddress('1 Federal St, Newark, NJ 07102-1234, USA'), 'NJ')

  // Y encadenado con el mapa de husos, que es para lo que existe.
  assert.equal(timeZoneForState(stateFromAddress('9 Elm St, Raleigh, NC 27601, USA')), 'America/New_York')
})

test('una dirección que no es de EE. UU. no inventa estado', () => {
  assert.equal(stateFromAddress('Av. General Avilés 20, 46015 Valencia, España'), null)
  assert.equal(stateFromAddress('221B Baker Street, London, UK'), null, 'UK no es un código de estado')
  assert.equal(stateFromAddress(''), null)
  assert.equal(stateFromAddress(null), null)
  assert.equal(stateFromAddress(undefined), null)
  // Sin zona conocida el lead va a la cola de correo, que es el fallo seguro.
  assert.equal(timeZoneForState(stateFromAddress('Calle Mayor 1, 28013 Madrid, España')), null)
})
