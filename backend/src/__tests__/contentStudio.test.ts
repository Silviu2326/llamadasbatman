import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PIECE_CHANNELS, PIECE_FORMATS, PIECE_OBJECTIVES, WRITTEN_FORMATS,
  defaultObjectiveFor, normalizeChannels, normalizeObjective, pieceImageSchema, withFallbacks,
} from '../services/contentStudio.service'
import { OPPORTUNITY_TYPES } from '../services/contentOpportunity.service'
import {
  REJECTION_REASONS, attributionByUtm, emailHtml, publishTargetFor, renderPiece, valueByLead,
} from '../services/contentApproval.service'

/**
 * Reglas del Estudio y la Sala (`docs/xarly/pantallas.md` §2 y §3).
 */

test('la atomización produce las seis piezas de la fase 2', () => {
  // Las tres del MVP más las tres de la idea 8: stories, email y locución.
  assert.deepEqual([...PIECE_FORMATS], ['post', 'carousel', 'reel_script', 'stories', 'email', 'voiceover'])
  // La locución no la escribe el modelo: sale del guion de Reel ya revisado.
  assert.ok(!WRITTEN_FORMATS.includes('voiceover' as never))
})

test('un formato que el modelo se deja no arrastra a los demás', () => {
  // Que falten las stories no puede tirar el post que sí vino bien escrito.
  const fallback = {
    post: { text: 'respaldo' },
    carousel: { title: 'respaldo', slides: ['a', 'b', 'c'] },
    reel_script: { hook: 'h', body: 'b', cta: 'c' },
    stories: { stories: [{ text: 'a', sticker: 's' }, { text: 'b', sticker: 's' }, { text: 'c', sticker: 's' }] },
    email: { subject: 's', preheader: 'p', body: 'b', cta: 'c' },
  }
  const result = withFallbacks({ post: { text: 'del modelo' }, stories: { stories: [{ text: 'solo una' }] } }, fallback)
  assert.equal(result.post.text, 'del modelo')
  // Las stories incompletas se descartan enteras: dos de tres no es el formato.
  assert.equal(result.stories.stories.length, 3)
  assert.equal(result.stories.stories[0].text, 'a')
  assert.equal(result.email.subject, 's')
})

test('cada formato se publica por donde le corresponde', () => {
  // El email no es un post de Instagram y la locución no se publica sola.
  assert.equal(publishTargetFor('post'), 'social')
  assert.equal(publishTargetFor('stories'), 'social')
  assert.equal(publishTargetFor('email'), 'email')
  assert.equal(publishTargetFor('voiceover'), 'none')
})

test('los motivos de rechazo son un vocabulario cerrado', () => {
  // Texto libre solamente haría imposible agregar el aprendizaje después.
  assert.ok(REJECTION_REASONS.length >= 3)
  for (const reason of REJECTION_REASONS) {
    assert.match(reason, /^[a-z_]+$/, `motivo no canónico: ${reason}`)
  }
})

test('la imagen de una pieza solo puede ser una URL descargable', () => {
  // Acaba en un <img> de la interfaz y en el borrador que Metricool descarga:
  // esquemas que zod da por válidos pero nadie puede descargar no valen.
  assert.ok(pieceImageSchema.safeParse({ imageUrl: 'https://cdn.example.com/a.png' }).success)
  for (const invalid of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'ftp://host/a.png', 'no-es-una-url']) {
    assert.equal(pieceImageSchema.safeParse({ imageUrl: invalid }).success, false, `aceptada: ${invalid}`)
  }
})

test('quitar la imagen de una pieza es una entrada válida', () => {
  // Sin `null` explícito, "quitar" tendría que inventarse un endpoint aparte.
  assert.ok(pieceImageSchema.safeParse({ imageUrl: null }).success)
  // Y el campo es obligatorio: un cuerpo vacío borraría la imagen sin pedirlo.
  assert.equal(pieceImageSchema.safeParse({}).success, false)
})

test('cada formato tiene un UTM distinto dentro de la misma oportunidad', () => {
  // Es lo que hace posible "leads por pieza" (§4): sin esto, dos piezas de la
  // misma campaña y canal serían indistinguibles en la atribución.
  const utm = (format: string, oppId: string) => `pieza-${format}-${oppId.slice(-8)}`
  const utms = new Set(PIECE_FORMATS.map(format => utm(format, 'opp-12345678')))
  assert.equal(utms.size, PIECE_FORMATS.length)
})

test('cada tipo de oportunidad abre el Estudio con un objetivo del vocabulario', () => {
  // §1 dice que el chip es "el modo objetivo elegible al generar": si un tipo
  // cayera fuera del vocabulario, el chip y el selector dirían cosas distintas.
  for (const type of OPPORTUNITY_TYPES) {
    assert.ok(PIECE_OBJECTIVES.includes(defaultObjectiveFor(type)), `tipo sin objetivo: ${type}`)
  }
  assert.equal(normalizeObjective('RESOLVER_OBJECION'), 'resolver_objecion')
  assert.equal(normalizeObjective('vender mucho'), null)
})

