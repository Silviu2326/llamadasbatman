import { prisma } from '../lib/prisma'

const pct = (curr: number, prev: number) =>
  prev > 0 ? Math.round((curr - prev) / prev * 1000) / 10 : curr > 0 ? 100 : 0

export async function getStats(orgId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const [
    totalCalls, totalLeads, meetingsScheduled, activeCampaigns,
    conversionAgg, pipelineAgg, leadsByStatus,
    recentCalls, recentMeetings, agentCallGroups,
    callsPrev, leadsThisWeek, leadsPrev,
    meetingsThisWeek, meetingsPrev,
    pipelineThisWeek, pipelinePrev, closedWonAgg,
    callsByCampGroups, recentOpps, sentimentGroups,
    recentContactedLeads, recentConvertedLeads,
  ] = await Promise.all([
    prisma.call.count({ where: { orgId } }),
    prisma.lead.count({ where: { orgId } }),
    prisma.meeting.count({ where: { orgId, status: 'scheduled' } }),
    prisma.campaign.count({ where: { orgId, status: 'active' } }),
    prisma.campaign.aggregate({ where: { orgId }, _sum: { totalLeads: true, meetingsScheduled: true } }),
    prisma.opportunity.aggregate({ where: { orgId }, _sum: { value: true } }),
    prisma.lead.groupBy({ by: ['status'], where: { orgId }, _count: { id: true } }),
    prisma.call.findMany({ where: { orgId, createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true } }),
    prisma.meeting.findMany({ where: { orgId, createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true } }),
    prisma.call.groupBy({
      by: ['agentId'],
      where: { orgId, agentId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
    // week-over-week prev window
    prisma.call.count({ where: { orgId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    prisma.lead.count({ where: { orgId, createdAt: { gte: sevenDaysAgo } } }),
    prisma.lead.count({ where: { orgId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    prisma.meeting.count({ where: { orgId, createdAt: { gte: sevenDaysAgo } } }),
    prisma.meeting.count({ where: { orgId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    prisma.opportunity.aggregate({ where: { orgId, createdAt: { gte: sevenDaysAgo } }, _sum: { value: true } }),
    prisma.opportunity.aggregate({ where: { orgId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } }, _sum: { value: true } }),
    prisma.opportunity.aggregate({ where: { orgId, stage: 'closed_won' }, _sum: { value: true } }),
    prisma.call.groupBy({
      by: ['campaignId'],
      where: { orgId, campaignId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
    prisma.opportunity.findMany({
      where: { orgId, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, value: true },
    }),
    prisma.call.groupBy({
      by: ['sentiment'],
      where: { orgId, sentiment: { not: null } },
      _count: { id: true },
    }),
    prisma.lead.findMany({
      where: { orgId, status: 'contacted', createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.lead.findMany({
      where: { orgId, status: 'converted', createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    }),
  ])

  const totalLeadsSum = conversionAgg._sum.totalLeads ?? 0
  const meetingsSum = conversionAgg._sum.meetingsScheduled ?? 0
  const conversionRate = totalLeadsSum > 0 ? Math.round((meetingsSum / totalLeadsSum) * 100) : 0
  const pipelineValue = pipelineAgg._sum.value ? Number(pipelineAgg._sum.value) : 0
  const closedWonValue = closedWonAgg._sum.value ? Number(closedWonAgg._sum.value) : 0
  const pipelineThisWeekVal = pipelineThisWeek._sum.value ? Number(pipelineThisWeek._sum.value) : 0
  const pipelinePrevVal = pipelinePrev._sum.value ? Number(pipelinePrev._sum.value) : 0
  const callsThisWeek = recentCalls.length

  const kpiPcts = {
    calls: pct(callsThisWeek, callsPrev),
    leads: pct(leadsThisWeek, leadsPrev),
    meetings: pct(meetingsThisWeek, meetingsPrev),
    pipeline: pct(pipelineThisWeekVal, pipelinePrevVal),
  }

  // Last 7 days time series
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    days.push(d.toISOString().slice(0, 10))
  }
  const timeSeries = days.map(day => {
    const dayStr = day
    const llamadas = recentCalls.filter(c => c.createdAt.toISOString().slice(0, 10) === dayStr).length
    const reuniones = recentMeetings.filter(m => m.createdAt.toISOString().slice(0, 10) === dayStr).length
    const contactados = recentContactedLeads.filter(l => l.createdAt.toISOString().slice(0, 10) === dayStr).length
    const convertidos = recentConvertedLeads.filter(l => l.createdAt.toISOString().slice(0, 10) === dayStr).length
    return {
      date: day.slice(5).replace('-', '/'),
      llamadas,
      reuniones,
      contactados,
      conversion: contactados > 0 ? Math.round((convertidos / contactados) * 100) : 0,
    }
  })

  // Lead funnel by status
  const sm: Record<string, number> = {}
  leadsByStatus.forEach(r => { sm[r.status] = r._count.id })
  const funnel = [
    { label: 'Leads', value: totalLeads },
    { label: 'Contactados', value: sm.contacted ?? 0 },
    { label: 'Calificados', value: sm.qualified ?? 0 },
    { label: 'Reuniones', value: meetingsScheduled },
    { label: 'Convertidos', value: sm.converted ?? 0 },
  ]

  // Agent leaderboard
  const agentIds = agentCallGroups.map(a => a.agentId).filter((id): id is string => id != null)
  let agentLeaderboard: { name: string; calls: number }[] = []
  if (agentIds.length > 0) {
    const agentDocs = await prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    })
    const nameMap = Object.fromEntries(agentDocs.map(a => [a.id, a.name]))
    agentLeaderboard = agentCallGroups.map(a => ({
      name: nameMap[a.agentId as string] ?? 'Desconocido',
      calls: a._count.id,
    }))
  }

  // Calls by campaign
  const campIds = callsByCampGroups.map(c => c.campaignId).filter((id): id is string => id != null)
  let callsByCampaign: { name: string; value: number; pct: number }[] = []
  if (campIds.length > 0) {
    const camps = await prisma.campaign.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true } })
    const campNames = Object.fromEntries(camps.map(c => [c.id, c.name]))
    const tot = callsByCampGroups.reduce((s, c) => s + c._count.id, 0)
    callsByCampaign = callsByCampGroups.map(c => ({
      name: campNames[c.campaignId as string] ?? 'Sin campaña',
      value: c._count.id,
      pct: tot > 0 ? Math.round(c._count.id / tot * 100) : 0,
    }))
  }

  // Pipeline value by day (last 7 days)
  const pipelineByDay = days.map(day => ({
    date: day.slice(5).replace('-', '/'),
    value: recentOpps
      .filter(o => o.createdAt.toISOString().slice(0, 10) === day)
      .reduce((s, o) => s + (o.value ? Number(o.value) : 0), 0),
  }))

  const sentimentTotals: Record<string, number> = {}
  sentimentGroups.forEach(g => { if (g.sentiment) sentimentTotals[g.sentiment] = g._count.id })
  const sentimentTotal = Object.values(sentimentTotals).reduce((s, v) => s + v, 0)
  const sentiment = {
    positive: sentimentTotal > 0 ? Math.round((sentimentTotals.positive ?? 0) / sentimentTotal * 100) : 0,
    neutral:  sentimentTotal > 0 ? Math.round((sentimentTotals.neutral  ?? 0) / sentimentTotal * 100) : 0,
    negative: sentimentTotal > 0 ? Math.round((sentimentTotals.negative ?? 0) / sentimentTotal * 100) : 0,
  }

  return {
    totalCalls, totalLeads, meetingsScheduled, conversionRate, activeCampaigns,
    pipelineValue, closedWonValue, kpiPcts,
    timeSeries, funnel, agentLeaderboard,
    callsByCampaign, pipelineByDay, sentiment,
  }
}

export async function getActivity(orgId: string, limit = 20) {
  const [calls, meetings] = await Promise.all([
    prisma.call.findMany({
      where: { orgId },
      include: { lead: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.meeting.findMany({
      where: { orgId },
      include: { lead: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ])

  const activity = [
    ...calls.map((c) => ({ type: 'call' as const, data: c, createdAt: c.createdAt })),
    ...meetings.map((m) => ({ type: 'meeting' as const, data: m, createdAt: m.createdAt })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)

  return activity
}
