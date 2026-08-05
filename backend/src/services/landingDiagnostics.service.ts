import { prisma } from '../lib/prisma'
import { computeBaseline, describeBaseline, type LandingBaseline } from './landingBaseline.service'
import { latestHealthByLanding } from './landingHealth.service'

/**
 * Los tres diagnósticos N1 del MVP — docs/xarly/landings.md §4.
 *
 * Todos siguen el mismo patrón: **detectar → explicar → demostrar → recomendar
 * → permitir actuar**. Un diagnóstico sin evidencia y sin impacto estimado no
 * se emite; "mejorará la conversión" no es una recomendación, es un deseo.
 *
 * N1 significa recomendar y explicar: nada de lo que hay aquí modifica una
 * landing por su cuenta.
 */

export type DiagnosisType =
  | 'traffic_without_leads'
  | 'form_field_abandonment'
  | 'possible_message_mismatch'

export type Confidence = 'low' | 'medium' | 'high'
export type Effort = 'low' | 'medium' | 'high'

export interface ImpactRange {
  /** Leads adicionales al mes, extremo bajo y alto. */
  minLeads: number
  maxLeads: number
  /** Oportunidades estimadas aplicando la tasa de cualificación real. */
  minOpportunities: number | null
  maxOpportunities: number | null
}

export interface LandingDiagnosis {
  id: string
  landingKey: string
  campaignId: string
  landingName: string
  type: DiagnosisType
  level: 'N1'
  title: string
  problem: string
  evidence: string[]
  recommendation: string
  impact: ImpactRange
  confidence: Confidence
  effort: Effort
  risk: 'low' | 'medium' | 'high'
  /** impacto × confianza ÷ esfuerzo (§5.1). */
  priority: number
  baselineUsed: string | null
}

const CONFIDENCE_WEIGHT: Record<Confidence, number> = { low: 0.3, medium: 0.65, high: 1 }
const EFFORT_WEIGHT: Record<Effort, number> = { low: 1, medium: 2, high: 4 }

/** Sesiones mínimas para que un diagnóstico de campo sea algo más que ruido. */
const MIN_EXPOSED_FOR_FIELD_DIAGNOSIS = 40
/** Por debajo de esta tasa de abandono, el campo no es el problema. */
const FIELD_ABANDONMENT_THRESHOLD = 0.45
/** Caída relativa frente a la línea base que se considera degradación. */
const DEGRADATION_THRESHOLD = -0.25
/** Por debajo de este alcance del hero, la gente se va antes de leer nada. */
const WEAK_SCROLL_REACH = 0.4

/**
 * Cuánto del abandono en un campo se recupera al hacerlo opcional. Es un rango
 * declarado, no una predicción: se muestra siempre como rango para que nadie lo
 * lea como una promesa.
 */
const FIELD_FIX_RECOVERY = { min: 0.25, max: 0.5 }

const DAY_MS = 24 * 60 * 60 * 1000

function confidenceFromSessions(sessions: number): Confidence {
  if (sessions >= 1000) return 'high'
  if (sessions >= 200) return 'medium'
  return 'low'
}

export function priorityOf(impact: ImpactRange, confidence: Confidence, effort: Effort) {
  const midpoint = (impact.minLeads + impact.maxLeads) / 2
  return Number(((midpoint * CONFIDENCE_WEIGHT[confidence]) / EFFORT_WEIGHT[effort]).toFixed(2))
}

function toMonthly(value: number, windowDays: number) {
  if (windowDays <= 0) return 0
  return (value / windowDays) * 30
}

/**
 * Convierte leads en oportunidades con la tasa real de la landing. Sin ventas
 * ni cualificados medidos devuelve `null`: inventar una tasa de cualificación
 * es exactamente el tipo de número que hace desconfiar de todo lo demás.
 */
export function opportunitiesFrom(leads: number, qualificationRate: number | null) {
  if (qualificationRate === null) return null
  return Math.round(leads * qualificationRate * 10) / 10
}

