import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { analysisWindow, buildAnalysis } from './businessAnalysis.metrics'

export async function getBusinessAnalysis(orgId: string, days: number) {
  const window = analysisWindow(days)
  const dateRange = { gte: window.previousStart, lt: window.end }
  const [calls, meetings, opportunities, missingCloseDates] = await Promise.all([
    prisma.call.findMany({ where: { orgId, createdAt: dateRange }, select: {
      id: true, createdAt: true, status: true, outcome: true, sentiment: true, campaignId: true, agentId: true,
      meetings: { where: { orgId, status: { not: 'cancelled' }, createdAt: { lt: window.end } }, select: { id: true } },
    } }),
    prisma.meeting.findMany({ where: { orgId, createdAt: dateRange, status: { not: 'cancelled' } }, select: { createdAt: true } }),
    prisma.opportunity.findMany({ where: { orgId, OR: [{ createdAt: dateRange }, { actualCloseDate: dateRange }] }, select: { createdAt: true, actualCloseDate: true, stage: true, value: true, currency: true, lossReason: true } }),
    prisma.opportunity.count({ where: { orgId, stage: { in: ['closed_won', 'closed_lost'] }, actualCloseDate: null } }),
  ])
  const result = buildAnalysis({ calls, meetings, opportunities: opportunities.map(row => ({ ...row, value: row.value == null ? null : Number(row.value) })) }, window)
  const [campaigns, agents] = await Promise.all([
    prisma.campaign.findMany({ where: { orgId, id: { in: result.campaigns.flatMap(row => row.id ? [row.id] : []) } }, select: { id: true, name: true } }),
    prisma.agent.findMany({ where: { orgId, id: { in: result.agents.flatMap(row => row.id ? [row.id] : []) } }, select: { id: true, name: true } }),
  ])
  const campaignNames = new Map(campaigns.map(row => [row.id, row.name]))
  const agentNames = new Map(agents.map(row => [row.id, row.name]))
  return { ...result, warnings: { ...result.warnings, missingCloseDates },
    campaigns: result.campaigns.map(row => ({ ...row, name: row.id ? campaignNames.get(row.id) ?? 'Campaña no disponible' : 'Sin campaña' })),
    agents: result.agents.map(row => ({ ...row, name: row.id ? agentNames.get(row.id) ?? 'Agente no disponible' : 'Sin agente' })),
  }
}

export type RecordQuery = { start: string; end: string; kind: 'calls' | 'meetings' | 'won' | 'closed' | 'lost' | 'opportunities'; page: number; campaignId?: string; agentId?: string; withMeeting?: boolean; outcome?: string }
export async function getAnalysisRecords(orgId: string, query: RecordQuery) {
  const range = { gte: new Date(query.start), lt: new Date(query.end) }
  const skip = (query.page - 1) * 25
  if (query.kind === 'calls') {
    const where: Prisma.CallWhereInput = { orgId, createdAt: range,
      ...(query.campaignId !== undefined ? { campaignId: query.campaignId === 'unassigned' ? null : query.campaignId } : {}),
      ...(query.agentId !== undefined ? { agentId: query.agentId === 'unassigned' ? null : query.agentId } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.withMeeting ? { meetings: { some: { orgId, status: { not: 'cancelled' }, createdAt: { lt: range.lt } } } } : {}),
    }
    const [total, rows] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.findMany({ where, skip, take: 25, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, createdAt: true, outcome: true, lead: { select: { name: true } } } }),
    ])
    return { total, page: query.page, rows: rows.map(row => ({ id: row.id, title: `Llamada con ${row.lead.name}`, date: row.createdAt, detail: row.outcome, href: `/llamadas/${row.id}` })) }
  }
  if (query.kind === 'meetings') {
    const where: Prisma.MeetingWhereInput = { orgId, createdAt: range, status: { not: 'cancelled' } }
    const [total, rows] = await Promise.all([
      prisma.meeting.count({ where }),
      prisma.meeting.findMany({ where, skip, take: 25, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, title: true, createdAt: true, status: true } }),
    ])
    return { total, page: query.page, rows: rows.map(row => ({ id: row.id, title: row.title, date: row.createdAt, detail: row.status, href: `/reuniones/${row.id}` })) }
  }
  const where: Prisma.OpportunityWhereInput = { orgId, ...(query.kind === 'opportunities' ? { createdAt: range } : {
    actualCloseDate: range,
    stage: query.kind === 'won' ? 'closed_won' : query.kind === 'lost' ? 'closed_lost' : { in: ['closed_won', 'closed_lost'] },
  }) }
  const [total, rows] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({ where, skip, take: 25, orderBy: query.kind === 'opportunities' ? [{ createdAt: 'desc' }, { id: 'asc' }] : [{ actualCloseDate: 'desc' }, { id: 'asc' }], select: { id: true, name: true, createdAt: true, actualCloseDate: true, stage: true, value: true, currency: true, lossReason: true } }),
  ])
  return { total, page: query.page, rows: rows.map(row => ({ id: row.id, title: row.name, date: query.kind === 'opportunities' ? row.createdAt : row.actualCloseDate, detail: row.lossReason || row.stage, value: row.value == null ? null : Number(row.value), currency: row.currency, href: `/pipeline/${row.id}` })) }
}
