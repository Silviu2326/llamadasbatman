// Lógica pura del asistente de nueva campaña (AdsWizardPage). Vive aquí para
// poder probarla con node:test sin montar React: construcción del payload,
// precedencia de la audiencia, variantes de creatividad, recomendaciones y el
// mensaje tras crear la campaña.

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
export function buildCreativeVariants({ campaignFocus = '', objetivo = '', audience = '' } = {}) {
  const focus = clip(campaignFocus, 70) || 'tu oferta'
  const goal = clip(objetivo, 80).toLowerCase() || 'dar el siguiente paso'
  const who = clip(audience, 60)
  return [
    {
      label: 'Resultado',
      title: clip(`${focus}: resultados que se notan`, 120),
      body: clip(`Descubre cómo ${focus.toLowerCase()} te ayuda a ${goal}.${who ? ` Pensado para ${who.toLowerCase()}.` : ''}`, 500),
      cta: 'Más información',
    },
    {
      label: 'Rapidez',
      title: clip(`${focus}, sin esperas`, 120),
      body: clip(`Da el primer paso hoy: te respondemos rápido y sin compromiso para ${goal}.`, 500),
      cta: 'Contactar',
    },
    {
      label: 'Oferta',
      title: clip(`Empieza con ${focus.toLowerCase()}`, 120),
      body: clip(`Plazas y horarios limitados. Reserva ahora y asegura tu sitio para ${goal}.`, 500),
      cta: 'Reservar',
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
export function applyRecommendationEffect(recommendation, { strategy, objetivo = '', creativeIndex = 0, variantCount = 3 } = {}) {
  const action = recommendation?.action
  if (action === 'audience') {
    return strategy?.audience ? { patch: { audience: strategy.audience }, focusId: 'ads-audience' } : { patch: {}, focusId: 'ads-audience' }
  }
  if (action === 'objective') {
    const patch = String(objetivo).trim() ? {} : { objetivo: 'Conseguir solicitudes de contacto cualificadas' }
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
export function describeForecast(strategy) {
  const benchmark = !strategy || strategy.forecastSource === 'sector_benchmark' || !strategy.forecastSource
  return benchmark
    ? {
        badge: 'Referencia orientativa del sector',
        note: strategy?.forecastNote
          || 'No es una predicción: son costes medios del sector aplicados a tu presupuesto, sin datos de tu cuenta. Las cifras reales aparecerán en Ads cuando la campaña tenga resultados.',
      }
    : { badge: 'Estimación', note: strategy.forecastNote || '' }
}

/** Quién redactó la estrategia, para el estado del borrador. */
export function describeStrategyProvider(provider) {
  if (provider === 'deepseek' || provider === 'claude') return 'Estrategia generada con IA y guardada'
  return 'Estrategia generada con reglas por sector (sin IA)'
}

/**
 * Mensaje tras crear la campaña. `published`/`publishError` los devuelve el
 * backend; sin ellos (versión anterior) se deduce del estado de Meta.
 */
export function describeWizardOutcome(campaign) {
  if (!campaign) return null
  if (campaign.published || campaign.metaCampaignId) {
    return { tone: 'success', text: 'Campaña creada y enviada a Meta en pausa. Revísala y actívala cuando esté lista.' }
  }
  const error = campaign.publishError
  if (error?.code === 'META_NOT_CONNECTED' || !error) {
    return { tone: 'info', text: 'Campaña creada en borrador. Conecta una cuenta de Meta para publicarla.' }
  }
  return { tone: 'warning', text: `Campaña creada en borrador, pero no se pudo publicar en Meta: ${error.message}` }
}
