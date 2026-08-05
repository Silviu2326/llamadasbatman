import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { SENSITIVE_CONTENT_RULES } from '../lib/sensitiveContent'
import { VariantError } from './landingVariants.service'
import { computeBaseline } from './landingBaseline.service'
import { diagnoseOrganization, type LandingDiagnosis } from './landingDiagnostics.service'

/**
 * Autonomía de landings — docs/xarly/landings.md §10.
 *
 * Tres capas, y ninguna es opcional:
 *
 * 1. **Qué puede tocarse.** Lista cerrada de cambios automáticos; todo lo demás
 *    exige una persona. La lista negra gana siempre sobre la blanca.
 * 2. **Límites operativos.** Un cambio activo por landing, período mínimo de
 *    observación, reversión automática si cae una métrica de seguridad, y nunca
 *    durante una campaña crítica sin permiso.
 * 3. **Modo sombra.** Antes de tocar nada, N3 escribe lo que *haría*. El
 *    registro dice "habría hecho X", jamás "habría ahorrado Y": no sabemos qué
 *    habría pasado por el otro camino (ads.md §10.2).
 */

/** Sube al cambiar las reglas: un histórico sin versión no se puede interpretar. */
export const AUTONOMY_POLICY_VERSION = 'landing-autonomy-v1'

export type AutonomyLevel = 'N1' | 'N2' | 'N3'

/** Modificable automáticamente por N3 (§10). */
export const AUTONOMOUS_CHANGES = {
  BLOCK_ORDER: 'block_order',
  CTA_TEXT: 'cta_text',
  OPTIONAL_FIELD: 'optional_field',
  HERO_VARIANT: 'hero_variant',
  FAQ: 'faq',
} as const

/** Siempre requiere aprobación humana (§10). La lista negra manda. */
export const HUMAN_ONLY_CHANGES = {
  PRICING: 'pricing',
  TESTIMONIAL: 'testimonial',
  LEGAL_CLAIM: 'legal_claim',
  CONTRACT_TERMS: 'contract_terms',
  CONSENT: 'consent',
  TARGETING: 'targeting',
} as const

const AUTONOMOUS_SET = new Set<string>(Object.values(AUTONOMOUS_CHANGES))
const HUMAN_ONLY_SET = new Set<string>(Object.values(HUMAN_ONLY_CHANGES))

/**
 * Un tipo de cambio permitido puede llevar contenido prohibido: un "texto de
 * CTA" que dice «garantía de devolución» o «desde 9 €» es una promesa
 * comercial, no un botón. Se inspecciona el contenido, no solo la etiqueta.
 *
 * Las reglas viven en `lib/sensitiveContent` porque `organico.md` §9 traza la
 * misma frontera para las piezas orgánicas: dos copias se separan en cuanto
 * alguien arregla una.
 */
export { SENSITIVE_CONTENT_RULES }

/** Campos sin los que la solicitud no se puede atender ni acreditar el permiso. */
const ESSENTIAL_FIELDS = new Set(['name', 'phone', 'consent'])

interface AutonomyConfig {
  level: AutonomyLevel
  shadowMode: boolean
  /** Días de observación tras aplicar un cambio antes de dar por bueno nada. */
  observationDays: number
  /** Caída relativa de la métrica de seguridad que dispara la reversión. */
  rollbackDropThreshold: number
  /** Campañas marcadas como críticas: N3 no las toca sin permiso. */
  criticalCampaignIds: string[]
}

const DEFAULT_CONFIG: AutonomyConfig = {
  // Por defecto, nada automático. La autonomía se concede, no se hereda.
  level: 'N1',
  shadowMode: true,
  observationDays: 7,
  rollbackDropThreshold: 0.15,
  criticalCampaignIds: [],
}

/**
 * Configuración efectiva. Se guarda en `GovernancePolicy` con la clave
 * `landing_autonomy`, reutilizando la tabla de gobierno que ya existe.
 */
