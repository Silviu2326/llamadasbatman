import { prisma } from '../lib/prisma'

const DAY_MS = 24 * 60 * 60 * 1000

type UsageAggregateRow = {
  provider: string
  billingMode: string
  _sum: { priceCents: unknown; costCents: unknown }
  _count: { _all: number }
}

type RoutedJob = { input: unknown }

function number(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function aggregateUsage(rows: UsageAggregateRow[]) {
  const providers = new Map<string, { provider: string; records: number; priceCents: number; costCents: number; marginCents: number }>()
  const billingModes = new Map<string, { billingMode: string; records: number; priceCents: number; costCents: number }>()
  for (const row of rows) {
    const priceCents = number(row._sum.priceCents)
    const costCents = number(row._sum.costCents)
    const provider = providers.get(row.provider) ?? { provider: row.provider, records: 0, priceCents: 0, costCents: 0, marginCents: 0 }
    provider.records += row._count._all
    provider.priceCents += priceCents
    provider.costCents += costCents
    provider.marginCents += priceCents - costCents
    providers.set(row.provider, provider)

    const mode = billingModes.get(row.billingMode) ?? { billingMode: row.billingMode, records: 0, priceCents: 0, costCents: 0 }
    mode.records += row._count._all
    mode.priceCents += priceCents
    mode.costCents += costCents
    billingModes.set(row.billingMode, mode)
  }
  const byProvider = [...providers.values()].sort((a, b) => b.priceCents - a.priceCents || a.provider.localeCompare(b.provider))
  const totals = byProvider.reduce((sum, row) => ({
    records: sum.records + row.records,
    priceCents: sum.priceCents + row.priceCents,
    costCents: sum.costCents + row.costCents,
    marginCents: sum.marginCents + row.marginCents,
  }), { records: 0, priceCents: 0, costCents: 0, marginCents: 0 })
  return { totals, byProvider, byBillingMode: [...billingModes.values()].sort((a, b) => a.billingMode.localeCompare(b.billingMode)) }
}

/**
 * Ahorro conservador: compara el estimado elegido con el candidato viable más
 * caro que el router guardó en Job.input._routing. No inventa ahorro cuando
 * solo había un proveedor ni mezcla candidatos excluidos.
 */
export function aggregateRoutingSavings(jobs: RoutedJob[]) {
  let jobsWithRouting = 0
  let jobsWithAlternatives = 0
  let chosenEstimateCents = 0
  let highestViableEstimateCents = 0
  for (const job of jobs) {
    const input = record(job.input)
    const routing = record(input?._routing)
    if (!routing) continue
    const chosen = number(routing.estimateCents)
    jobsWithRouting += 1
    chosenEstimateCents += chosen
    const alternatives = Array.isArray(routing.alternatives) ? routing.alternatives : []
    const estimates = alternatives.map(item => number(record(item)?.estimateCents)).filter(value => value >= 0)
    const highest = Math.max(chosen, ...estimates)
    highestViableEstimateCents += highest
    if (estimates.length) jobsWithAlternatives += 1
  }
  const savingsCents = Math.max(0, highestViableEstimateCents - chosenEstimateCents)
  return {
    jobsWithRouting,
    jobsWithAlternatives,
    chosenEstimateCents,
    highestViableEstimateCents,
    savingsCents,
    savingsRate: highestViableEstimateCents > 0 ? savingsCents / highestViableEstimateCents : 0,
  }
}

export function aggregateMultiCapabilityFlows(
  runs: Array<{ id: string; steps: Array<{ jobId: string | null }> }>,
  jobs: Array<{ id: string; kind: string }>,
) {
  const kindByJob = new Map(jobs.map(job => [job.id, job.kind]))
  let multiCapabilityRuns = 0
  for (const run of runs) {
    const capabilities = new Set(
      run.steps
        .map(step => step.jobId ? kindByJob.get(step.jobId) : undefined)
        .filter((kind): kind is string => Boolean(kind) && kind !== 'microapp.run'),
    )
    if (capabilities.size >= 2) multiCapabilityRuns += 1
  }
  return {
    runsEvaluated: runs.length,
    multiCapabilityRuns,
    percentage: runs.length ? (multiCapabilityRuns / runs.length) * 100 : 0,
  }
}

export async function getOpenPlatformMetrics(params: { orgId: string; days?: number }) {
  const days = Math.min(Math.max(params.days ?? 30, 1), 365)
  const now = new Date()
  const since = new Date(now.getTime() - days * DAY_MS)
  const weekStart = new Date(now)
  weekStart.setUTCHours(0, 0, 0, 0)
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7))

  const [usageRows, routedJobs, microappRows, weeklyMicroappRuns, flowRuns] = await Promise.all([
    prisma.usageRecord.groupBy({
      by: ['provider', 'billingMode'],
      where: { orgId: params.orgId, createdAt: { gte: since } },
      _sum: { priceCents: true, costCents: true },
      _count: { _all: true },
    }),
    prisma.job.findMany({
      where: { orgId: params.orgId, createdAt: { gte: since } },
      select: { input: true },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    }),
    prisma.microappRun.groupBy({
      by: ['microappId'],
      where: { orgId: params.orgId, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { microappId: 'desc' } },
    }),
    prisma.microappRun.count({ where: { orgId: params.orgId, createdAt: { gte: weekStart } } }),
    prisma.flowRun.findMany({
      where: { orgId: params.orgId, startedAt: { gte: since }, dryRun: false },
      select: { id: true, steps: { select: { jobId: true } } },
      orderBy: { startedAt: 'desc' },
      take: 10_000,
    }),
  ])

  const flowJobIds = [...new Set(flowRuns.flatMap(run => run.steps.map(step => step.jobId).filter((id): id is string => Boolean(id))))]
  const flowJobs = flowJobIds.length
    ? await prisma.job.findMany({ where: { orgId: params.orgId, id: { in: flowJobIds } }, select: { id: true, kind: true } })
    : []

  return {
    period: { days, from: since.toISOString(), to: now.toISOString() },
    margin: aggregateUsage(usageRows),
    routing: aggregateRoutingSavings(routedJobs),
    microapps: {
      weeklyRuns: weeklyMicroappRuns,
      periodRuns: microappRows.reduce((sum, row) => sum + row._count._all, 0),
      activeMicroapps: microappRows.length,
      byMicroapp: microappRows.map(row => ({ microappId: row.microappId, runs: row._count._all })),
    },
    flows: aggregateMultiCapabilityFlows(flowRuns, flowJobs),
  }
}
