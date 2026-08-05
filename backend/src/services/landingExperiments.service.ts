import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { LANDING_LIFECYCLE, VARIANT_STATUS, VariantError } from './landingVariants.service'

/**
 * A/B server-side de landings — docs/xarly/landings.md §9.
 *
 * A diferencia del orgánico, aquí el A/B es estadísticamente honesto: mismo
 * tráfico y asignación aleatoria en el servidor. Las tres reglas que hacen que
 * el resultado signifique algo:
 *
 * 1. El experimento referencia `landingVersionId`, no slugs: editar el hero a
 *    mitad de experimento crearía una versión nueva y compararía cosas
 *    distintas.
 * 2. La métrica de decisión es la más profunda elegible: cualificados si hay
 *    volumen, leads si no.
 * 3. **Umbral explícito antes de declarar ganadora.** Si no se alcanza en el
 *    plazo, el experimento termina en "sin conclusión" — un resultado válido,
 *    nunca una ganadora con 17 visitas.
 *
 * Nota de alcance: la asignación es **por sesión**, no por visitante, mientras
 * la decisión de cookies siga pendiente (§13). Un visitante que vuelve mañana
 * puede caer en la otra variante; el experimento sigue siendo válido, pero mide
 * sesiones y así se declara.
 */

/** Exposiciones mínimas por variante antes de mirar siquiera el resultado. */
const MIN_EXPOSURES_PER_VARIANT = 200
/** Conversiones mínimas en total: sin ellas, cualquier diferencia es ruido. */
const MIN_CONVERSIONS_TOTAL = 25
/** Significación exigida: 95% a dos colas. */
const Z_THRESHOLD = 1.96

export type ExperimentDecision = 'running' | 'winner' | 'inconclusive' | 'insufficient'

/**
 * Asignación determinista por sesión: la misma sesión recibe siempre la misma
 * variante aunque el reparto se recalcule, y sin necesidad de consultar la base
 * antes de decidir.
 */
export function assignVariantKey(subjectKey: string, keys: string[]) {
  if (!keys.length) return null
  const hash = createHash('sha256').update(subjectKey).digest()
  return keys[hash.readUInt32BE(0) % keys.length]
}

/**
 * Test de dos proporciones. Devuelve el estadístico z y si supera el umbral.
 *
 * Es deliberadamente simple y explícito: preferimos una regla que cualquiera
 * pueda auditar a una biblioteca opaca decidiendo qué se le dice al cliente.
 */
export function twoProportionZ(
  control: { exposures: number; conversions: number },
  challenger: { exposures: number; conversions: number },
) {
  if (!control.exposures || !challenger.exposures) return null
  const p1 = control.conversions / control.exposures
  const p2 = challenger.conversions / challenger.exposures
  const pooled = (control.conversions + challenger.conversions) / (control.exposures + challenger.exposures)
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / control.exposures + 1 / challenger.exposures))
  if (!standardError) return null
  return { z: Number(((p2 - p1) / standardError).toFixed(3)), lift: p1 ? Number(((p2 - p1) / p1).toFixed(4)) : null }
}

/**
 * Arranca un experimento entre la versión publicada (control) y una variante
 * aprobada. La variante debe estar aprobada por una persona: N1 propone, N2
 * aprueba, y solo entonces se sirve a tráfico real.
 */
