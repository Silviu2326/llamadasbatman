import { prisma } from '../lib/prisma'
import { OpportunityStage } from '@prisma/client'
import { writeAuditLog } from '../lib/audit'
import { logSalesActivity } from '../lib/salesActivity'

/** Errores de dominio para que el controller pueda mapear a códigos HTTP. */
export class OwnershipError extends Error {
  constructor(public field: string) {
    super(`${field} no pertenece a la organización`)
    this.name = 'OwnershipError'
  }
}

/** 404 (P0-02): la fila no existe o no pertenece a la organización. */
export class OpportunityNotFoundError extends Error {
  constructor() {
    super('Opportunity not found')
    this.name = 'OpportunityNotFoundError'
  }
}

/**
 * Valida que las referencias recibidas del cliente (lead, usuario asignado)
 * pertenezcan a la organización antes de dejarlas tocar la base (P0-01/VE-01).
 */
async function assertOwnedReferences(orgId: string, refs: {
  leadId?: string
  assignedTo?: string
}) {
  const checks: Promise<void>[] = []

  if (refs.leadId !== undefined) {
    checks.push(
      prisma.lead.findFirst({ where: { id: refs.leadId, orgId }, select: { id: true } }).then((lead) => {
        if (!lead) throw new OwnershipError('leadId')
      })
    )
  }
  if (refs.assignedTo) {
    checks.push(
      prisma.user.findFirst({ where: { id: refs.assignedTo, orgId }, select: { id: true } }).then((user) => {
        if (!user) throw new OwnershipError('assignedTo')
      })
    )
  }

  await Promise.all(checks)
}

export async function getOpportunity(orgId: string, id: string) {
  return prisma.opportunity.findFirst({
    where: { id, orgId },
    include: { lead: true },
  })
}

export async function listByStage(orgId: string) {
  const opportunities = await prisma.opportunity.findMany({
    where: { orgId },
    include: { lead: true, assignee: true },
    orderBy: { createdAt: 'desc' },
  })

  const stages: OpportunityStage[] = [
    'lead',
    'qualified',
    'proposal',
    'negotiation',
    'closed_won',
    'closed_lost',
  ]

  const grouped: Record<string, typeof opportunities> = {}
  for (const stage of stages) {
    grouped[stage] = []
  }
  for (const opp of opportunities) {
    grouped[opp.stage].push(opp)
  }

  return grouped
}

