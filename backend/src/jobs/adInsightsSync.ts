import { Queue, Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { fetchAndStoreInsights } from '../services/metaInsights.service'
import { evaluateCampaign } from '../services/adOptimizer.service'
import { evaluateDataQuality } from '../services/adDataQuality.service'
import { runDiagnostics } from '../services/adDiagnostics.service'
import { enforceAutonomyGuardrails } from '../services/adRuleAutonomy.service'

const QUEUE_NAME = 'ad-insights-sync'
const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000
const REPEATABLE_JOB_ID = 'ad-insights-sync-tick'
const reportInsightsError = reportQueueError('AdInsightsSync')

let adInsightsSyncQueue: Queue | null = null
let adInsightsSyncWorker: Worker | null = null

void (async () => {
  const connection = await connectOptionalRedis('AdInsightsSync')
  if (!connection) return

  try {
    adInsightsSyncQueue = new Queue(QUEUE_NAME, { connection: connection as any })
    adInsightsSyncQueue.on('error', reportInsightsError)

    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return

    try {
      await adInsightsSyncQueue.add('tick', {}, { repeat: { every: SYNC_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID })
    } catch (error) {
      reportInsightsError(error as Error)
    }

    const worker = new Worker(
      QUEUE_NAME,
      // Orden obligatorio de ads.md §14:
      //   ad-insights-sync → data-quality-check → attribution-reconcile
      //                    → ad-decision-run
      // Los diagnósticos se ejecutan por organización y no por campaña porque
      // comparan campañas entre sí (la línea base de landing es la mediana del
      // resto), y necesitan la integridad ya recalculada.
      async () => {
        const campaigns = await prisma.campaign.findMany({
          where: { status: 'active', metaAdSetId: { not: null } },
          select: { id: true, orgId: true },
        })
        for (const campaign of campaigns) {
          try {
            await fetchAndStoreInsights(campaign.orgId, campaign.id)
            await evaluateCampaign(campaign.orgId, campaign.id)
          } catch (error) {
            console.error(`[AdInsightsSync] error en campaign ${campaign.id}:`, error)
          }
        }

        for (const orgId of new Set(campaigns.map(campaign => campaign.orgId))) {
          try {
            await evaluateDataQuality(orgId)
            // La degradación es automática y va antes de diagnosticar: si los
            // datos ya no sostienen la autonomía, hay que bajarla antes de
            // producir observaciones que alguien podría ejecutar.
            const guardrails = await enforceAutonomyGuardrails(orgId)
            if (guardrails.degraded) {
              console.warn(
                `[AdInsightsSync] org ${orgId}: ${guardrails.degraded} regla(s) degradadas a N1 —`,
                (guardrails.rules ?? []).join(', ')
              )
            }
            const result = await runDiagnostics(orgId)
            console.log(`[AdInsightsSync] org ${orgId}: ${result.evaluated} campañas evaluadas, ${result.raised} observaciones vigentes`)
          } catch (error) {
            console.error(`[AdInsightsSync] error de diagnóstico en org ${orgId}:`, error)
          }
        }
      },
      { connection: connection as any, concurrency: 1 }
    )

    worker.on('completed', (job) => console.log(`[AdInsightsSync] job ${job.id} completed`))
    worker.on('failed', (job, error) => console.error(`[AdInsightsSync] job ${job?.id} failed:`, error))
    worker.on('error', reportInsightsError)
    adInsightsSyncWorker = worker
  } catch (error) {
    reportInsightsError(error as Error)
    connection.disconnect()
  }
})()

export { adInsightsSyncQueue, adInsightsSyncWorker }
