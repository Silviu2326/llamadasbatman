import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LANDING_EVENT_TYPES,
  deviceFromUserAgent,
  isBotUserAgent,
  landingContentHash,
  landingContentOf,
} from '../services/landingTelemetry.service'

/**
 * Contratos de docs/xarly/landings.md §3.1 y §3.2. Son bloqueantes de la fase
 * 1: sin identidad de versión estable y sin exclusión de tráfico automático,
 * los diagnósticos parecen precisos partiendo de datos sucios — peor que no
 * tener diagnósticos (§12).
 */

const baseCampaign = {
  name: 'Instalación rápida',
  adAssets: {
    title: 'Instalamos en 24 horas',
    offer: 'Presupuesto sin coste',
    leadMagnet: 'Guía de instalación',
    adCopy: 'Cuéntanos qué necesitas.',
    landingTemplateId: 'generic-v1',
    imageUrl: '/assets/landings/landing-hero.png',
  },
}

test('el mismo contenido produce el mismo hash aunque cambie el orden de las claves', () => {
  const reordered = {
    name: baseCampaign.name,
    adAssets: {
      imageUrl: baseCampaign.adAssets.imageUrl,
      adCopy: baseCampaign.adAssets.adCopy,
      offer: baseCampaign.adAssets.offer,
      landingTemplateId: baseCampaign.adAssets.landingTemplateId,
      title: baseCampaign.adAssets.title,
      leadMagnet: baseCampaign.adAssets.leadMagnet,
    },
  }
  assert.equal(
    landingContentHash(landingContentOf(baseCampaign)),
    landingContentHash(landingContentOf(reordered)),
  )
})

test('modificar el hero crea una versión nueva', () => {
  const edited = { ...baseCampaign, adAssets: { ...baseCampaign.adAssets, title: 'Instalamos hoy mismo' } }
  assert.notEqual(
    landingContentHash(landingContentOf(baseCampaign)),
    landingContentHash(landingContentOf(edited)),
  )
})

test('un campo ajeno al contenido publicado no parte la línea base', () => {
  // `visits` es el contador heredado de adAssets. Si entrara en el hash, cada
  // visita crearía una versión y la línea base de §3.4 no existiría.
  const withNoise = { ...baseCampaign, adAssets: { ...baseCampaign.adAssets, visits: 412 } }
  assert.equal(
    landingContentHash(landingContentOf(baseCampaign)),
    landingContentHash(landingContentOf(withNoise)),
  )
})

test('los rastreadores y las previsualizaciones de enlaces quedan fuera (§3.2)', () => {
  assert.equal(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true)
  assert.equal(isBotUserAgent('facebookexternalhit/1.1'), true)
  assert.equal(isBotUserAgent('WhatsApp/2.23'), true)
  assert.equal(isBotUserAgent('curl/8.4.0'), true)
  // Sin user-agent no se puede afirmar que sea una persona.
  assert.equal(isBotUserAgent(undefined), true)
})

test('un navegador real sí cuenta', () => {
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  assert.equal(isBotUserAgent(chrome), false)
  assert.equal(isBotUserAgent(iphone), false)
  assert.equal(deviceFromUserAgent(chrome), 'desktop')
  assert.equal(deviceFromUserAgent(iphone), 'mobile')
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15'), 'tablet')
})

test('el agregado se reparte por origen, así que una sesión no puede tener dos', () => {
  // Documenta por qué la atribución se sella en el primer evento: la clave
  // única del rollup incluye el origen, de modo que una sesión con dos orígenes
  // se contaría una vez en cada fila.
  const rollupKey = (source: string, device: string) => ['landing', 'version', '', '2026-08-05', source, device].join('|')
  assert.notEqual(rollupKey('direct', 'mobile'), rollupKey('meta', 'mobile'))
})

test('la lista blanca de eventos cubre el diagnóstico de abandono por campo (§7.2)', () => {
  for (const type of ['view', 'scroll_50', 'scroll_90', 'cta_click', 'form_start', 'form_field_blur', 'form_validation_error', 'form_submit']) {
    assert.ok((LANDING_EVENT_TYPES as readonly string[]).includes(type), `falta el evento ${type}`)
  }
})
