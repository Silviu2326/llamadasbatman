import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { getDataQuality } from './adDataQuality.service'

/**
 * Política de optimización y aprobación humana de decisiones — Fase 3 de
 * `docs/vendrava/ads.md`.
 *
 * La progresión que exige la §10.1 es obligatoria y no se puede saltar:
 *
 *   modo sombra → recomendaciones humanas → N2 limitado
 *                → canario automático → N3
 *
 * Aquí se cubren los dos primeros escalones. Aprobar una decisión **no la
 * ejecuta**: crea una `AdAction` en `pending_execution`, con sus guardarraíles
 * evaluados y su compensación declarada. La ejecución llega en la Fase 4.
 */

const DEFAULT_POLICY = {
  targetSignal: 'qualified_lead',
  autonomyLevel: 'N1',
  mode: 'shadow',
  maxChangesPerDay: 3,
  minMinutesBetweenChanges: 120,
  protectLearningPhase: true,
  killSwitchEnabled: false,
}

export async function getPolicy(orgId: string) {
  const existing = await prisma.adOptimizationPolicy.findUnique({ where: { orgId } })
  if (existing) return existing
  return prisma.adOptimizationPolicy.create({ data: { orgId, ...DEFAULT_POLICY } })
}

/**
 * Cambiar la autonomía es una decisión de gobierno, no una preferencia: queda
 * auditada con quién la cambió y desde qué valor.
 */
export async function updatePolicy(
  orgId: string,
  actorUserId: string,
  patch: Partial<{
    targetSignal: string
    autonomyLevel: string
    mode: string
    maxDailySpendCents: number | null
    maxMonthlySpendCents: number | null
    maxChangesPerDay: number
    minMinutesBetweenChanges: number
    protectLearningPhase: boolean
    minCampaignBudgetCents: number | null
    maxNewLeadsPerDay: number | null
  }>
) {
  const before = await getPolicy(orgId)

  // La promoción a N2 o N3 exige dos cosas: que nadie haya pulsado el freno de
  // emergencia y que los datos aguanten una decisión. La §10.1 dice que ante
  // datos escasos la regla degrada, nunca al revés.
  const raisesAutonomy = Boolean(patch.autonomyLevel && patch.autonomyLevel !== 'N1')
  const goesLive = patch.mode === 'live'
  if (raisesAutonomy || goesLive) {
    // Un freno de emergencia que se puede saltar subiendo la autonomía no es
    // un freno: hay que soltarlo explícitamente antes.
    if (before.killSwitchEnabled) {
      throw new PolicyBlockedError(
        'La autonomía está parada. Reanúdala explícitamente antes de subir el nivel o pasar a modo activo.'
      )
    }
    const dataQuality = await getDataQuality(orgId)
    if (dataQuality.blocksAutomation) {
      throw new PolicyBlockedError(
        `No se puede subir la autonomía con la integridad de datos en "${dataQuality.status}".`
      )
    }
  }

  const updated = await prisma.adOptimizationPolicy.update({
    where: { orgId },
    data: { ...patch, version: { increment: 1 }, updatedByUserId: actorUserId },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'ads.policy.updated',
    entityType: 'AdOptimizationPolicy',
    entityId: updated.id,
    before,
    after: updated,
  })
  return updated
}

export class PolicyBlockedError extends Error {
  readonly statusCode = 409
  constructor(message: string) {
    super(message)
    this.name = 'PolicyBlockedError'
  }
}

export class DecisionNotActionableError extends Error {
  readonly statusCode = 409
  constructor(message: string) {
    super(message)
    this.name = 'DecisionNotActionableError'
  }
}

