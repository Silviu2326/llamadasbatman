import { isHumanConversation } from '../lib/callOutcome'

const DAY = 86_400_000
export function analysisWindow(days: number, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY)
  return { start, end: now, previousStart: new Date(start.getTime() - days * DAY), previousEnd: new Date(now.getTime() - days * DAY), days }
}

type Call = { id: string; createdAt: Date; status: string; outcome: string; sentiment: string | null; campaignId: string | null; agentId: string | null; meetings: { id: string }[] }
type Meeting = { createdAt: Date }
type Opportunity = { createdAt: Date; actualCloseDate: Date | null; stage: string; value: number | null; currency: string; lossReason: string | null }
export type AnalysisInput = { calls: Call[]; meetings: Meeting[]; opportunities: Opportunity[] }
const inRange = (date: Date | null, start: Date, end: Date) => date != null && date >= start && date < end
const sum = (rows: Opportunity[]) => rows.reduce((total, row) => total + (row.value ?? 0), 0)
export const change = (current: number, previous: number) => previous > 0 ? Math.round((current - previous) / previous * 1000) / 10 : null

export function buildAnalysis(input: AnalysisInput, window: ReturnType<typeof analysisWindow>) {
  function period(start: Date, end: Date) {
    const calls = input.calls.filter(row => inRange(row.createdAt, start, end))
    const meetings = input.meetings.filter(row => inRange(row.createdAt, start, end))
    const closed = input.opportunities.filter(row => ['closed_won', 'closed_lost'].includes(row.stage) && inRange(row.actualCloseDate, start, end))
    const won = closed.filter(row => row.stage === 'closed_won')
    return { calls, meetings, closed, won, revenue: sum(won.filter(row => row.currency === 'EUR')), winRate: closed.length ? won.length / closed.length * 100 : null }
  }
  const current = period(window.start, window.end)
  const previous = period(window.previousStart, window.previousEnd)
  const created = input.opportunities.filter(row => inRange(row.createdAt, window.start, window.end))
  const series = []
  for (let time = window.start.getTime(); time < window.end.getTime(); time += DAY) {
    const date = new Date(time).toISOString().slice(0, 10)
    series.push({ date, calls: 0, meetings: 0, revenue: 0 })
  }
  const byDate = new Map(series.map(row => [row.date, row]))
  current.calls.forEach(row => { const day = byDate.get(row.createdAt.toISOString().slice(0, 10)); if (day) day.calls++ })
  current.meetings.forEach(row => { const day = byDate.get(row.createdAt.toISOString().slice(0, 10)); if (day) day.meetings++ })
  current.won.filter(row => row.currency === 'EUR').forEach(row => { const day = byDate.get(row.actualCloseDate!.toISOString().slice(0, 10)); if (day) day.revenue += row.value ?? 0 })
  function comparison(field: 'campaignId' | 'agentId') {
    const groups = new Map<string | null, { id: string | null; calls: number; conversations: number; withMeeting: number }>()
    for (const call of current.calls) {
      const row = groups.get(call[field]) ?? { id: call[field], calls: 0, conversations: 0, withMeeting: 0 }
      row.calls++
      if (isHumanConversation(call.outcome)) row.conversations++
      if (call.meetings.length > 0) row.withMeeting++
      groups.set(call[field], row)
    }
    return [...groups.values()].map(row => ({ ...row, meetingRate: row.withMeeting / row.calls * 100, smallSample: row.calls < 20 }))
      .sort((a, b) => b.withMeeting - a.withMeeting || b.meetingRate - a.meetingRate || b.calls - a.calls)
  }
  function counts(rows: { key: string }[]) {
    const groups = new Map<string, number>()
    rows.forEach(row => groups.set(row.key, (groups.get(row.key) ?? 0) + 1))
    return [...groups].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  }
  return {
    generatedAt: window.end.toISOString(),
    period: { start: window.start.toISOString(), end: window.end.toISOString(), previousStart: window.previousStart.toISOString(), previousEnd: window.previousEnd.toISOString(), days: window.days, timezone: 'UTC' },
    metrics: {
      revenue: { value: current.revenue, previous: previous.revenue, change: change(current.revenue, previous.revenue) },
      calls: { value: current.calls.length, previous: previous.calls.length, change: change(current.calls.length, previous.calls.length) },
      meetings: { value: current.meetings.length, previous: previous.meetings.length, change: change(current.meetings.length, previous.meetings.length) },
      winRate: { value: current.winRate, previous: previous.winRate, points: current.winRate != null && previous.winRate != null ? current.winRate - previous.winRate : null },
    },
    sample: { won: current.won.length, closed: current.closed.length, opportunities: created.length, sentiments: current.calls.filter(row => ['positive', 'neutral', 'negative'].includes(row.sentiment ?? '')).length },
    warnings: { otherCurrencies: current.won.filter(row => row.currency !== 'EUR').length, missingValues: current.won.filter(row => row.value == null).length },
    series, campaigns: comparison('campaignId'), agents: comparison('agentId'),
    stages: counts(created.map(row => ({ key: row.stage }))),
    outcomes: counts(current.calls.map(row => ({ key: row.outcome || 'none' }))),
    sentiment: counts(current.calls.filter(row => ['positive', 'neutral', 'negative'].includes(row.sentiment ?? '')).map(row => ({ key: row.sentiment! }))),
    losses: counts(current.closed.filter(row => row.stage === 'closed_lost').map(row => ({ key: row.lossReason?.trim() || 'Sin motivo registrado' }))),
  }
}
