import { prisma } from '../lib/prisma'
import { NO_CONTACT_CALL_OUTCOMES, QUALIFYING_CALL_OUTCOMES } from '../lib/callOutcome'
import { CONSUMPTION_LIMITS } from '../access-control/consumption'
import { planPolicy } from '../access-control/entitlements'

/**
 * Predictor de crecimiento: con lo que ya pasó, proyecta lo que pasaría si
 * inviertes X, y dice dónde invertirlo.
 *
 * Dos reglas que hacen que esto sea útil en vez de un horóscopo:
 *
 * 1. Cada tasa dice de dónde sale. Si la organización tiene muestra suficiente,
 *    es SU tasa; si no, es una referencia del sector marcada como tal. Nunca se
 *    presenta una referencia como si fuera un dato propio.
 * 2. Ningún número se inventa hacia arriba. Cuando falta información, la
 *    proyección se queda corta y se dice, en vez de rellenar con optimismo.
 */

/** Por debajo de esto, la tasa propia es ruido y se usa la referencia. */
const MIN_SAMPLE = {
  calls: 20,
  qualified: 10,
  opportunities: 5,
}

/**
 * Referencias de partida para una organización sin histórico. Conservadoras a
 * propósito: es peor prometer de más que quedarse corto.
 */
const BASELINE = {
  contactRate: 0.35,      // de las llamadas, cuántas hablan con una persona
  qualifyRate: 0.25,      // de las conversaciones, cuántas cualifican
  opportunityRate: 0.5,   // de los cualificados, cuántos abren oportunidad
  winRate: 0.2,           // de las oportunidades, cuántas se ganan
  dealValue: 1500,        // valor medio de una venta, en la moneda de la org
  callsPerLead: 2.2,      // intentos hasta contactar o descartar
  minutesPerCall: 3,
}

/**
 * Coste por minuto de llamada, IA incluida. Sale del modelo de
 * COSTES_VOZ_INGLES.md: 0,042 $/min de IA + 0,018 $/min de telefonía en EE. UU.
 * Se puede ajustar por entorno cuando cambien las tarifas.
 */
function costPerMinute(): number {
  const configured = Number(process.env.VOICE_COST_PER_MINUTE)
  return Number.isFinite(configured) && configured > 0 ? configured : 0.06
}

export type RateSource = 'own' | 'baseline'

export interface FunnelRate {
  value: number
  source: RateSource
  /** Tamaño de muestra propio, para que se pueda juzgar la fiabilidad. */
  sample: number
}

export interface PredictorSnapshot {
  currency: string
  windowDays: number
  history: {
    calls: number
    conversations: number
    qualified: number
    opportunities: number
    won: number
    revenue: number
    adSpend: number
  }
  rates: {
    contact: FunnelRate
    qualify: FunnelRate
    opportunity: FunnelRate
    win: FunnelRate
  }
  dealValue: FunnelRate
  costPerMinute: number
  minutesPerCall: number
}

export interface Projection {
  budget: number
  calls: number
  conversations: number
  qualified: number
  opportunities: number
  sales: number
  revenue: number
  /** Ingreso menos inversión. Negativo significa que a ese volumen se pierde dinero. */
  profit: number
  roi: number
  /** Cuánto cuesta conseguir una venta a este volumen. */
  costPerSale: number | null
  /** Si el plan no da para tantos minutos, aquí se dice. */
  planCap: { minutes: number; exceededBy: number } | null
}

export interface Recommendation {
  id: string
  title: string
  detail: string
  /** Cuánto mueve la aguja, para poder ordenarlas. */
  impact: 'alto' | 'medio' | 'bajo'
  effort: 'bajo' | 'medio' | 'alto'
  /** A dónde lleva en la aplicación, si aplica. */
  href?: string
}

function rate(numerator: number, denominator: number, minSample: number, fallback: number): FunnelRate {
  if (denominator >= minSample && denominator > 0) {
    return { value: Math.min(1, numerator / denominator), source: 'own', sample: denominator }
  }
  return { value: fallback, source: 'baseline', sample: denominator }
}