export async function autonomyConfig(orgId: string): Promise<AutonomyConfig> {
  const policy = await prisma.governancePolicy.findUnique({
    where: { orgId_key: { orgId, key: 'landing_autonomy' } },
  })
  if (!policy || !policy.enabled) return DEFAULT_CONFIG

  const config = (policy.config ?? {}) as Partial<AutonomyConfig>
  return {
    level: config.level === 'N3' || config.level === 'N2' ? config.level : DEFAULT_CONFIG.level,
    // El modo sombra solo se desactiva explícitamente: cualquier valor que no
    // sea `false` mantiene N3 sin efectos reales.
    shadowMode: config.shadowMode !== false,
    observationDays: typeof config.observationDays === 'number' ? config.observationDays : DEFAULT_CONFIG.observationDays,
    rollbackDropThreshold: typeof config.rollbackDropThreshold === 'number' ? config.rollbackDropThreshold : DEFAULT_CONFIG.rollbackDropThreshold,
    criticalCampaignIds: Array.isArray(config.criticalCampaignIds) ? config.criticalCampaignIds : [],
  }
}

export async function setAutonomyConfig(orgId: string, actorUserId: string, input: Partial<AutonomyConfig>) {
  const current = await autonomyConfig(orgId)
  const next = { ...current, ...input }
  const saved = await prisma.governancePolicy.upsert({
    where: { orgId_key: { orgId, key: 'landing_autonomy' } },
    create: { orgId, key: 'landing_autonomy', enabled: true, config: next as unknown as Prisma.InputJsonObject, updatedById: actorUserId },
    update: { config: next as unknown as Prisma.InputJsonObject, updatedById: actorUserId, enabled: true },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'landing.autonomy.policy_updated',
    entityType: 'GovernancePolicy',
    entityId: saved.id,
    before: current,
    after: next,
  })

  return next
}

export interface GuardrailCheck {
  id: string
  passed: boolean
  detail: string
}

export interface ProposedChange {
  landingKey: string
  campaignId: string
  changeType: string
  payload: Record<string, unknown>
  diagnosisType?: string
}

/**
 * Evalúa los guardarraíles de §10 uno a uno. Devuelve todos los resultados, no
 * solo el primero que falla: quien lee la decisión tiene que ver qué se
 * comprobó, no solo qué la bloqueó.
 */
export async function evaluateGuardrails(orgId: string, change: ProposedChange, config: AutonomyConfig) {
  const checks: GuardrailCheck[] = []

  // 1. Lista negra antes que lista blanca.
  const humanOnly = HUMAN_ONLY_SET.has(change.changeType)
  checks.push({
    id: 'change_type_allowed',
    passed: !humanOnly && AUTONOMOUS_SET.has(change.changeType),
    detail: humanOnly
      ? `«${change.changeType}» siempre requiere aprobación humana.`
      : AUTONOMOUS_SET.has(change.changeType)
        ? `«${change.changeType}» está en la lista de cambios automáticos.`
        : `«${change.changeType}» no está en la lista de cambios automáticos.`,
  })

  // 2. El contenido puede ser sensible aunque el tipo esté permitido.
  const text = JSON.stringify(change.payload)
  const sensitive = SENSITIVE_CONTENT_RULES.find(rule => rule.pattern.test(text))
  checks.push({
    id: 'content_not_sensitive',
    passed: !sensitive,
    detail: sensitive ? `El contenido propuesto ${sensitive.reason}: decide una persona.` : 'El contenido no toca precios, garantías, legales ni prueba social.',
  })

  // 3. Campos esenciales: nunca se retiran automáticamente.
  const fields = Array.isArray(change.payload.fields) ? change.payload.fields as string[] : []
  const touchesEssential = fields.some(field => ESSENTIAL_FIELDS.has(field))
  checks.push({
    id: 'essential_fields_untouched',
    passed: !touchesEssential,
    detail: touchesEssential
      ? 'El cambio afecta a nombre, teléfono o consentimiento: sin ellos no se puede atender la solicitud.'
      : 'No toca campos esenciales.',
  })

  // 4. Un solo cambio activo por landing.
  const active = await prisma.landingAutonomyDecision.findFirst({
    where: { landingKey: change.landingKey, status: 'applied', rolledBackAt: null },
  })
  checks.push({
    id: 'single_active_change',
    passed: !active,
    detail: active
      ? `Ya hay un cambio activo desde ${active.appliedAt?.toISOString().slice(0, 10)}: dos a la vez impiden saber cuál causó qué.`
      : 'No hay otro cambio activo en esta landing.',
  })

  // 5. Campaña crítica.
  const critical = config.criticalCampaignIds.includes(change.campaignId)
  checks.push({
    id: 'not_critical_campaign',
    passed: !critical,
    detail: critical ? 'La campaña está marcada como crítica: requiere permiso explícito.' : 'La campaña no está marcada como crítica.',
  })

  // 6. Volumen suficiente para poder observar el efecto.
  const baseline = await computeBaseline(change.landingKey)
  checks.push({
    id: 'enough_traffic_to_observe',
    passed: !baseline.insufficientReason,
    detail: baseline.insufficientReason ?? `Volumen suficiente para observar el efecto (${baseline.recent.sessions} sesiones recientes).`,
  })

  const blocked = checks.find(check => !check.passed)
  return { checks, blockedReason: blocked ? blocked.detail : null, baseline }
}