interface FieldStat {
  exposed: number
  interacted: number
  completed: number
  validationErrors: number
  averageMs: number | null
}

function readFieldStats(value: unknown): Record<string, FieldStat> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, FieldStat>
}

/** Etiquetas legibles de los campos del formulario público. */
const FIELD_LABELS: Record<string, string> = {
  name: 'nombre',
  phone: 'teléfono',
  email: 'email',
  contactTime: 'franja horaria',
  consent: 'consentimiento',
}

const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field

/** Campos sin los que la solicitud no se puede atender: no se tocan. */
const ESSENTIAL_FIELDS = new Set(['name', 'phone', 'consent'])

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'con', 'sin', 'para', 'por',
  'que', 'en', 'del', 'al', 'tu', 'tus', 'su', 'sus', 'te', 'se', 'lo', 'más', 'mas', 'muy', 'ya',
  'nos', 'nuestro', 'nuestra', 'este', 'esta', 'esto', 'como', 'qué', 'cual', 'desde', 'hasta',
])

export function terms(text: string | null | undefined) {
  if (!text) return new Set<string>()
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      // Rango de diacríticos combinantes (U+0300–U+036F): "instalación" y
      // "instalacion" tienen que contar como el mismo término.
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(word => word.length > 3 && !STOPWORDS.has(word))
  )
}

/** Solapamiento de Jaccard entre la promesa del anuncio y la de la landing. */
export function termOverlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return null
  let shared = 0
  for (const term of a) if (b.has(term)) shared += 1
  const union = new Set([...a, ...b]).size
  return union ? Number((shared / union).toFixed(3)) : null
}

interface DiagnosisContext {
  campaignId: string
  landingKey: string
  landingName: string
  baseline: LandingBaseline
  fieldStats: Record<string, FieldStat>
  windowDays: number
  qualificationRate: number | null
  health: { verdict: string; ttfbMs: number | null; totalMs: number | null; statusCode: number | null; heroImageBytes: number | null; mobileReady: boolean | null } | null
  adCopy: string | null
  offer: string | null
  heroTitle: string | null
  heroCopy: string | null
  /** Alcance del hero por canal, para la desalineación de mensaje. */
  scrollReachByChannel: Map<string, { sessions: number; scrollReach: number }>
}

/**
 * Diagnóstico 1 — tráfico sin leads (§4).
 *
 * Localiza el cuello: nadie pasa del hero, nadie abre el formulario, o la
 * página está rota o lenta. La causa técnica manda sobre las demás.
 */