export async function createOpportunity(orgId: string, actorUserId: string | null | undefined, data: {
  leadId: string
  assignedTo?: string
  name: string
  stage?: OpportunityStage
  value?: number
  currency?: string
  probability?: number
  expectedCloseDate?: string
  notes?: string
}) {
  await assertOwnedReferences(orgId, { leadId: data.leadId, assignedTo: data.assignedTo })

  const opportunity = await prisma.opportunity.create({
    data: {
      orgId,
      leadId: data.leadId,
      assignedTo: data.assignedTo,
      name: data.name,
      stage: data.stage ?? 'lead',
      value: data.value,
      currency: data.currency ?? 'EUR',
      probability: data.probability ?? 0,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
      notes: data.notes,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.create',
    entityType: 'Opportunity',
    entityId: opportunity.id,
    after: opportunity,
  })

  await logSalesActivity({
    orgId,
    type: 'opportunity_created',
    opportunityId: opportunity.id,
    leadId: data.leadId,
    actorUserId,
    metadata: { stage: opportunity.stage },
  })

  return opportunity
}

const DAYS_ES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
const COLORS   = ['#7c3aed','#2563eb','#059669']

export async function getPipelineInsights(orgId: string) {
  const [negOpps, meetings, won, lost] = await Promise.all([
    prisma.opportunity.findMany({ where: { orgId, stage: 'negotiation' }, select: { probability: true } }),
    prisma.meeting.findMany({ where: { orgId }, select: { scheduledAt: true } }),
    prisma.opportunity.count({ where: { orgId, stage: 'closed_won' } }),
    prisma.opportunity.count({ where: { orgId, stage: 'closed_lost' } }),
  ])

  const avgNegProb = negOpps.length > 0
    ? Math.round(negOpps.reduce((s, o) => s + o.probability, 0) / negOpps.length) : 0

  const dayCounts = Array(7).fill(0)
  meetings.forEach(m => dayCounts[m.scheduledAt.getDay()]++)
  const bestDayIdx = dayCounts.indexOf(Math.max(...dayCounts))
  const bestDay = meetings.length > 0 ? DAYS_ES[bestDayIdx] : 'martes'

  const convRate = (won + lost) > 0 ? Math.round(won / (won + lost) * 100) : null

  return [
    { color: COLORS[0], text: negOpps.length > 0
        ? `Las oportunidades en negociación tienen un ${avgNegProb}% de probabilidad de cierre.`
        : 'No hay oportunidades en negociación actualmente.' },
    { color: COLORS[1], text: `El mejor día para agendar reuniones es los ${bestDay}.` },
    { color: COLORS[2], text: convRate !== null
        ? `La tasa de conversión actual es del ${convRate}%.`
        : 'Aún no hay oportunidades cerradas para calcular la conversión.' },
  ]
}

export async function getPipelinePrediction(orgId: string) {
  const opps = await prisma.opportunity.findMany({
    where: { orgId, stage: { notIn: ['closed_won', 'closed_lost'] } },
    select: { value: true, probability: true, expectedCloseDate: true },
  })

  const now = new Date()
  const weeks = Array.from({ length: 5 }, (_, w) => {
    const start = new Date(now); start.setDate(now.getDate() + w * 7)
    const end   = new Date(start); end.setDate(start.getDate() + 7)
    const label = start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    const value = opps
      .filter(o => o.expectedCloseDate && o.expectedCloseDate >= start && o.expectedCloseDate < end)
      .reduce((s, o) => s + (Number(o.value) || 0) * (o.probability / 100), 0)
    return { date: label, value: Math.round(value / 1000) }
  })

  const total = Math.round(opps.reduce((s, o) => s + (Number(o.value) || 0) * (o.probability / 100), 0))
  return { total, weeks }
}

export async function getPipelineActions(orgId: string) {
  const sevenAgo = new Date(Date.now() - 7 * 86400_000)
  const threeAgo = new Date(Date.now() - 3 * 86400_000)

  const [staleCount, staleAgg, staleProposals, goodCalls] = await Promise.all([
    prisma.opportunity.count({ where: { orgId, stage: { in: ['lead', 'qualified'] }, createdAt: { lt: sevenAgo } } }),
    prisma.opportunity.aggregate({ where: { orgId, stage: { in: ['lead', 'qualified'] }, createdAt: { lt: sevenAgo } }, _sum: { value: true } }),
    prisma.opportunity.count({ where: { orgId, stage: 'proposal', createdAt: { lt: threeAgo } } }),
    prisma.call.findMany({ where: { orgId, outcome: { in: ['meeting_scheduled', 'interested'] }, startedAt: { not: null } }, select: { startedAt: true }, take: 100, orderBy: { createdAt: 'desc' } }),
  ])

  const hourCounts: Record<number, number> = {}
  goodCalls.forEach(c => { const h = c.startedAt!.getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1 })
  const bestHour = Object.keys(hourCounts).length > 0
    ? parseInt(Object.keys(hourCounts).reduce((a, b) => hourCounts[+a] > hourCounts[+b] ? a : b))
    : 10

  const staleValue = Math.round(Number(staleAgg._sum.value ?? 0))

  return [
    { type:'followup',  title:`${staleCount} oportunidades necesitan seguimiento`,    desc:`Podrías perder €${staleValue.toLocaleString('es-ES')}`,       cta:'Ver oportunidades', url:'/pipeline' },
    { type:'proposal',  title:`${staleProposals} propuestas sin respuesta > 3 días`,  desc:'Enviar recordatorio puede aumentar 32%',                        cta:'Ver propuestas',    url:'/pipeline' },
    { type:'timing',    title:'Mejor momento para contactar',                          desc:`Hoy ${bestHour}:00 - ${bestHour + 2}:00`,                       cta:'Ver calendario',    url:'/reuniones' },
  ]
}

export async function updateOpportunity(orgId: string, actorUserId: string | null | undefined, id: string, data: {
  name?: string
  stage?: OpportunityStage
  value?: number
  currency?: string
  probability?: number
  expectedCloseDate?: string
  notes?: string
  assignedTo?: string
}) {
  await assertOwnedReferences(orgId, { assignedTo: data.assignedTo })

  const before = await prisma.opportunity.findFirst({ where: { id, orgId } })
  if (!before) throw new OpportunityNotFoundError()

  const result = await prisma.opportunity.updateMany({
    where: { id, orgId },
    data: {
      ...data,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
    },
  })

  if (result.count === 0) throw new OpportunityNotFoundError()

  const after = await prisma.opportunity.findFirst({ where: { id, orgId } })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'opportunity.update',
    entityType: 'Opportunity',
    entityId: id,
    before,
    after: after ?? undefined,
  })

  if (data.stage && after && data.stage !== before.stage) {
    await logSalesActivity({
      orgId,
      type: 'stage_change',
      opportunityId: id,
      leadId: before.leadId,
      actorUserId,
      metadata: { from: before.stage, to: after.stage },
    })
  }

  return after
}
