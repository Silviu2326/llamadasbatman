import { Queue, Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import {
  captureKeywordRanks,
  generateSeoReport,
  saveReport,
  allProjects,
  SeoReport,
} from '../services/seoAgency.service'
import { sendTransactionalEmail } from '../services/transactionalEmail.service'

// Vigilancia SEO diaria por proyecto: re-audita cada web (checklist+score+SSL+
// crawl+CWV) con su contexto guardado, audita también a sus competidores,
// captura la posición semanal de las keywords (Search Console) y avisa por
// email de incidencias NUEVAS (web caída, SSL, bajada de score). skipAi:
// el refresco vigila salud técnica, no regenera el plan con LLM.
const QUEUE_NAME = 'seo-audit-refresh'
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
const REPEATABLE_JOB_ID = 'seo-audit-refresh-tick'
const reportSeoError = reportQueueError('SeoAuditRefresh')

let seoAuditRefreshQueue: Queue | null = null
let seoAuditRefreshWorker: Worker | null = null

interface Incident {
  subject: string
  body: string
}

/** Incidencias que aparecen en el informe nuevo y NO estaban en el anterior. */
export function newIncidents(current: SeoReport, previous: SeoReport | null, url: string): Incident[] {
  const incidents: Incident[] = []
  if (!current.webAlive && (previous?.webAlive ?? true)) {
    incidents.push({
      subject: `⚠ Tu web ${url} no responde`,
      body: 'La auditoría diaria de Vendrava no pudo leer tu web: puede estar caída o bloqueando el análisis. Compruébala cuanto antes.',
    })
  }
  const sslNow = current.checklist?.find((c) => c.id === 'ssl')
  const sslBefore = previous?.checklist?.find((c) => c.id === 'ssl')
  if (sslNow && !sslNow.ok && (sslBefore?.ok ?? true)) {
    incidents.push({
      subject: `⚠ El certificado SSL de ${url} está a punto de caducar`,
      body: `${sslNow.label}. Renuévalo antes de que el navegador bloquee la web con un aviso de seguridad.`,
    })
  }
  if (previous && current.score < previous.score - 5) {
    incidents.push({
      subject: `⚠ El score SEO de ${url} bajó de ${previous.score} a ${current.score}`,
      body: 'Alguna comprobación técnica que antes pasaba ahora falla. Entra en la página SEO de Vendrava para ver el detalle.',
    })
  }
  return incidents
}

async function notifyOrg(orgId: string, incidents: Incident[]) {
  if (!incidents.length) return
  const owner = await prisma.user.findFirst({
    where: { orgId, role: 'owner' },
    select: { email: true },
  })
  const org = owner?.email ? null : await prisma.organization.findUnique({ where: { id: orgId }, select: { email: true } })
  const to = owner?.email ?? org?.email
  if (!to) return
  for (const incident of incidents) {
    await sendTransactionalEmail({
      to,
      subject: incident.subject,
      html: `<p>${incident.body}</p><p style="color:#888;font-size:12px">Vigilancia SEO automática de Vendrava.</p>`,
    })
  }
}

async function refreshProject(project: { orgId: string; url: string; business: string | null; sector: string | null; city: string | null; competitors: string[] }) {
  const previousRow = await prisma.seoReport.findFirst({
    where: { orgId: project.orgId, url: project.url },
    orderBy: { createdAt: 'desc' },
    select: { report: true },
  })
  const previous = (previousRow?.report as unknown as SeoReport | undefined) ?? null

  const report = await generateSeoReport({
    url: project.url,
    business: project.business ?? undefined,
    sector: project.sector ?? undefined,
    city: project.city ?? undefined,
  }, { skipAi: true })
  await saveReport(project.orgId, report, true)

  await notifyOrg(project.orgId, newIncidents(report, previous, project.url))
    .catch((error) => console.warn(`[SeoAuditRefresh] aviso fallido org ${project.orgId}:`, (error as Error).message))

  for (const competitor of project.competitors.slice(0, 3)) {
    try {
      const rivalReport = await generateSeoReport({ url: competitor }, { skipAi: true })
      await saveReport(project.orgId, rivalReport, true)
    } catch (error) {
      console.warn(`[SeoAuditRefresh] competidor ${competitor} falló:`, (error as Error).message)
    }
  }

  // La captura interna se auto-limita a una vez por semana.
  await captureKeywordRanks(project.orgId, project.url)
    .catch((error) => console.warn(`[SeoAuditRefresh] ranks org ${project.orgId}:`, (error as Error).message))
}

void (async () => {
  const connection = await connectOptionalRedis('SeoAuditRefresh')
  if (!connection) return

  try {
    seoAuditRefreshQueue = new Queue(QUEUE_NAME, { connection: connection as any })
    seoAuditRefreshQueue.on('error', reportSeoError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    try {
      await seoAuditRefreshQueue.add('tick', {}, { repeat: { every: SYNC_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID })
    } catch (error) {
      reportSeoError(error as Error)
    }

    const worker = new Worker(
      QUEUE_NAME,
      async () => {
        const projects = await allProjects()
        for (const project of projects) {
          try {
            await refreshProject(project)
          } catch (error) {
            console.error(`[SeoAuditRefresh] error en org ${project.orgId} (${project.url}):`, error)
          }
        }
      },
      { connection: connection as any, concurrency: 1 }
    )

    worker.on('completed', (job) => console.log(`[SeoAuditRefresh] job ${job.id} completed`))
    worker.on('failed', (job, error) => console.error(`[SeoAuditRefresh] job ${job?.id} failed:`, error))
    worker.on('error', reportSeoError)
    seoAuditRefreshWorker = worker
  } catch (error) {
    reportSeoError(error as Error)
    connection.disconnect()
  }
})()

export { seoAuditRefreshQueue, seoAuditRefreshWorker }