export async function startLandingExperiment(
  orgId: string,
  actorUserId: string,
  variantId: string,
  options: { primaryMetric?: string; durationDays?: number } = {},
) {
  const variant = await prisma.landingVariant.findFirst({ where: { id: variantId, orgId } })
  if (!variant) throw new VariantError('Variante no encontrada')
  if (variant.status !== VARIANT_STATUS.PENDING_APPROVAL) {
    throw new VariantError('Solo una variante pendiente de aprobación puede activarse; genera y envía a aprobación primero.')
  }

  const approval = variant.approvalRequestId
    ? await prisma.sensitiveApprovalRequest.findUnique({ where: { id: variant.approvalRequestId } })
    : null
  if (!approval || approval.status !== 'approved') {
    throw new VariantError('La variante necesita aprobación humana explícita antes de servirse a tráfico real.')
  }

  const running = await prisma.landingVariant.findFirst({
    where: { landingKey: variant.landingKey, status: VARIANT_STATUS.ACTIVE },
  })
  // Dos experimentos a la vez sobre la misma landing hacen que ninguno de los
  // dos signifique nada.
  if (running) throw new VariantError('Esta landing ya tiene un experimento activo.')

  const durationDays = options.durationDays ?? 21
  const experiment = await prisma.revenueExperiment.create({
    data: {
      orgId,
      createdById: actorUserId,
      name: `Landing ${variant.landingKey} — ${variant.name}`,
      surface: 'landing',
      primaryMetric: options.primaryMetric ?? 'lead',
      status: 'running',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
      // El experimento apunta a la versión inmutable, nunca al slug (§9).
      audienceDefinition: {
        landingKey: variant.landingKey,
        baseVersionId: variant.baseVersionId,
        assignmentUnit: 'session',
      } as Prisma.InputJsonObject,
    },
  })

  const [, challenger] = await Promise.all([
    prisma.revenueExperimentVariant.create({
      data: { experimentId: experiment.id, key: 'a', name: 'Versión publicada', isControl: true, allocation: 50 },
    }),
    prisma.revenueExperimentVariant.create({
      data: { experimentId: experiment.id, key: variant.key, name: variant.name, allocation: 50, payload: variant.patch as Prisma.InputJsonObject },
    }),
  ])

  const [updated] = await Promise.all([
    prisma.landingVariant.update({
      where: { id: variant.id },
      data: { status: VARIANT_STATUS.ACTIVE, experimentId: experiment.id, variantRecordId: challenger.id },
    }),
    prisma.campaign.update({
      where: { id: variant.campaignId },
      data: { landingLifecycle: LANDING_LIFECYCLE.EXPERIMENTING },
    }),
    prisma.sensitiveApprovalRequest.update({ where: { id: approval.id }, data: { consumedAt: new Date() } }),
  ])

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'landing.experiment.started',
    entityType: 'RevenueExperiment',
    entityId: experiment.id,
    after: { variantId: variant.id, landingKey: variant.landingKey, durationDays },
  })

  return { experiment, variant: updated }
}

/** Experimento activo de una landing, si lo hay. */
export async function activeExperimentFor(landingKey: string) {
  const variant = await prisma.landingVariant.findFirst({
    where: { landingKey, status: VARIANT_STATUS.ACTIVE, experimentId: { not: null } },
  })
  if (!variant?.experimentId) return null

  const experiment = await prisma.revenueExperiment.findUnique({
    where: { id: variant.experimentId },
    include: { variants: true },
  })
  if (!experiment || experiment.status !== 'running') return null
  return { experiment, variant }
}

/**
 * Asigna variante a una sesión al servir la landing. Idempotente: la misma
 * sesión recibe siempre lo mismo, aunque recargue.
 */
export async function assignSessionToVariant(landingKey: string, sessionId: string) {
  const active = await activeExperimentFor(landingKey)
  if (!active) return null

  const { experiment, variant } = active
  const existing = await prisma.revenueExperimentAssignment.findUnique({
    where: { experimentId_subjectKey: { experimentId: experiment.id, subjectKey: sessionId } },
    include: { variant: true },
  })
  if (existing) {
    return { experimentId: experiment.id, variantKey: existing.variant.key, patch: existing.variant.payload, variantId: existing.variantId }
  }

  const keys = experiment.variants.map(item => item.key)
  const chosenKey = assignVariantKey(sessionId, keys)
  const chosen = experiment.variants.find(item => item.key === chosenKey) ?? experiment.variants[0]

  try {
    await prisma.revenueExperimentAssignment.create({
      data: {
        orgId: variant.orgId,
        experimentId: experiment.id,
        variantId: chosen.id,
        subjectKey: sessionId,
        metadata: { landingKey, baseVersionId: variant.baseVersionId } as Prisma.InputJsonObject,
      },
    })
  } catch (error) {
    // Dos peticiones simultáneas de la misma sesión: gana el índice único y la
    // segunda lee la asignación existente.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
  }

  return { experimentId: experiment.id, variantKey: chosen.key, patch: chosen.payload, variantId: chosen.id }
}

