import { prisma } from '../lib/prisma'
import { EntitlementError, planPolicy, type PlanKey } from './entitlements'

/**
 * Cuotas de consumo, distintas de los límites de entidades de `entitlements.ts`.
 * Un plan limita cuántos agentes creas; esto limita cuánto gastan esos agentes,
 * que es lo que llega como factura de Cartesia, Cerebras, MiniMax y Twilio.
 *
 * ponytail: el consumo se cuenta de las tablas que ya existen (Call,
 * EmailDelivery) en vez de con contadores propios. Sin migración y sin riesgo
 * de descuadre entre el contador y la realidad; el coste es una consulta
 * agregada por comprobación, no por request.
 */
export const CONSUMPTION_RESOURCES = ['call_minutes', 'emails_sent'] as const
export type ConsumptionResource = (typeof CONSUMPTION_RESOURCES)[number]

export const CONSUMPTION_LIMITS: Readonly<Record<PlanKey, Readonly<Record<ConsumptionResource, number>>>> = Object.freeze({
  free: Object.freeze({ call_minutes: 60, emails_sent: 500 }),
  pro: Object.freeze({ call_minutes: 2_000, emails_sent: 20_000 }),
  completo: Object.freeze({ call_minutes: 10_000, emails_sent: 100_000 }),
  agency: Object.freeze({ call_minutes: 50_000, emails_sent: 500_000 }),
})

/** Avisa en el log cuando queda poco margen, para verlo antes del corte. */
const WARN_RATIO = 0.8

export function periodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

async function organizationPlan(orgId: string): Promise<PlanKey> {
  const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } })
  return planPolicy(organization?.plan).key
}

export async function consumptionUsage(orgId: string, resource: ConsumptionResource, now = new Date()): Promise<number> {
  const since = periodStart(now)
  if (resource === 'call_minutes') {
    const result = await prisma.call.aggregate({
      _sum: { durationSeconds: true },
      where: { orgId, startedAt: { gte: since } },
    })
    return Math.ceil((result._sum.durationSeconds ?? 0) / 60)
  }
  return prisma.emailDelivery.count({
    where: { orgId, queuedAt: { gte: since }, status: { notIn: ['failed', 'unsubscribed'] } },
  })
}

export async function consumptionSnapshot(orgId: string, now = new Date()) {
  const plan = await organizationPlan(orgId)
  const limits = CONSUMPTION_LIMITS[plan]
  const [callMinutes, emailsSent] = await Promise.all([
    consumptionUsage(orgId, 'call_minutes', now),
    consumptionUsage(orgId, 'emails_sent', now),
  ])
  return {
    plan,
    periodStart: periodStart(now).toISOString(),
    usage: { call_minutes: callMinutes, emails_sent: emailsSent },
    limits,
  }
}

/**
 * Lanza `EntitlementError` si la operación pasaría del techo del plan. El
 * llamante decide si eso es un 409 al usuario o simplemente no arrancar la
 * llamada; lo que no puede es seguir gastando en silencio.
 */
export async function assertConsumptionLimit(
  orgId: string,
  resource: ConsumptionResource,
  increment = 1,
  now = new Date(),
): Promise<void> {
  const plan = await organizationPlan(orgId)
  const limit = CONSUMPTION_LIMITS[plan][resource]
  const usage = await consumptionUsage(orgId, resource, now)

  if (usage + increment > limit) {
    throw new EntitlementError(
      `Has agotado tu cuota mensual de ${resource === 'call_minutes' ? 'minutos de llamada' : 'envíos de email'} del plan ${plan}`,
      409,
      'CONSUMPTION_LIMIT_REACHED',
      { resource, usage, requested: increment, limit, plan, upgradeRequired: true },
    )
  }
  if (usage + increment > limit * WARN_RATIO) {
    console.warn('[CONSUMPTION] org=%s %s al %d%% de la cuota (%d/%d)', orgId, resource, Math.round(((usage + increment) / limit) * 100), usage + increment, limit)
  }
}
