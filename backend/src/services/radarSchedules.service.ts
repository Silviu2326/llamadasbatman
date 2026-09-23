import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { assertCapability, hasPermission } from '../access-control'
import { getBusinessIntelligenceContext, BUSINESS_INTELLIGENCE_MICROAPP_ID } from './businessIntelligence.service'
import { radarSearchSchema, type RadarSearch } from './opportunityRadar'
import { hasRadarKnowledge } from './radarKnowledge.schema'

export const RADAR_SCHEDULE_RULE = 'opportunity-radar.schedule'
export const scheduleSchema = z.object({
  radar: radarSearchSchema,
  intervalHours: z.union([z.literal(24), z.literal(168)]),
  startsAt: z.string().datetime({ offset: true }),
  requestId: z.string().uuid(),
  allowExternalReview: z.literal(true),
}).strict()
const payloadSchema = z.object({
  radar: radarSearchSchema, intervalHours: z.union([z.literal(24), z.literal(168)]),
  createdById: z.string().min(1), allowExternalReview: z.literal(true),
  slotAt: z.string().optional(), lastJobId: z.string().optional(), lastError: z.string().optional(), lastRunAt: z.string().optional(),
})
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode })

export function nextRadarRun(slot: Date, intervalHours: number, now = new Date()) {
  const interval = intervalHours * 3600_000
  const elapsed = Math.max(1, Math.floor((now.getTime() - slot.getTime()) / interval) + 1)
  return new Date(slot.getTime() + elapsed * interval)
}

export async function startRadarSearch(orgId: string, userId: string, radar: RadarSearch, idempotencyKey: string) {
  const member = await prisma.organizationMembership.findUnique({ where: { orgId_userId: { orgId, userId } }, select: { role: true, status: true } })
  if (!member || member.status !== 'active' || !hasPermission(member.role, 'organization.read', 'org') || !hasPermission(member.role, 'costs.request', 'org')) throw fail('La persona que creó el radar ya no tiene permiso para ejecutarlo.', 403)
  await assertCapability(orgId, 'revenue_intelligence')
  await assertCapability(orgId, 'microapps')
  const context = await getBusinessIntelligenceContext(orgId)
  if (!context || (!context.intelligenceReadiness.canResearch && !hasRadarKnowledge(radar.companyKnowledge))) throw fail('Completa la descripción, los servicios o los documentos de la empresa antes de buscar.')
  if (!context.radarSearchAvailable) throw fail('La búsqueda web del radar todavía no está conectada.', 503)
  const lensKey = radar.kind === 'suppliers' ? 'costs_suppliers' : ['influencers', 'partners'].includes(radar.kind) ? 'partnerships' : 'demand_growth'
  const lens = context.lenses.find(item => item.key === lensKey)!
  const { startMicroappRun } = await import('../microapps/runtime')
  return startMicroappRun({
    orgId, createdById: userId, microappId: BUSINESS_INTELLIGENCE_MICROAPP_ID, idempotencyKey,
    input: {
      company: { name: context.company.name, website: context.company.website, industry: context.company.industry, address: context.company.address, currency: context.company.currency },
      businessDescription: context.profile.description.trim() || `${context.company.name} opera en ${context.company.industry || context.vertical.label}.`,
      idealCustomer: context.profile.idealCustomer, valueProposition: context.profile.valueProposition,
      differentiators: context.profile.differentiators,
      offers: context.profile.offers.filter(offer => offer.active && offer.name.trim()).map(({ name, description }) => ({ name, description })),
      vertical: context.vertical.label, lens: lensKey, lensTitle: lens.title, queryAngles: lens.queryAngles,
      focus: `${radar.target} · ${radar.location}`, radar,
      businessMaterial: await (await import('./radarKnowledge.service')).resolveRadarKnowledge(orgId, radar.companyKnowledge),
    },
  })
}

