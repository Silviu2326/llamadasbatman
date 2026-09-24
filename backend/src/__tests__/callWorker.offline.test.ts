import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:9/call_worker_offline'
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
process.env.REDIS_ENABLED = 'false'
process.env.WORKER_QUEUE_BACKEND = 'postgres'

test('scheduled call worker filters organisation and channel before LIMIT; ordinary worker remains unrestricted', async t => {
  const { prisma } = await import('../lib/prisma')
  const { findRunnableSalesSequenceSteps } = await import('../services/salesSequence.service')
  const queries: any[] = []
  t.mock.method(prisma, '$queryRaw', async (query: any) => { queries.push(query); return [] })
  await findRunnableSalesSequenceSteps(25, new Date(), { orgId: 'org-calls', type: 'call' })
  assert.ok(queries[0].sql.indexOf('s."type" =') < queries[0].sql.indexOf('LIMIT'))
  assert.ok(queries[0].values.includes('org-calls'))
  assert.ok(queries[0].values.includes('call'))
  await findRunnableSalesSequenceSteps(25)
  assert.equal(queries[1].sql.includes('s."type" ='), false)
})

test('call queue applies organisation scope both when selecting and atomically claiming a job', async t => {
  const { prisma } = await import('../lib/prisma')
  const { startDatabaseQueueWorker } = await import('../lib/databaseQueue')
  let selection: any, claim: any
  let complete!: () => void
  const completed = new Promise<void>(resolve => { complete = resolve })
  const delegate = prisma.workerQueueJob as any
  const originalFind = delegate.findMany, originalUpdate = delegate.updateMany
  delegate.findMany = async (query: any) => { selection = query; return [{ id: 'job-a' }] }
  delegate.updateMany = async (query: any) => { claim = query; complete(); return { count: 0 } }
  t.after(() => { delegate.findMany = originalFind; delegate.updateMany = originalUpdate })
  const stop = startDatabaseQueueWorker({ queue: 'lead-call-dispatch', orgId: 'org-calls', handler: async () => { assert.fail('A job whose claim failed must not execute') } })
  try {
    await completed
    for (const query of [selection, claim]) assert.deepEqual(query.where.payload, { path: ['orgId'], equals: 'org-calls' })
  } finally { stop() }
})

test('queue ticks never overlap: with one slot the poll does not claim while a job is still in flight', async t => {
  const { prisma } = await import('../lib/prisma')
  const { startDatabaseQueueWorker } = await import('../lib/databaseQueue')
  const delegate = prisma.workerQueueJob as any
  const originalFind = delegate.findMany, originalUpdate = delegate.updateMany, originalUnique = delegate.findUnique
  let claims = 0
  const finishes: any[] = []
  delegate.findMany = async () => [{ id: `job-${claims + 1}` }]
  delegate.updateMany = async (query: any) => {
    if (query.data?.status === 'processing') { claims++; return { count: 1 } }
    finishes.push(query.data)
    return { count: 1 }
  }
  delegate.findUnique = async (query: any) => ({ id: query.where.id, payload: { orgId: 'org-calls' }, attempts: 1, maxAttempts: 5, kind: 'call' })
  t.after(() => { delegate.findMany = originalFind; delegate.updateMany = originalUpdate; delegate.findUnique = originalUnique })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let started = 0
  const stop = startDatabaseQueueWorker({ queue: 'lead-call-dispatch', orgId: 'org-calls', pollMs: 500, handler: async () => { started++; await gate } })
  try {
    await new Promise(resolve => setTimeout(resolve, 1300))
    assert.equal(claims, 1, 'several polls elapsed but only one job was claimed')
    assert.equal(started, 1)
  } finally { stop(); release() }
})

test('a QueueRetryError without attempt cost requeues at the requested delay and gives the attempt back', async t => {
  const { prisma } = await import('../lib/prisma')
  const { startDatabaseQueueWorker, QueueRetryError } = await import('../lib/databaseQueue')
  const delegate = prisma.workerQueueJob as any
  const originalFind = delegate.findMany, originalUpdate = delegate.updateMany, originalUnique = delegate.findUnique
  let served = false
  let retryUpdate: any
  let resolveRetry!: () => void
  const retried = new Promise<void>(resolve => { resolveRetry = resolve })
  delegate.findMany = async () => served ? [] : [{ id: 'job-cap' }]
  delegate.updateMany = async (query: any) => {
    if (query.data?.status === 'processing') { served = true; return { count: 1 } }
    retryUpdate = query.data; resolveRetry(); return { count: 1 }
  }
  delegate.findUnique = async () => ({ id: 'job-cap', payload: { orgId: 'org-calls', leadId: 'lead-1' }, attempts: 5, maxAttempts: 5, kind: 'call' })
  t.after(() => { delegate.findMany = originalFind; delegate.updateMany = originalUpdate; delegate.findUnique = originalUnique })
  const before = Date.now()
  const stop = startDatabaseQueueWorker({ queue: 'lead-call-dispatch', orgId: 'org-calls', handler: async () => { throw new QueueRetryError('ZADARMA_CAPACITY_REACHED', { delayMs: 25_000, countAttempt: false }) } })
  try {
    await retried
    assert.equal(retryUpdate.status, 'pending', 'attempts exhausted but a capacity retry never fails the job')
    assert.deepEqual(retryUpdate.attempts, { decrement: 1 })
    const delay = new Date(retryUpdate.availableAt).getTime() - before
    assert.ok(delay >= 24_000 && delay <= 26_500, `expected ~25 s, got ${delay}`)
  } finally { stop() }
})
