import { prisma } from '../lib/prisma'
import { QUALIFYING_CALL_OUTCOMES } from '../lib/callOutcome'
import { classifyChannel, isOrganicEvent, type OrganicChannel } from './organicChannels.service'

/**
 * Cerrar el bucle — fase 3 de `docs/vendrava/organico.md`.
 *
 * Vendrava debe poder demostrar **qué recomendaciones funcionaron, con cohortes y
 * no con anécdotas**. Para eso hacen falta tres cosas, y las tres se hacen
 * aquí:
 *
 * 1. Al despachar, se declara la métrica objetivo, su valor actual y el efecto
 *    esperado — **antes** de ejecutar. Compararse contra una expectativa
 *    inventada después no demuestra nada.
 * 2. Cada acción tiene su ventana de maduración. En orgánico un artículo tarda
 *    semanas: juzgarlo a los tres días solo mide impaciencia.
 * 3. Al madurar se compara lo observado con lo esperado y se escribe una
 *    lectura en lenguaje llano, que es lo que acaba en el informe semanal.
 */

/**
 * Días hasta poder juzgar, por brazo. El SEO es el más lento porque depende de
 * que Google reindexe y reposicione; la prospección es casi inmediata porque el
 * lead llega o no llega.
 */
const MATURITY_DAYS: Record<string, number> = {
  seo: 45,
  landings: 21,
  social: 14,
  prospecting: 7,
}

const DEFAULT_MATURITY_DAYS = 30

/** Cuenta la métrica objetivo de un canal en una ventana. */
async function measure(orgId: string, channel: string, metric: string, since: Date, until: Date): Promise<number> {
  const events = await prisma.acquisitionEvent.findMany({
    where: { orgId, leadId: { not: null }, createdAt: { gte: since, lt: until } },
    select: { type: true, source: true, medium: true, leadId: true },
  })
  const organic = events.filter(isOrganicEvent)
  const leadIds = new Set(
    organic
      .filter(event => channel === 'all' || classifyChannel(event) === (channel as OrganicChannel))
      .map(event => event.leadId!)
      .filter(Boolean)
  )
  if (metric === 'leads') return leadIds.size
  if (metric === 'qualified') {
    if (!leadIds.size) return 0
    return prisma.lead.count({
      where: { orgId, id: { in: Array.from(leadIds) }, calls: { some: { outcome: { in: [...QUALIFYING_CALL_OUTCOMES] } } } },
    })
  }
  return leadIds.size
}

/**
 * Registra la acción al despachar una recomendación, con su línea base y su
 * ventana. Es el paso que hace medible todo lo demás.
 */
export async function recordDispatchedAction(orgId: string, decision: {
  id: string
  diagnosis: string
  title: string
  channel: string
  dispatchArm: string | null
  estimatedHours: number | null
  evidence: unknown
}) {
  const project = await prisma.organicProject.findUnique({ where: { orgId }, select: { id: true } })
  if (!project) return null

  const arm = decision.dispatchArm ?? 'seo'
  const days = MATURITY_DAYS[arm] ?? DEFAULT_MATURITY_DAYS
  const now = new Date()
  const windowStart = new Date(now.getTime() - days * 86_400_000)

  // La línea base es lo que ese canal produjo en una ventana del mismo tamaño
  // justo antes: comparar contra un periodo más corto o más largo inventaría
  // una mejora que solo vendría de medir distinto.
  const targetMetric = decision.diagnosis === 'channel_not_qualifying' ? 'qualified' : 'leads'
  const baseline = await measure(orgId, decision.channel, targetMetric, windowStart, now)

  const evidence = (decision.evidence ?? {}) as Record<string, unknown>
  const expectedDelta = typeof evidence.estimatedLeads === 'number'
    ? evidence.estimatedLeads
    : Math.max(1, Math.round(baseline * 0.15))

  return prisma.organicAction.create({
    data: {
      orgId,
      projectId: project.id,
      type: `dispatch:${decision.diagnosis}`,
      title: decision.title,
      description: `Despachada a ${arm} desde el centro de mando.`,
      status: 'in_progress',
      decisionId: decision.id,
      arm,
      channel: decision.channel,
      targetMetric,
      baselineValue: baseline,
      expectedDelta,
      maturesAt: new Date(now.getTime() + days * 86_400_000),
      outcomeStatus: 'maturing',
      metadata: { estimatedHours: decision.estimatedHours } as object,
    },
  })
}

/**
 * Evalúa las acciones que ya han madurado. Comparación honesta: si la ventana
 * no ha cerrado no se toca, y si el volumen es demasiado bajo para distinguir
 * el efecto del ruido se marca `inconclusive` en vez de declarar un éxito.
 */