function diagnoseTrafficWithoutLeads(context: DiagnosisContext): LandingDiagnosis | null {
  const { baseline, health } = context
  if (baseline.insufficientReason) return null
  if (baseline.delta === null || baseline.delta > DEGRADATION_THRESHOLD) return null

  const recent = baseline.recent
  const evidence: string[] = [
    `Conversión reciente ${(recent.conversion! * 100).toFixed(1)}% frente al ${(baseline.baseline.conversion! * 100).toFixed(1)}% de su ${describeBaseline(baseline)}.`,
    `${recent.sessions} sesiones en los últimos 7 días.`,
  ]

  let cause: string
  let recommendation: string
  let effort: Effort = 'medium'

  if (health && health.verdict === 'broken') {
    cause = `La landing responde con un error ${health.statusCode}: el problema no es el mensaje, es que la página no carga.`
    recommendation = 'Revisa la publicación de la landing antes de tocar ningún texto.'
    evidence.push(`Último chequeo técnico: HTTP ${health.statusCode}.`)
    effort = 'low'
  } else if (health && health.verdict === 'slow') {
    cause = 'La landing tarda en cargar y la gente se va antes de verla.'
    recommendation = 'Aligera la imagen principal y revisa el tiempo de respuesta antes de reescribir el mensaje.'
    if (health.ttfbMs) evidence.push(`Primer byte en ${health.ttfbMs} ms.`)
    if (health.heroImageBytes) evidence.push(`Imagen principal de ${Math.round(health.heroImageBytes / 1024)} KB.`)
  } else if (recent.scrollReach !== null && recent.scrollReach < WEAK_SCROLL_REACH) {
    cause = 'La mayoría se va sin pasar del primer pantallazo: el cuello está en el hero.'
    recommendation = 'Revisa titular y promesa del hero: hoy no retienen a quien llega.'
    evidence.push(`Solo el ${(recent.scrollReach * 100).toFixed(0)}% de las sesiones pasa de la mitad de la página.`)
  } else if (recent.formStartRate !== null && recent.ctaReach !== null && recent.formStartRate < recent.ctaReach / 2) {
    cause = 'Se pulsa el CTA pero casi nadie empieza el formulario.'
    recommendation = 'Acerca el formulario al CTA y reduce lo que se pide de entrada.'
    evidence.push(`${(recent.ctaReach * 100).toFixed(0)}% pulsa el CTA y solo el ${(recent.formStartRate * 100).toFixed(0)}% empieza el formulario.`)
  } else {
    cause = 'Llega tráfico y no se convierte, sin un cuello claro en hero, CTA ni salud técnica.'
    recommendation = 'Revisa la calidad del tráfico de origen antes de cambiar la landing.'
  }

  // Recuperar la línea base: ese es el techo honesto de la mejora.
  const missedRate = baseline.baseline.conversion! - recent.conversion!
  const missedLeadsWindow = Math.max(0, missedRate * recent.sessions)
  const monthly = toMonthly(missedLeadsWindow, 7)
  const impact: ImpactRange = {
    minLeads: Math.floor(monthly * 0.5),
    maxLeads: Math.ceil(monthly),
    minOpportunities: opportunitiesFrom(Math.floor(monthly * 0.5), context.qualificationRate),
    maxOpportunities: opportunitiesFrom(Math.ceil(monthly), context.qualificationRate),
  }
  if (impact.maxLeads <= 0) return null

  const confidence = confidenceFromSessions(recent.sessions)
  return {
    id: `${context.landingKey}:traffic_without_leads`,
    landingKey: context.landingKey,
    campaignId: context.campaignId,
    landingName: context.landingName,
    type: 'traffic_without_leads',
    level: 'N1',
    title: 'Tráfico sin leads',
    problem: cause,
    evidence,
    recommendation,
    impact,
    confidence,
    effort,
    risk: 'low',
    priority: priorityOf(impact, confidence, effort),
    baselineUsed: describeBaseline(baseline),
  }
}

/**
 * Diagnóstico 2 — abandono de formulario por campo (§7.2).
 *
 * Medido sobre exposición real: la tasa se calcula sobre quien llegó al campo,
 * no sobre el total. Sin eso, el último campo del formulario siempre parece el
 * mejor porque poca gente llega hasta él.
 */
