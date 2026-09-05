export function groupSeries(series, interval) {
  const groups = new Map()
  for (const row of series) {
    const date = new Date(`${row.date}T00:00:00Z`)
    if (interval === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
    if (interval === 'month') date.setUTCDate(1)
    const key = date.toISOString().slice(0, 10)
    const bucket = groups.get(key) || { date: key, calls: 0, meetings: 0, revenue: 0 }
    for (const metric of ['calls', 'meetings', 'revenue']) bucket[metric] += row[metric]
    groups.set(key, bucket)
  }
  return [...groups.values()]
}

export function validAnalysis(data) {
  return data?.period && Number.isFinite(data.period.days)
    && ['start', 'end', 'previousStart', 'previousEnd'].every(key => Number.isFinite(Date.parse(data.period[key])))
    && ['calls', 'meetings', 'revenue'].every(key => Number.isFinite(data.metrics?.[key]?.value))
    && data.metrics?.winRate && data.sample && data.warnings
    && ['series', 'campaigns', 'agents', 'stages', 'outcomes', 'losses', 'sentiment'].every(key => Array.isArray(data[key]))
}