/**
 * Asignación existente de una sesión, sin crear ninguna.
 *
 * La telemetría la consulta para sellar cada evento con su experimento y su
 * variante (§3.1). Crear la asignación aquí sería meter en el experimento a
 * quien nunca llegó a ver la página.
 */
export async function assignmentForSession(landingKey: string, sessionId: string) {
  const active = await activeExperimentFor(landingKey)
  if (!active) return null

  const assignment = await prisma.revenueExperimentAssignment.findUnique({
    where: { experimentId_subjectKey: { experimentId: active.experiment.id, subjectKey: sessionId } },
    select: { variantId: true },
  })
  if (!assignment) return null

  return { experimentId: active.experiment.id, variantId: assignment.variantId }
}

/** Registra la conversión de una sesión asignada (envío de formulario). */
export async function recordSessionConversion(landingKey: string, sessionId: string, leadId?: string) {
  const active = await activeExperimentFor(landingKey)
  if (!active) return null

  const assignment = await prisma.revenueExperimentAssignment.findUnique({
    where: { experimentId_subjectKey: { experimentId: active.experiment.id, subjectKey: sessionId } },
  })
  if (!assignment || assignment.convertedAt) return null

  return prisma.revenueExperimentAssignment.update({
    where: { id: assignment.id },
    data: { convertedAt: new Date(), conversionType: 'lead', leadId: leadId ?? null },
  })
}

/**
 * Evalúa un experimento. Nunca declara ganadora sin volumen y sin significación:
 * el resultado honesto de un experimento pequeño es "sin conclusión".
 */