function publicSchedule(row: { id: string; dueAt: Date; status: string; payload: unknown }) {
  const payload = payloadSchema.parse(row.payload)
  return { id: row.id, status: row.status.replace('radar_', ''), nextRunAt: row.dueAt, radar: payload.radar, intervalHours: payload.intervalHours, lastJobId: payload.lastJobId, lastError: payload.lastError, lastRunAt: payload.lastRunAt }
}
export async function listRadarSchedules(orgId: string) {
  const rows = await prisma.scheduledTrigger.findMany({ where: { orgId, ruleKey: RADAR_SCHEDULE_RULE }, orderBy: { createdAt: 'desc' }, take: 50 })
  return rows.map(publicSchedule)
}
export async function createRadarSchedule(orgId: string, userId: string, input: z.infer<typeof scheduleSchema>) {
  const startsAt = new Date(input.startsAt)
  if (startsAt.getTime() <= Date.now()) throw fail('La primera ejecución debe estar en el futuro.', 400)
  const context = await getBusinessIntelligenceContext(orgId)
  if (!context || (!context.intelligenceReadiness.canResearch && !hasRadarKnowledge(input.radar.companyKnowledge))) throw fail('Completa el perfil de empresa antes de programar.')
  if (!context.radarSearchAvailable) throw fail('Conecta la búsqueda web antes de activar una programación.', 503)
  await (await import('./radarKnowledge.service')).resolveRadarKnowledge(orgId, input.radar.companyKnowledge)
  const dedupeKey = `${RADAR_SCHEDULE_RULE}:${orgId}:${input.requestId}`
  const row = await prisma.scheduledTrigger.upsert({
    where: { dedupeKey }, update: {},
    create: { orgId, ruleKey: RADAR_SCHEDULE_RULE, entityType: 'opportunity_radar', entityId: randomUUID(), dedupeKey, dueAt: startsAt, status: 'radar_pending', payload: { radar: input.radar, intervalHours: input.intervalHours, createdById: userId, allowExternalReview: true } },
  })
  return publicSchedule(row)
}
export async function setRadarScheduleActive(orgId: string, id: string, active: boolean) {
  const row = await prisma.scheduledTrigger.findFirst({ where: { id, orgId, ruleKey: RADAR_SCHEDULE_RULE } })
  if (!row) throw fail('Programación no encontrada.', 404)
  if (row.status === 'radar_running' && active) throw fail('La búsqueda todavía está en curso.')
  const payload = payloadSchema.parse(row.payload)
  const { slotAt, lastError, lastJobId, ...rest } = payload
  if (active) {
    await assertCapability(orgId, 'revenue_intelligence')
    await assertCapability(orgId, 'microapps')
    const context = await getBusinessIntelligenceContext(orgId)
    if (!context?.radarSearchAvailable) throw fail('Conecta la búsqueda web antes de reanudar.', 503)
  }
  const dueAt = active && row.dueAt <= new Date() ? nextRadarRun(row.dueAt, payload.intervalHours) : row.dueAt
  const updated = await prisma.scheduledTrigger.updateMany({ where: { id, orgId, ruleKey: RADAR_SCHEDULE_RULE, status: row.status, dueAt: row.dueAt }, data: { status: active ? 'radar_pending' : 'radar_paused', dueAt, payload: { ...rest, ...(!active && lastJobId ? { lastJobId } : {}) } } })
  if (!updated.count) throw fail('La programación ha cambiado. Actualiza antes de intentarlo de nuevo.')
  return { id, status: active ? 'pending' : 'paused', nextRunAt: dueAt }
}

/** Uses the existing indexed durable trigger store. Radar statuses are separate from CRM events. */
export async function dispatchRadarSchedules(now = new Date(), startSearch: typeof startRadarSearch = startRadarSearch) {
  const rows = await prisma.scheduledTrigger.findMany({ where: { ruleKey: RADAR_SCHEDULE_RULE, status: { in: ['radar_pending', 'radar_running'] }, dueAt: { lte: now } }, orderBy: { dueAt: 'asc' }, take: 10 })
  for (const row of rows) {
    const parsed = payloadSchema.safeParse(row.payload)
    if (!parsed.success) {
      await prisma.scheduledTrigger.updateMany({ where: { id: row.id, orgId: row.orgId, status: row.status, dueAt: row.dueAt }, data: { status: 'radar_error' } })
      continue
    }
    const payload = parsed.data
    const slotAt = payload.slotAt || row.dueAt.toISOString()
    const lease = new Date(now.getTime() + 10 * 60_000)
    const claim = await prisma.scheduledTrigger.updateMany({ where: { id: row.id, orgId: row.orgId, status: row.status, dueAt: row.dueAt }, data: { status: 'radar_running', dueAt: lease, payload: { ...payload, slotAt } } })
    if (!claim.count) continue
    const claimed = { id: row.id, orgId: row.orgId, status: 'radar_running', dueAt: lease }
    try {
      if (payload.lastJobId) {
        const previous = await prisma.job.findFirst({ where: { id: payload.lastJobId, orgId: row.orgId }, select: { status: true } })
        if (previous?.status === 'failed') throw fail('La última búsqueda falló. Revisa el trabajo y reanuda la programación cuando esté resuelto.')
        if (previous && !['succeeded', 'failed', 'canceled'].includes(previous.status)) throw fail('La búsqueda anterior sigue pendiente. Revisa el trabajo antes de reanudar la programación.')
      }
      const result = await startSearch(row.orgId, payload.createdById, payload.radar, `radar-schedule:${row.id}:${slotAt}`)
      const { slotAt: _slot, lastError: _error, ...config } = payload
      await prisma.scheduledTrigger.updateMany({ where: claimed, data: { status: 'radar_pending', dueAt: nextRadarRun(new Date(slotAt), payload.intervalHours), payload: { ...config, lastJobId: result.jobId, lastRunAt: now.toISOString() } } })
    } catch (error) {
      // Provider, permission or balance failures pause the recurrence; no endless paid retry loop.
      await prisma.scheduledTrigger.updateMany({ where: claimed, data: { status: 'radar_error', payload: { ...payload, slotAt, lastError: (error as Error).message.slice(0, 500) } } })
    }
  }
}