export async function evaluateMaturedActions(orgId: string) {
  const due = await prisma.organicAction.findMany({
    where: { orgId, outcomeStatus: 'maturing', maturesAt: { lte: new Date() } },
  })
  if (!due.length) return { evaluated: 0, improved: 0, inconclusive: 0 }

  let improved = 0
  let inconclusive = 0

  for (const action of due) {
    const days = MATURITY_DAYS[action.arm ?? ''] ?? DEFAULT_MATURITY_DAYS
    const now = new Date()
    const observed = await measure(
      orgId,
      action.channel ?? 'all',
      action.targetMetric ?? 'leads',
      new Date(now.getTime() - days * 86_400_000),
      now,
    )
    const baseline = action.baselineValue ?? 0
    const delta = observed - baseline

    // Con menos de cinco eventos entre las dos ventanas, la diferencia cabe
    // dentro del ruido de cualquier semana. Decirlo es más útil que celebrar.
    const tooSmall = baseline + observed < 5
    const metExpectation = action.expectedDelta != null && delta >= action.expectedDelta

    const summary = tooSmall
      ? `Sin volumen suficiente para juzgar: ${baseline} antes y ${observed} después. La diferencia cabe dentro del ruido.`
      : metExpectation
        ? `Funcionó: se esperaban ${action.expectedDelta} más y se observaron ${delta} (${baseline} → ${observed}).`
        : delta > 0
          ? `Mejoró menos de lo esperado: ${delta} de los ${action.expectedDelta} previstos (${baseline} → ${observed}).`
          : `No movió la aguja: ${baseline} antes y ${observed} después.`

    await prisma.organicAction.update({
      where: { id: action.id },
      data: {
        observedValue: observed,
        outcomeStatus: tooSmall ? 'inconclusive' : 'evaluated',
        outcomeSummary: summary,
        evaluatedAt: now,
        status: 'completed',
        completedAt: now,
      },
    })
    if (tooSmall) inconclusive += 1
    else if (metExpectation) improved += 1
  }

  return { evaluated: due.length, improved, inconclusive }
}

/**
 * Aprender de los descartes. Cada rechazo con motivo baja el peso de ese tipo
 * de recomendación; cada despacho lo sube.
 *
 * El peso **solo reordena**, nunca silencia: el motivo de ayer puede no valer
 * mañana, y una recomendación que desaparece para siempre por tres descartes
 * es un sistema que deja de avisar de un problema real.
 */
export async function recordFeedback(orgId: string, diagnosis: string, kind: 'dispatched' | 'dismissed', reason?: string) {
  const existing = await prisma.organicRecommendationWeight.findUnique({
    where: { orgId_diagnosis: { orgId, diagnosis } },
  })

  const dispatched = (existing?.dispatched ?? 0) + (kind === 'dispatched' ? 1 : 0)
  const dismissed = (existing?.dismissed ?? 0) + (kind === 'dismissed' ? 1 : 0)
  const total = dispatched + dismissed
  // Suelo de 0,3 y techo de 1,5: aun descartada siempre, la recomendación sigue
  // apareciendo, solo que abajo.
  const weight = total === 0 ? 1 : Math.min(1.5, Math.max(0.3, 0.3 + (dispatched / total) * 1.2))

  const reasons = reason
    ? [reason, ...(existing?.lastReasons ?? [])].slice(0, 5)
    : existing?.lastReasons ?? []

  return prisma.organicRecommendationWeight.upsert({
    where: { orgId_diagnosis: { orgId, diagnosis } },
    create: { orgId, diagnosis, dispatched, dismissed, weight, lastReasons: reasons },
    update: { dispatched, dismissed, weight, lastReasons: reasons },
  })
}

export async function getWeights(orgId: string) {
  const rows = await prisma.organicRecommendationWeight.findMany({ where: { orgId } })
  return new Map(rows.map(row => [row.diagnosis, row]))
}

/**
 * Resultados observados para el informe semanal: qué recomendaciones se
 * despacharon y qué pasó después. Es la prueba de valor de la fase 3.
 */
export async function getOutcomeSummary(orgId: string, limit = 10) {
  const [evaluated, maturing] = await Promise.all([
    prisma.organicAction.findMany({
      where: { orgId, outcomeStatus: { in: ['evaluated', 'inconclusive'] } },
      orderBy: { evaluatedAt: 'desc' },
      take: limit,
      select: {
        id: true, title: true, arm: true, channel: true, targetMetric: true,
        baselineValue: true, observedValue: true, expectedDelta: true,
        outcomeStatus: true, outcomeSummary: true, evaluatedAt: true,
      },
    }),
    prisma.organicAction.count({ where: { orgId, outcomeStatus: 'maturing' } }),
  ])
  return { evaluated, maturing }
}
