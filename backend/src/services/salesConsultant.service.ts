import { prisma } from '../lib/prisma'
import { NO_CONTACT_CALL_OUTCOMES, QUALIFYING_CALL_OUTCOMES, CALL_OUTCOME } from '../lib/callOutcome'
import { CONSUMPTION_LIMITS } from '../access-control/consumption'
import { planPolicy } from '../access-control/entitlements'
import { classifyChannel, isOrganicEvent } from './organicChannels.service'
import {
  budgetForOneSale,
  predictorSnapshot,
  project,
  recommendations,
  type PredictorSnapshot,
  type Projection,
  type Recommendation,
} from './growthPredictor.service'

/**
 * Consultor comercial: lee TODO lo que la organización ya tiene medido
 * —llamadas, anuncios, redes, búsqueda, email, pipeline— y contesta las cuatro
 * preguntas que se hace quien dirige un departamento de ventas:
 *
 *   1. ¿Cómo va? (nota por área, con la evidencia que la sostiene)
 *   2. ¿De dónde sale el dinero y de dónde no? (cuenta de resultados por canal)
 *   3. ¿Dónde está el freno? (embudo, llamadas, pipeline, velocidad)
 *   4. ¿Qué hago esta semana y cuánto vale hacerlo? (plan con importe)
 *
 * Las reglas que hacen que esto sea un diagnóstico y no un horóscopo son las
 * mismas del predictor: cada cifra dice de dónde sale, y cuando no hay muestra
 * se dice «no lo sé» en vez de rellenar con una referencia disfrazada de dato.
 *
 * Todo el análisis vive en funciones puras: reciben filas ya leídas, no tocan
 * prisma y se prueban sin base de datos (`salesConsultant.test.ts`).
 */

// ───────────────────────────────────────────────────────────────────────────
// Canales
// ───────────────────────────────────────────────────────────────────────────

export const SALES_CHANNELS = ['ads', 'social', 'search', 'gbp', 'email', 'outbound', 'referral', 'unknown'] as const
export type SalesChannel = (typeof SALES_CHANNELS)[number]

export const CHANNEL_LABEL: Record<SalesChannel, string> = {
  ads: 'Publicidad de pago',
  social: 'Redes sociales',
  search: 'Búsqueda y SEO',
  gbp: 'Ficha de Google',
  email: 'Email marketing',
  outbound: 'Prospección en frío',
  referral: 'Referidos y recomendaciones',
  unknown: 'Origen sin identificar',
}

/**
 * A qué pantalla se va uno a trabajar ese canal. Rutas canónicas, no las
 * antiguas: `/seo` y `/redes-sociales` siguen existiendo como redirección, pero
 * mandar ahí obligaría a un salto extra en cada clic.
 */
export const CHANNEL_HREF: Record<SalesChannel, string> = {
  ads: '/captacion/atraer/ads',
  social: '/captacion/atraer/organico?tab=contenido',
  search: '/captacion/convertir?tab=seo',
  gbp: '/captacion/atraer/organico',
  email: '/email-marketing',
  outbound: '/captacion/atraer/prospectos',
  referral: '/growth',
  unknown: '/ventas?vista=leads',
}

/** Palabras que aparecen en `Lead.source` y delatan el canal. */
const SOURCE_HINTS: [SalesChannel, string[]][] = [
  ['ads', ['meta_ad', 'meta ads', 'facebook_ad', 'facebook ads', 'instagram_ad', 'google_ads', 'adwords', 'tiktok_ads', 'paid', 'cpc', 'ppc']],
  ['social', ['instagram', 'linkedin', 'facebook', 'tiktok', 'youtube', 'social', 'metricool']],
  ['search', ['organic', 'seo', 'google', 'bing', 'search', 'blog', 'landing']],
  ['gbp', ['gbp', 'business_profile', 'maps', 'ficha']],
  ['email', ['email', 'newsletter', 'mail']],
  ['outbound', ['import', 'csv', 'prospect', 'outbound', 'cold', 'lista', 'scraper', 'apollo']],
  ['referral', ['referral', 'referido', 'recomend', 'partner', 'word_of_mouth', 'boca']],
]

/**
 * De qué canal viene un lead. El orden importa y es deliberado: lo que tenga
 * huella de pago es de Ads aunque después llegara por búsqueda, porque
 * atribuírselo al orgánico sería quitárselo a quien lo pagó — el mismo criterio
 * que aplica `organicChannels.service.ts` dentro del orgánico.
 *
 * Lo que no se reconoce cae en `unknown`, nunca en el canal más probable: una
 * atribución inventada es peor que un hueco visible.
 */
export function channelForLead(
  lead: { source: string | null; metaAdId: string | null },
  events: { type: string; source: string | null; medium: string | null }[] = [],
): SalesChannel {
  if (lead.metaAdId) return 'ads'
  if (events.some(event => !isOrganicEvent(event))) return 'ads'

  const organic = events.find(event => isOrganicEvent(event))
  if (organic) {
    const channel = classifyChannel(organic)
    if (channel === 'prospecting') return 'outbound'
    if (channel !== 'unattributed') return channel
  }

  const source = (lead.source ?? '').toLowerCase()
  if (source) {
    for (const [channel, hints] of SOURCE_HINTS) {
      if (hints.some(hint => source.includes(hint))) return channel
    }
  }
  return 'unknown'
}

export interface ChannelInput {
  channel: SalesChannel
  leads: number
  /** Leads con los que se llegó a hablar con una persona. */
  contacted: number
  qualified: number
  opportunities: number
  sales: number
  revenue: number
  /** Dinero gastado de forma directa en el canal (anuncios). */
  spend: number
  /** Coste de las llamadas hechas a los leads de este canal. */
  voiceCost: number
  /** Horas de trabajo invertidas; `null` es «no se ha medido», no cero. */
  hours: number | null
}

export type ChannelVerdict = 'escalar' | 'mantener' | 'arreglar' | 'parar' | 'medir'

export interface ChannelPerformance extends ChannelInput {
  label: string
  href: string
  cost: number
  /** `money` cuando el gasto es real; `time` cuando el coste es trabajo; `none` cuando no cuesta nada medible. */
  costBasis: 'money' | 'time' | 'none'
  costPerLead: number | null
  costPerQualified: number | null
  costPerSale: number | null
  roi: number | null
  contactRate: number | null
  qualifyRate: number | null
  winRate: number | null
  share: number
  maturity: 'insufficient' | 'maturing' | 'mature'
  verdict: ChannelVerdict
  reason: string
}

/** Por debajo de esto el canal no tiene muestra para juzgarlo, solo para mirarlo. */
const CHANNEL_MIN_LEADS = 10
const CHANNEL_MATURE_LEADS = 30

/**
 * Veredicto de un canal. Se decide sobre el retorno medido, no sobre el
 * volumen: un canal que trae mucho y no cierra es un canal que hay que
 * arreglar, no uno que va bien.
 */
export function evaluateChannel(input: ChannelInput, totalLeads: number): ChannelPerformance {
  const cost = input.spend + input.voiceCost
  const costBasis: ChannelPerformance['costBasis'] = cost > 0 ? 'money' : (input.hours ?? 0) > 0 ? 'time' : 'none'
  const roi = cost > 0 ? Math.round((input.revenue / cost) * 100) / 100 : null
  const maturity = input.leads >= CHANNEL_MATURE_LEADS
    ? 'mature'
    : input.leads >= CHANNEL_MIN_LEADS ? 'maturing' : 'insufficient'

  let verdict: ChannelVerdict = 'medir'
  let reason = `Solo ${input.leads} ${input.leads === 1 ? 'lead' : 'leads'} en el periodo: no hay con qué juzgarlo todavía.`

  if (maturity !== 'insufficient' || input.sales > 0) {
    if (roi == null) {
      verdict = input.opportunities > 0 ? 'escalar' : 'medir'
      reason = input.opportunities > 0
        ? `No te cuesta dinero directo y ha abierto ${input.opportunities} ${input.opportunities === 1 ? 'oportunidad' : 'oportunidades'}. Es el euro más barato que tienes.`
        : 'No te cuesta dinero directo, pero tampoco ha abierto ninguna oportunidad. Antes de meterle más horas, mide qué pasa después del clic.'
    } else if (roi >= 3 && input.sales >= 1) {
      verdict = 'escalar'
      reason = `Devuelve ${roi}× lo que le metes. Es donde debería ir el siguiente euro.`
    } else if (roi >= 1.5) {
      verdict = 'mantener'
      reason = `Devuelve ${roi}×: se paga solo, pero no da margen para financiar el resto. Mantenlo y trabaja el cierre.`
    } else if (roi >= 0.8) {
      verdict = 'arreglar'
      reason = `Devuelve ${roi}×: no llega a pagarse. Lo que está roto está entre el lead y la venta, no en el volumen.`
    } else {
      verdict = 'parar'
      reason = `Has puesto ${Math.round(cost)} y ha devuelto ${Math.round(input.revenue)}. Con ${maturity === 'mature' ? 'esta muestra' : 'la muestra que hay'} eso no se arregla subiendo el presupuesto.`
    }
  }

  // Un canal sin ventas todavía pero con oportunidades abiertas no es un
  // fracaso: es un ciclo de venta que no ha terminado. Decirlo evita cortar lo
  // que aún no ha tenido tiempo de dar resultado.
  if (verdict === 'parar' && input.sales === 0 && input.opportunities > 0) {
    verdict = 'arreglar'
    reason = `Aún no ha cerrado nada, pero tiene ${input.opportunities} ${input.opportunities === 1 ? 'oportunidad viva' : 'oportunidades vivas'}. Antes de cortarlo, cierra lo que ya está abierto.`
  }

  return {
    ...input,
    label: CHANNEL_LABEL[input.channel],
    href: CHANNEL_HREF[input.channel],
    cost: Math.round(cost * 100) / 100,
    costBasis,
    costPerLead: input.leads > 0 && cost > 0 ? Math.round((cost / input.leads) * 100) / 100 : null,
    costPerQualified: input.qualified > 0 && cost > 0 ? Math.round((cost / input.qualified) * 100) / 100 : null,
    costPerSale: input.sales > 0 && cost > 0 ? Math.round(cost / input.sales) : null,
    roi,
    contactRate: input.leads > 0 ? Math.round((input.contacted / input.leads) * 100) / 100 : null,
    qualifyRate: input.contacted > 0 ? Math.round((input.qualified / input.contacted) * 100) / 100 : null,
    winRate: input.opportunities > 0 ? Math.round((input.sales / input.opportunities) * 100) / 100 : null,
    share: totalLeads > 0 ? Math.round((input.leads / totalLeads) * 100) : 0,
    maturity,
    verdict,
    reason,
  }
}

export interface AllocationItem {
  channel: SalesChannel
  label: string
  href: string
  amount: number
  share: number
  reason: string
}

/**
 * Dónde poner el presupuesto del mes que viene.
 *
 * No es una optimización elegante, es la regla que usaría alguien con criterio:
 * el grueso a lo que ya devuelve, un mínimo a lo que aún no se sabe si devuelve
 * —para poder saberlo— y cero a lo que se ha demostrado que no. Ningún canal
 * pasa del 60 %: concentrarlo todo en uno es como se muere una empresa cuando
 * ese canal cambia de reglas.
 */