/** Parada de emergencia: detiene cualquier autonomía y degrada a N1. */
export async function setKillSwitch(orgId: string, actorUserId: string, enabled: boolean, reason?: string) {
  const before = await getPolicy(orgId)
  const updated = await prisma.adOptimizationPolicy.update({
    where: { orgId },
    data: {
      killSwitchEnabled: enabled,
      killSwitchReason: enabled ? (reason ?? 'Parada solicitada por el equipo') : null,
      killSwitchAt: enabled ? new Date() : null,
      // Parar la autonomía significa volver a N1, no solo poner una bandera.
      ...(enabled ? { autonomyLevel: 'N1', mode: 'shadow' } : {}),
      updatedByUserId: actorUserId,
    },
  })
  await writeAuditLog({
    orgId,
    actorUserId,
    action: enabled ? 'ads.autonomy.stopped' : 'ads.autonomy.resumed',
    entityType: 'AdOptimizationPolicy',
    entityId: updated.id,
    before,
    after: updated,
  })
  return updated
}

/**
 * Guardarraíles que tendría que pasar la acción. Se evalúan al aprobar aunque
 * todavía no se ejecute: aprobar algo que no podría ejecutarse sería aprobar
 * una ilusión.
 */
async function evaluateGuardrails(orgId: string, campaignId: string | null) {
  const [policy, dataQuality, recentActions] = await Promise.all([
    getPolicy(orgId),
    getDataQuality(orgId),
    prisma.adAction.findMany({
      // Solo las acciones de Ads: la autonomía orgánica escribe también en
      // `AdAction` (no hay motor paralelo, `organico.md` §10) y contar sus
      // re-sincronizaciones aquí gastaría el cupo diario de cambios de Meta.
      where: { orgId, createdAt: { gte: new Date(Date.now() - 86_400_000) }, decision: { channel: 'ads' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, campaignId: true },
    }),
  ])

  const lastChange = recentActions.find(action => action.campaignId === campaignId)
  const minutesSinceLast = lastChange
    ? (Date.now() - lastChange.createdAt.getTime()) / 60_000
    : null

  const checks = [
    {
      rule: 'kill_switch',
      passed: !policy.killSwitchEnabled,
      detail: policy.killSwitchEnabled
        ? `La autonomía está parada: ${policy.killSwitchReason ?? 'sin motivo registrado'}.`
        : 'La organización no tiene la parada de emergencia activada.',
    },
    {
      rule: 'data_quality',
      passed: !dataQuality.blocksAutomation,
      detail: dataQuality.blocksAutomation
        ? `La integridad de datos está en "${dataQuality.status}" y bloquea cualquier acción.`
        : `Integridad de datos: ${dataQuality.status}.`,
    },
    {
      rule: 'max_changes_per_day',
      passed: recentActions.length < policy.maxChangesPerDay,
      detail: `${recentActions.length} cambios en las últimas 24 h; el límite es ${policy.maxChangesPerDay}.`,
    },
    {
      rule: 'cooldown',
      passed: minutesSinceLast == null || minutesSinceLast >= policy.minMinutesBetweenChanges,
      detail: minutesSinceLast == null
        ? 'No hay cambios recientes en esta campaña.'
        : `Último cambio hace ${Math.round(minutesSinceLast)} min; el mínimo es ${policy.minMinutesBetweenChanges} min.`,
    },
  ]

  return { policy, checks, allPassed: checks.every(check => check.passed) }
}

/**
 * Compensación de cada tipo de acción. Lo importante no es lo que se puede
 * deshacer, sino lo que **no** se recupera: por eso los efectos irreversibles
 * se declaran uno a uno en vez de decir "reversible: sí".
 */
function buildCompensation(kind: string, payload: Record<string, unknown>) {
  if (kind === 'pause_ad_set') {
    return {
      compensationPayload: { kind: 'resume_ad_set', payload: { status: 'ACTIVE' } },
      irreversibleEffects: [
        'El aprendizaje que Meta hubiese acumulado durante la pausa no se recupera.',
        'Las impresiones no servidas durante la pausa no se recuperan.',
        'Los leads que hubieran entrado durante la pausa no se recuperan.',
      ],
    }
  }
  if (kind === 'set_budget' || kind === 'set_max_cpl') {
    return {
      compensationPayload: { kind, payload: { restore: payload.previous ?? null } },
      irreversibleEffects: ['La entrega servida con el presupuesto anterior no se puede rehacer.'],
    }
  }
  return { compensationPayload: null, irreversibleEffects: ['Efectos no catalogados para este tipo de acción.'] }
}

/**
 * Aprueba una decisión: registra quién y por qué, y crea la acción pendiente
 * con sus guardarraíles y su compensación. No toca Meta.
 */
export async function approveDecision(
  orgId: string,
  actorUserId: string,
  decisionId: string,
  note?: string
) {
  const decision = await prisma.adDecision.findFirst({ where: { id: decisionId, orgId } })
  if (!decision) return null
  if (!['advisory', 'shadow', 'pending_approval'].includes(decision.status)) {
    throw new DecisionNotActionableError(`La decisión ya está en estado "${decision.status}".`)
  }
  if (!decision.hypotheticalAction) {
    throw new DecisionNotActionableError('Esta observación no propone ninguna acción concreta que aprobar.')
  }

  const hypothetical = decision.hypotheticalAction as Record<string, unknown>
  const kind = typeof hypothetical.kind === 'string' ? hypothetical.kind : 'unknown'
  const { policy, checks, allPassed } = await evaluateGuardrails(orgId, decision.campaignId)
  const { compensationPayload, irreversibleEffects } = buildCompensation(
    kind,
    (hypothetical.payload ?? {}) as Record<string, unknown>
  )

  const [updatedDecision, action] = await prisma.$transaction([
    prisma.adDecision.update({
      where: { id: decision.id },
      data: {
        status: 'approved',
        actorUserId,
        decidedAt: new Date(),
        decisionNote: note ?? null,
      },
    }),
    prisma.adAction.create({
      data: {
        orgId,
        decisionId: decision.id,
        campaignId: decision.campaignId,
        kind,
        scope: typeof hypothetical.scope === 'string' ? hypothetical.scope : 'campaign',
        target: typeof hypothetical.target === 'string' ? hypothetical.target : null,
        payload: (hypothetical.payload ?? {}) as object,
        // Aunque la persona apruebe, la acción nace en sombra: la ejecución
        // real necesita la Fase 4 y una política que lo permita.
        mode: policy.mode === 'live' && allPassed ? 'live' : 'shadow',
        status: allPassed ? 'pending_execution' : 'cancelled',
        guardrailChecks: checks,
        compensationPayload: compensationPayload as object | undefined,
        irreversibleEffects,
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
        errorCode: allPassed ? null : 'guardrail_blocked',
      },
    }),
  ])

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'ads.decision.approved',
    entityType: 'AdDecision',
    entityId: decision.id,
    before: decision,
    after: { decision: updatedDecision, action },
  })

  return { decision: updatedDecision, action }
}

/**
 * Rechaza una decisión con motivo humano. El motivo es obligatorio: es el
 * único mecanismo de aprendizaje que tiene el sistema en N1, y un rechazo sin
 * razón no enseña nada a la próxima versión de la regla.
 */
export async function rejectDecision(
  orgId: string,
  actorUserId: string,
  decisionId: string,
  reason: string
) {
  const decision = await prisma.adDecision.findFirst({ where: { id: decisionId, orgId } })
  if (!decision) return null
  if (!['advisory', 'shadow', 'pending_approval'].includes(decision.status)) {
    throw new DecisionNotActionableError(`La decisión ya está en estado "${decision.status}".`)
  }

  const updated = await prisma.adDecision.update({
    where: { id: decision.id },
    data: { status: 'rejected', actorUserId, decidedAt: new Date(), decisionNote: reason },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'ads.decision.rejected',
    entityType: 'AdDecision',
    entityId: decision.id,
    before: decision,
    after: updated,
  })
  return updated
}

/** Acciones aprobadas, con su decisión de origen, para auditar el circuito. */
export async function listActions(orgId: string, limit = 25) {
  return prisma.adAction.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      decision: { select: { title: true, diagnosis: true, confidence: true } },
      campaign: { select: { name: true } },
    },
  })
}
