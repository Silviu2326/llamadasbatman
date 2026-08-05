import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { getDataQuality } from './adDataQuality.service'
import { getOrganicDataQuality } from './organicDataQuality.service'
import { attributionCoverage, isDataRepairRule, isOrganicAutonomyRule } from './organicAutonomy.service'
import { getPolicy } from './adPolicy.service'

/**
 * Autonomía por regla — Fase 5 de `docs/xarly/ads.md`.
 *
 * Dos ideas gobiernan este servicio, ambas de la §10.1:
 *
 * 1. **La promoción se gana, no se concede.** Hacen falta un número mínimo de
 *    decisiones evaluadas y de resultados observados. "Lleva una semana
 *    funcionando" no es un criterio: una regla que nadie ha aprobado nunca no
 *    ha demostrado nada.
 *
 * 2. **La degradación es automática.** Ante datos obsoletos, cobertura baja o
 *    errores de ejecución, la regla vuelve a N1 sola. Esperar a que alguien se
 *    dé cuenta no es un guardarraíl.
 *
 * Es por regla y no por organización: que el kill switch por gasto diario haya
 * demostrado ser fiable no dice nada sobre una regla de fatiga creativa recién
 * escrita.
 */

/** Requisitos para subir de N1 a N2. */
const N2_MIN_DECISIONS = 5
const N2_MIN_APPROVED = 3
/** Requisitos para subir de N2 a N3 (canario automático). */
const N3_MIN_EXECUTED = 5
/** Proporción máxima de rechazos humanos que tolera una promoción. */
const MAX_REJECTION_RATE = 0.34
/** Proporción máxima de acciones fallidas que tolera una promoción. */
const MAX_FAILURE_RATE = 0.2

export type PromotionAssessment = {
  ruleKey: string
  currentLevel: string
  eligibleFor: string | null
  blockers: string[]
  stats: {
    raised: number
    approved: number
    rejected: number
    executed: number
    failed: number
    rejectionRate: number | null
    failureRate: number | null
  }
}

export async function getRuleAutonomy(orgId: string, ruleKey: string) {
  const existing = await prisma.adRuleAutonomy.findUnique({
    where: { orgId_ruleKey: { orgId, ruleKey } },
  })
  if (existing) return existing
  return prisma.adRuleAutonomy.create({ data: { orgId, ruleKey } })
}

/**
 * Recalcula los contadores desde los datos reales en vez de mantenerlos a
 * mano. Un contador que se incrementa en el sitio equivocado miente para
 * siempre; recontar es barato y no puede desincronizarse.
 */
export async function refreshRuleStats(orgId: string, ruleKey: string) {
  const [decisions, actions] = await Promise.all([
    prisma.adDecision.groupBy({
      by: ['status'],
      where: { orgId, ruleKey },
      _count: { _all: true },
    }),
    prisma.adAction.findMany({
      where: { orgId, decision: { ruleKey } },
      select: { status: true },
    }),
  ])

  const decisionCount = (status: string) => decisions.find(row => row.status === status)?._count._all ?? 0
  const raised = decisions.reduce((total, row) => total + row._count._all, 0)

  return prisma.adRuleAutonomy.upsert({
    where: { orgId_ruleKey: { orgId, ruleKey } },
    create: {
      orgId,
      ruleKey,
      decisionsRaised: raised,
      decisionsApproved: decisionCount('approved') + decisionCount('executed'),
      decisionsRejected: decisionCount('rejected'),
      actionsExecuted: actions.filter(action => action.status === 'executed' || action.status === 'compensated').length,
      actionsFailed: actions.filter(action => action.status === 'failed').length,
    },
    update: {
      decisionsRaised: raised,
      decisionsApproved: decisionCount('approved') + decisionCount('executed'),
      decisionsRejected: decisionCount('rejected'),
      actionsExecuted: actions.filter(action => action.status === 'executed' || action.status === 'compensated').length,
      actionsFailed: actions.filter(action => action.status === 'failed').length,
    },
  })
}