function diagnoseFieldAbandonment(context: DiagnosisContext): LandingDiagnosis | null {
  const candidates = Object.entries(context.fieldStats)
    .filter(([field, stat]) => !ESSENTIAL_FIELDS.has(field) && stat.exposed >= MIN_EXPOSED_FOR_FIELD_DIAGNOSIS)
    .map(([field, stat]) => ({
      field,
      stat,
      abandonment: stat.exposed ? (stat.exposed - stat.completed) / stat.exposed : 0,
    }))
    .filter(candidate => candidate.abandonment >= FIELD_ABANDONMENT_THRESHOLD)
    .sort((a, b) => b.abandonment - a.abandonment)

  const worst = candidates[0]
  if (!worst) return null

  const abandonersWindow = worst.stat.exposed - worst.stat.completed
  const monthlyAbandoners = toMonthly(abandonersWindow, context.windowDays)
  const impact: ImpactRange = {
    minLeads: Math.floor(monthlyAbandoners * FIELD_FIX_RECOVERY.min),
    maxLeads: Math.ceil(monthlyAbandoners * FIELD_FIX_RECOVERY.max),
    minOpportunities: opportunitiesFrom(Math.floor(monthlyAbandoners * FIELD_FIX_RECOVERY.min), context.qualificationRate),
    maxOpportunities: opportunitiesFrom(Math.ceil(monthlyAbandoners * FIELD_FIX_RECOVERY.max), context.qualificationRate),
  }
  if (impact.maxLeads <= 0) return null

  const evidence = [
    `El ${(worst.abandonment * 100).toFixed(0)}% de quienes llegaron al campo «${fieldLabel(worst.field)}» lo dejaron sin rellenar (${worst.stat.exposed} expuestos, ${worst.stat.completed} completados).`,
  ]
  if (worst.stat.averageMs) evidence.push(`Tiempo medio en el campo: ${(worst.stat.averageMs / 1000).toFixed(1)} s.`)
  if (worst.stat.validationErrors) evidence.push(`${worst.stat.validationErrors} errores de validación en ese campo.`)
  evidence.push(`Estimación calculada sobre recuperar entre el ${FIELD_FIX_RECOVERY.min * 100}% y el ${FIELD_FIX_RECOVERY.max * 100}% de quienes lo abandonan.`)

  const confidence = confidenceFromSessions(worst.stat.exposed)
  const effort: Effort = 'low'
  return {
    id: `${context.landingKey}:form_field_abandonment`,
    landingKey: context.landingKey,
    campaignId: context.campaignId,
    landingName: context.landingName,
    type: 'form_field_abandonment',
    level: 'N1',
    title: `Abandono en el campo «${fieldLabel(worst.field)}»`,
    problem: `El campo «${fieldLabel(worst.field)}» está frenando el envío del formulario.`,
    evidence,
    // El formulario público ya solo exige nombre, teléfono y consentimiento,
    // así que "hazlo opcional" no sería una recomendación válida para un campo
    // que ya lo es: la palanca real es retirarlo o pedirlo más tarde.
    recommendation: `Retira «${fieldLabel(worst.field)}» del formulario o pídelo después de la primera conversación: hoy solo frena el envío.`,
    impact,
    confidence,
    effort,
    risk: 'low',
    priority: priorityOf(impact, confidence, effort),
    baselineUsed: null,
  }
}

/**
 * Diagnóstico 3 — posible desalineación de mensaje (§6).
 *
 * Siempre "posible": CTR alto en origen y rebote alto en destino es una señal,
 * no una prueba. Antes de culpar al mensaje se descartan las causas técnicas, y
 * la confianza nunca sube de media.
 *
 * **Límite conocido del modelo de datos.** §6 pide comparar el ángulo
 * etiquetado del anuncio y su promesa principal con el hero de la landing. Hoy
 * el ángulo no existe como dato, y `adAssets.adCopy` alimenta a la vez el texto
 * del anuncio (`metaCampaignBuilder.service.ts` lo envía como `message`) y la
 * descripción del hero: compararlos daría siempre solapamiento total y un
 * "todo alineado" falso. Lo único que hoy se escribe por separado es el título
 * de la landing, así que la comparación se hace contra él — y cuando ni eso
 * existe, la ausencia de una promesa propia *es* el hallazgo.
 */
