import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getDataQuality } from './adDataQuality.service'

/**
 * Registro de decisiones de Xarly (`docs/xarly/ads.md` §11).
 *
 * Toda regla que observe algo escribe aquí, y solo aquí. Nada ejecuta una
 * llamada a Meta desde este servicio: `AdAction` y sus guardarraíles llegan en
 * la Fase 4. Hasta entonces `mode` es siempre `shadow` y `status` `advisory`.
 */

export type DecisionInput = {
  orgId: string
  campaignId?: string | null
  diagnosis: string
  ruleKey: string
  ruleVersion: string
  /** Identificador estable para no duplicar la misma observación cada ciclo. */
  dedupeKey: string
  severity: 'info' | 'warning' | 'critical'
  confidence: 'low' | 'medium' | 'high'
  confidenceReason: string
  title: string
  explanation: string
  recommendation: string
  hypotheticalAction?: Record<string, unknown> | null
  evidence: Record<string, unknown>
  cohortStatus: 'insufficient' | 'maturing' | 'mature'
  signalUsed?: string | null
  /** Canal de origen: `ads` por defecto, o el canal orgánico que la produjo. */
  channel?: string
  /** Brazo donde se ejecuta y contexto que hay que llevarle al abrirlo. */
  dispatchArm?: string | null
  dispatchContext?: Record<string, unknown> | null
  estimatedHours?: number | null
  priorityScore?: number | null
  /**
   * Dias de silencio tras un rechazo humano sobre el MISMO asunto. Sin esto,
   * como el `dedupeKey` lleva la fecha, una recomendacion descartada hoy vuelve
   * identica manana: el sistema pregunta lo mismo cada dia hasta que alguien se
   * rinde. Con esto, el rechazo se respeta un tiempo y despues se vuelve a
   * plantear, porque el motivo de entonces puede haber caducado.
   */
  suppressDays?: number
  /**
   * Estado inicial de la decisión. Por defecto `advisory`: una regla que
   * observa no propone ejecutar nada. La autonomía orgánica (`organico.md` §9)
   * lo sobrescribe porque su estado **es** el resultado de evaluar el nivel:
   * `blocked` si un guardarraíl lo impide, `pending_approval` en N2, `shadow`
   * en N3 sin efectos, `approved` en N3 en vivo.
   */
  status?: 'advisory' | 'shadow' | 'pending_approval' | 'approved' | 'blocked'
  /** `shadow` mientras la acción no llegue a tocar nada real. */
  mode?: 'shadow' | 'live'
  autonomyLevel?: 'N1' | 'N2' | 'N3'
}

/**
 * Frases que afirman un contrafactual. La §10.2 prohíbe decir que una acción
 * no ejecutada "habría ahorrado" algo: no se sabe qué habría pasado después.
 * Se comprueba en el código y no solo en la revisión humana, porque es el
 * error más fácil de cometer al redactar una explicación.
 */
const COUNTERFACTUAL_CLAIMS = [
  /habr[íi]a ahorrado/i,
  /te habr[íi]a[s]? ahorrado/i,
  /habr[íi]a evitado (?:un |el )?gast/i,
  /would have saved/i,
]

function assertNoCounterfactualSavings(decision: DecisionInput) {
  const text = [decision.title, decision.explanation, decision.recommendation].join(' ')
  const offending = COUNTERFACTUAL_CLAIMS.find(pattern => pattern.test(text))
  if (offending) {
    throw new Error(
      `Una decisión no puede afirmar un ahorro contrafactual (ads.md §10.2). Texto: "${text.slice(0, 160)}"`
    )
  }
}

/**
 * Crea o actualiza la observación. Es idempotente por `dedupeKey`: el job se
 * ejecuta cada pocas horas y no debe acumular una decisión por ciclo.
 *
 * Una decisión ya resuelta por una persona (aprobada o rechazada) no se
 * reescribe: su historial es la evidencia de qué se decidió y cuándo.
 */
