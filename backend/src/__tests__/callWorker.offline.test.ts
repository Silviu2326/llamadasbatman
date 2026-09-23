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