/**
 * Decide sobre un cambio propuesto y lo registra siempre, se aplique o no.
 *
 * En N1 y N2 nunca se aplica solo. En N3 con modo sombra se registra lo que
 * habría hecho. Solo N3 con sombra desactivada y todos los guardarraíles en
 * verde llega a aplicar.
 */
export async function decide(orgId: string, change: ProposedChange, evidence: unknown, actorUserId?: string) {
  const config = await autonomyConfig(orgId)
  const { checks, blockedReason, baseline } = await evaluateGuardrails(orgId, change, config)

  const status = blockedReason
    ? 'blocked'
    : config.level !== 'N3'
      ? 'proposed'
      : config.shadowMode
        ? 'shadow'
        : 'applied'

  const decision = await prisma.landingAutonomyDecision.create({
    data: {
      orgId,
      campaignId: change.campaignId,
      landingKey: change.landingKey,
      diagnosisType: change.diagnosisType ?? null,
      level: config.level,
      status,
      changeType: change.changeType,
      payload: change.payload as Prisma.InputJsonObject,
      guardrails: checks as unknown as Prisma.InputJsonArray,
      blockedReason,
      policyVersion: AUTONOMY_POLICY_VERSION,
      evidence: (evidence ?? {}) as Prisma.InputJsonObject,
      actorUserId: actorUserId ?? null,
      // La métrica de seguridad y su valor se congelan al aplicar: comparar
      // después contra una base recalculada escondería la caída.
      safetyMetric: status === 'applied' ? 'conversion' : null,
      safetyBaseline: status === 'applied' ? baseline.baseline.conversion : null,
      observationUntil: status === 'applied'
        ? new Date(Date.now() + config.observationDays * 24 * 60 * 60 * 1000)
        : null,
      appliedAt: status === 'applied' ? new Date() : null,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    actorType: actorUserId ? 'user' : 'system',
    action: `landing.autonomy.${status}`,
    entityType: 'LandingAutonomyDecision',
    entityId: decision.id,
    after: { changeType: change.changeType, level: config.level, blockedReason },
  })

  return decision
}

/**
 * Convierte los diagnósticos activos en cambios candidatos y los pasa por la
 * cadena de decisión. Es lo que ejecuta el job de autonomía.
 */
export function changeFromDiagnosis(diagnosis: LandingDiagnosis): ProposedChange | null {
  // Hoy ningún diagnóstico produce un cambio que N3 pueda aplicar, y conviene
  // que esté escrito aquí en vez de descubrirse leyendo un registro de sombra
  // lleno de decisiones que no habrían cambiado nada:
  //
  // - `optional_field`: el formulario público solo exige nombre, teléfono y
  //   consentimiento, y los tres son esenciales. No queda ningún campo no
  //   esencial cuya obligatoriedad se pueda relajar. Retirar el campo sí tiene
  //   efecto, pero eso es más que "relajar la obligatoriedad" de §10 y por eso
  //   va por variante y experimento (§9), donde una persona lo aprueba.
  // - `cta_text` y `faq`: son constantes de `PublicLandingPage`, no datos
  //   editables; no hay nada que un cambio automático pueda escribir.
  // - `block_order`: la landing no tiene bloques reordenables.
  // - `hero_variant`: exige una variante ya aprobada, es decir, el camino de
  //   §9 otra vez.
  //
  // Cuando la landing tenga superficie editable, este es el único punto que
  // hay que tocar: los guardarraíles, el registro y la reversión ya funcionan.
  void diagnosis
  return null
}

/**
 * Cierra el período de observación: mide qué pasó y revierte si la métrica de
 * seguridad cayó por encima del umbral.
 */
export async function reviewAppliedChanges(orgId: string) {
  const config = await autonomyConfig(orgId)
  const pending = await prisma.landingAutonomyDecision.findMany({
    where: { orgId, status: 'applied', rolledBackAt: null, observationUntil: { lte: new Date() } },
  })

  const reviewed = []
  for (const decision of pending) {
    const baseline = await computeBaseline(decision.landingKey)
    const before = decision.safetyBaseline
    const after = baseline.recent.conversion

    // Sin medición no se declara ni éxito ni fracaso: se deja en observación.
    if (before === null || after === null || baseline.insufficientReason) {
      reviewed.push(await prisma.landingAutonomyDecision.update({
        where: { id: decision.id },
        data: {
          outcome: {
            verdict: 'sin_datos',
            detail: baseline.insufficientReason ?? 'Sin conversión medida en la ventana de observación.',
          } as Prisma.InputJsonObject,
          observationUntil: new Date(Date.now() + config.observationDays * 24 * 60 * 60 * 1000),
        },
      }))
      continue
    }

    const drop = before > 0 ? (before - after) / before : 0
    const mustRollback = drop >= config.rollbackDropThreshold

    reviewed.push(await prisma.landingAutonomyDecision.update({
      where: { id: decision.id },
      data: {
        status: mustRollback ? 'rolled_back' : 'applied',
        rolledBackAt: mustRollback ? new Date() : null,
        outcome: {
          verdict: mustRollback ? 'revertido' : 'mantenido',
          // Se describe lo observado, no lo que "se habría ahorrado".
          conversionBefore: before,
          conversionAfter: after,
          relativeChange: Number((-drop).toFixed(4)),
          detail: mustRollback
            ? `La conversión cayó un ${(drop * 100).toFixed(1)}% frente a la línea base congelada al aplicar el cambio; se revierte.`
            : `La conversión se mantuvo dentro del margen (${(-drop * 100).toFixed(1)}%).`,
        } as Prisma.InputJsonObject,
      },
    }))

    if (mustRollback) {
      await writeAuditLog({
        orgId,
        actorType: 'system',
        action: 'landing.autonomy.rolled_back',
        entityType: 'LandingAutonomyDecision',
        entityId: decision.id,
        after: { drop, threshold: config.rollbackDropThreshold },
      })
    }
  }

  return { reviewed: reviewed.length }
}

/** Pasada completa: diagnostica, propone y decide. La ejecuta el job diario. */
export async function runAutonomyPass(orgId: string) {
  const config = await autonomyConfig(orgId)
  const diagnoses = await diagnoseOrganization(orgId)

  const decisions = []
  for (const diagnosis of diagnoses) {
    const change = changeFromDiagnosis(diagnosis)
    if (!change) continue
    decisions.push(await decide(orgId, change, {
      diagnosis: diagnosis.type,
      evidence: diagnosis.evidence,
      impact: diagnosis.impact,
      confidence: diagnosis.confidence,
    }))
  }

  const review = await reviewAppliedChanges(orgId)
  return { level: config.level, shadowMode: config.shadowMode, decisions: decisions.length, ...review }
}

export async function listDecisions(orgId: string, landingKey?: string) {
  return prisma.landingAutonomyDecision.findMany({
    where: { orgId, ...(landingKey ? { landingKey } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}