function diagnoseMessageMismatch(context: DiagnosisContext): LandingDiagnosis | null {
  // Una página rota o lenta explica el rebote sin necesidad de teorías sobre
  // el mensaje.
  if (context.health && (context.health.verdict === 'broken' || context.health.verdict === 'slow')) return null

  const channels = Array.from(context.scrollReachByChannel.entries())
    .filter(([channel, stats]) => channel !== 'direct' && stats.sessions >= 100)
    .sort((a, b) => a[1].scrollReach - b[1].scrollReach)

  const worst = channels[0]
  if (!worst || worst[1].scrollReach >= WEAK_SCROLL_REACH) return null

  const promise = new Set([...terms(context.adCopy), ...terms(context.offer)])
  const heroPromise = terms(context.heroTitle)
  const [channel, stats] = worst

  const evidence = [
    `El ${((1 - stats.scrollReach) * 100).toFixed(0)}% del tráfico de «${channel}» abandona antes del primer scroll (${stats.sessions} sesiones).`,
  ]

  if (!promise.size) return null

  if (!heroPromise.size) {
    // La landing no tiene una promesa propia escrita: el visitante llega desde
    // un anuncio concreto y se encuentra el texto genérico de la plantilla.
    evidence.push('La landing no tiene un titular propio: el visitante llega desde un anuncio concreto y se encuentra el texto genérico de la plantilla.')
  } else {
    const overlap = termOverlap(promise, heroPromise)
    if (overlap === null || overlap > 0.2) return null
    evidence.push(`La promesa del anuncio y el titular de la landing apenas comparten vocabulario (solapamiento ${(overlap * 100).toFixed(0)}%).`)
  }

  evidence.push('Chequeo técnico sin incidencias: la velocidad y el render móvil no explican el rebote.')

  const recentSessions = context.baseline.recent.sessions
  const recoverable = toMonthly(stats.sessions * (WEAK_SCROLL_REACH - stats.scrollReach), context.windowDays)
    * (context.baseline.baseline.conversion ?? context.baseline.recent.conversion ?? 0)
  const impact: ImpactRange = {
    minLeads: Math.floor(recoverable * 0.3),
    maxLeads: Math.ceil(recoverable),
    minOpportunities: opportunitiesFrom(Math.floor(recoverable * 0.3), context.qualificationRate),
    maxOpportunities: opportunitiesFrom(Math.ceil(recoverable), context.qualificationRate),
  }
  if (impact.maxLeads <= 0) return null

  // Nunca más de "media": la señal sugiere, no demuestra causalidad.
  const confidence: Confidence = confidenceFromSessions(recentSessions) === 'low' ? 'low' : 'medium'
  const effort: Effort = 'medium'
  return {
    id: `${context.landingKey}:possible_message_mismatch`,
    landingKey: context.landingKey,
    campaignId: context.campaignId,
    landingName: context.landingName,
    type: 'possible_message_mismatch',
    level: 'N1',
    title: 'Posible desalineación de mensaje',
    problem: `Lo que promete el anuncio de «${channel}» y lo que dice el hero de la landing no parecen la misma oferta.`,
    evidence,
    recommendation: 'Lleva al hero la promesa concreta del anuncio antes de tocar la segmentación.',
    impact,
    confidence,
    effort,
    risk: 'medium',
    priority: priorityOf(impact, confidence, effort),
    baselineUsed: describeBaseline(context.baseline),
  }
}

/**
 * Diagnostica todas las landings de una organización y devuelve las
 * recomendaciones ordenadas por prioridad económica (§5.1).
 */