test('los canales inválidos se caen antes de llegar a Metricool', () => {
  // Un canal que Metricool no conoce falla al crear el borrador, donde el
  // usuario ya no puede corregirlo.
  assert.deepEqual(normalizeChannels(['Instagram', 'instagram', 'mastodon']), ['instagram'])
  assert.deepEqual(normalizeChannels(['linkedin', 'x']), ['linkedin', 'x'])
  // Sin canales válidos se publica donde se publicaba antes del selector.
  assert.deepEqual(normalizeChannels([]), ['instagram'])
  assert.deepEqual(normalizeChannels(undefined), ['instagram'])
  for (const channel of PIECE_CHANNELS) assert.deepEqual(normalizeChannels([channel]), [channel])
})

test('la atribución por pieza no suma la conversión a la visita', () => {
  // Era el error que inflaba §4: contar todos los eventos del UTM hacía que una
  // pieza con 2 visitas y 1 lead enseñara 3 visitas.
  const utm = 'pieza-post-12345678'
  const rows = [
    { content: utm, type: 'landing_view', leadId: null, source: 'instagram', medium: 'organic_social' },
    { content: utm, type: 'landing_view', leadId: null, source: 'instagram', medium: 'organic_social' },
    { content: utm, type: 'landing_lead', leadId: 'lead-1', source: 'instagram', medium: 'organic_social' },
  ]
  const entry = attributionByUtm(rows).get(utm)
  assert.equal(entry?.visits, 2)
  assert.equal(entry?.leadIds.size, 1)
})

test('la atribución cuenta leads, no formularios, y no se apunta lo pagado', () => {
  const utm = 'pieza-carousel-12345678'
  const rows = [
    // El mismo lead dos veces sigue siendo un lead.
    { content: utm, type: 'landing_lead', leadId: 'lead-1', source: 'linkedin', medium: 'organic_social' },
    { content: utm, type: 'landing_lead', leadId: 'lead-1', source: 'linkedin', medium: 'organic_social' },
    // Un lead que llegó por un anuncio lo pagó Ads, no la pieza.
    { content: utm, type: 'landing_lead', leadId: 'lead-2', source: 'meta', medium: 'paid_social' },
  ]
  const entry = attributionByUtm(rows).get(utm)
  assert.equal(entry?.leadIds.size, 1)
  assert.equal(entry?.visits, 0)
})

test('los euros ganados y los abiertos no se suman nunca', () => {
  // Es la métrica de la fase 4: mezclar lo cerrado con lo abierto daría una
  // cifra que no es ninguna de las dos, y lo perdido no es un resultado.
  const byLead = valueByLead([
    { leadId: 'lead-1', stage: 'closed_won', value: '1200.50', currency: 'EUR' },
    { leadId: 'lead-1', stage: 'proposal', value: '800', currency: 'EUR' },
    { leadId: 'lead-2', stage: 'closed_lost', value: '5000', currency: 'EUR' },
    // Una oportunidad sin importe no aporta euros, y no debe romper la suma.
    { leadId: 'lead-3', stage: 'closed_won', value: null, currency: 'EUR' },
  ])
  assert.equal(byLead.get('lead-1')?.won, 1200.5)
  assert.equal(byLead.get('lead-1')?.open, 800)
  // Lo perdido no cuenta en ninguna de las dos columnas.
  assert.equal(byLead.get('lead-2'), undefined)
  assert.equal(byLead.get('lead-3'), undefined)
})

test('cada formato nuevo se renderiza con su forma, no con la del Reel', () => {
  // Antes cualquier formato desconocido caía en hook/body/cta, así que unas
  // stories se habrían publicado vacías sin que nadie lo notara.
  assert.equal(
    renderPiece({ format: 'stories', body: { stories: [{ text: 'una' }, { text: 'dos' }, { text: '' }] } }),
    'una\n\ndos',
  )
  assert.equal(
    renderPiece({ format: 'email', body: { subject: 'Asunto', preheader: 'Previo', body: 'Cuerpo' } }),
    'Asunto\n\nPrevio\n\nCuerpo',
  )
})

test('el email que viaja a Mautic escapa lo que escribió el modelo', () => {
  // El cuerpo acaba dentro del HTML de una plantilla: sin escapar, un "<" del
  // texto se convertiría en marcado dentro del correo de un cliente.
  const html = emailHtml({ body: 'Precio < 100 & sin "letra pequeña"\n\nSegundo párrafo', cta: 'Responder' })
  assert.match(html, /Precio &lt; 100 &amp; sin &quot;letra pequeña&quot;/)
  assert.equal((html.match(/<p>/g) ?? []).length, 3)
})
