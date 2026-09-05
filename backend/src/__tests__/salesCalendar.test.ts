import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import { listTasks } from '../services/tasks.service'
import { list } from '../controllers/tasks.controller'
import { listCalls } from '../services/calls.service'
import { listOpportunities } from '../services/pipeline.service'

test('calendar date range and pagination retain organization and owner restrictions', async () => {
  const originalFind = prisma.task.findMany, originalCount = prisma.task.count
  const queries: any[] = []
  prisma.task.findMany = (async args => { queries.push(args); return [] }) as typeof prisma.task.findMany
  prisma.task.count = (async args => { queries.push(args); return 151 }) as typeof prisma.task.count
  try {
    const result = await listTasks('org-test', { userId: 'seller-test', role: 'sales_rep', workspaceScope: 'own' }, { dueAfter: '2026-09-07T00:00:00Z', dueBefore: '2026-09-13T23:59:59.999Z', page: 2, limit: 100 })
    assert.equal(result.totalPages, 2)
    assert.equal(queries[0].skip, 100)
    assert.equal(queries[0].take, 100)
    for (const query of queries) {
      assert.equal(query.where.orgId, 'org-test')
      assert.equal(query.where.ownerId, 'seller-test')
      assert.equal(query.where.dueAt.gte.toISOString(), '2026-09-07T00:00:00.000Z')
      assert.equal(query.where.dueAt.lte.toISOString(), '2026-09-13T23:59:59.999Z')
    }
  } finally { prisma.task.findMany = originalFind; prisma.task.count = originalCount }
})

test('invalid dates and pagination are rejected before querying storage', async () => {
  for (const query of [{ dueAfter: 'not-a-date' }, { limit: '0' }, { page: '-1' }, { dueBefore: 'invalid' }]) {
    let status = 200
    const reply = { status(code: number) { status = code; return this }, code(code: number) { status = code; return this }, send() {} }
    await list({ user: { orgId: 'org-test', userId: 'seller-test' }, query } as any, reply as any)
    assert.equal(status, 400)
  }
})

test('call search, contact and result filters apply before pagination without dropping tenant scope', async () => {
  const originalFind = prisma.call.findMany, originalCount = prisma.call.count
  const queries: any[] = []
  prisma.call.findMany = (async args => { queries.push(args); return [] }) as typeof prisma.call.findMany
  prisma.call.count = (async args => { queries.push(args); return 25 }) as typeof prisma.call.count
  try {
    const result = await listCalls('org-test', { leadId: 'contact-test', search: 'Ana', highIntent: true, page: 2, limit: 20 })
    assert.equal(result.totalPages, 2)
    assert.equal(queries[0].skip, 20)
    for (const query of queries) {
      assert.equal(query.where.orgId, 'org-test')
      assert.equal(query.where.leadId, 'contact-test')
      assert.equal(query.where.lead.OR[0].name.contains, 'Ana')
      assert.deepEqual(query.where.AND[0].outcome.in, ['interested', 'meeting_scheduled'])
    }
  } finally { prisma.call.findMany = originalFind; prisma.call.count = originalCount }
})

test('contact opportunities keep the seller ownership filter', async () => {
  const originalFind = prisma.opportunity.findMany, originalCount = prisma.opportunity.count
  const queries: any[] = []
  prisma.opportunity.findMany = (async args => { queries.push(args); return [] }) as typeof prisma.opportunity.findMany
  prisma.opportunity.count = (async args => { queries.push(args); return 0 }) as typeof prisma.opportunity.count
  try {
    await listOpportunities('org-test', { userId: 'seller-test', role: 'sales_rep' }, { leadId: 'contact-test' })
    for (const query of queries) {
      assert.equal(query.where.orgId, 'org-test')
      assert.equal(query.where.assignedTo, 'seller-test')
      assert.equal(query.where.leadId, 'contact-test')
    }
  } finally { prisma.opportunity.findMany = originalFind; prisma.opportunity.count = originalCount }
})
