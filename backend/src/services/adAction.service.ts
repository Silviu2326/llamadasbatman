import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { getDataQuality } from './adDataQuality.service'
import { getPolicy } from './adPolicy.service'
import { getDecryptedToken } from './metaAdAccount.service'
import { getRuleAutonomy } from './adRuleAutonomy.service'
import { createHash } from 'crypto'
import { getRemoteStatus } from './metaCampaignBuilder.service'
import { fetchWithTimeout } from '../lib/integrationRuntime'

/**
 * Ejecución de acciones aprobadas — Fase 4 de `docs/xarly/ads.md`.
 *
 * La regla que gobierna este servicio: **los guardarraíles se vuelven a
 * comprobar en el momento de ejecutar**, no solo al aprobar. Entre una cosa y
 * otra pueden pasar horas, y en ese tiempo alguien puede haber pulsado el
 * freno, los datos pueden haberse quedado obsoletos o puede haberse agotado
 * el cupo de cambios del día. Aprobar es una intención; ejecutar es un hecho.
 *
 * Nada se ejecuta con la política en N1 o en modo sombra. Subir a N2 es una
 * decisión explícita, versionada y auditada (`adPolicy.service.ts`).
 */

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'
const META_TIMEOUT_MS = 15_000

export class ActionBlockedError extends Error {
  readonly statusCode = 409
  readonly checks: Array<{ rule: string; passed: boolean; detail: string }>
  constructor(message: string, checks: Array<{ rule: string; passed: boolean; detail: string }>) {
    super(message)
    this.name = 'ActionBlockedError'
    this.checks = checks
  }
}

export class ActionNotExecutableError extends Error {
  readonly statusCode = 409
  constructor(message: string) {
    super(message)
    this.name = 'ActionNotExecutableError'
  }
}

type GuardrailCheck = { rule: string; passed: boolean; detail: string }

/**
 * Guardarraíles en el instante de ejecutar. Incluye los de aprobación más los
 * que solo tienen sentido ahora: que la política permita actuar y que el
 * objetivo remoto siga existiendo.
 */
/**
 * Reparto estable para el canario: el mismo objetivo cae siempre en el mismo
 * bucket, así que un canario del 10 % actúa sobre el mismo 10 % y no sobre uno
 * distinto en cada ejecución. Mismo patrón que voice/experiments.
 */
function stableBucket(value: string): number {
  return parseInt(createHash('sha256').update(value).digest('hex').slice(0, 4), 16) % 10_000
}

async function checkExecutionGuardrails(
  orgId: string,
  action: { id: string; campaignId: string | null; scope: string; target: string | null; ruleKey: string }
): Promise<GuardrailCheck[]> {
  const [policy, dataQuality, changesToday, lastChange, token] = await Promise.all([
    getPolicy(orgId),
    getDataQuality(orgId),
    prisma.adAction.count({
      where: { orgId, status: 'executed', executedAt: { gte: new Date(Date.now() - 86_400_000) } },
    }),
    prisma.adAction.findFirst({
      where: { orgId, campaignId: action.campaignId, status: 'executed', id: { not: action.id } },
      orderBy: { executedAt: 'desc' },
      select: { executedAt: true },
    }),
    getDecryptedToken(orgId),
  ])
  // La autonomía de la organización es el techo; la de la regla es el permiso
  // concreto. Sin esta comprobación, una regla que nunca demostró nada podría
  // ejecutarse solo porque la organización subió a N2 (Fase 5 de ads.md).
  const rule = await getRuleAutonomy(orgId, action.ruleKey)
  const canaryBucket = stableBucket(`canary:${action.ruleKey}:${action.campaignId ?? action.id}`)
  const withinCanary = rule.autonomyLevel !== 'N3' || canaryBucket < rule.canaryPercent * 100

  const minutesSinceLast = lastChange?.executedAt
    ? (Date.now() - lastChange.executedAt.getTime()) / 60_000
    : null

  return [
    {
      rule: 'autonomy_level',
      passed: policy.autonomyLevel !== 'N1',
      detail: policy.autonomyLevel === 'N1'
        ? 'La autonomía está en N1: Xarly solo sugiere. Súbela a N2 para poder ejecutar acciones aprobadas.'
        : `Autonomía en ${policy.autonomyLevel}.`,
    },
    {
      rule: 'policy_mode',
      passed: policy.mode === 'live',
      detail: policy.mode === 'live'
        ? 'La política está en modo activo.'
        : 'La política está en modo sombra: ninguna acción llega a Meta.',
    },
    {
      rule: 'kill_switch',
      passed: !policy.killSwitchEnabled,
      detail: policy.killSwitchEnabled
        ? `Autonomía parada: ${policy.killSwitchReason ?? 'sin motivo registrado'}.`
        : 'Sin parada de emergencia activa.',
    },
    {
      rule: 'data_quality',
      passed: !dataQuality.blocksAutomation,
      detail: dataQuality.blocksAutomation
        ? `Integridad de datos en "${dataQuality.status}": no se puede actuar sobre datos en los que no se confía.`
        : `Integridad de datos: ${dataQuality.status}.`,
    },
    {
      rule: 'max_changes_per_day',
      passed: changesToday < policy.maxChangesPerDay,
      detail: `${changesToday} acciones ejecutadas en 24 h; el límite es ${policy.maxChangesPerDay}.`,
    },
    {
      rule: 'cooldown',
      passed: minutesSinceLast == null || minutesSinceLast >= policy.minMinutesBetweenChanges,
      detail: minutesSinceLast == null
        ? 'Sin cambios previos sobre esta campaña.'
        : `Último cambio hace ${Math.round(minutesSinceLast)} min; el mínimo es ${policy.minMinutesBetweenChanges} min.`,
    },
    {
      rule: 'rule_autonomy',
      passed: rule.autonomyLevel !== 'N1',
      detail: rule.autonomyLevel === 'N1'
        ? `La regla "${action.ruleKey}" sigue en N1: todavía no ha demostrado que acierte lo suficiente como para ejecutarse.`
        : `La regla está en ${rule.autonomyLevel}.`,
    },
    {
      rule: 'canary_scope',
      passed: withinCanary,
      detail: withinCanary
        ? rule.autonomyLevel === 'N3'
          ? `Dentro del canario del ${rule.canaryPercent} % de la regla.`
          : 'El canario solo limita las reglas en N3.'
        : `Fuera del canario: la regla en N3 solo actúa sobre el ${rule.canaryPercent} % del alcance.`,
    },
    {
      rule: 'meta_credentials',
      passed: Boolean(token),
      detail: token
        ? 'Hay credenciales de Meta válidas.'
        : 'No hay token de Meta disponible: la acción no podría llegar a la plataforma.',
    },
    {
      rule: 'target_present',
      passed: Boolean(action.target),
      detail: action.target
        ? `Objetivo remoto: ${action.scope} ${action.target}.`
        : 'La acción no tiene objetivo remoto identificado.',
    },
  ]
}

