// Lógica pura del asistente de nueva campaña (AdsWizardPage). Vive aquí para
// poder probarla con node:test sin montar React: construcción del payload,
// precedencia de la audiencia, variantes de creatividad, recomendaciones y el
// mensaje tras crear la campaña.
//
// Los textos salen de src/i18n/messages/ads.js: las funciones reciben `t`
// (el de useI18n) y, si no se pasa, usan el traductor en español de abajo,
// que no depende de React y sirve igual en node:test.

import adsMessages from '../i18n/messages/ads.js'

/** Traductor mínimo sobre messages/ads.js para uso fuera de React (tests, defaults). */
export function adsTranslator(locale = 'es') {
  const bundle = adsMessages[locale] ?? adsMessages.es
  return (key, variables) => {
    const value = key.split('.').reduce((node, part) => node?.[part], bundle)
      ?? key.split('.').reduce((node, part) => node?.[part], adsMessages.es)
    if (!variables || typeof value !== 'string') return value
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(variables[name] ?? ''))
  }
}

const defaultT = adsTranslator('es')

/**
 * Lo que escribe el usuario manda sobre el público conocido del perfil
 * orgánico: el perfil es un punto de partida, no una imposición.
 */
export function resolveAudience(typed, known) {
  const own = typeof typed === 'string' ? typed.trim() : ''
  if (own) return own
  return typeof known === 'string' ? known.trim() : ''
}

function clip(value, max) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}

/**
 * Tres ángulos de anuncio construidos con el brief (qué se promociona y qué se
 * busca). Son copy inicial: la variante elegida viaja al backend y se usa al
 * publicar solo si la campaña no tiene creatividades aprobadas en el plan.
 */
export function buildCreativeVariants({ campaignFocus = '', objetivo = '', audience = '' } = {}, t = defaultT) {
  const focus = clip(campaignFocus, 70) || t('adsWizard.lib.yourOffer')
  const goal = clip(objetivo, 80).toLowerCase() || t('adsWizard.lib.nextStep')
  const who = clip(audience, 60)
  return [
    {
      label: t('adsWizard.lib.resultLabel'),
      title: clip(t('adsWizard.lib.resultTitle', { focus }), 120),
      body: clip(t('adsWizard.lib.resultBody', { focus: focus.toLowerCase(), goal }) + (who ? t('adsWizard.lib.resultAudience', { who: who.toLowerCase() }) : ''), 500),
      cta: t('adsWizard.lib.resultCta'),
    },
    {
      label: t('adsWizard.lib.speedLabel'),
      title: clip(t('adsWizard.lib.speedTitle', { focus }), 120),
      body: clip(t('adsWizard.lib.speedBody', { goal }), 500),
      cta: t('adsWizard.lib.speedCta'),
    },
    {
      label: t('adsWizard.lib.offerLabel'),
      title: clip(t('adsWizard.lib.offerTitle', { focus: focus.toLowerCase() }), 120),
      body: clip(t('adsWizard.lib.offerBody', { goal }), 500),
      cta: t('adsWizard.lib.offerCta'),
    },
  ]
}

export function pickCreative(variants, index) {
  if (!Array.isArray(variants) || !variants.length) return null
  const safe = Number.isInteger(index) && index >= 0 ? index % variants.length : 0
  return variants[safe]
}

/**
 * Payload de POST /api/ads/wizard. El margen y el % de adquisición solo viajan
 * si son positivos: el backend los valida como opcionales, no como nulos.
 */
export function buildWizardPayload({
  vertical, objetivo, presupuesto, audience, knownAudience, campaignFocus,
  destination, knowledgeContext, strategy, margin, acquisitionShare, creative,
}) {
  const resolvedAudience = resolveAudience(audience, knownAudience)
  const marginValue = Number(margin)
  const shareValue = Number(acquisitionShare)
  return {
    vertical,
    objetivo: String(objetivo ?? '').trim(),
    presupuestoMensual: Number(presupuesto),
    ...(resolvedAudience ? { audience: resolvedAudience } : {}),
    campaignFocus: String(campaignFocus ?? '').trim(),
    destination,
    knowledgeContext: knowledgeContext ?? null,
    ...(strategy ? { strategy } : {}),
    ...(marginValue > 0 ? { marginPerSaleCents: Math.round(marginValue * 100) } : {}),
    ...(shareValue > 0 ? { acquisitionSharePct: Math.min(100, Math.round(shareValue)) } : {}),
    ...(creative ? { creative: { label: creative.label, title: creative.title, body: creative.body, cta: creative.cta } } : {}),
  }
}

