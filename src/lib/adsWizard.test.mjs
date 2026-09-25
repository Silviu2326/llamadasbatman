import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  adsTranslator,
  applyRecommendationEffect,
  buildCreativeVariants,
  buildWizardPayload,
  describeForecast,
  describeStrategyProvider,
  describeWizardOutcome,
  hasGeneratedStrategy,
  pickCreative,
  resolveAudience,
  serializeDraftStrategy,
} from './adsWizard.js'

test('la audiencia escrita por el usuario tiene prioridad sobre la conocida', () => {
  assert.equal(resolveAudience('  Clínicas en Madrid ', 'Pymes'), 'Clínicas en Madrid')
  assert.equal(resolveAudience('   ', 'Pymes'), 'Pymes')
  assert.equal(resolveAudience('', ''), '')
  assert.equal(resolveAudience(undefined, undefined), '')
})

test('el payload del asistente incluye la creatividad elegida, margen y % y respeta la audiencia', () => {
  const variants = buildCreativeVariants({ campaignFocus: 'Clases de pádel', objetivo: 'Conseguir reservas' })
  const payload = buildWizardPayload({
    vertical: 'Deporte',
    objetivo: ' Conseguir reservas ',
    presupuesto: '600',
    audience: 'Adultos de Valencia',
    knownAudience: 'Público genérico',
    campaignFocus: ' Clases de pádel ',
    destination: 'landing',
    knowledgeContext: null,
    strategy: null,
    margin: '90.5',
    acquisitionShare: '30',
    creative: pickCreative(variants, 1),
  })
  assert.equal(payload.audience, 'Adultos de Valencia')
  assert.equal(payload.presupuestoMensual, 600)
  assert.equal(payload.objetivo, 'Conseguir reservas')
  assert.equal(payload.campaignFocus, 'Clases de pádel')
  assert.equal(payload.marginPerSaleCents, 9050)
  assert.equal(payload.acquisitionSharePct, 30)
  assert.deepEqual(Object.keys(payload.creative).sort(), ['body', 'cta', 'label', 'title'])
  assert.equal(payload.creative.label, 'Rapidez')
  assert.ok(!('strategy' in payload))

  const minimal = buildWizardPayload({ vertical: 'x', objetivo: 'y', presupuesto: 1, campaignFocus: 'z', destination: 'landing', margin: '', acquisitionShare: '0' })
  assert.ok(!('audience' in minimal))
  assert.ok(!('marginPerSaleCents' in minimal))
  assert.ok(!('acquisitionSharePct' in minimal))
  assert.ok(!('creative' in minimal))
})

test('las variantes usan el brief y respetan los límites del backend', () => {
  const variants = buildCreativeVariants({ campaignFocus: 'A'.repeat(300), objetivo: 'Reservas', audience: 'Pymes' })
  assert.equal(variants.length, 3)
  for (const v of variants) {
    assert.ok(v.title.length <= 120 && v.body.length <= 500 && v.cta.length <= 40 && v.label.length <= 60)
  }
  assert.match(buildCreativeVariants({ campaignFocus: 'Clases de pádel' })[0].title, /Clases de pádel/)
  assert.equal(pickCreative(variants, 4).label, variants[1].label)
  assert.equal(pickCreative([], 0), null)
})

test('aplicar recomendaciones: audiencia, objetivo y creatividad', () => {
  const strategy = { audience: 'Responsables de operaciones' }
  assert.deepEqual(applyRecommendationEffect({ action: 'audience' }, { strategy }).patch, { audience: 'Responsables de operaciones' })

  const objectiveEmpty = applyRecommendationEffect({ action: 'objective', body: 'Promete un resultado medible' }, { objetivo: '' })
  assert.equal(objectiveEmpty.focusId, 'ads-objective')
  assert.ok(objectiveEmpty.patch.objetivo)
  assert.equal(objectiveEmpty.hint, 'Promete un resultado medible')
  // Con objetivo ya escrito no se pisa: solo se enfoca el campo.
  assert.deepEqual(applyRecommendationEffect({ action: 'objective' }, { objetivo: 'Mío' }).patch, {})

  assert.equal(applyRecommendationEffect({ action: 'creative' }, { creativeIndex: 2, variantCount: 3 }).patch.creativeIndex, 0)
  assert.deepEqual(applyRecommendationEffect({ action: 'otra' }).patch, {})
})

test('el borrador guarda margen y % dentro de strategy.brief', () => {
  const serialized = serializeDraftStrategy(null, { campaignFocus: 'Pádel', destination: 'landing', margin: '90', acquisitionShare: '25' })
  assert.deepEqual(serialized.brief, { campaignFocus: 'Pádel', destination: 'landing', knowledgeContext: null, margin: '90', acquisitionShare: '25' })
  assert.equal(hasGeneratedStrategy(serialized), false)
  const withStrategy = serializeDraftStrategy({ score: 70, recommendations: [{ id: 'a', icon: () => null }] }, { campaignFocus: 'x' })
  assert.equal(hasGeneratedStrategy(withStrategy), true)
  assert.ok(!('icon' in withStrategy.recommendations[0]))
})

test('pronóstico y proveedor se etiquetan con honestidad', () => {
  assert.equal(describeForecast({ forecastSource: 'sector_benchmark' }).badge, 'Referencia orientativa del sector')
  assert.match(describeForecast(null).note, /No es una predicción/)
  assert.equal(describeForecast({ forecastSource: 'account', forecastNote: 'nota propia' }).note, 'nota propia')
  assert.match(describeStrategyProvider('heuristic'), /sin IA/)
  assert.match(describeStrategyProvider('deepseek'), /IA/)

  // Con el traductor inglés cambian los textos, no la lógica.
  const en = adsTranslator('en')
  assert.equal(describeForecast(null, en).badge, 'Indicative sector reference')
  assert.match(describeStrategyProvider('heuristic', en), /no AI/)
})

test('las funciones de texto respetan el idioma y no traducen datos del usuario', () => {
  const en = adsTranslator('en')
  const variants = buildCreativeVariants({ campaignFocus: 'Clases de pádel', objetivo: 'Conseguir reservas', audience: 'Pymes' }, en)
  assert.equal(variants[0].label, 'Result')
  assert.match(variants[0].title, /^Clases de pádel: results/)
  assert.match(variants[0].body, /Designed for pymes\./)
  assert.equal(variants[1].cta, 'Contact us')
  assert.equal(applyRecommendationEffect({ action: 'objective' }, { objetivo: '' }, en).patch.objetivo, 'Get qualified contact requests')
  const failed = describeWizardOutcome({ published: false, publishError: { code: 'X', message: 'Falta la página' } }, en)
  assert.match(failed.text, /could not be published .*Falta la página/)
  // Una clave inexistente en en cae al español y una desconocida devuelve undefined.
  assert.equal(adsTranslator('fr')('adsWizard.lib.estimate'), 'Estimación')
  assert.equal(en('adsWizard.lib.nope'), undefined)
})

test('el resultado de crear la campaña explica si se publicó', () => {
  assert.equal(describeWizardOutcome({ published: true }).tone, 'success')
  assert.equal(describeWizardOutcome({ published: false, publishError: { code: 'META_NOT_CONNECTED', message: 'x' } }).tone, 'info')
  const failed = describeWizardOutcome({ published: false, publishError: { code: 'META_PAGE_MISSING', message: 'Falta la página' } })
  assert.equal(failed.tone, 'warning')
  assert.match(failed.text, /Falta la página/)
  assert.equal(describeWizardOutcome(null), null)
})