/** Dice si una regla puede subir de nivel y, si no, exactamente por qué. */
export async function assessPromotion(orgId: string, ruleKey: string): Promise<PromotionAssessment> {
  const rule = await refreshRuleStats(orgId, ruleKey)
  const decided = rule.decisionsApproved + rule.decisionsRejected
  const attempted = rule.actionsExecuted + rule.actionsFailed
  const rejectionRate = decided > 0 ? rule.decisionsRejected / decided : null
  const failureRate = attempted > 0 ? rule.actionsFailed / attempted : null

  const blockers: string[] = []
  let eligibleFor: string | null = null

  if (rule.autonomyLevel === 'N1') {
    if (rule.decisionsRaised < N2_MIN_DECISIONS) {
      blockers.push(`Solo ha producido ${rule.decisionsRaised} de las ${N2_MIN_DECISIONS} observaciones necesarias.`)
    }
    if (rule.decisionsApproved < N2_MIN_APPROVED) {
      blockers.push(`Solo se han aprobado ${rule.decisionsApproved} de las ${N2_MIN_APPROVED} necesarias: nadie ha confirmado todavía que acierte.`)
    }
    if (rejectionRate != null && rejectionRate > MAX_REJECTION_RATE) {
      blockers.push(`Se rechaza el ${Math.round(rejectionRate * 100)} % de las veces: por encima del ${Math.round(MAX_REJECTION_RATE * 100)} % no se promociona.`)
    }
    if (!blockers.length) eligibleFor = 'N2'
  } else if (rule.autonomyLevel === 'N2') {
    if (rule.actionsExecuted < N3_MIN_EXECUTED) {
      blockers.push(`Solo se han ejecutado ${rule.actionsExecuted} de las ${N3_MIN_EXECUTED} acciones necesarias para observar resultados.`)
    }
    if (failureRate != null && failureRate > MAX_FAILURE_RATE) {
      blockers.push(`Falla el ${Math.round(failureRate * 100)} % de las ejecuciones: por encima del ${Math.round(MAX_FAILURE_RATE * 100)} % no se promociona.`)
    }
    if (!blockers.length) eligibleFor = 'N3'
  } else {
    blockers.push('La regla ya está en el nivel máximo.')
  }

  // La integridad de los datos gobierna por encima del historial: una regla
  // demostrada sobre datos que hoy no son fiables tampoco puede subir. Y cada
  // familia se juzga con sus datos: la salud de Meta no dice nada sobre si
  // Search Console lleva una semana sin sincronizar.
  if (isOrganicAutonomyRule(ruleKey)) {
    const project = await prisma.organicProject.findUnique({ where: { orgId }, select: { id: true } })
    const organicQuality = await getOrganicDataQuality(orgId, project?.id ?? null)
    const staleBlocks = organicQuality.status === 'stale' && !isDataRepairRule(ruleKey)
    if (organicQuality.status === 'unreliable' || staleBlocks) {
      blockers.push(`La integridad de las fuentes orgánicas está en "${organicQuality.status}" y bloquea cualquier promoción.`)
      eligibleFor = null
    }
  } else {
    const dataQuality = await getDataQuality(orgId)
    if (dataQuality.blocksAutomation) {
      blockers.push(`La integridad de datos está en "${dataQuality.status}" y bloquea cualquier promoción.`)
      eligibleFor = null
    }
  }

  // El freno de emergencia es de la organización entera: con él echado no se
  // promociona nada, ni de Ads ni de orgánico.
  const policy = await getPolicy(orgId)
  if (policy.killSwitchEnabled) {
    blockers.push('La organización tiene la parada de emergencia activada: suéltala antes de promocionar nada.')
    eligibleFor = null
  }

  return {
    ruleKey,
    currentLevel: rule.autonomyLevel,
    eligibleFor,
    blockers,
    stats: {
      raised: rule.decisionsRaised,
      approved: rule.decisionsApproved,
      rejected: rule.decisionsRejected,
      executed: rule.actionsExecuted,
      failed: rule.actionsFailed,
      rejectionRate: rejectionRate == null ? null : Math.round(rejectionRate * 100) / 100,
      failureRate: failureRate == null ? null : Math.round(failureRate * 100) / 100,
    },
  }
}