export function allocateBudget(
  channels: ChannelPerformance[],
  budget: number,
): { total: number; items: AllocationItem[]; note: string } {
  const total = Math.max(0, Math.round(budget))
  if (total === 0) return { total: 0, items: [], note: 'Sin presupuesto no hay nada que repartir.' }

  const scored = channels
    .map(channel => {
      // El peso mezcla retorno y confianza: un 8× sobre 11 leads no puede pesar
      // lo mismo que un 3× sobre 200.
      const confidence = channel.maturity === 'mature' ? 1 : channel.maturity === 'maturing' ? 0.6 : 0.25
      let weight = 0
      if (channel.verdict === 'escalar') weight = (channel.roi ?? 3) * confidence
      else if (channel.verdict === 'mantener') weight = (channel.roi ?? 1.5) * confidence * 0.6
      else if (channel.verdict === 'arreglar') weight = 0.4 * confidence
      else if (channel.verdict === 'medir') weight = 0.35 * confidence
      return { channel, weight }
    })
    .filter(entry => entry.weight > 0)

  if (scored.length === 0) {
    return {
      total,
      items: [{
        channel: 'ads',
        label: CHANNEL_LABEL.ads,
        href: CHANNEL_HREF.ads,
        amount: total,
        share: 100,
        reason: 'Ningún canal tiene todavía retorno medido. Concentra el presupuesto en uno solo hasta reunir 30 leads suyos: repartirlo entre varios solo consigue que ninguno llegue a muestra.',
      }],
      note: 'Reparto de arranque: sin datos lo que importa es conseguir muestra rápido, no diversificar.',
    }
  }

  const sum = scored.reduce((acc, entry) => acc + entry.weight, 0)

  // Techo del 60 % por canal. Recortar y renormalizar no vale —volvería a
  // subir del techo al dividir—, así que el exceso se reparte entre los que
  // aún tienen hueco, en proporción al hueco que les queda. Con un solo canal
  // no hay techo posible: se lleva todo y se dice.
  const cap = scored.length > 1 ? 0.6 : 1
  let shares = scored.map(entry => entry.weight / sum)
  for (let round = 0; round < 5; round++) {
    const excess = shares.reduce((acc, share) => acc + Math.max(0, share - cap), 0)
    if (excess <= 0.0001) break
    const room = shares.reduce((acc, share) => acc + Math.max(0, cap - share), 0)
    if (room <= 0.0001) break
    shares = shares.map(share => (share >= cap ? cap : share + (excess * (cap - share)) / room))
  }

  const items = scored
    .map((entry, index) => {
      const share = shares[index]
      const channel = entry.channel
      const reason = channel.verdict === 'escalar'
        ? `Devuelve ${channel.roi ?? '—'}× con ${channel.leads} leads medidos: es donde el euro rinde más.`
        : channel.verdict === 'mantener'
          ? 'Se paga solo. Lo justo para no perder volumen mientras arreglas el cierre.'
          : channel.verdict === 'arreglar'
            ? 'Presupuesto de mantenimiento: no para crecer, para no perder la señal mientras lo arreglas.'
            : 'Presupuesto de aprendizaje: lo mínimo para llegar a muestra y poder decidir con datos.'
      return {
        channel: channel.channel,
        label: channel.label,
        href: channel.href,
        amount: Math.round(total * share),
        share: Math.round(share * 100),
        reason,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  const stopped = channels.filter(channel => channel.verdict === 'parar')
  const note = stopped.length
    ? `Fuera del reparto: ${stopped.map(channel => channel.label).join(', ')}. Han tenido presupuesto y muestra y no han devuelto.`
    : 'Ningún canal queda fuera: todos tienen retorno o muestra pendiente.'

  return { total, items, note }
}

// ───────────────────────────────────────────────────────────────────────────
// Operación de llamadas — el departamento de ventas propiamente dicho
// ───────────────────────────────────────────────────────────────────────────

export interface CallInput {
  agentId: string | null
  outcome: string | null
  durationSeconds: number | null
  createdAt: Date
  startedAt: Date | null
  sentiment: string | null
}

export interface HourPerformance {
  hour: number
  calls: number
  contacted: number
  contactRate: number
  reliable: boolean
}

export interface AgentPerformance {
  agentId: string
  name: string
  calls: number
  contacted: number
  qualified: number
  meetings: number
  contactRate: number
  qualifyRate: number
  averageMinutes: number
  reliable: boolean
}

export interface CallOperations {
  total: number
  contacted: number
  qualified: number
  meetings: number
  contactRate: number | null
  qualifyRate: number | null
  meetingRate: number | null
  averageMinutes: number | null
  machineRate: number | null
  rejectionRate: number | null
  byHour: HourPerformance[]
  bestHour: HourPerformance | null
  worstHour: HourPerformance | null
  byWeekday: { weekday: number; label: string; calls: number; contactRate: number; reliable: boolean }[]
  byAgent: AgentPerformance[]
  outcomes: { outcome: string; label: string; count: number; share: number }[]
  sentiment: { positive: number; neutral: number; negative: number; measured: number }
}

const OUTCOME_LABEL: Record<string, string> = {
  [CALL_OUTCOME.MEETING_SCHEDULED]: 'Reunión agendada',
  [CALL_OUTCOME.HUMAN_REQUESTED]: 'Pidió hablar con una persona',
  [CALL_OUTCOME.CALLBACK_REQUESTED]: 'Pidió que le llamen después',
  [CALL_OUTCOME.INTERESTED]: 'Interesado sin agendar',
  [CALL_OUTCOME.NOT_INTERESTED]: 'Dijo que no',
  [CALL_OUTCOME.NONE]: 'Sin resultado registrado',
  [CALL_OUTCOME.VOICEMAIL]: 'Buzón de voz',
  [CALL_OUTCOME.IVR]: 'Centralita',
  [CALL_OUTCOME.FAX_OR_NOISE]: 'Fax o ruido',
  [CALL_OUTCOME.UNKNOWN]: 'No se pudo clasificar',
}

const WEEKDAY_LABEL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const MACHINE_OUTCOMES: readonly string[] = [CALL_OUTCOME.VOICEMAIL, CALL_OUTCOME.IVR, CALL_OUTCOME.FAX_OR_NOISE]

/**
 * Hora local de la organización. Una franja horaria en UTC no le sirve a nadie
 * para decidir cuándo llamar, y una zona horaria inválida guardada en la ficha
 * de la empresa no puede tumbar el informe entero: se degrada a UTC.
 */
function localParts(date: Date, timezone: string): { hour: number; weekday: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' })
    const parts = formatter.formatToParts(date)
    const hour = Number(parts.find(part => part.type === 'hour')?.value ?? date.getUTCHours())
    const weekdayName = parts.find(part => part.type === 'weekday')?.value ?? ''
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName)
    return { hour: Number.isFinite(hour) ? hour : date.getUTCHours(), weekday: weekday >= 0 ? weekday : date.getUTCDay() }
  } catch {
    return { hour: date.getUTCHours(), weekday: date.getUTCDay() }
  }
}

/** Mínimo de llamadas para que una franja o un agente se puedan comparar. */
const MIN_CALLS_PER_BUCKET = 8
const MIN_CALLS_PER_AGENT = 15

export function callOperations(
  calls: CallInput[],
  agentNames: Record<string, string> = {},
  timezone = 'Europe/Madrid',
): CallOperations {
  const noContact = new Set<string>(NO_CONTACT_CALL_OUTCOMES)
  const qualifying = new Set<string>(QUALIFYING_CALL_OUTCOMES)
  const isContacted = (call: CallInput) => !!call.outcome && !noContact.has(call.outcome)
  const isQualified = (call: CallInput) => !!call.outcome && qualifying.has(call.outcome)

  const total = calls.length
  const contacted = calls.filter(isContacted).length
  const qualified = calls.filter(isQualified).length
  const meetings = calls.filter(call => call.outcome === CALL_OUTCOME.MEETING_SCHEDULED).length
  const machine = calls.filter(call => !!call.outcome && MACHINE_OUTCOMES.includes(call.outcome)).length
  const rejected = calls.filter(call => call.outcome === CALL_OUTCOME.NOT_INTERESTED).length
  const durations = calls.map(call => call.durationSeconds ?? 0).filter(seconds => seconds > 0)

  const hourBuckets = new Map<number, { calls: number; contacted: number }>()
  const weekdayBuckets = new Map<number, { calls: number; contacted: number }>()
  const agentBuckets = new Map<string, { calls: number; contacted: number; qualified: number; meetings: number; seconds: number; measured: number }>()
  const outcomeCounts = new Map<string, number>()
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0, measured: 0 }

  for (const call of calls) {
    const when = call.startedAt ?? call.createdAt
    const { hour, weekday } = localParts(when, timezone)

    const hourBucket = hourBuckets.get(hour) ?? { calls: 0, contacted: 0 }
    hourBucket.calls += 1
    if (isContacted(call)) hourBucket.contacted += 1
    hourBuckets.set(hour, hourBucket)

    const weekdayBucket = weekdayBuckets.get(weekday) ?? { calls: 0, contacted: 0 }
    weekdayBucket.calls += 1
    if (isContacted(call)) weekdayBucket.contacted += 1
    weekdayBuckets.set(weekday, weekdayBucket)

    if (call.agentId) {
      const agent = agentBuckets.get(call.agentId) ?? { calls: 0, contacted: 0, qualified: 0, meetings: 0, seconds: 0, measured: 0 }
      agent.calls += 1
      if (isContacted(call)) agent.contacted += 1
      if (isQualified(call)) agent.qualified += 1
      if (call.outcome === CALL_OUTCOME.MEETING_SCHEDULED) agent.meetings += 1
      if (call.durationSeconds && call.durationSeconds > 0) {
        agent.seconds += call.durationSeconds
        agent.measured += 1
      }
      agentBuckets.set(call.agentId, agent)
    }

    const outcome = call.outcome ?? CALL_OUTCOME.NONE
    outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1)

    if (call.sentiment === 'positive' || call.sentiment === 'neutral' || call.sentiment === 'negative') {
      sentimentCounts[call.sentiment] += 1
      sentimentCounts.measured += 1
    }
  }

  const byHour = [...hourBuckets.entries()]
    .map(([hour, bucket]) => ({
      hour,
      calls: bucket.calls,
      contacted: bucket.contacted,
      contactRate: bucket.calls > 0 ? Math.round((bucket.contacted / bucket.calls) * 100) / 100 : 0,
      reliable: bucket.calls >= MIN_CALLS_PER_BUCKET,
    }))
    .sort((a, b) => a.hour - b.hour)

  const comparableHours = byHour.filter(hour => hour.reliable)
  const bestHour = comparableHours.length
    ? comparableHours.reduce((best, hour) => (hour.contactRate > best.contactRate ? hour : best))
    : null
  const worstHour = comparableHours.length > 1
    ? comparableHours.reduce((worst, hour) => (hour.contactRate < worst.contactRate ? hour : worst))
    : null

  const byWeekday = [...weekdayBuckets.entries()]
    .map(([weekday, bucket]) => ({
      weekday,
      label: WEEKDAY_LABEL[weekday] ?? '—',
      calls: bucket.calls,
      contactRate: bucket.calls > 0 ? Math.round((bucket.contacted / bucket.calls) * 100) / 100 : 0,
      reliable: bucket.calls >= MIN_CALLS_PER_BUCKET,
    }))
    // Lunes primero: el domingo cierra la semana comercial, no la abre.
    .sort((a, b) => (a.weekday === 0 ? 7 : a.weekday) - (b.weekday === 0 ? 7 : b.weekday))

  const byAgent = [...agentBuckets.entries()]
    .map(([agentId, bucket]) => ({
      agentId,
      name: agentNames[agentId] ?? 'Agente retirado',
      calls: bucket.calls,
      contacted: bucket.contacted,
      qualified: bucket.qualified,
      meetings: bucket.meetings,
      contactRate: bucket.calls > 0 ? Math.round((bucket.contacted / bucket.calls) * 100) / 100 : 0,
      qualifyRate: bucket.contacted > 0 ? Math.round((bucket.qualified / bucket.contacted) * 100) / 100 : 0,
      averageMinutes: bucket.measured > 0 ? Math.round((bucket.seconds / bucket.measured / 60) * 10) / 10 : 0,
      reliable: bucket.calls >= MIN_CALLS_PER_AGENT,
    }))
    .sort((a, b) => b.qualified - a.qualified || b.calls - a.calls)

  const outcomes = [...outcomeCounts.entries()]
    .map(([outcome, count]) => ({
      outcome,
      label: OUTCOME_LABEL[outcome] ?? outcome,
      count,
      share: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    total,
    contacted,
    qualified,
    meetings,
    contactRate: total > 0 ? Math.round((contacted / total) * 100) / 100 : null,
    qualifyRate: contacted > 0 ? Math.round((qualified / contacted) * 100) / 100 : null,
    meetingRate: contacted > 0 ? Math.round((meetings / contacted) * 100) / 100 : null,
    averageMinutes: durations.length
      ? Math.round((durations.reduce((acc, seconds) => acc + seconds, 0) / durations.length / 60) * 10) / 10
      : null,
    machineRate: total > 0 ? Math.round((machine / total) * 100) / 100 : null,
    rejectionRate: contacted > 0 ? Math.round((rejected / contacted) * 100) / 100 : null,
    byHour,
    bestHour,
    worstHour,
    byWeekday,
    byAgent,
    outcomes,
    sentiment: {
      positive: sentimentCounts.measured > 0 ? Math.round((sentimentCounts.positive / sentimentCounts.measured) * 100) : 0,
      neutral: sentimentCounts.measured > 0 ? Math.round((sentimentCounts.neutral / sentimentCounts.measured) * 100) : 0,
      negative: sentimentCounts.measured > 0 ? Math.round((sentimentCounts.negative / sentimentCounts.measured) * 100) : 0,
      measured: sentimentCounts.measured,
    },
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Pipeline
// ───────────────────────────────────────────────────────────────────────────

export interface OpportunityInput {
  id: string
  name: string
  stage: string
  value: number
  probability: number
  createdAt: Date
  stageEnteredAt: Date
  actualCloseDate: Date | null
  lossReason: string | null
  forecastCategory: string | null
}

/**
 * Días a partir de los cuales una oportunidad en esa etapa está parada. No son
 * cifras de manual: son el tiempo que una etapa aguanta antes de que el
 * interlocutor se enfríe, y por eso «Negociación» aguanta más que «Lead».
 */
const STALL_DAYS: Record<string, number> = {
  lead: 7,
  qualified: 14,
  proposal: 10,
  negotiation: 14,
}

const STAGE_LABEL: Record<string, string> = {
  lead: 'Sin cualificar',
  qualified: 'Cualificada',
  proposal: 'Propuesta enviada',
  negotiation: 'En negociación',
  closed_won: 'Ganada',
  closed_lost: 'Perdida',
}

export interface PipelineHealth {
  open: number
  openValue: number
  weightedValue: number
  won: number
  lost: number
  wonValue: number
  winRate: number | null
  averageCycleDays: number | null
  byStage: { stage: string; label: string; count: number; value: number; averageDays: number; stalled: number; stalledValue: number }[]
  stalled: { id: string; name: string; stage: string; label: string; value: number; days: number }[]
  lossReasons: { reason: string; count: number; share: number }[]
  commitValue: number
  uncategorized: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function pipelineHealth(list: OpportunityInput[], now = new Date()): PipelineHealth {
  const openStages = ['lead', 'qualified', 'proposal', 'negotiation']
  const open = list.filter(item => openStages.includes(item.stage))
  const won = list.filter(item => item.stage === 'closed_won')
  const lost = list.filter(item => item.stage === 'closed_lost')

  const days = (from: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS))

  const byStage = openStages.map(stage => {
    const rows = open.filter(item => item.stage === stage)
    const stalledRows = rows.filter(item => days(item.stageEnteredAt) > (STALL_DAYS[stage] ?? 14))
    return {
      stage,
      label: STAGE_LABEL[stage] ?? stage,
      count: rows.length,
      value: Math.round(rows.reduce((acc, item) => acc + item.value, 0)),
      averageDays: rows.length ? Math.round(rows.reduce((acc, item) => acc + days(item.stageEnteredAt), 0) / rows.length) : 0,
      stalled: stalledRows.length,
      stalledValue: Math.round(stalledRows.reduce((acc, item) => acc + item.value, 0)),
    }
  })

  const stalled = open
    .map(item => ({ item, days: days(item.stageEnteredAt) }))
    .filter(entry => entry.days > (STALL_DAYS[entry.item.stage] ?? 14))
    .sort((a, b) => b.item.value - a.item.value || b.days - a.days)
    .slice(0, 8)
    .map(entry => ({
      id: entry.item.id,
      name: entry.item.name,
      stage: entry.item.stage,
      label: STAGE_LABEL[entry.item.stage] ?? entry.item.stage,
      value: Math.round(entry.item.value),
      days: entry.days,
    }))

  const reasonCounts = new Map<string, number>()
  for (const item of lost) {
    const reason = (item.lossReason ?? '').trim() || 'Sin motivo registrado'
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
  }
  const lossReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count, share: lost.length ? Math.round((count / lost.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // Ciclo medio: solo con las ganadas que tienen fecha de cierre. Estimar el
  // cierre con `updatedAt` haría que cualquier edición acortara el ciclo.
  const closedWithDate = won.filter(item => item.actualCloseDate)
  const averageCycleDays = closedWithDate.length
    ? Math.round(closedWithDate.reduce((acc, item) => acc + Math.max(0, (item.actualCloseDate as Date).getTime() - item.createdAt.getTime()) / DAY_MS, 0) / closedWithDate.length)
    : null

  return {
    open: open.length,
    openValue: Math.round(open.reduce((acc, item) => acc + item.value, 0)),
    weightedValue: Math.round(open.reduce((acc, item) => acc + item.value * (item.probability / 100), 0)),
    won: won.length,
    lost: lost.length,
    wonValue: Math.round(won.reduce((acc, item) => acc + item.value, 0)),
    winRate: won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) / 100 : null,
    averageCycleDays,
    byStage,
    stalled,
    lossReasons,
    commitValue: Math.round(open.filter(item => item.forecastCategory === 'commit').reduce((acc, item) => acc + item.value, 0)),
    uncategorized: open.filter(item => !item.forecastCategory).length,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Velocidad de respuesta y seguimiento
// ───────────────────────────────────────────────────────────────────────────

export interface LeadInput {
  id: string
  status: string
  createdAt: Date
  firstRespondedAt: Date | null
  lastAttemptAt: Date | null
  attempts: number
}

export interface ResponseSpeed {
  measured: number
  medianMinutes: number | null
  withinFiveMinutes: number | null
  untouched: number
  untouchedOldestDays: number | null
  stale: number
  neverAnswered: number
}

/** Un lead sin tocar en 24 h ya está frío; a los 14 días sin intento, olvidado. */
const UNTOUCHED_HOURS = 24
const STALE_DAYS = 14

export function responseSpeed(leads: LeadInput[], now = new Date()): ResponseSpeed {
  const responded = leads
    .filter(lead => lead.firstRespondedAt)
    .map(lead => Math.max(0, ((lead.firstRespondedAt as Date).getTime() - lead.createdAt.getTime()) / 60000))
    .sort((a, b) => a - b)

  const median = responded.length
    ? responded.length % 2 === 1
      ? responded[(responded.length - 1) / 2]
      : (responded[responded.length / 2 - 1] + responded[responded.length / 2]) / 2
    : null

  const untouchedLeads = leads.filter(lead =>
    lead.attempts === 0
    && !lead.firstRespondedAt
    && now.getTime() - lead.createdAt.getTime() > UNTOUCHED_HOURS * 60 * 60 * 1000)

  const oldest = untouchedLeads.reduce<number | null>((max, lead) => {
    const age = Math.floor((now.getTime() - lead.createdAt.getTime()) / DAY_MS)
    return max == null || age > max ? age : max
  }, null)

  const stale = leads.filter(lead => {
    if (['converted', 'unqualified'].includes(lead.status)) return false
    const last = lead.lastAttemptAt ?? lead.createdAt
    return lead.attempts > 0 && now.getTime() - last.getTime() > STALE_DAYS * DAY_MS
  }).length

  return {
    measured: responded.length,
    medianMinutes: median == null ? null : Math.round(median),
    withinFiveMinutes: responded.length ? Math.round((responded.filter(minutes => minutes <= 5).length / responded.length) * 100) : null,
    untouched: untouchedLeads.length,
    untouchedOldestDays: oldest,
    stale,
    // Intentado varias veces y nunca respondió: o el número es malo o la franja
    // horaria lo es. Se separa de «sin tocar» porque el arreglo es distinto.
    neverAnswered: leads.filter(lead => lead.attempts >= 3 && !lead.firstRespondedAt).length,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Nota por área
// ───────────────────────────────────────────────────────────────────────────

export type AreaKey = 'demand' | 'conversation' | 'conversion' | 'speed' | 'economics'
export type AreaState = 'bien' | 'regular' | 'mal' | 'sin-datos'

export interface AreaScore {
  key: AreaKey
  label: string
  score: number | null
  state: AreaState
  headline: string
  evidence: string
  href: string
}

const AREA_LABEL: Record<AreaKey, string> = {
  demand: 'Generación de demanda',
  conversation: 'Contacto y conversación',
  conversion: 'Cierre',
  speed: 'Velocidad y seguimiento',
  economics: 'Economía del negocio',
}

/** 0–100 sobre un objetivo, sin premiar por encima de 100. */
function ratioScore(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function stateFor(score: number | null): AreaState {
  if (score == null) return 'sin-datos'
  if (score >= 70) return 'bien'
  if (score >= 45) return 'regular'
  return 'mal'
}

export interface ScoreInput {
  windowDays: number
  leadsThisWindow: number
  leadsPreviousWindow: number
  calls: CallOperations
  pipeline: PipelineHealth
  speed: ResponseSpeed
  revenue: number
  cost: number
  dealValue: number
}

/**
 * Cinco notas, una por área, cada una con la cifra que la sostiene. Un área sin
 * muestra devuelve `null` y se pinta como «sin datos»: poner un 0 donde no se
 * ha medido nada es exactamente la mentira que este servicio evita.
 */
export function scoreAreas(input: ScoreInput): AreaScore[] {
  const { calls, pipeline, speed } = input

  // Demanda: crecer respecto al periodo anterior. Un 20 % de crecimiento es
  // el objetivo; mantener el volumen puntúa la mitad.
  const demandScore = input.leadsPreviousWindow > 0
    ? ratioScore(input.leadsThisWindow / input.leadsPreviousWindow, 1.2)
    : input.leadsThisWindow > 0 ? 50 : null
  const demandTrend = input.leadsPreviousWindow > 0
    ? Math.round(((input.leadsThisWindow - input.leadsPreviousWindow) / input.leadsPreviousWindow) * 100)
    : null

  // Conversación: contactar al 35 % es la referencia del sector; cualificar al
  // 25 % de lo contactado, también.
  const conversationScore = calls.total >= 20 && calls.contactRate != null
    ? Math.round(ratioScore(calls.contactRate, 0.35) * 0.6 + ratioScore(calls.qualifyRate ?? 0, 0.25) * 0.4)
    : null

  // Cierre: mitad tasa de victoria (objetivo 20 %), mitad pipeline que no se
  // atasca. Un pipeline lleno de oportunidades paradas no es un pipeline.
  const stalledCount = pipeline.byStage.reduce((acc, stage) => acc + stage.stalled, 0)
  const healthyRatio = pipeline.open > 0 ? 1 - stalledCount / pipeline.open : null
  const conversionScore = pipeline.won + pipeline.lost >= 5 || pipeline.open >= 5
    ? Math.round(ratioScore(pipeline.winRate ?? 0, 0.2) * 0.5 + ratioScore(healthyRatio ?? 0.5, 0.85) * 0.5)
    : null

  // Velocidad: responder en menos de 5 minutos multiplica la conversión; lo que
  // penaliza de verdad es el lead que nadie ha tocado.
  const speedBase = speed.medianMinutes == null
    ? null
    : speed.medianMinutes <= 5 ? 100 : speed.medianMinutes <= 60 ? 80 : speed.medianMinutes <= 24 * 60 ? 55 : 25
  const untouchedPenalty = input.leadsThisWindow > 0 ? Math.min(40, Math.round((speed.untouched / Math.max(1, input.leadsThisWindow)) * 100)) : 0
  const speedScore = speedBase == null
    ? (speed.untouched > 0 ? Math.max(0, 50 - untouchedPenalty) : null)
    : Math.max(0, speedBase - untouchedPenalty)

  // Economía: el retorno sobre lo invertido, con 3× como objetivo. Sin coste
  // medido no hay economía que juzgar.
  const roi = input.cost > 0 ? input.revenue / input.cost : null
  const economicsScore = roi == null ? null : ratioScore(roi, 3)

  return [
    {
      key: 'demand',
      label: AREA_LABEL.demand,
      score: demandScore,
      state: stateFor(demandScore),
      headline: demandTrend == null
        ? `${input.leadsThisWindow} leads nuevos`
        : `${demandTrend >= 0 ? '+' : ''}${demandTrend}% de leads`,
      evidence: input.leadsPreviousWindow > 0
        ? `${input.leadsThisWindow} leads en ${input.windowDays} días frente a ${input.leadsPreviousWindow} en el periodo anterior.`
        : `${input.leadsThisWindow} leads en ${input.windowDays} días. Sin periodo anterior con el que comparar todavía.`,
      href: '/captacion/nueva',
    },
    {
      key: 'conversation',
      label: AREA_LABEL.conversation,
      score: conversationScore,
      state: stateFor(conversationScore),
      headline: calls.contactRate != null ? `${Math.round(calls.contactRate * 100)}% de contacto` : 'Sin llamadas',
      evidence: calls.total >= 20
        ? `${calls.total} llamadas: hablas con una persona en el ${Math.round((calls.contactRate ?? 0) * 100)}% y cualificas al ${Math.round((calls.qualifyRate ?? 0) * 100)}% de quien te contesta.`
        : `Solo ${calls.total} llamadas en la ventana. Hasta 20 no hay muestra para juzgar el contacto.`,
      href: '/llamadas',
    },
    {
      key: 'conversion',
      label: AREA_LABEL.conversion,
      score: conversionScore,
      state: stateFor(conversionScore),
      headline: pipeline.winRate != null ? `${Math.round(pipeline.winRate * 100)}% de cierre` : `${pipeline.open} abiertas`,
      evidence: conversionScore == null
        ? `${pipeline.open} oportunidades abiertas y ${pipeline.won + pipeline.lost} cerradas. Hacen falta 5 para poder juzgar el cierre.`
        : `Ganas el ${Math.round((pipeline.winRate ?? 0) * 100)}% de lo que cierras y tienes ${stalledCount} de ${pipeline.open} oportunidades paradas más de lo que aguanta su etapa.`,
      href: '/ventas?vista=pipeline',
    },
    {
      key: 'speed',
      label: AREA_LABEL.speed,
      score: speedScore,
      state: stateFor(speedScore),
      headline: speed.medianMinutes == null
        ? (speed.untouched > 0 ? `${speed.untouched} sin tocar` : 'Sin medir')
        : speed.medianMinutes < 60 ? `${speed.medianMinutes} min` : `${Math.round(speed.medianMinutes / 60)} h`,
      evidence: speed.medianMinutes == null
        ? `Ningún lead tiene primera respuesta registrada${speed.untouched > 0 ? ` y ${speed.untouched} llevan más de 24 h sin un solo intento` : ''}.`
        : `Tardas ${speed.medianMinutes < 60 ? `${speed.medianMinutes} minutos` : `${Math.round(speed.medianMinutes / 60)} horas`} de mediana en responder y ${speed.untouched} leads llevan más de 24 h sin un solo intento.`,
      href: '/ventas?vista=leads',
    },
    {
      key: 'economics',
      label: AREA_LABEL.economics,
      score: economicsScore,
      state: stateFor(economicsScore),
      headline: roi == null ? 'Sin coste medido' : `${Math.round(roi * 100) / 100}× de retorno`,
      evidence: roi == null
        ? 'No hay gasto en anuncios ni coste de llamadas registrado en la ventana, así que no hay retorno que calcular.'
        : `Has invertido ${Math.round(input.cost)} y facturado ${Math.round(input.revenue)}. Con un ticket medio de ${Math.round(input.dealValue)}, cada venta tiene que costarte menos de eso para que el negocio respire.`,
      href: '/plan',
    },
  ]
}

export interface Verdict {
  score: number | null
  stage: 'arranque' | 'aprendiendo' | 'funcionando' | 'escalando' | 'en-riesgo'
  headline: string
  summary: string
  /** La cifra que se lee antes que nada. `null` cuando no hay nada que ganar todavía. */
  money: string | null
}

/**
 * La frase que diría un consultor al entrar por la puerta. Se construye del
 * área más débil, no de la media: la media esconde justo lo que hay que
 * arreglar. Y se cierra con dinero, porque «tu tasa de contacto es baja» no
 * mueve a nadie y «te estás dejando 2.400 al mes» sí.
 */
export function overallVerdict(
  scores: AreaScore[],
  context: { calls: number; revenue: number; cost: number },
  upside?: Pick<RevenueUpside, 'monthlyUpside' | 'recoverable' | 'annualUpside'>,
): Verdict {
  const money = (() => {
    if (!upside) return null
    if (upside.monthlyUpside > 0 && upside.recoverable > 0) {
      return `Hay ${Math.round(upside.monthlyUpside)} al mes en juego y ${Math.round(upside.recoverable)} ya pagados esperando a que alguien los llame.`
    }
    if (upside.monthlyUpside > 0) return `Hay ${Math.round(upside.monthlyUpside)} al mes en juego: ${Math.round(upside.annualUpside)} en un año.`
    if (upside.recoverable > 0) return `Tienes ${Math.round(upside.recoverable)} ya pagados y parados: es lo más barato que vas a cobrar este mes.`
    return null
  })()

  const measured = scores.filter(area => area.score != null)
  if (measured.length === 0 || context.calls < 20) {
    return {
      score: null,
      stage: 'arranque',
      headline: 'Todavía no hay departamento que medir',
      summary: `Con ${context.calls} llamadas registradas no hay muestra propia: todo lo que se ve son referencias del sector. La única prioridad ahora es volumen, no optimización.`,
      money,
    }
  }

  const average = Math.round(measured.reduce((acc, area) => acc + (area.score as number), 0) / measured.length)
  const weakest = measured.reduce((worst, area) => ((area.score as number) < (worst.score as number) ? area : worst))
  const strongest = measured.reduce((best, area) => ((area.score as number) > (best.score as number) ? area : best))
  const losingMoney = context.cost > 0 && context.revenue < context.cost

  const stage: Verdict['stage'] = losingMoney
    ? 'en-riesgo'
    : average >= 75 ? 'escalando' : average >= 55 ? 'funcionando' : average >= 35 ? 'aprendiendo' : 'en-riesgo'

  const headline = stage === 'escalando'
    ? 'El motor funciona: toca meterle más combustible'
    : stage === 'funcionando'
      ? `Funciona, pero ${weakest.label.toLowerCase()} te está frenando`
      : stage === 'aprendiendo'
        ? `Hay señal, pero ${weakest.label.toLowerCase()} no aguanta más volumen`
        : 'Estás pagando por aprender y no puedes seguir así mucho tiempo'

  const summary = losingMoney
    ? `Has invertido ${Math.round(context.cost)} y has facturado ${Math.round(context.revenue)}. Antes de subir un euro más, hay que arreglar ${weakest.label.toLowerCase()}: es lo que rompe la cadena.`
    : `Tu punto fuerte es ${strongest.label.toLowerCase()} (${strongest.score}/100) y tu punto débil ${weakest.label.toLowerCase()} (${weakest.score}/100). Subir el presupuesto sin tocar lo segundo solo compra más de lo mismo.`

  return { score: average, stage, headline, summary, money }
}

// ───────────────────────────────────────────────────────────────────────────
// Riesgos operativos
// ───────────────────────────────────────────────────────────────────────────

export interface Risk {
  id: string
  title: string
  detail: string
  severity: 'alta' | 'media' | 'baja'
  href: string
}

export interface RiskInput {
  activeAgents: number
  activeCampaigns: number
  callsLast7Days: number
  metaConnected: boolean
  adDataQuality: string | null
  adDataQualityAgeDays: number | null
  metricoolEnabled: boolean
  organicProject: boolean
  seoProjects: number
  minutesUsed: number
  minutesAllowed: number
  overdueTasks: number
  optOuts: number
  leadsWithoutOwner: number
}

export function buildRisks(input: RiskInput): Risk[] {
  const risks: Risk[] = []

  if (input.activeAgents === 0) {
    risks.push({
      id: 'no-agent',
      title: 'No tienes ningún agente activo',
      detail: 'Sin agente activo no sale ninguna llamada, por mucho presupuesto o leads que haya. Es el primer interruptor.',
      severity: 'alta',
      href: '/agentes',
    })
  }

  if (input.activeCampaigns > 0 && input.callsLast7Days === 0) {
    risks.push({
      id: 'idle-campaigns',
      title: `${input.activeCampaigns} campañas activas sin una sola llamada esta semana`,
      detail: 'Las campañas figuran en marcha pero no están produciendo actividad. O no tienen leads, o el agente no está llamando.',
      severity: 'alta',
      href: '/captacion/planificar',
    })
  }

  const minutesRatio = input.minutesAllowed > 0 ? input.minutesUsed / input.minutesAllowed : 0
  if (minutesRatio >= 0.8) {
    risks.push({
      id: 'minutes-cap',
      title: `Has consumido el ${Math.round(minutesRatio * 100)}% de los minutos del mes`,
      detail: `${input.minutesUsed} de ${input.minutesAllowed} minutos. Cuando se agoten, las llamadas se cortan a mitad de mes y el embudo se queda seco.`,
      severity: minutesRatio >= 1 ? 'alta' : 'media',
      href: '/configuracion',
    })
  }

  if (input.adDataQuality && input.adDataQuality !== 'ready') {
    risks.push({
      id: 'ad-data-quality',
      title: 'Los datos de anuncios no son fiables',
      detail: `El diagnóstico de calidad marca «${input.adDataQuality}»${input.adDataQualityAgeDays != null ? ` y se calculó hace ${input.adDataQualityAgeDays} días` : ''}. Decidir presupuesto con estos números es decidir a ciegas.`,
      severity: 'media',
      href: '/captacion/atraer/ads',
    })
  }

  if (!input.metaConnected) {
    risks.push({
      id: 'meta-disconnected',
      title: 'No hay cuenta de anuncios conectada',
      detail: 'Sin la cuenta de Meta conectada, ni el gasto ni los leads de pago entran en el cálculo: el retorno que ves está incompleto.',
      severity: 'media',
      href: '/captacion/conectar',
    })
  }

  if (!input.metricoolEnabled) {
    risks.push({
      id: 'social-disconnected',
      title: 'Las redes sociales no están conectadas',
      detail: 'Sin conectar redes no se sabe qué tráfico y qué leads llegan del contenido orgánico, y ese canal aparece como cero cuando puede no serlo.',
      severity: 'baja',
      href: '/captacion/atraer/organico',
    })
  }

  if (!input.organicProject && input.seoProjects === 0) {
    risks.push({
      id: 'no-organic',
      title: 'Todo depende de canales de pago',
      detail: 'No hay proyecto orgánico ni web vigilada. Mientras el 100 % de la demanda se compre, cada subida de coste por lead es una bajada directa de margen.',
      severity: 'media',
      href: '/captacion/convertir?tab=seo',
    })
  }


  if (input.overdueTasks > 0) {
    risks.push({
      id: 'overdue-tasks',
      title: `${input.overdueTasks} tareas comerciales vencidas`,
      detail: 'Cada tarea vencida es un compromiso de seguimiento que no se ha cumplido. Es la forma más barata de perder una venta ya ganada.',
      severity: input.overdueTasks >= 10 ? 'media' : 'baja',
      href: '/calendario',
    })
  }

  if (input.leadsWithoutOwner > 0) {
    risks.push({
      id: 'unassigned-leads',
      title: `${input.leadsWithoutOwner} leads sin responsable`,
      detail: 'Un lead sin dueño es un lead del que nadie responde. Asígnalos aunque sea a una sola persona.',
      severity: 'baja',
      href: '/ventas?vista=leads',
    })
  }

  const order = { alta: 0, media: 1, baja: 2 }
  return risks.sort((a, b) => order[a.severity] - order[b.severity])
}

// ───────────────────────────────────────────────────────────────────────────
// Plan de acción con importe
// ───────────────────────────────────────────────────────────────────────────

export interface ConsultantAction {
  id: string
  area: AreaKey | 'operations'
  title: string
  /** Qué se ha visto en los datos para proponer esto. */
  evidence: string
  /** Qué hacer, paso a paso. Es la parte de consultor: la recomendación sin plan no se ejecuta. */
  steps: string[]
  impact: 'alto' | 'medio' | 'bajo'
  effort: 'bajo' | 'medio' | 'alto'
  /** Euros al mes que se ganan (o dejan de perderse) si se hace. `null` cuando no se puede estimar con honestidad. */
  expectedGain: number | null
  horizon: 'hoy' | 'esta-semana' | 'este-mes'
  href: string
  ctaLabel: string
}

export interface ActionContext {
  snapshot: PredictorSnapshot
  calls: CallOperations
  pipeline: PipelineHealth
  speed: ResponseSpeed
  channels: ChannelPerformance[]
  scores: AreaScore[]
  monthlyCalls: number
}

const IMPACT_ORDER = { alto: 0, medio: 1, bajo: 2 }

/**
 * El plan. Cada acción sale de una cifra concreta y lleva el importe que se
 * juega, porque «mejora tu tasa de contacto» sin un número al lado no compite
 * con las otras quince cosas que esa persona tiene que hacer hoy.
 *
 * El importe es deliberadamente conservador: se calcula sobre el ticket medio
 * y las tasas medidas, y cuando falta alguna de las dos se devuelve `null` en
 * vez de una cifra bonita.
 */
export function consultantActions(context: ActionContext): ConsultantAction[] {
  const { snapshot, calls, pipeline, speed, channels } = context
  const actions: ConsultantAction[] = []
  const dealValue = snapshot.dealValue.value
  const canPriceIt = snapshot.dealValue.source === 'own' || snapshot.history.won > 0

  /** Ventas al mes que salen de un número de conversaciones, con las tasas medidas. */
  const salesFromConversations = (conversations: number) =>
    conversations * snapshot.rates.qualify.value * snapshot.rates.opportunity.value * snapshot.rates.win.value

  if (snapshot.history.calls < 20) {
    actions.push({
      id: 'get-sample',
      area: 'demand',
      title: 'Haz 20 llamadas antes de tocar nada más',
      evidence: `Llevas ${snapshot.history.calls} llamadas en ${snapshot.windowDays} días. Por debajo de 20 no hay tasas propias y todo lo que ves son referencias del sector.`,
      steps: [
        'Sube o elige una lista de al menos 50 contactos del mismo perfil.',
        'Deja un solo agente y un solo guion: con dos variables a la vez no se aprende nada.',
        'Lanza la campaña y no la toques hasta tener 20 llamadas con resultado.',
      ],
      impact: 'alto',
      effort: 'bajo',
      expectedGain: null,
      horizon: 'hoy',
      href: '/captacion/planificar',
      ctaLabel: 'Lanzar campaña',
    })
  }

  if (calls.total >= 20 && calls.contactRate != null && calls.contactRate < 0.3 && calls.bestHour) {
    const potential = context.monthlyCalls * (calls.bestHour.contactRate - calls.contactRate)
    const gain = canPriceIt ? Math.round(salesFromConversations(potential) * dealValue) : null
    actions.push({
      id: 'call-window',
      area: 'conversation',
      title: `Concentra las llamadas a las ${calls.bestHour.hour}:00`,
      evidence: `Contactas en el ${Math.round(calls.contactRate * 100)}% de las llamadas, pero a las ${calls.bestHour.hour}:00 subes al ${Math.round(calls.bestHour.contactRate * 100)}% (${calls.bestHour.calls} llamadas medidas)${calls.worstHour ? `, y a las ${calls.worstHour.hour}:00 bajas al ${Math.round(calls.worstHour.contactRate * 100)}%` : ''}.`,
      steps: [
        `Mueve el horario del agente para que la mayor parte de los intentos caigan alrededor de las ${calls.bestHour.hour}:00.`,
        calls.worstHour ? `Deja de llamar a las ${calls.worstHour.hour}:00: esas llamadas cuestan lo mismo y contactan la mitad.` : 'Reparte el resto de intentos fuera de las franjas con peor contacto.',
        'Revisa el efecto dentro de dos semanas antes de volver a tocarlo.',
      ],
      impact: 'alto',
      effort: 'bajo',
      expectedGain: gain,
      horizon: 'hoy',
      href: '/agentes',
      ctaLabel: 'Ajustar horario',
    })
  }

  if (calls.machineRate != null && calls.machineRate > 0.4 && calls.total >= 20) {
    actions.push({
      id: 'bad-list',
      area: 'demand',
      title: 'Cuatro de cada diez llamadas van a un buzón o una centralita',
      evidence: `El ${Math.round(calls.machineRate * 100)}% de las llamadas acaba en buzón, centralita o ruido. Eso no es un problema de guion: es la lista.`,
      steps: [
        'Filtra la lista por teléfono móvil verificado antes de volver a cargarla.',
        'Descarta los números que ya han fallado tres veces: no van a contestar.',
        'Si la lista viene de un proveedor, pídele reemplazo de los no contactables.',
      ],
      impact: 'alto',
      effort: 'medio',
      expectedGain: null,
      horizon: 'esta-semana',
      href: '/captacion/atraer/prospectos',
      ctaLabel: 'Revisar listas',
    })
  }

  const reliableAgents = calls.byAgent.filter(agent => agent.reliable)
  if (reliableAgents.length >= 2) {
    const best = reliableAgents.reduce((top, agent) => (agent.qualifyRate > top.qualifyRate ? agent : top))
    const worst = reliableAgents.reduce((low, agent) => (agent.qualifyRate < low.qualifyRate ? agent : low))
    if (best.qualifyRate - worst.qualifyRate >= 0.1) {
      const potential = worst.contacted * (best.qualifyRate - worst.qualifyRate)
      const gain = canPriceIt
        ? Math.round(potential * snapshot.rates.opportunity.value * snapshot.rates.win.value * dealValue * (30 / snapshot.windowDays))
        : null
      actions.push({
        id: 'agent-gap',
        area: 'conversation',
        title: `Copia el guion de «${best.name}» al resto de agentes`,
        evidence: `«${best.name}» cualifica al ${Math.round(best.qualifyRate * 100)}% de con quien habla y «${worst.name}» al ${Math.round(worst.qualifyRate * 100)}%, con muestra suficiente en los dos. La diferencia no es suerte.`,
        steps: [
          `Escucha tres llamadas cualificadas de «${best.name}» y tres perdidas de «${worst.name}».`,
          'Lleva al guion peor las preguntas de descubrimiento del mejor, literalmente.',
          'Vuelve a comparar cuando el agente corregido tenga 15 llamadas nuevas.',
        ],
        impact: 'alto',
        effort: 'medio',
        expectedGain: gain,
        horizon: 'esta-semana',
        href: '/agentes',
        ctaLabel: 'Comparar agentes',
      })
    }
  }

  if (speed.untouched > 0) {
    const gain = canPriceIt
      ? Math.round(speed.untouched * snapshot.rates.contact.value * snapshot.rates.qualify.value * snapshot.rates.opportunity.value * snapshot.rates.win.value * dealValue)
      : null
    actions.push({
      id: 'untouched-leads',
      area: 'speed',
      title: `Llama hoy a los ${speed.untouched} leads que nadie ha tocado`,
      evidence: `${speed.untouched} leads llevan más de 24 h sin un solo intento${speed.untouchedOldestDays ? `, y el más antiguo lleva ${speed.untouchedOldestDays} días` : ''}. Ya están pagados.`,
      steps: [
        'Filtra los leads sin intentos y asígnalos a una campaña de recuperación.',
        'Llama primero a los de menos de 72 h: la conversión cae en picado a partir de ahí.',
        'Pon un aviso automático para que ningún lead nuevo pase de 1 hora sin intento.',
      ],
      impact: 'alto',
      effort: 'bajo',
      expectedGain: gain,
      horizon: 'hoy',
      href: '/ventas?vista=leads',
      ctaLabel: 'Ver leads sin tocar',
    })
  }

  if (speed.medianMinutes != null && speed.medianMinutes > 60) {
    actions.push({
      id: 'response-time',
      area: 'speed',
      title: 'Responde en menos de 5 minutos, no en horas',
      evidence: `Tardas ${speed.medianMinutes < 1440 ? `${Math.round(speed.medianMinutes / 60)} horas` : `${Math.round(speed.medianMinutes / 1440)} días`} de mediana en dar la primera respuesta. El lead que rellena un formulario está comparando en ese mismo momento.`,
      steps: [
        'Activa la llamada automática al alta del lead en la campaña que más leads trae.',
        'Deja el resto de intentos escalonados: minuto 0, hora 1, día siguiente.',
        'Mide la mediana otra vez en dos semanas.',
      ],
      impact: 'alto',
      effort: 'bajo',
      expectedGain: null,
      horizon: 'esta-semana',
      href: '/automatizaciones',
      ctaLabel: 'Automatizar respuesta',
    })
  }

  const stalledValue = pipeline.byStage.reduce((acc, stage) => acc + stage.stalledValue, 0)
  if (stalledValue > 0) {
    actions.push({
      id: 'stalled-pipeline',
      area: 'conversion',
      title: `Desatasca ${Math.round(stalledValue)} parados en el pipeline`,
      evidence: `${pipeline.byStage.reduce((acc, stage) => acc + stage.stalled, 0)} oportunidades llevan más días en su etapa de los que esa etapa aguanta. Son ventas ya trabajadas que se están enfriando.`,
      steps: [
        'Ordena las paradas por importe y quédate con las cinco primeras.',
        'A cada una, una sola pregunta de cierre: «¿seguimos o lo dejamos?». El «no» también libera tiempo.',
        'Lo que no tenga próxima fecha después de esa llamada, se marca como perdido con motivo.',
      ],
      impact: 'alto',
      effort: 'bajo',
      expectedGain: canPriceIt ? Math.round(stalledValue * (pipeline.winRate ?? snapshot.rates.win.value)) : null,
      horizon: 'esta-semana',
      href: '/ventas?vista=pipeline',
      ctaLabel: 'Abrir pipeline',
    })
  }

  if (pipeline.lost >= 3) {
    const topReason = pipeline.lossReasons[0]
    if (topReason && topReason.reason === 'Sin motivo registrado' && topReason.share >= 50) {
      actions.push({
        id: 'loss-reasons',
        area: 'conversion',
        title: 'Registra por qué pierdes: hoy no lo sabes',
        evidence: `El ${topReason.share}% de las oportunidades perdidas no tiene motivo. Sin eso no hay forma de saber si pierdes por precio, por producto o por tiempos.`,
        steps: [
          'Haz obligatorio el motivo al marcar una oportunidad como perdida.',
          'Usa cuatro motivos, no quince: precio, momento, competencia, no encaja.',
          'Revisa el reparto dentro de un mes: ahí está la siguiente mejora del guion.',
        ],
        impact: 'medio',
        effort: 'bajo',
        expectedGain: null,
        horizon: 'esta-semana',
        href: '/ventas?vista=pipeline',
        ctaLabel: 'Revisar perdidas',
      })
    } else if (topReason) {
      actions.push({
        id: 'top-loss-reason',
        area: 'conversion',
        title: `Ataca el motivo por el que más pierdes: ${topReason.reason.toLowerCase()}`,
        evidence: `${topReason.count} de ${pipeline.lost} oportunidades perdidas (${topReason.share}%) se caen por lo mismo.`,
        steps: [
          'Lleva ese motivo al guion del agente como objeción anticipada, antes de que la digan.',
          'Prepara una pieza de contenido que la responda y mándala antes de la reunión.',
          'Vuelve a mirar el reparto de motivos en 30 días.',
        ],
        impact: 'medio',
        effort: 'medio',
        expectedGain: null,
        horizon: 'este-mes',
        href: '/agentes',
        ctaLabel: 'Ajustar guion',
      })
    }
  }

  const toStop = channels.filter(channel => channel.verdict === 'parar')
  for (const channel of toStop) {
    actions.push({
      id: `stop-${channel.channel}`,
      area: 'economics',
      title: `Corta el presupuesto de ${channel.label.toLowerCase()}`,
      evidence: channel.reason,
      steps: [
        'Pausa la inversión, no la borres: los datos del histórico siguen valiendo.',
        'Traslada ese importe al canal con mejor retorno medido.',
        'Reabre solo con una hipótesis nueva (otro público, otro mensaje), no con más dinero.',
      ],
      impact: 'alto',
      effort: 'bajo',
      expectedGain: Math.round(channel.cost * (30 / snapshot.windowDays)),
      horizon: 'hoy',
      href: channel.href,
      ctaLabel: 'Revisar canal',
    })
  }

  const toScale = channels.filter(channel => channel.verdict === 'escalar' && channel.costBasis === 'money')
  for (const channel of toScale.slice(0, 2)) {
    const gain = channel.roi != null ? Math.round(channel.cost * 0.3 * (channel.roi - 1) * (30 / snapshot.windowDays)) : null
    actions.push({
      id: `scale-${channel.channel}`,
      area: 'economics',
      title: `Sube un 30% el presupuesto de ${channel.label.toLowerCase()}`,
      evidence: channel.reason,
      steps: [
        'Sube el presupuesto un 30 %, no lo dupliques: los canales de puja se resienten con saltos grandes.',
        'Espera dos semanas antes de volver a subirlo y mira si el coste por lead se mantiene.',
        'Si el coste por lead sube más de un 20 %, has tocado el techo del público: toca abrir otro.',
      ],
      impact: 'alto',
      effort: 'bajo',
      expectedGain: gain,
      horizon: 'esta-semana',
      href: channel.href,
      ctaLabel: 'Subir presupuesto',
    })
  }

  const unknown = channels.find(channel => channel.channel === 'unknown')
  if (unknown && unknown.share >= 30) {
    actions.push({
      id: 'attribution',
      area: 'operations',
      title: `El ${unknown.share}% de tus leads no sabes de dónde vienen`,
      evidence: `${unknown.leads} leads sin origen identificado. Repartir presupuesto con un tercio del embudo a oscuras es repartirlo a suertes.`,
      steps: [
        'Pon UTMs en todos los enlaces que publiques: anuncios, redes, firma de correo.',
        'Conecta las cuentas que falten para que el origen llegue solo.',
        'Para lo que entre por teléfono, añade la pregunta «¿cómo nos has conocido?» al guion.',
      ],
      impact: 'medio',
      effort: 'medio',
      expectedGain: null,
      horizon: 'este-mes',
      href: '/conexiones',
      ctaLabel: 'Revisar conexiones',
    })
  }

  return actions.sort((a, b) => {
    const byImpact = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]
    if (byImpact !== 0) return byImpact
    return (b.expectedGain ?? 0) - (a.expectedGain ?? 0)
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Lo que puedes ganar
// ───────────────────────────────────────────────────────────────────────────

/**
 * `ingreso` suma al techo de facturación. `ahorro` no factura más: deja de
 * quemar, y por eso va aparte —mezclarlos infla el techo con dinero que no
 * entra—. `rescate` es dinero ya pagado que sigue ahí y se cobra una sola vez.
 */
export type UpsideKind = 'ingreso' | 'ahorro' | 'rescate'
export type Confidence = 'alta' | 'media' | 'baja'

export interface UpsideLever {
  id: string
  title: string
  kind: UpsideKind
  /** Euros al mes (`ingreso`/`ahorro`) o de una vez (`rescate`). */
  amount: number
  /** La cuenta, escrita para que se pueda discutir en vez de creer. */
  basis: string
  confidence: Confidence
  effort: 'bajo' | 'medio' | 'alto'
  /** Meses hasta verlo entero: una palanca de guion no rinde el día uno. */
  rampMonths: number
  /** La acción del plan que lo ejecuta, si la hay. */
  actionId: string | null
  href: string
}

export interface UnitEconomics {
  perCall: number
  perConversation: number
  perLead: number
  perMinute: number
  costPerCall: number
  marginPerCall: number
  callsPerSale: number | null
}

export interface RevenueUpside {
  /** Facturación mensual de hoy, mensualizada desde la ventana medida. */
  current: number
  /** Techo mensual si se ejecutan las palancas de ingreso. */
  ceiling: number
  monthlyUpside: number
  annualUpside: number
  monthlySavings: number
  /** Dinero ya pagado que está parado y se cobra una vez. */
  recoverable: number
  /** Lo que cuesta cada semana de no hacer nada. */
  weeklyCostOfInaction: number
  confidence: Confidence
  confidenceNote: string
  levers: UpsideLever[]
  unit: UnitEconomics
  /** Doce meses, sin cambios y con el plan, para ver la diferencia acumulada. */
  trajectory: { month: number; base: number; plan: number; baseAccumulated: number; planAccumulated: number }[]
  /** Diferencia acumulada a doce meses: lo que te dejas por no hacerlo. */
  twelveMonthGap: number
}

export interface UpsideInput {
  snapshot: PredictorSnapshot
  calls: CallOperations
  speed: ResponseSpeed
  pipeline: PipelineHealth
  channels: ChannelPerformance[]
  windowDays: number
  /** Ingresos medidos en la ventana; se mensualizan aquí. */
  windowRevenue: number
}

/**
 * Un lead que lleva dos semanas sin que nadie lo llame no convierte como uno
 * fresco. Se descuenta a la mitad en vez de contarlo entero: es la diferencia
 * entre una estimación y un folleto.
 */
const STALE_LEAD_DISCOUNT = 0.5

/**
 * De los intentos que hoy se comen buzones y centralitas, no todos se
 * convierten en conversación al depurar la lista. Se cuenta la mitad.
 */
const LIST_CLEANUP_YIELD = 0.5

/** Una oportunidad parada se cierra peor que una viva, aunque se rescate. */
const STALLED_DISCOUNT = 0.7

/** Por debajo de esta inversión mensual, «subir un 30%» no es una palanca. */
const MIN_SCALABLE_SPEND = 50

/**
 * Los rescates no se cobran en un día: hay que llamar a la lista y reabrir las
 * conversaciones paradas. Se reparten en tres meses para que la trayectoria no
 * dibuje un pico imposible en el mes uno.
 */
const RESCUE_MONTHS = 3

/**
 * Cuánto dinero hay encima de la mesa y de dónde sale cada euro.
 *
 * Tres reglas para que esto sea una cuenta y no una promesa:
 *
 * 1. Cada palanca compara contra algo ya medido —tu mejor hora, tu mejor
 *    agente, la referencia del sector—, nunca contra un ideal inventado.
 * 2. Todo lo que no está seguro se descuenta hacia abajo y se dice el
 *    descuento. Prometer de más aquí es la forma más rápida de que nadie
 *    vuelva a creerse una cifra de esta pantalla.
 * 3. La confianza viaja con el número. Con ticket de referencia, esto orienta;
 *    no se firma un contrato con ello.
 */
export function revenueUpside(input: UpsideInput): RevenueUpside {
  const { snapshot, calls, speed, pipeline, channels, windowDays } = input
  const { rates, dealValue } = snapshot
  const toMonth = 30 / Math.max(1, windowDays)

  const afterConversation = rates.qualify.value * rates.opportunity.value * rates.win.value
  const valuePerConversation = afterConversation * dealValue.value
  const valuePerCall = rates.contact.value * valuePerConversation
  const valuePerLead = valuePerCall
  const costPerCall = snapshot.costPerMinute * snapshot.minutesPerCall

  const current = Math.round(input.windowRevenue * toMonth)
  const monthlyCalls = calls.total * toMonth
  const monthlyContacted = calls.contacted * toMonth

  const levers: UpsideLever[] = []
  const ownRates = (['contact', 'qualify', 'opportunity', 'win'] as const).every(key => rates[key].source === 'own')
  const baseConfidence: Confidence = dealValue.source === 'baseline' ? 'baja' : ownRates ? 'alta' : 'media'
  /** Nunca por encima de la confianza general: una palanca no puede saber más que sus tasas. */
  const cap = (level: Confidence): Confidence => {
    const order = { alta: 2, media: 1, baja: 0 }
    return order[level] <= order[baseConfidence] ? level : baseConfidence
  }

  // ── Rescates: dinero ya pagado que está parado ──────────────────────────
  if (speed.untouched > 0 && valuePerLead > 0) {
    levers.push({
      id: 'untouched-leads',
      title: `Llamar a los ${speed.untouched} leads que nadie ha tocado`,
      kind: 'rescate',
      amount: Math.round(speed.untouched * valuePerLead),
      basis: `${speed.untouched} leads × ${Math.round(valuePerLead)} que vale de media un lead tuyo. Ya los has pagado: esto no cuesta un euro más.`,
      confidence: cap('alta'),
      effort: 'bajo',
      rampMonths: 1,
      actionId: 'untouched-leads',
      href: '/ventas?vista=leads',
    })
  }

  if (speed.stale > 0 && valuePerLead > 0) {
    levers.push({
      id: 'stale-leads',
      title: `Reactivar los ${speed.stale} leads abandonados`,
      kind: 'rescate',
      amount: Math.round(speed.stale * valuePerLead * STALE_LEAD_DISCOUNT),
      basis: `${speed.stale} leads sin un intento desde hace más de 14 días × ${Math.round(valuePerLead)} de valor, descontado a la mitad porque un lead frío convierte peor que uno recién llegado.`,
      confidence: cap('media'),
      effort: 'bajo',
      rampMonths: 2,
      actionId: null,
      href: '/ventas?vista=leads',
    })
  }

  const stalledValue = pipeline.byStage.reduce((total, stage) => total + stage.stalledValue, 0)
  const stalledCount = pipeline.byStage.reduce((total, stage) => total + stage.stalled, 0)
  if (stalledValue > 0) {
    const winRate = pipeline.winRate ?? rates.win.value
    levers.push({
      id: 'stalled-pipeline',
      title: `Desatascar las ${stalledCount} oportunidades paradas`,
      kind: 'rescate',
      amount: Math.round(stalledValue * winRate * STALLED_DISCOUNT),
      basis: `${Math.round(stalledValue)} parados × ${Math.round(winRate * 100)}% que cierras de media, descontado un 30% porque una oportunidad quieta cierra peor que una viva.`,
      confidence: cap(pipeline.won + pipeline.lost >= 5 ? 'media' : 'baja'),
      effort: 'bajo',
      rampMonths: 2,
      actionId: 'stalled-pipeline',
      href: '/ventas?vista=pipeline',
    })
  }

  // ── Contacto: tres arreglos que empujan la misma palanca ────────────────
  //
  // Llamar a mejor hora, depurar la lista y responder antes mejoran todos la
  // MISMA tasa de contacto. Sumarlos enteros es cómo se fabrica un potencial
  // de fantasía: se recogen como puntos de contacto y se reparten dentro de un
  // techo común, el de tu propia mejor franja. Nadie contacta mejor que su
  // mejor día, y menos haciendo tres cosas a la vez.
  const contactCandidates: { id: string; title: string; delta: number; confidence: Confidence; effort: UpsideLever['effort']; rampMonths: number; actionId: string; href: string; detail: string }[] = []

  if (calls.bestHour && calls.contactRate != null && calls.bestHour.contactRate > calls.contactRate + 0.02) {
    contactCandidates.push({
      id: 'call-window',
      title: `Llamar en tu mejor franja (${calls.bestHour.hour}:00)`,
      delta: calls.bestHour.contactRate - calls.contactRate,
      confidence: 'alta',
      effort: 'bajo',
      rampMonths: 1,
      actionId: 'call-window',
      href: '/agentes',
      detail: `medido sobre tus propias ${calls.bestHour.calls} llamadas de esa franja`,
    })
  }

  if (calls.machineRate != null && calls.machineRate > 0.4) {
    contactCandidates.push({
      id: 'bad-list',
      title: 'Depurar la lista para dejar de llamar a buzones',
      delta: (calls.machineRate - 0.25) * LIST_CLEANUP_YIELD,
      confidence: 'media',
      effort: 'medio',
      rampMonths: 2,
      actionId: 'bad-list',
      href: '/captacion/atraer/prospectos',
      detail: `${Math.round(calls.machineRate * 100)}% de tus llamadas acaban en buzón o centralita y solo la mitad de lo que se recupere será conversación`,
    })
  }

  if (speed.medianMinutes != null && speed.medianMinutes > 60) {
    contactCandidates.push({
      id: 'response-time',
      title: 'Responder en minutos en vez de en horas',
      // Suelo prudente de 5 puntos, no los que promete cualquier estudio.
      delta: 0.05,
      confidence: 'baja',
      effort: 'bajo',
      rampMonths: 1,
      actionId: 'response-time',
      href: '/automatizaciones',
      detail: `hoy tardas ${speed.medianMinutes < 1440 ? `${Math.round(speed.medianMinutes / 60)} horas` : `${Math.round(speed.medianMinutes / 1440)} días`} de mediana en dar la primera respuesta`,
    })
  }

  if (contactCandidates.length > 0 && monthlyCalls > 0 && calls.contactRate != null) {
    const wanted = contactCandidates.reduce((total, candidate) => total + candidate.delta, 0)
    // El techo: tu mejor franja medida o quince puntos por encima de donde
    // estás, lo que sea mayor, y nunca más del 85 %.
    const ceilingRate = Math.min(0.85, Math.max(calls.bestHour?.contactRate ?? 0, calls.contactRate + 0.15))
    const headroom = Math.max(0, ceilingRate - calls.contactRate)
    const scale = wanted > headroom && wanted > 0 ? headroom / wanted : 1

    for (const candidate of contactCandidates) {
      const delta = candidate.delta * scale
      const amount = Math.round(monthlyCalls * delta * valuePerConversation)
      if (amount <= 0) continue
      levers.push({
        id: candidate.id,
        title: candidate.title,
        kind: 'ingreso',
        amount,
        basis: `${Math.round(monthlyCalls)} llamadas al mes × ${Math.round(delta * 1000) / 10} puntos más de contacto × ${Math.round(valuePerConversation)} que vale cada conversación (${candidate.detail})${scale < 0.999 ? `. Recortado porque esta mejora se pisa con las otras del mismo bloque: juntas no pueden pasar del ${Math.round(ceilingRate * 100)}% de contacto, que es tu mejor franja medida` : ''}.`,
        confidence: cap(candidate.confidence),
        effort: candidate.effort,
        rampMonths: candidate.rampMonths,
        actionId: candidate.actionId,
        href: candidate.href,
      })
    }
  }

  const comparableAgents = calls.byAgent.filter(agent => agent.reliable)
  if (comparableAgents.length >= 2 && calls.qualifyRate != null) {
    const best = comparableAgents.reduce((top, agent) => (agent.qualifyRate > top.qualifyRate ? agent : top))
    const delta = best.qualifyRate - calls.qualifyRate
    if (delta >= 0.05 && monthlyContacted > 0) {
      levers.push({
        id: 'agent-gap',
        title: `Llevar a todos los agentes al nivel de «${best.name}»`,
        kind: 'ingreso',
        amount: Math.round(monthlyContacted * delta * rates.opportunity.value * rates.win.value * dealValue.value),
        basis: `${Math.round(monthlyContacted)} conversaciones al mes × ${Math.round(delta * 100)} puntos de cualificación que le sacas al resto × lo que rinde después una cualificación. «${best.name}» ya lo hace con ${best.calls} llamadas medidas.`,
        confidence: cap('alta'),
        effort: 'medio',
        rampMonths: 2,
        actionId: 'agent-gap',
        href: '/agentes',
      })
    }
  }

  // ── Canales: escalar lo que devuelve, cortar lo que no ──────────────────
  for (const channel of channels) {
    // Solo se puede «subir un 30%» lo que tiene un presupuesto que subir. Un
    // canal orgánico cuyo único coste es llamar a sus leads no tiene ese dial,
    // y su retorno —dividir ingresos entre cuatro llamadas— sale disparado sin
    // que eso signifique nada. Por debajo de 50 al mes tampoco es una palanca:
    // es ruido con nombre de estrategia.
    const monthlySpend = channel.spend * toMonth
    if (channel.verdict === 'escalar' && monthlySpend >= MIN_SCALABLE_SPEND && channel.roi != null && channel.roi > 1) {
      levers.push({
        id: `scale-${channel.channel}`,
        title: `Subir un 30% ${channel.label.toLowerCase()}`,
        kind: 'ingreso',
        amount: Math.round(monthlySpend * 0.3 * (channel.roi - 1)),
        basis: `${Math.round(monthlySpend)} al mes de inversión × 30% más × ${channel.roi}× de retorno medido, contando solo el beneficio por encima de lo invertido.`,
        confidence: cap(channel.maturity === 'mature' ? 'media' : 'baja'),
        effort: 'bajo',
        rampMonths: 2,
        actionId: `scale-${channel.channel}`,
        href: channel.href,
      })
    }
    if (channel.verdict === 'parar' && channel.cost > 0) {
      levers.push({
        id: `stop-${channel.channel}`,
        title: `Dejar de quemar en ${channel.label.toLowerCase()}`,
        kind: 'ahorro',
        amount: Math.round(channel.cost * toMonth),
        basis: `${Math.round(channel.cost)} invertidos en ${windowDays} días que han devuelto ${Math.round(channel.revenue)}. Esto no factura más: deja de restar.`,
        confidence: cap(channel.maturity === 'mature' ? 'alta' : 'media'),
        effort: 'bajo',
        rampMonths: 1,
        actionId: `stop-${channel.channel}`,
        href: channel.href,
      })
    }
  }

  levers.sort((a, b) => b.amount - a.amount)

  const monthlyUpside = levers.filter(lever => lever.kind === 'ingreso').reduce((total, lever) => total + lever.amount, 0)
  const monthlySavings = levers.filter(lever => lever.kind === 'ahorro').reduce((total, lever) => total + lever.amount, 0)
  const recoverable = levers.filter(lever => lever.kind === 'rescate').reduce((total, lever) => total + lever.amount, 0)

  // Trayectoria: nada rinde entero el primer mes, así que cada palanca entra
  // por su rampa. Los rescates son de una vez y caen en el mes uno.
  const trajectory: RevenueUpside['trajectory'] = []
  let baseAccumulated = 0
  let planAccumulated = 0
  for (let month = 1; month <= 12; month++) {
    const ramped = levers
      .filter(lever => lever.kind === 'ingreso')
      .reduce((total, lever) => total + lever.amount * Math.min(1, month / Math.max(1, lever.rampMonths)), 0)
    const plan = current + ramped + (month <= RESCUE_MONTHS ? recoverable / RESCUE_MONTHS : 0)
    baseAccumulated += current
    planAccumulated += plan
    trajectory.push({
      month,
      base: Math.round(current),
      plan: Math.round(plan),
      baseAccumulated: Math.round(baseAccumulated),
      planAccumulated: Math.round(planAccumulated),
    })
  }

  const confidenceNote = baseConfidence === 'baja'
    ? 'El ticket medio todavía es una referencia del sector, así que estas cifras orientan la prioridad —qué arreglar antes que qué— pero no son tu dinero hasta que tengas cinco ventas propias.'
    : baseConfidence === 'media'
      ? 'El ticket medio es tuyo, pero alguna tasa del embudo aún usa la referencia del sector. Las cifras son razonables; el orden de las palancas es más fiable que el importe exacto.'
      : 'Todas las tasas y el ticket medio salen de tus propios datos. Es la mejor estimación que se puede hacer con lo que has medido.'

  return {
    current,
    ceiling: Math.round(current + monthlyUpside),
    monthlyUpside: Math.round(monthlyUpside),
    annualUpside: Math.round(monthlyUpside * 12),
    monthlySavings: Math.round(monthlySavings),
    recoverable: Math.round(recoverable),
    weeklyCostOfInaction: Math.round((monthlyUpside + monthlySavings) * (7 / 30)),
    confidence: baseConfidence,
    confidenceNote,
    levers,
    unit: {
      perCall: Math.round(valuePerCall * 100) / 100,
      perConversation: Math.round(valuePerConversation * 100) / 100,
      perLead: Math.round(valuePerLead * 100) / 100,
      perMinute: snapshot.minutesPerCall > 0 ? Math.round((valuePerCall / snapshot.minutesPerCall) * 100) / 100 : 0,
      costPerCall: Math.round(costPerCall * 100) / 100,
      marginPerCall: Math.round((valuePerCall - costPerCall) * 100) / 100,
      callsPerSale: valuePerCall > 0 ? Math.ceil(dealValue.value / valuePerCall) : null,
    },
    trajectory,
    twelveMonthGap: Math.round(planAccumulated - baseAccumulated),
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Objetivo de facturación (la cuenta al revés)
// ───────────────────────────────────────────────────────────────────────────

export interface GoalPlan {
  goal: number
  sales: number
  opportunities: number
  qualified: number
  conversations: number
  calls: number
  leads: number
  budget: number
  minutes: number
  minutesAllowed: number
  feasibleWithPlan: boolean
  monthsAtCurrentPace: number | null
  note: string
}

/**
 * Al revés que la proyección: no «si invierto X, cuánto saco», sino «quiero
 * facturar X, qué hace falta». Es la pregunta que hace el dueño, y encadena las
 * mismas tasas para que las dos cuentas no se contradigan.
 */
export function goalPlan(snapshot: PredictorSnapshot, goal: number, plan = 'free', monthlyRevenue = 0): GoalPlan {
  const { rates, dealValue } = snapshot
  const sales = dealValue.value > 0 ? goal / dealValue.value : 0
  const opportunities = rates.win.value > 0 ? sales / rates.win.value : 0
  const qualified = rates.opportunity.value > 0 ? opportunities / rates.opportunity.value : 0
  const conversations = rates.qualify.value > 0 ? qualified / rates.qualify.value : 0
  const calls = rates.contact.value > 0 ? conversations / rates.contact.value : 0
  const minutes = Math.round(calls * snapshot.minutesPerCall)
  const budget = Math.ceil(calls * snapshot.minutesPerCall * snapshot.costPerMinute)
  const minutesAllowed = CONSUMPTION_LIMITS[planPolicy(plan).key].call_minutes

  return {
    goal: Math.round(goal),
    sales: Math.round(sales * 10) / 10,
    opportunities: Math.ceil(opportunities),
    qualified: Math.ceil(qualified),
    conversations: Math.ceil(conversations),
    calls: Math.ceil(calls),
    // Un lead se llama más de una vez: los leads necesarios no son las llamadas.
    leads: Math.ceil(calls / 2.2),
    budget,
    minutes,
    minutesAllowed,
    feasibleWithPlan: minutes <= minutesAllowed,
    monthsAtCurrentPace: monthlyRevenue > 0 ? Math.ceil(goal / monthlyRevenue) : null,
    note: dealValue.source === 'baseline'
      ? 'El ticket medio es una referencia del sector: cuando tengas cinco ventas propias, esta cuenta cambiará y será tuya.'
      : `Calculado con tu ticket medio real (${Math.round(dealValue.value)}) y tus tasas medidas.`,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Lectura y montaje
// ───────────────────────────────────────────────────────────────────────────

export interface ConsultantBoardOptions {
  windowDays?: number
  budgets?: number[]
  budget?: number
  goal?: number
  plan?: string
}

/**
 * Todo lo anterior, con los datos de la organización. Una sola consulta en
 * paralelo por tabla: la página necesita el conjunto entero para poder decir
 * algo con sentido, y partirlo en seis peticiones solo movería la espera al
 * navegador.
 */
export async function consultantBoard(orgId: string, options: ConsultantBoardOptions = {}) {
  const windowDays = Math.min(365, Math.max(7, options.windowDays ?? 90))
  const now = new Date()
  const since = new Date(now.getTime() - windowDays * DAY_MS)
  const previousSince = new Date(now.getTime() - 2 * windowDays * DAY_MS)
  const last7Days = new Date(now.getTime() - 7 * DAY_MS)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const [
    organization,
    leads,
    previousLeadCount,
    calls,
    agents,
    opportunities,
    acquisitionEvents,
    adSpend,
    adSpendPrevious,
    campaignsActive,
    callsLast7Days,
    metaAccounts,
    adQuality,
    organicSnapshots,
    organicProject,
    seoProjects,
    latestSeoReport,
    emailDeliveries,
    emailEvents,
    contentPieces,
    overdueTasks,
    optOuts,
    leadsWithoutOwner,
    minutesAgg,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true, currency: true, timezone: true, metricoolEnabled: true },
    }),
    prisma.lead.findMany({
      where: { orgId, createdAt: { gte: since } },
      select: { id: true, status: true, source: true, metaAdId: true, createdAt: true, firstRespondedAt: true, lastAttemptAt: true, attempts: true },
    }),
    prisma.lead.count({ where: { orgId, createdAt: { gte: previousSince, lt: since } } }),
    prisma.call.findMany({
      where: { orgId, createdAt: { gte: since } },
      select: { agentId: true, leadId: true, outcome: true, durationSeconds: true, createdAt: true, startedAt: true, sentiment: true },
    }),
    prisma.agent.findMany({ where: { orgId }, select: { id: true, name: true, isActive: true } }),
    prisma.opportunity.findMany({
      where: { orgId, OR: [{ createdAt: { gte: since } }, { stage: { in: ['lead', 'qualified', 'proposal', 'negotiation'] } }] },
      select: {
        id: true, leadId: true, name: true, stage: true, value: true, probability: true,
        createdAt: true, stageEnteredAt: true, actualCloseDate: true, lossReason: true, forecastCategory: true,
      },
    }),
    prisma.acquisitionEvent.findMany({
      where: { orgId, createdAt: { gte: since }, leadId: { not: null } },
      select: { leadId: true, type: true, source: true, medium: true },
    }),
    prisma.adInsightSnapshot.aggregate({
      _sum: { spendCents: true, impressions: true, clicks: true, leadsCount: true },
      where: { orgId, capturedAt: { gte: since } },
    }),
    prisma.adInsightSnapshot.aggregate({
      _sum: { spendCents: true },
      where: { orgId, capturedAt: { gte: previousSince, lt: since } },
    }),
    prisma.campaign.count({ where: { orgId, status: 'active' } }),
    prisma.call.count({ where: { orgId, createdAt: { gte: last7Days } } }),
    prisma.metaAdAccount.count({ where: { orgId } }),
    prisma.adDataQualityStatus.findUnique({ where: { orgId }, select: { status: true, computedAt: true } }),
    prisma.organicChannelSnapshot.findMany({
      where: { orgId },
      orderBy: { computedAt: 'desc' },
      take: 20,
      select: { channel: true, visits: true, leads: true, opportunities: true, sales: true, revenueCents: true, hoursInvested: true, periodKey: true, cohortStatus: true },
    }),
    prisma.organicProject.findFirst({ where: { orgId, isActive: true }, select: { id: true } }),
    prisma.seoProject.count({ where: { orgId } }),
    prisma.seoReport.findFirst({ where: { orgId }, orderBy: { createdAt: 'desc' }, select: { score: true, url: true, createdAt: true } }),
    prisma.emailDelivery.count({ where: { orgId, queuedAt: { gte: since } } }),
    prisma.emailEvent.groupBy({ by: ['type'], where: { orgId, occurredAt: { gte: since } }, _count: { id: true } }),
    prisma.contentPiece.groupBy({ by: ['status'], where: { orgId, createdAt: { gte: since } }, _count: { id: true } }),
    prisma.task.count({ where: { orgId, status: { in: ['open', 'in_progress'] }, dueAt: { lt: now } } }),
    prisma.optOut.count({ where: { orgId } }),
    prisma.lead.count({ where: { orgId, ownerId: null, status: { in: ['new', 'contacted'] } } }),
    prisma.call.aggregate({ _sum: { durationSeconds: true }, where: { orgId, startedAt: { gte: monthStart } } }),
  ])

  const plan = options.plan ?? organization?.plan ?? 'free'
  const timezone = organization?.timezone || 'Europe/Madrid'
  const snapshot = await predictorSnapshot(orgId, windowDays)
  const currency = organization?.currency || snapshot.currency

  const agentNames = Object.fromEntries(agents.map(agent => [agent.id, agent.name]))
  const callStats = callOperations(calls, agentNames, timezone)

  const opportunityRows: OpportunityInput[] = opportunities.map(row => ({
    id: row.id,
    name: row.name,
    stage: row.stage,
    value: Number(row.value ?? 0),
    probability: row.probability,
    createdAt: row.createdAt,
    stageEnteredAt: row.stageEnteredAt,
    actualCloseDate: row.actualCloseDate,
    lossReason: row.lossReason,
    forecastCategory: row.forecastCategory,
  }))
  const pipeline = pipelineHealth(opportunityRows, now)
  const speed = responseSpeed(leads, now)

  // ── Atribución por canal ────────────────────────────────────────────────
  const eventsByLead = new Map<string, { type: string; source: string | null; medium: string | null }[]>()
  for (const event of acquisitionEvents) {
    if (!event.leadId) continue
    const list = eventsByLead.get(event.leadId) ?? []
    list.push({ type: event.type, source: event.source, medium: event.medium })
    eventsByLead.set(event.leadId, list)
  }

  const leadChannel = new Map<string, SalesChannel>()
  for (const lead of leads) {
    leadChannel.set(lead.id, channelForLead(lead, eventsByLead.get(lead.id) ?? []))
  }

  const noContact = new Set<string>(NO_CONTACT_CALL_OUTCOMES)
  const qualifying = new Set<string>(QUALIFYING_CALL_OUTCOMES)
  const contactedLeads = new Set<string>()
  const qualifiedLeads = new Set<string>()
  const voiceCostByLead = new Map<string, number>()
  for (const call of calls) {
    if (call.outcome && !noContact.has(call.outcome)) contactedLeads.add(call.leadId)
    if (call.outcome && qualifying.has(call.outcome)) qualifiedLeads.add(call.leadId)
    const minutes = (call.durationSeconds ?? snapshot.minutesPerCall * 60) / 60
    voiceCostByLead.set(call.leadId, (voiceCostByLead.get(call.leadId) ?? 0) + minutes * snapshot.costPerMinute)
  }

  // Se indexa desde las filas de prisma, que son las que traen `leadId`. Buscar
  // el lead recorriendo el array por cada oportunidad convertía esto en
  // cuadrático justo en la organización que más oportunidades tiene.
  const opportunityByLead = new Map<string, { stage: string; value: number }[]>()
  for (const row of opportunities) {
    const list = opportunityByLead.get(row.leadId) ?? []
    list.push({ stage: row.stage, value: Number(row.value ?? 0) })
    opportunityByLead.set(row.leadId, list)
  }

  const buckets = new Map<SalesChannel, ChannelInput>()
  const bucket = (channel: SalesChannel) => {
    const existing = buckets.get(channel)
    if (existing) return existing
    const created: ChannelInput = {
      channel, leads: 0, contacted: 0, qualified: 0, opportunities: 0,
      sales: 0, revenue: 0, spend: 0, voiceCost: 0, hours: null,
    }
    buckets.set(channel, created)
    return created
  }

  for (const lead of leads) {
    const entry = bucket(leadChannel.get(lead.id) ?? 'unknown')
    entry.leads += 1
    if (contactedLeads.has(lead.id)) entry.contacted += 1
    if (qualifiedLeads.has(lead.id)) entry.qualified += 1
    entry.voiceCost += voiceCostByLead.get(lead.id) ?? 0
    for (const opportunity of opportunityByLead.get(lead.id) ?? []) {
      entry.opportunities += 1
      if (opportunity.stage === 'closed_won') {
        entry.sales += 1
        entry.revenue += opportunity.value
      }
    }
  }

  // El gasto en anuncios es de Ads aunque sus leads no se hayan podido atribuir
  // uno a uno: colgarlo de otro canal falsearía los dos.
  const adSpendTotal = (adSpend._sum?.spendCents ?? 0) / 100
  if (adSpendTotal > 0) bucket('ads').spend += adSpendTotal

  // Horas del orgánico: son su coste real (§5.2 de organic). Se muestran como
  // horas, no convertidas a dinero con una tarifa inventada.
  const latestPeriod = organicSnapshots[0]?.periodKey
  for (const row of organicSnapshots) {
    if (row.periodKey !== latestPeriod) continue
    const channel: SalesChannel | null = row.channel === 'social' ? 'social'
      : row.channel === 'search' ? 'search'
        : row.channel === 'gbp' ? 'gbp'
          : row.channel === 'prospecting' ? 'outbound' : null
    if (!channel) continue
    const entry = bucket(channel)
    if (row.hoursInvested != null) entry.hours = (entry.hours ?? 0) + row.hoursInvested
  }

  const totalLeads = leads.length
  const channels = [...buckets.values()]
    .map(entry => evaluateChannel(entry, totalLeads))
    .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads)

  const totalCost = channels.reduce((acc, channel) => acc + channel.cost, 0)
  const totalRevenue = channels.reduce((acc, channel) => acc + channel.revenue, 0)

  const scores = scoreAreas({
    windowDays,
    leadsThisWindow: leads.length,
    leadsPreviousWindow: previousLeadCount,
    calls: callStats,
    pipeline,
    speed,
    revenue: totalRevenue || snapshot.history.revenue,
    cost: totalCost,
    dealValue: snapshot.dealValue.value,
  })

  const upside = revenueUpside({
    snapshot,
    calls: callStats,
    speed,
    pipeline,
    channels,
    windowDays,
    windowRevenue: totalRevenue || snapshot.history.revenue,
  })

  const verdict = overallVerdict(
    scores,
    { calls: callStats.total, revenue: totalRevenue || snapshot.history.revenue, cost: totalCost },
    upside,
  )

  const minutesUsed = Math.ceil((minutesAgg._sum?.durationSeconds ?? 0) / 60)
  const adQualityAgeDays = adQuality ? Math.floor((now.getTime() - adQuality.computedAt.getTime()) / DAY_MS) : null

  const risks = buildRisks({
    activeAgents: agents.filter(agent => agent.isActive).length,
    activeCampaigns: campaignsActive,
    callsLast7Days,
    metaConnected: metaAccounts > 0,
    adDataQuality: adQuality?.status ?? null,
    adDataQualityAgeDays: adQualityAgeDays,
    metricoolEnabled: organization?.metricoolEnabled ?? false,
    organicProject: !!organicProject,
    seoProjects,
    minutesUsed,
    minutesAllowed: CONSUMPTION_LIMITS[planPolicy(plan).key].call_minutes,
    overdueTasks,
    optOuts,
    leadsWithoutOwner,
  })

  const monthlyCalls = Math.round(callStats.total * (30 / windowDays))
  const rawActions = consultantActions({ snapshot, calls: callStats, pipeline, speed, channels, scores, monthlyCalls })

  // Una misma palanca no puede valer dos cifras distintas según la pestaña.
  // El importe y la confianza los fija el módulo de potencial, que es el que
  // documenta la cuenta; la acción se limita a ejecutarla.
  const leverByAction = new Map(upside.levers.filter(lever => lever.actionId).map(lever => [lever.actionId as string, lever]))
  const actions = rawActions.map(action => {
    const lever = leverByAction.get(action.id)
    return lever
      ? { ...action, expectedGain: lever.amount, gainKind: lever.kind, gainBasis: lever.basis, confidence: lever.confidence }
      : { ...action, gainKind: null, gainBasis: null, confidence: null }
  })

  const budgets = options.budgets?.length
    ? [...new Set(options.budgets)].filter(value => value > 0).sort((a, b) => a - b).slice(0, 6)
    : [100, 250, 500, 1000, 2500]
  const projections: Projection[] = budgets.map(value => project(snapshot, value, plan))

  const monthlyRevenue = totalRevenue > 0 ? totalRevenue * (30 / windowDays) : 0
  const goal = options.goal && options.goal > 0 ? goalPlan(snapshot, options.goal, plan, monthlyRevenue) : null

  const emailEventCounts = Object.fromEntries(emailEvents.map(row => [row.type, row._count.id]))
  const contentCounts = Object.fromEntries(contentPieces.map(row => [row.status, row._count.id]))

  const legacyRecommendations: Recommendation[] = recommendations(snapshot)

  return {
    generatedAt: now.toISOString(),
    windowDays,
    currency,
    plan,
    timezone,
    verdict,
    scores,
    channels,
    allocation: allocateBudget(channels, options.budget ?? 500),
    calls: callStats,
    pipeline,
    speed,
    risks,
    actions,
    upside,
    goal,
    projections,
    breakEven: budgetForOneSale(snapshot),
    snapshot,
    totals: {
      leads: leads.length,
      leadsPrevious: previousLeadCount,
      cost: Math.round(totalCost),
      revenue: Math.round(totalRevenue),
      adSpend: Math.round(adSpendTotal),
      adSpendPrevious: Math.round((adSpendPrevious._sum?.spendCents ?? 0) / 100),
      adImpressions: adSpend._sum?.impressions ?? 0,
      adClicks: adSpend._sum?.clicks ?? 0,
      adLeads: adSpend._sum?.leadsCount ?? 0,
      minutesUsed,
      minutesAllowed: CONSUMPTION_LIMITS[planPolicy(plan).key].call_minutes,
    },
    marketing: {
      emailsSent: emailDeliveries,
      emailOpens: emailEventCounts.open ?? 0,
      emailClicks: emailEventCounts.click ?? 0,
      emailUnsubscribes: emailEventCounts.unsubscribe ?? 0,
      contentPublished: contentCounts.published ?? 0,
      contentPending: contentCounts.pending_approval ?? 0,
      seoScore: latestSeoReport?.score ?? null,
      seoUrl: latestSeoReport?.url ?? null,
      organicVisits: organicSnapshots
        .filter(row => row.periodKey === latestPeriod)
        .reduce((acc, row) => acc + (row.visits ?? 0), 0),
      organicHours: organicSnapshots
        .filter(row => row.periodKey === latestPeriod && row.hoursInvested != null)
        .reduce((acc, row) => acc + (row.hoursInvested ?? 0), 0),
    },
    recommendations: legacyRecommendations,
  }
}

export type ConsultantBoard = Awaited<ReturnType<typeof consultantBoard>>