async function graphPost(path: string, token: string, body: Record<string, unknown>) {
  const started = Date.now()
  const response = await fetchWithTimeout(
    `https://graph.facebook.com/${GRAPH_VERSION}${path}?access_token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    META_TIMEOUT_MS,
  )
  const text = (await response.text()).slice(0, 500)
  return { ok: response.ok, status: response.status, body: text, durationMs: Date.now() - started }
}

/**
 * Devuelve el estado local que corresponde a la acción, para que la ficha de
 * campaña no quede diciendo "activa" después de pausarla en Meta.
 */
function localStateFor(kind: string): Prisma.CampaignUpdateInput | null {
  if (kind === 'pause_ad_set') return { status: 'paused', adStatus: 'paused_by_approval' }
  if (kind === 'resume_ad_set') return { status: 'active', adStatus: 'active' }
  return null
}

/**
 * Ejecuta una acción aprobada. `dryRun` permite comprobar los guardarraíles
 * sin tocar nada — es lo que usa la interfaz para explicar por qué un botón
 * está bloqueado antes de que alguien lo pulse.
 */
export async function executeAction(
  orgId: string,
  actorUserId: string,
  actionId: string,
  options: { dryRun?: boolean } = {}
) {
  const action = await prisma.adAction.findFirst({
    where: { id: actionId, orgId },
    include: { decision: { select: { title: true, diagnosis: true, ruleKey: true } } },
  })
  if (!action) return null
  if (action.status !== 'pending_execution') {
    throw new ActionNotExecutableError(`La acción está en estado "${action.status}" y no se puede ejecutar.`)
  }

  const checks = await checkExecutionGuardrails(orgId, { ...action, ruleKey: action.decision.ruleKey })
  const blocked = checks.filter(check => !check.passed)

  if (options.dryRun) return { action, checks, executable: blocked.length === 0 }

  if (blocked.length) {
    // Un bloqueo no es un fallo de la acción: la acción sigue pendiente y se
    // podrá ejecutar cuando se resuelva el motivo. Queda registrado el intento.
    await prisma.adActionResult.create({
      data: {
        orgId,
        actionId: action.id,
        operation: 'execute',
        attempt: (await prisma.adActionResult.count({ where: { actionId: action.id, operation: 'execute' } })) + 1,
        outcome: 'guardrail_blocked',
        errorCode: blocked.map(check => check.rule).join(','),
        requestPayload: { blockedBy: blocked } as object,
      },
    })
    await prisma.adAction.update({ where: { id: action.id }, data: { guardrailChecks: checks as object } })
    throw new ActionBlockedError(
      `No se puede ejecutar: ${blocked.map(check => check.detail).join(' ')}`,
      checks,
    )
  }

  // Los guardarraíles ya han comprobado que existe; se relee para usarlo.
  const token = (await getDecryptedToken(orgId))!

  const attempt = (await prisma.adActionResult.count({ where: { actionId: action.id, operation: 'execute' } })) + 1
  await prisma.adAction.update({ where: { id: action.id }, data: { status: 'executing', guardrailChecks: checks as object } })

  const payload = (action.payload ?? {}) as Record<string, unknown>
  const response = await graphPost(`/${action.target}`, token, payload)

  // No basta con el 200 de Meta: se relee el estado remoto para comprobar que
  // el cambio existe de verdad. Un 200 y un estado sin cambiar es un fallo
  // silencioso, y son los peores.
  let remoteStateAfter: unknown = null
  if (response.ok && action.campaignId) {
    try {
      remoteStateAfter = await getRemoteStatus(orgId, action.campaignId)
    } catch (error) {
      remoteStateAfter = { error: (error as Error).message.slice(0, 200) }
    }
  }

  await prisma.adActionResult.create({
    data: {
      orgId,
      actionId: action.id,
      operation: 'execute',
      attempt,
      outcome: response.ok ? 'ok' : 'provider_error',
      requestPayload: payload as object,
      providerResponse: response.body,
      errorCode: response.ok ? null : `http_${response.status}`,
      httpStatus: response.status,
      remoteStateAfter: (remoteStateAfter ?? undefined) as object | undefined,
      durationMs: response.durationMs,
    },
  })

  const updated = await prisma.adAction.update({
    where: { id: action.id },
    data: {
      status: response.ok ? 'executed' : 'failed',
      executedAt: response.ok ? new Date() : null,
      providerResponse: response.body,
      errorCode: response.ok ? null : `http_${response.status}`,
    },
  })

  if (response.ok) {
    const localState = localStateFor(action.kind)
    if (localState && action.campaignId) {
      await prisma.campaign.update({ where: { id: action.campaignId }, data: localState })
    }
    await prisma.adDecision.update({ where: { id: action.decisionId }, data: { status: 'executed' } })
  }

  await writeAuditLog({
    orgId,
    actorUserId,
    action: response.ok ? 'ads.action.executed' : 'ads.action.failed',
    entityType: 'AdAction',
    entityId: action.id,
    before: action,
    after: updated,
  })

  return { action: updated, checks, executable: true, remoteStateAfter }
}

/**
 * Ejecuta la compensación disponible. No restaura el mundo: devuelve el estado
 * configurable a como estaba. Lo que se perdió mientras tanto —aprendizaje,
 * impresiones, leads— está declarado en `irreversibleEffects` y sigue perdido.
 */
export async function compensateAction(orgId: string, actorUserId: string, actionId: string) {
  const action = await prisma.adAction.findFirst({ where: { id: actionId, orgId } })
  if (!action) return null
  if (action.status !== 'executed') {
    throw new ActionNotExecutableError(`Solo se puede compensar una acción ejecutada; esta está en "${action.status}".`)
  }
  const compensation = action.compensationPayload as { kind?: string; payload?: Record<string, unknown> } | null
  if (!compensation?.payload) {
    throw new ActionNotExecutableError('Esta acción no tiene compensación disponible.')
  }

  const token = await getDecryptedToken(orgId)
  if (!token) throw new ActionNotExecutableError('No hay token de Meta disponible para compensar.')

  const attempt = (await prisma.adActionResult.count({ where: { actionId: action.id, operation: 'compensate' } })) + 1
  const response = await graphPost(`/${action.target}`, token, compensation.payload)

  await prisma.adActionResult.create({
    data: {
      orgId,
      actionId: action.id,
      operation: 'compensate',
      attempt,
      outcome: response.ok ? 'ok' : 'provider_error',
      requestPayload: compensation.payload as object,
      providerResponse: response.body,
      errorCode: response.ok ? null : `http_${response.status}`,
      httpStatus: response.status,
      durationMs: response.durationMs,
    },
  })

  const updated = await prisma.adAction.update({
    where: { id: action.id },
    data: { status: response.ok ? 'compensated' : 'executed', errorCode: response.ok ? null : `http_${response.status}` },
  })

  if (response.ok && compensation.kind) {
    const localState = localStateFor(compensation.kind)
    if (localState && action.campaignId) {
      await prisma.campaign.update({ where: { id: action.campaignId }, data: localState })
    }
  }

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'ads.action.compensated',
    entityType: 'AdAction',
    entityId: action.id,
    before: action,
    after: updated,
  })

  return { action: updated, irreversibleEffects: action.irreversibleEffects }
}

/** Acciones pendientes con el motivo por el que se pueden ejecutar o no. */
export async function listPendingActions(orgId: string) {
  const actions = await prisma.adAction.findMany({
    where: { orgId, status: { in: ['pending_execution', 'failed'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      decision: { select: { title: true, diagnosis: true, confidence: true, explanation: true, ruleKey: true } },
      campaign: { select: { name: true } },
    },
  })

  return Promise.all(
    actions.map(async action => {
      const checks = await checkExecutionGuardrails(orgId, { ...action, ruleKey: action.decision.ruleKey })
      const blocked = checks.filter(check => !check.passed)
      return {
        ...action,
        checks,
        executable: blocked.length === 0,
        blockedReason: blocked.length ? blocked.map(check => check.detail).join(' ') : null,
      }
    })
  )
}