export class PromotionBlockedError extends Error {
  readonly statusCode = 409
  readonly blockers: string[]
  constructor(message: string, blockers: string[]) {
    super(message)
    this.name = 'PromotionBlockedError'
    this.blockers = blockers
  }
}

/** Sube una regla de nivel si se lo ha ganado. Queda auditado. */
export async function promoteRule(orgId: string, actorUserId: string, ruleKey: string, canaryPercent?: number) {
  const assessment = await assessPromotion(orgId, ruleKey)
  if (!assessment.eligibleFor) {
    throw new PromotionBlockedError(
      `La regla "${ruleKey}" todavía no se ha ganado la promoción.`,
      assessment.blockers,
    )
  }

  const before = await getRuleAutonomy(orgId, ruleKey)
  const updated = await prisma.adRuleAutonomy.update({
    where: { orgId_ruleKey: { orgId, ruleKey } },
    data: {
      autonomyLevel: assessment.eligibleFor,
      // N3 empieza siempre pequeño: un canario es un experimento con red, no
      // un despliegue. La §13 lo dice literalmente: "empezar con canarios y
      // límites pequeños".
      canaryPercent: assessment.eligibleFor === 'N3' ? Math.min(canaryPercent ?? 10, 25) : before.canaryPercent,
      promotedAt: new Date(),
      promotedByUserId: actorUserId,
      degradedAt: null,
      degradedReason: null,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'ads.rule.promoted',
    entityType: 'AdRuleAutonomy',
    entityId: updated.id,
    before,
    after: updated,
  })
  return updated
}

/**
 * Degrada una regla a N1. Se llama desde el job periódico, sin intervención
 * humana: es la red de seguridad que permite que N3 exista.
 */
export async function degradeRule(orgId: string, ruleKey: string, reason: string) {
  const before = await getRuleAutonomy(orgId, ruleKey)
  if (before.autonomyLevel === 'N1') return before

  const updated = await prisma.adRuleAutonomy.update({
    where: { orgId_ruleKey: { orgId, ruleKey } },
    data: { autonomyLevel: 'N1', degradedAt: new Date(), degradedReason: reason },
  })

  await writeAuditLog({
    orgId,
    // Sin actor: la degradación la decide el sistema, y eso debe verse en la
    // auditoría en vez de atribuirse a una persona que no hizo nada.
    actorType: 'system',
    action: 'ads.rule.degraded',
    entityType: 'AdRuleAutonomy',
    entityId: updated.id,
    before,
    after: updated,
  })
  return updated
}

/** Cobertura de atribución mínima para sostener una autonomía por encima de N1. */
const MIN_ATTRIBUTION_COVERAGE_PCT = 70

/**
 * Revisión periódica: degrada todas las reglas por encima de N1 cuando la
 * realidad deja de sostenerlas. Se ejecuta en el job de sincronización.
 *
 * Cubre las dos superficies. Una regla orgánica no se mide con la integridad de
 * Meta —podría estar impecable mientras Search Console lleva una semana sin
 * sincronizar—, así que cada familia se juzga con sus propios datos. Lo que sí
 * es común: el kill switch de la organización degrada todo, de aquí y de allá.
 * Un freno que solo detiene la mitad del sistema no es un freno (`ads.md` §10).
 */
export async function enforceAutonomyGuardrails(orgId: string) {
  const elevated = await prisma.adRuleAutonomy.findMany({
    where: { orgId, autonomyLevel: { not: 'N1' } },
  })
  if (!elevated.length) return { checked: 0, degraded: 0 }

  const [dataQuality, policy, project] = await Promise.all([
    getDataQuality(orgId),
    getPolicy(orgId),
    prisma.organicProject.findUnique({ where: { orgId }, select: { id: true } }),
  ])
  const hasOrganicRule = elevated.some(rule => isOrganicAutonomyRule(rule.ruleKey))
  const [organicQuality, organicCoverage] = hasOrganicRule
    ? await Promise.all([
        getOrganicDataQuality(orgId, project?.id ?? null),
        project ? attributionCoverage(orgId, project.id) : Promise.resolve(null),
      ])
    : [null, null]

  const degraded: string[] = []

  for (const rule of elevated) {
    let reason: string | null = null
    const organic = isOrganicAutonomyRule(rule.ruleKey)

    if (policy.killSwitchEnabled) {
      reason = `La organización tiene la parada de emergencia activada: ${policy.killSwitchReason ?? 'sin motivo registrado'}.`
    } else if (organic) {
      // Una re-sincronización se libra de la degradación por datos obsoletos:
      // degradar la reparación deja la avería puesta hasta que alguien la vea.
      if (organicQuality?.status === 'stale' && !isDataRepairRule(rule.ruleKey)) {
        reason = 'Las fuentes orgánicas están obsoletas: no se puede actuar sobre una foto vieja.'
      } else if (organicQuality?.status === 'unreliable') {
        reason = 'La integridad de las fuentes orgánicas es insuficiente para actuar sin supervisión.'
      } else if (organicCoverage != null && organicCoverage < MIN_ATTRIBUTION_COVERAGE_PCT) {
        reason = `La cobertura de atribución orgánica cayó al ${organicCoverage} %.`
      }
    } else if (dataQuality.status === 'stale') {
      reason = 'Los datos de Meta están obsoletos: no se puede actuar sobre una foto vieja.'
    } else if (dataQuality.status === 'unreliable') {
      reason = 'La integridad de datos es insuficiente para actuar sin supervisión.'
    } else if (
      dataQuality.attributionCoveragePct != null &&
      dataQuality.attributionCoveragePct < MIN_ATTRIBUTION_COVERAGE_PCT
    ) {
      reason = `La cobertura de atribución cayó al ${dataQuality.attributionCoveragePct} %.`
    }

    if (!reason) {
      const stats = await refreshRuleStats(orgId, rule.ruleKey)
      const attempted = stats.actionsExecuted + stats.actionsFailed
      if (attempted > 0 && stats.actionsFailed / attempted > MAX_FAILURE_RATE) {
        reason = `La regla falla al ejecutar el ${Math.round((stats.actionsFailed / attempted) * 100)} % de las veces.`
      }
    }

    if (reason) {
      await degradeRule(orgId, rule.ruleKey, reason)
      degraded.push(rule.ruleKey)
    }
  }

  return { checked: elevated.length, degraded: degraded.length, rules: degraded }
}

/**
 * Estado de autonomía de las reglas de Ads, con su evaluación. Las orgánicas
 * comparten tabla pero tienen su propia sala (`organico.md` §9): mezclarlas aquí
 * llenaría la pantalla de Ads de reglas que no gobierna.
 */
export async function listRuleAutonomy(orgId: string) {
  const ruleKeys = await prisma.adDecision.findMany({
    where: { orgId, channel: 'ads' },
    distinct: ['ruleKey'],
    select: { ruleKey: true },
  })
  const known = new Set(ruleKeys.map(row => row.ruleKey))
  // Las reglas del MVP aparecen aunque todavía no hayan producido nada: su
  // ausencia en la lista se leería como que no existen.
  for (const key of ['spend_without_qualified', 'creative_fatigue', 'landing_underperforming', 'daily_budget_cap', 'high_cpl']) {
    known.add(key)
  }
  return Promise.all(Array.from(known).map(ruleKey => assessPromotion(orgId, ruleKey)))
}