export async function recordDecision(input: DecisionInput) {
  assertNoCounterfactualSavings(input)

  const existing = await prisma.adDecision.findUnique({
    where: { orgId_dedupeKey: { orgId: input.orgId, dedupeKey: input.dedupeKey } },
    select: { id: true, status: true },
  })
  if (existing && ['approved', 'rejected', 'executed'].includes(existing.status)) return existing

  // Silencio por asunto: el `dedupeKey` es `regla:asunto:fecha`, asi que el
  // prefijo sin la fecha identifica el asunto a lo largo del tiempo.
  if (input.suppressDays && input.suppressDays > 0) {
    const subjectPrefix = input.dedupeKey.split(':').slice(0, -1).join(':')
    const recentlyRejected = await prisma.adDecision.findFirst({
      where: {
        orgId: input.orgId,
        ruleKey: input.ruleKey,
        status: 'rejected',
        dedupeKey: { startsWith: `${subjectPrefix}:` },
        decidedAt: { gte: new Date(Date.now() - input.suppressDays * 86_400_000) },
      },
      select: { id: true, status: true },
    })
    if (recentlyRejected) return recentlyRejected
  }

  const data = {
    campaignId: input.campaignId ?? null,
    diagnosis: input.diagnosis,
    ruleKey: input.ruleKey,
    ruleVersion: input.ruleVersion,
    severity: input.severity,
    confidence: input.confidence,
    confidenceReason: input.confidenceReason,
    title: input.title,
    explanation: input.explanation,
    recommendation: input.recommendation,
    hypotheticalAction: (input.hypotheticalAction ?? undefined) as Prisma.InputJsonValue | undefined,
    evidence: input.evidence as Prisma.InputJsonValue,
    cohortStatus: input.cohortStatus,
    signalUsed: input.signalUsed ?? null,
    channel: input.channel ?? 'ads',
    dispatchArm: input.dispatchArm ?? null,
    dispatchContext: (input.dispatchContext ?? undefined) as Prisma.InputJsonValue | undefined,
    estimatedHours: input.estimatedHours ?? null,
    priorityScore: input.priorityScore ?? null,
    // Fase 1: Xarly observa y explica. No propone ejecutar nada todavía.
    status: input.status ?? 'advisory',
    mode: input.mode ?? 'shadow',
    autonomyLevel: input.autonomyLevel ?? 'N1',
  }

  return prisma.adDecision.upsert({
    where: { orgId_dedupeKey: { orgId: input.orgId, dedupeKey: input.dedupeKey } },
    create: { orgId: input.orgId, dedupeKey: input.dedupeKey, ...data },
    update: data,
  })
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

/**
 * Decisiones vigentes, ordenadas por gravedad y luego por recencia. Si la
 * calidad de los datos bloquea las métricas profundas, se devuelven solo las
 * de integridad: recomendar sobre datos no fiables es peor que no recomendar.
 */
export async function listActiveDecisions(orgId: string, options: { limit?: number } = {}) {
  const dataQuality = await getDataQuality(orgId)
  const decisions = await prisma.adDecision.findMany({
    // Solo Ads: el organico tiene su propia cola priorizada (§5.5).
    where: { orgId, channel: 'ads', status: { in: ['advisory', 'shadow', 'pending_approval'] } },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 20,
    include: { campaign: { select: { id: true, name: true } } },
  })

  const ordered = decisions.sort((left, right) => {
    const bySeverity =
      (SEVERITY_ORDER[left.severity as keyof typeof SEVERITY_ORDER] ?? 3) -
      (SEVERITY_ORDER[right.severity as keyof typeof SEVERITY_ORDER] ?? 3)
    if (bySeverity !== 0) return bySeverity
    return right.createdAt.getTime() - left.createdAt.getTime()
  })

  if (!dataQuality.blocksDeepMetrics) return ordered
  return ordered.filter(decision => decision.signalUsed === 'clic' || decision.diagnosis === 'daily_budget_cap')
}

/** Retira las observaciones de una regla que ya no se cumple. */
export async function expireDecisions(orgId: string, ruleKey: string, keepDedupeKeys: string[]) {
  await prisma.adDecision.updateMany({
    where: {
      orgId,
      ruleKey,
      status: { in: ['advisory', 'shadow'] },
      dedupeKey: { notIn: keepDedupeKeys },
    },
    data: { status: 'expired' },
  })
}