export async function diagnoseOrganization(orgId: string, now = new Date()) {
  const campaigns = await prisma.campaign.findMany({
    where: { orgId, landingKey: { not: null } },
    select: { id: true, name: true, landingKey: true, adAssets: true },
  })
  if (!campaigns.length) return []

  const landingKeys = campaigns.map(campaign => campaign.landingKey as string)
  const windowFrom = new Date(now.getTime() - 28 * DAY_MS)

  const [rollups, snapshots, health] = await Promise.all([
    prisma.landingDailyRollup.findMany({
      // Solo tráfico fuera de experimento: durante un A/B, la mitad de los
      // visitantes ve otra página, y sumar los dos formularios en la misma
      // tasa de abandono por campo describiría una página que no existe.
      where: { landingKey: { in: landingKeys }, day: { gte: windowFrom }, variantId: '' },
      select: { landingKey: true, source: true, sessions: true, scroll50: true, fieldStats: true },
    }),
    prisma.landingPerformanceSnapshot.findMany({
      where: { orgId, landingKey: { in: landingKeys } },
      orderBy: { periodEnd: 'desc' },
    }),
    latestHealthByLanding(orgId, landingKeys),
  ])

  const snapshotByKey = new Map<string, (typeof snapshots)[number]>()
  for (const snapshot of snapshots) {
    if (!snapshotByKey.has(snapshot.landingKey)) snapshotByKey.set(snapshot.landingKey, snapshot)
  }

  const diagnoses: LandingDiagnosis[] = []

  for (const campaign of campaigns) {
    const landingKey = campaign.landingKey as string
    const rows = rollups.filter(row => row.landingKey === landingKey)
    if (!rows.length) continue

    // Los campos se agregan sobre toda la ventana: un solo día no da exposición
    // suficiente para juzgar un campo.
    const fieldStats: Record<string, FieldStat> = {}
    for (const row of rows) {
      for (const [field, stat] of Object.entries(readFieldStats(row.fieldStats))) {
        const current = fieldStats[field] ?? { exposed: 0, interacted: 0, completed: 0, validationErrors: 0, averageMs: null }
        const totalExposed = current.exposed + stat.exposed
        fieldStats[field] = {
          exposed: totalExposed,
          interacted: current.interacted + stat.interacted,
          completed: current.completed + stat.completed,
          validationErrors: current.validationErrors + stat.validationErrors,
          // Media ponderada por exposición; sin muestras se conserva `null`.
          averageMs: stat.averageMs === null && current.averageMs === null
            ? null
            : Math.round(((current.averageMs ?? 0) * current.exposed + (stat.averageMs ?? 0) * stat.exposed) / (totalExposed || 1)),
        }
      }
    }

    const scrollReachByChannel = new Map<string, { sessions: number; scrollReach: number }>()
    for (const row of rows) {
      const current = scrollReachByChannel.get(row.source) ?? { sessions: 0, scrollReach: 0 }
      // Se acumulan valores absolutos y se divide al final.
      current.sessions += row.sessions
      current.scrollReach += row.scroll50
      scrollReachByChannel.set(row.source, current)
    }
    for (const [channel, stats] of scrollReachByChannel) {
      scrollReachByChannel.set(channel, {
        sessions: stats.sessions,
        scrollReach: stats.sessions ? stats.scrollReach / stats.sessions : 0,
      })
    }

    const snapshot = snapshotByKey.get(landingKey) ?? null
    // Tasa de cualificación real de la landing. `null` si no se midió: sin ella
    // el impacto se expresa solo en leads, nunca en oportunidades inventadas.
    const qualificationRate = snapshot && snapshot.qualified !== null && snapshot.leads
      ? snapshot.qualified / snapshot.leads
      : null

    const assets = (campaign.adAssets ?? {}) as { adCopy?: string; offer?: string; title?: string }
    const check = health.get(landingKey) ?? null

    const context: DiagnosisContext = {
      campaignId: campaign.id,
      landingKey,
      landingName: assets.title || campaign.name,
      baseline: await computeBaseline(landingKey, now),
      fieldStats,
      windowDays: 28,
      qualificationRate,
      health: check && {
        verdict: check.verdict,
        ttfbMs: check.ttfbMs,
        totalMs: check.totalMs,
        statusCode: check.statusCode,
        heroImageBytes: check.heroImageBytes,
        mobileReady: check.mobileReady,
      },
      adCopy: assets.adCopy ?? null,
      offer: assets.offer ?? null,
      // Solo el título de la landing: la descripción del hero es el propio
      // `adCopy` del anuncio y compararla consigo misma no diagnostica nada.
      heroTitle: assets.title ?? null,
      heroCopy: null,
      scrollReachByChannel,
    }

    for (const diagnose of [diagnoseTrafficWithoutLeads, diagnoseFieldAbandonment, diagnoseMessageMismatch]) {
      const diagnosis = diagnose(context)
      if (diagnosis) diagnoses.push(diagnosis)
    }
  }

  return diagnoses.sort((a, b) => b.priority - a.priority)
}