/** Lo que de verdad pasó en la ventana pedida. Nada aquí es estimación. */
export async function predictorSnapshot(orgId: string, windowDays = 90): Promise<PredictorSnapshot> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const [calls, opportunities, adSpend, organization] = await Promise.all([
    prisma.call.findMany({
      where: { orgId, createdAt: { gte: since } },
      select: { outcome: true, durationSeconds: true },
    }),
    prisma.opportunity.findMany({
      where: { orgId, createdAt: { gte: since } },
      select: { stage: true, value: true, currency: true },
    }),
    prisma.adInsightSnapshot.aggregate({
      _sum: { spendCents: true },
      where: { orgId, capturedAt: { gte: since } },
    }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } }),
  ])

  const noContact = new Set<string>(NO_CONTACT_CALL_OUTCOMES)
  const qualifying = new Set<string>(QUALIFYING_CALL_OUTCOMES)

  const conversations = calls.filter(call => call.outcome && !noContact.has(call.outcome)).length
  const qualified = calls.filter(call => call.outcome && qualifying.has(call.outcome)).length
  const won = opportunities.filter(opportunity => opportunity.stage === 'closed_won')
  const revenue = won.reduce((total, opportunity) => total + Number(opportunity.value ?? 0), 0)
  const durations = calls.map(call => call.durationSeconds ?? 0).filter(seconds => seconds > 0)
  const averageMinutes = durations.length
    ? durations.reduce((total, seconds) => total + seconds, 0) / durations.length / 60
    : BASELINE.minutesPerCall

  return {
    currency: opportunities[0]?.currency ?? 'EUR',
    windowDays,
    history: {
      calls: calls.length,
      conversations,
      qualified,
      opportunities: opportunities.length,
      won: won.length,
      revenue,
      adSpend: (adSpend._sum?.spendCents ?? 0) / 100,
    },
    rates: {
      contact: rate(conversations, calls.length, MIN_SAMPLE.calls, BASELINE.contactRate),
      qualify: rate(qualified, conversations, MIN_SAMPLE.qualified, BASELINE.qualifyRate),
      opportunity: rate(opportunities.length, qualified, MIN_SAMPLE.qualified, BASELINE.opportunityRate),
      win: rate(won.length, opportunities.length, MIN_SAMPLE.opportunities, BASELINE.winRate),
    },
    dealValue: won.length >= MIN_SAMPLE.opportunities
      ? { value: revenue / won.length, source: 'own', sample: won.length }
      : { value: BASELINE.dealValue, source: 'baseline', sample: won.length },
    costPerMinute: costPerMinute(),
    minutesPerCall: Number(averageMinutes.toFixed(2)),
    ...(organization ? {} : {}),
  }
}

/** Qué pasa si dedicas `budget` al mes a llamar. */
export function project(snapshot: PredictorSnapshot, budget: number, plan = 'free'): Projection {
  const costPerCall = snapshot.costPerMinute * snapshot.minutesPerCall
  const calls = costPerCall > 0 ? Math.floor(budget / costPerCall) : 0
  const conversations = calls * snapshot.rates.contact.value
  const qualified = conversations * snapshot.rates.qualify.value
  const opportunities = qualified * snapshot.rates.opportunity.value
  const sales = opportunities * snapshot.rates.win.value
  const revenue = sales * snapshot.dealValue.value

  const planKey = planPolicy(plan).key
  const minutesNeeded = Math.round(calls * snapshot.minutesPerCall)
  const minutesAllowed = CONSUMPTION_LIMITS[planKey].call_minutes
  const planCap = minutesNeeded > minutesAllowed
    ? { minutes: minutesAllowed, exceededBy: minutesNeeded - minutesAllowed }
    : null

  return {
    budget,
    calls,
    conversations: Math.round(conversations * 10) / 10,
    qualified: Math.round(qualified * 10) / 10,
    opportunities: Math.round(opportunities * 10) / 10,
    sales: Math.round(sales * 10) / 10,
    revenue: Math.round(revenue),
    profit: Math.round(revenue - budget),
    roi: budget > 0 ? Math.round((revenue / budget) * 100) / 100 : 0,
    costPerSale: sales >= 0.1 ? Math.round(budget / sales) : null,
    planCap,
  }
}

/**
 * El presupuesto a partir del cual sale una venta al mes. Es la pregunta que
 * de verdad se hace alguien que empieza: "¿cuánto tengo que poner para que
 * esto sirva de algo?".
 */
export function budgetForOneSale(snapshot: PredictorSnapshot): number {
  const perCall = snapshot.rates.contact.value * snapshot.rates.qualify.value
    * snapshot.rates.opportunity.value * snapshot.rates.win.value
  if (perCall <= 0) return 0
  const callsNeeded = Math.ceil(1 / perCall)
  return Math.ceil(callsNeeded * snapshot.costPerMinute * snapshot.minutesPerCall)
}