/**
 * Efecto de "Aplicar" en una recomendación. Devuelve el cambio de estado y,
 * si procede, el id del campo que hay que enfocar; la página lo aplica.
 * - audience: usa la audiencia recomendada por la estrategia.
 * - objective: enfoca el objetivo y, si está vacío, propone uno medible.
 * - creative: pasa a la siguiente variante de anuncio.
 */
export function applyRecommendationEffect(recommendation, { strategy, objetivo = '', creativeIndex = 0, variantCount = 3 } = {}, t = defaultT) {
  const action = recommendation?.action
  if (action === 'audience') {
    return strategy?.audience ? { patch: { audience: strategy.audience }, focusId: 'ads-audience' } : { patch: {}, focusId: 'ads-audience' }
  }
  if (action === 'objective') {
    const patch = String(objetivo).trim() ? {} : { objetivo: t('adsWizard.lib.defaultObjective') }
    return { patch, focusId: 'ads-objective', hint: recommendation.body || '' }
  }
  if (action === 'creative') {
    return { patch: { creativeIndex: (creativeIndex + 1) % Math.max(1, variantCount) }, focusId: null }
  }
  return { patch: {}, focusId: null }
}

/**
 * El borrador guarda el brief completo dentro de strategy.brief (el modelo
 * AdWizardDraft no tiene columnas para margen, % de adquisición, foco o
 * destino, y así no hace falta migración).
 */
export function serializeDraftStrategy(strategy, brief) {
  const base = strategy
    ? { ...strategy, recommendations: (strategy.recommendations || []).map(({ icon, ...rest }) => rest) }
    : {}
  return {
    ...base,
    brief: {
      campaignFocus: brief.campaignFocus ?? '',
      destination: brief.destination ?? 'landing',
      knowledgeContext: brief.knowledgeContext ?? null,
      margin: brief.margin ?? '',
      acquisitionShare: brief.acquisitionShare ?? '',
    },
  }
}

/** Una estrategia guardada solo con `brief` no es una estrategia generada. */
export function hasGeneratedStrategy(strategy) {
  return Boolean(strategy && (strategy.score != null || strategy.forecast))
}

/** Etiqueta honesta del pronóstico según su fuente. */
export function describeForecast(strategy, t = defaultT) {
  const benchmark = !strategy || strategy.forecastSource === 'sector_benchmark' || !strategy.forecastSource
  return benchmark
    ? { badge: t('adsWizard.lib.forecastBadge'), note: strategy?.forecastNote || t('adsWizard.lib.forecastNote') }
    : { badge: t('adsWizard.lib.estimate'), note: strategy.forecastNote || '' }
}

/** Quién redactó la estrategia, para el estado del borrador. */
export function describeStrategyProvider(provider, t = defaultT) {
  if (provider === 'deepseek' || provider === 'claude') return t('adsWizard.lib.providerAi')
  return t('adsWizard.lib.providerRules')
}

/**
 * Mensaje tras crear la campaña. `published`/`publishError` los devuelve el
 * backend; sin ellos (versión anterior) se deduce del estado de Meta.
 */
export function describeWizardOutcome(campaign, t = defaultT) {
  if (!campaign) return null
  if (campaign.published || campaign.metaCampaignId) {
    return { tone: 'success', text: t('adsWizard.lib.outcomeSuccess') }
  }
  const error = campaign.publishError
  if (error?.code === 'META_NOT_CONNECTED' || !error) {
    return { tone: 'info', text: t('adsWizard.lib.outcomeInfo') }
  }
  // El mensaje del error es dato del backend: se inserta, no se traduce.
  return { tone: 'warning', text: t('adsWizard.lib.outcomeWarning', { message: error.message }) }
}
