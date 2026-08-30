import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireEntitlement, requirePermission } from '../access-control'
import { growthPlan } from '../services/growthPredictor.service'
import { consultantBoard } from '../services/salesConsultant.service'
import { prisma } from '../lib/prisma'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

function budgets(raw: unknown): number[] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const values = raw.split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isFinite(value) && value > 0 && value <= 1_000_000)
  return values.length ? values : undefined
}

/** Importe suelto de la query. Fuera de rango se ignora en vez de recortarse en silencio. */
function amount(raw: unknown): number | undefined {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 && value <= 10_000_000 ? value : undefined
}

export async function growthPlanRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  /**
   * Qué hacer, en qué invertir y cuánto puedes conseguir. Lee del CRM de la
   * organización, así que va con el mismo permiso que el resto de analítica.
   */
  app.get<{ Querystring: { budgets?: string; windowDays?: string } }>(
    '/',
    { preHandler: [requirePermission('calls.read', { scope: 'org' }), requireEntitlement('crm')] },
    async request => {
      const { orgId } = request.user as JWTUser
      const windowDays = Math.min(365, Math.max(7, Number(request.query.windowDays) || 90))
      const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } })
      return growthPlan(orgId, {
        budgets: budgets(request.query.budgets),
        windowDays,
        plan: organization?.plan ?? 'free',
      })
    },
  )

  /**
   * El informe completo del consultor: canales, llamadas, pipeline, riesgos y
   * plan de acción. Va con el mismo permiso que el resto de analítica porque
   * lee exactamente lo mismo, solo que todo a la vez.
   */
  app.get<{ Querystring: { budgets?: string; windowDays?: string; budget?: string; goal?: string } }>(
    '/board',
    { preHandler: [requirePermission('calls.read', { scope: 'org' }), requireEntitlement('crm')] },
    async request => {
      const { orgId } = request.user as JWTUser
      const windowDays = Math.min(365, Math.max(7, Number(request.query.windowDays) || 90))
      const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } })
      return consultantBoard(orgId, {
        budgets: budgets(request.query.budgets),
        windowDays,
        budget: amount(request.query.budget) ?? 500,
        goal: amount(request.query.goal),
        plan: organization?.plan ?? 'free',
      })
    },
  )
}
