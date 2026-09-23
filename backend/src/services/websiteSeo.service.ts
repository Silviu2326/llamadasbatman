import type { Job, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { createJob, hasJobExecutor, registerJobExecutor } from './jobs.service'
import { generateSeoReport, latestReport, listHistory } from './seoAgency.service'
import { readWorkerHeartbeat } from '../observability/workerHeartbeat'

export const WEBSITE_AUDIT_KIND = 'website.seo.audit'
export const WEBSITE_AUDIT_INTERVAL = 24 * 60 * 60 * 1000
const activeStatuses = ['pending', 'running', 'waiting_provider']
const jobWhere = (orgId: string, connectionId: string) => ({
  orgId, kind: WEBSITE_AUDIT_KIND, input: { path: ['connectionId'], equals: connectionId },
})
export function nextWebsiteAuditAt(lastAudit: Date | null, lastAttempt: Date | null) {
  const latest = Math.max(lastAudit?.getTime() ?? 0, lastAttempt?.getTime() ?? 0)
  return new Date(latest ? latest + WEBSITE_AUDIT_INTERVAL : Date.now())
}
export function auditJobView(job: Job | null) {
  if (!job) return null
  return { id: job.id, status: job.status, progress: job.progress, createdAt: job.createdAt,
    startedAt: job.startedAt, finishedAt: job.finishedAt,
    error: job.status === 'failed' ? 'No se pudo completar la revisión. Puedes volver a intentarlo.' : null }
}
export async function enqueueWebsiteAudit(orgId: string, connectionId: string, source: 'initial' | 'manual' | 'scheduled' = 'manual', actorId?: string) {
  const connection = await prisma.websiteConnection.findFirst({ where: { id: connectionId, orgId } })
  if (!connection || connection.status === 'disconnected') return null
  const active = await prisma.job.findFirst({ where: { ...jobWhere(orgId, connectionId), status: { in: activeStatuses } } })
  if (active) return active
  // initial and scheduled requests are safe across multiple API/worker replicas.
  const previousJob = source === 'manual' ? await prisma.job.findFirst({ where: jobWhere(orgId, connectionId), orderBy: { createdAt: 'desc' }, select: { id: true } }) : null
  const key = source === 'initial' ? `initial:${connectionId}`
    : source === 'scheduled' ? `daily:${connectionId}:${new Date().toISOString().slice(0, 10)}`
    : `manual:${connectionId}:after:${previousJob?.id ?? "first"}`
  registerWebsiteAuditExecutor()
  return createJob({ orgId, kind: WEBSITE_AUDIT_KIND, input: { connectionId, source },
    idempotencyKey: key, createdById: actorId, maxAttempts: 2, costEstimateCents: 0 })
}
export function registerWebsiteAuditExecutor() {
  if (hasJobExecutor(WEBSITE_AUDIT_KIND)) return
  registerJobExecutor(WEBSITE_AUDIT_KIND, async job => {
    const input = job.input as { connectionId: string; source: string }
    const connection = await prisma.websiteConnection.findFirst({ where: { id: input.connectionId, orgId: job.orgId } })
    if (!connection || connection.status === 'disconnected') throw new Error('WEBSITE_UNAVAILABLE')
    // A recovered lease must not duplicate a report already saved by this job.
    const existing = await prisma.seoReport.findFirst({
      where: { orgId: job.orgId, url: connection.websiteUrl, report: { path: ['auditJobId'], equals: job.id } },
      select: { id: true },
    })
    if (existing) return { output: { reportId: existing.id, connectionId: connection.id } }
    await prisma.job.updateMany({ where: { id: job.id, workerId: job.workerId }, data: { progress: 10 } })
    const previous = await latestReport(job.orgId, connection.websiteUrl)
    const report = await generateSeoReport({ url: connection.websiteUrl }, { skipAi: true })
    // Passive checks update evidence; keep a previously authored plan.
    const combined = previous?.provider === 'deepseek'
      ? { ...report, keywords: previous.keywords, contentPlan: previous.contentPlan, localSeo: previous.localSeo,
          summary: report.summary, planGeneratedAt: (previous as any).planGeneratedAt ?? previous.generatedAt, provider: previous.provider, model: previous.model }
      : report
    await prisma.job.updateMany({ where: { id: job.id, workerId: job.workerId }, data: { progress: 90 } })
    // Require the lease at commit, so an abandoned executor cannot save stale evidence.
    const saved = await prisma.$transaction(async tx => {
      const owns = await tx.job.updateMany({ where: { id: job.id, workerId: job.workerId, status: 'running' }, data: { progress: 100 } })
      if (!owns.count) throw new Error('AUDIT_LEASE_LOST')
      return tx.seoReport.create({ data: { orgId: job.orgId, url: connection.websiteUrl, score: report.score,
        auto: input.source !== 'manual', report: { ...combined, auditJobId: job.id } as unknown as Prisma.InputJsonValue }, select: { id: true } })
    })
    return { output: { reportId: saved.id, connectionId: connection.id } }
  })
}
export async function websiteSeoOverview(orgId: string, connectionId: string) {
  const connection = await prisma.websiteConnection.findFirst({ where: { id: connectionId, orgId } })
  if (!connection) return null
  const [report, history, jobs, proposals, heartbeat] = await Promise.all([
    latestReport(orgId, connection.websiteUrl), listHistory(orgId, connection.websiteUrl),
    prisma.job.findMany({ where: jobWhere(orgId, connectionId), orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.websiteChangeProposal.findMany({ where: { orgId, connectionId }, orderBy: { createdAt: 'desc' }, take: 15,
      select: { id: true, title: true, status: true, prUrl: true, createdAt: true, mergedAt: true } }),
    readWorkerHeartbeat('website-seo'),
  ])
  const lastAudit = history.at(-1)?.createdAt ?? null
  const next = nextWebsiteAuditAt(lastAudit, jobs[0]?.createdAt ?? null)
  return { report, history, jobs: jobs.map(auditJobView), proposals,
    monitoring: { status: connection.status === 'disconnected' ? 'paused' : heartbeat.status === 'healthy' ? 'active' : 'unavailable',
      lastSeenAt: heartbeat.lastSeenAt ?? null,
      nextRunAt: heartbeat.status === 'healthy' && connection.status !== 'disconnected' ? next : null,
      intervalHours: 24 } }
}
export async function scheduleWebsiteAudits() {
  let cursor: string | undefined
  for (;;) {
    const connections = await prisma.websiteConnection.findMany({
      where: { status: { not: 'disconnected' } }, orderBy: { id: 'asc' }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, orgId: true, websiteUrl: true },
    })
    for (const connection of connections) {
      const [last, job] = await Promise.all([
        prisma.seoReport.findFirst({ where: { orgId: connection.orgId, url: connection.websiteUrl }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        prisma.job.findFirst({ where: jobWhere(connection.orgId, connection.id), orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      ])
      if (nextWebsiteAuditAt(last?.createdAt ?? null, job?.createdAt ?? null).getTime() <= Date.now()) {
        await enqueueWebsiteAudit(connection.orgId, connection.id, 'scheduled')
      }
    }
    if (connections.length < 100) break
    cursor = connections.at(-1)!.id
  }
}