/**
 * Dónde está el cuello de botella y qué hacer con él. Se ordena por impacto:
 * arreglar la etapa más débil del embudo rinde más que subir el presupuesto.
 */
export function recommendations(snapshot: PredictorSnapshot): Recommendation[] {
  const list: Recommendation[] = []
  const { rates, history } = snapshot

  if (history.calls < MIN_SAMPLE.calls) {
    list.push({
      id: 'no-data',
      title: 'Haz las primeras 20 llamadas antes de fiarte de estos números',
      detail: `Llevas ${history.calls} llamadas en los últimos ${snapshot.windowDays} días. Hasta 20 no hay muestra suficiente y todo lo que ves usa referencias del sector, no tus datos.`,
      impact: 'alto',
      effort: 'bajo',
      href: '/captacion/planificar',
    })
  }

  if (rates.contact.source === 'own' && rates.contact.value < 0.3) {
    list.push({
      id: 'contact-rate',
      title: 'Solo hablas con una persona en el ' + Math.round(rates.contact.value * 100) + '% de las llamadas',
      detail: 'Es lo que más te está costando. Prueba a llamar en otra franja horaria: en Insights tienes la hora con mejor tasa de contacto. Cada punto que subas aquí multiplica todo lo que viene detrás.',
      impact: 'alto',
      effort: 'bajo',
      href: '/insights',
    })
  }

  if (rates.qualify.source === 'own' && rates.qualify.value < 0.2) {
    list.push({
      id: 'qualify-rate',
      title: 'Hablas con gente que no encaja',
      detail: `De cada conversación, solo el ${Math.round(rates.qualify.value * 100)}% cualifica. O el guion del agente no descubre bien, o la lista de leads no es la buena. Escucha tres llamadas perdidas antes de tocar nada.`,
      impact: 'alto',
      effort: 'medio',
      href: '/llamadas',
    })
  }

  if (rates.win.source === 'own' && rates.win.value < 0.15 && history.opportunities >= MIN_SAMPLE.opportunities) {
    list.push({
      id: 'win-rate',
      title: 'Se abren oportunidades pero no se cierran',
      detail: `Cierras el ${Math.round(rates.win.value * 100)}% de lo que abres. El agente está consiguiendo reuniones que no llegan a nada: endurece la calificación antes de agendar.`,
      impact: 'medio',
      effort: 'medio',
      href: '/pipeline',
    })
  }

  if (history.adSpend > 0 && history.revenue > 0 && history.revenue < history.adSpend * 2) {
    list.push({
      id: 'ads-roi',
      title: 'Los anuncios no se están pagando solos',
      detail: `Has gastado ${Math.round(history.adSpend)} en anuncios y has facturado ${Math.round(history.revenue)}. Por debajo de 2× conviene parar y revisar la segmentación antes de subir el presupuesto.`,
      impact: 'alto',
      effort: 'medio',
      href: '/captacion',
    })
  }

  if (history.conversations > 0 && history.opportunities === 0) {
    list.push({
      id: 'no-pipeline',
      title: 'Estás hablando con gente pero no registras oportunidades',
      detail: 'Sin oportunidades en el pipeline no hay forma de saber qué funciona ni de proyectar ingresos. Crea la oportunidad en cuanto una llamada vaya bien.',
      impact: 'medio',
      effort: 'bajo',
      href: '/pipeline',
    })
  }

  const order = { alto: 0, medio: 1, bajo: 2 }
  return list.sort((a, b) => order[a.impact] - order[b.impact])
}

/** Todo junto, que es lo que consume la página. */
export async function growthPlan(orgId: string, options: { budgets?: number[]; windowDays?: number; plan?: string } = {}) {
  const snapshot = await predictorSnapshot(orgId, options.windowDays ?? 90)
  const breakEven = budgetForOneSale(snapshot)
  const budgets = options.budgets?.length
    ? [...new Set(options.budgets)].filter(value => value > 0).sort((a, b) => a - b).slice(0, 6)
    : [100, 250, 500, 1000, 2500]

  return {
    snapshot,
    breakEven,
    projections: budgets.map(budget => project(snapshot, budget, options.plan)),
    recommendations: recommendations(snapshot),
    generatedAt: new Date().toISOString(),
  }
}