export async function evaluateExperiment(orgId: string, experimentId: string) {
  const experiment = await prisma.revenueExperiment.findFirst({
    where: { id: experimentId, orgId },
    include: { variants: true },
  })
  if (!experiment) throw new VariantError('Experimento no encontrado')

  const assignments = await prisma.revenueExperimentAssignment.groupBy({
    by: ['variantId'],
    where: { experimentId },
    _count: { _all: true },
  })
  const conversions = await prisma.revenueExperimentAssignment.groupBy({
    by: ['variantId'],
    where: { experimentId, convertedAt: { not: null } },
    _count: { _all: true },
  })

  const exposureByVariant = new Map(assignments.map(row => [row.variantId, row._count._all]))
  const conversionByVariant = new Map(conversions.map(row => [row.variantId, row._count._all]))

  const results = experiment.variants.map(variant => {
    const exposures = exposureByVariant.get(variant.id) ?? 0
    const converted = conversionByVariant.get(variant.id) ?? 0
    return {
      variantId: variant.id,
      key: variant.key,
      name: variant.name,
      isControl: variant.isControl,
      exposures,
      conversions: converted,
      // `null` cuando no hubo exposición: sin tráfico no hay tasa que mostrar.
      conversionRate: exposures ? Number((converted / exposures).toFixed(4)) : null,
    }
  })

  const control = results.find(result => result.isControl)
  const challenger = results.find(result => !result.isControl)
  const totalConversions = results.reduce((total, result) => total + result.conversions, 0)
  const expired = experiment.endsAt ? experiment.endsAt.getTime() <= Date.now() : false

  let decision: ExperimentDecision = 'running'
  let reason = 'El experimento sigue recogiendo datos.'
  let statistic: ReturnType<typeof twoProportionZ> = null

  if (!control || !challenger) {
    decision = 'insufficient'
    reason = 'El experimento no tiene control y retador comparables.'
  } else {
    const enoughExposure = control.exposures >= MIN_EXPOSURES_PER_VARIANT && challenger.exposures >= MIN_EXPOSURES_PER_VARIANT
    const enoughConversions = totalConversions >= MIN_CONVERSIONS_TOTAL
    statistic = twoProportionZ(control, challenger)

    if (enoughExposure && enoughConversions && statistic && Math.abs(statistic.z) >= Z_THRESHOLD) {
      decision = 'winner'
      const winner = statistic.z > 0 ? challenger : control
      reason = `«${winner.name}» gana con significación del 95% (z = ${statistic.z}).`
    } else if (expired) {
      // Terminó el plazo sin alcanzar el umbral: eso es un resultado, y se
      // comunica como tal en vez de coronar a la variante que va por delante.
      decision = 'inconclusive'
      reason = !enoughExposure
        ? `Sin conclusión: hacen falta ${MIN_EXPOSURES_PER_VARIANT} sesiones por variante y hubo ${control.exposures} y ${challenger.exposures}.`
        : !enoughConversions
          ? `Sin conclusión: ${totalConversions} conversiones en total, por debajo del mínimo de ${MIN_CONVERSIONS_TOTAL}.`
          : 'Sin conclusión: la diferencia observada no alcanza el 95% de significación.'
    } else if (!enoughExposure || !enoughConversions) {
      decision = 'insufficient'
      reason = `Todavía sin volumen suficiente (${control.exposures} y ${challenger.exposures} sesiones, ${totalConversions} conversiones).`
    }
  }

  return {
    experimentId,
    landingKey: (experiment.audienceDefinition as { landingKey?: string } | null)?.landingKey ?? null,
    primaryMetric: experiment.primaryMetric,
    assignmentUnit: 'session',
    endsAt: experiment.endsAt,
    results,
    statistic,
    decision,
    reason,
    thresholds: {
      minExposuresPerVariant: MIN_EXPOSURES_PER_VARIANT,
      minConversionsTotal: MIN_CONVERSIONS_TOTAL,
      confidence: '95%',
    },
  }
}

/**
 * Cierra el experimento aplicando su resultado (N2: un clic de una persona).
 *
 * Una variante ganadora no se publica sola: promocionarla reescribe lo que ven
 * los clientes, así que queda registrada en `AuditLog` con quién lo decidió.
 */
export async function concludeExperiment(orgId: string, actorUserId: string, experimentId: string) {
  const evaluation = await evaluateExperiment(orgId, experimentId)
  if (evaluation.decision === 'running' || evaluation.decision === 'insufficient') {
    throw new VariantError(`El experimento todavía no se puede cerrar: ${evaluation.reason}`)
  }

  const variant = await prisma.landingVariant.findFirst({ where: { orgId, experimentId } })
  if (!variant) throw new VariantError('Variante del experimento no encontrada')

  const challengerWon = evaluation.decision === 'winner'
    && (evaluation.statistic?.z ?? 0) > 0
  const status = evaluation.decision === 'inconclusive'
    ? VARIANT_STATUS.INCONCLUSIVE
    : challengerWon ? VARIANT_STATUS.WINNER : VARIANT_STATUS.LOSER

  const [updated] = await Promise.all([
    prisma.landingVariant.update({ where: { id: variant.id }, data: { status, decidedAt: new Date() } }),
    prisma.revenueExperiment.update({ where: { id: experimentId }, data: { status: 'completed' } }),
    prisma.campaign.update({
      where: { id: variant.campaignId },
      data: { landingLifecycle: challengerWon ? LANDING_LIFECYCLE.WINNER : LANDING_LIFECYCLE.PUBLISHED },
    }),
  ])

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'landing.experiment.concluded',
    entityType: 'RevenueExperiment',
    entityId: experimentId,
    after: { decision: evaluation.decision, reason: evaluation.reason, variantId: variant.id, status },
  })

  return { evaluation, variant: updated }
}
