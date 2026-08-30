import { Job, Queue, Worker } from 'bullmq'
import { connectOptionalRedis, reportQueueError } from '../lib/optionalRedis'
import { processTrainingJob } from '../services/whiteLabel.service'

export interface WhiteLabelTrainingQueueJob { trainingJobId: string }

const QUEUE_NAME = 'white-label-training'
const reportTrainingError = reportQueueError('WhiteLabelTraining')
let whiteLabelTrainingQueue: Queue<WhiteLabelTrainingQueueJob> | null = null
let whiteLabelTrainingWorker: Worker<WhiteLabelTrainingQueueJob> | null = null

void (async () => {
  const connection = await connectOptionalRedis('WhiteLabelTraining')
  if (!connection) return
  try {
    whiteLabelTrainingQueue = new Queue<WhiteLabelTrainingQueueJob>(QUEUE_NAME, { connection: connection as any })
    whiteLabelTrainingQueue.on('error', reportTrainingError)
    if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') return
    const worker = new Worker<WhiteLabelTrainingQueueJob>(
      QUEUE_NAME,
      async (job: Job<WhiteLabelTrainingQueueJob>) => {
        await processTrainingJob(job.data.trainingJobId)
      },
      { connection: connection as any, concurrency: 2 },
    )
    worker.on('failed', (job, error) => console.error(`[WhiteLabelTraining] job ${job?.id} failed:`, error))
    worker.on('error', reportTrainingError)
    whiteLabelTrainingWorker = worker
  } catch (error) {
    reportTrainingError(error as Error)
    connection.disconnect()
  }
})()

export async function enqueueWhiteLabelTraining(trainingJobId: string): Promise<boolean> {
  if (!whiteLabelTrainingQueue) return false
  try {
    await whiteLabelTrainingQueue.add('crawl', { trainingJobId }, {
      jobId: trainingJobId,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    })
    return true
  } catch (error) {
    reportTrainingError(error as Error)
    return false
  }
}

export { whiteLabelTrainingQueue, whiteLabelTrainingWorker }
