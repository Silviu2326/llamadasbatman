import test from 'node:test'
import assert from 'node:assert/strict'
import { getAgentTeam } from '../src/services/agentTeam.service.ts'
test('team metrics isolate organizations and tests, classify outcomes and keep currencies separate', async () => {
  const queries = {}
  const db = {
    call: {
      groupBy: async q => { queries.counts=q; return ['interested','not_interested','voicemail','meeting_scheduled'].map(outcome => ({agentId:'a',outcome,_count:{_all:1}})) },
      count: async q => { queries.previous=q; return 3 },
      findMany: async q => { queries[q.distinct?'latest':'recent']=q; return [] },
    },
    meeting: {findMany:async q=>{queries.meetings=q; return [{call:{agentId:'a'}}]}},
    opportunity: {groupBy:async q=>{queries.pipeline=q; return [{currency:'EUR',_count:{_all:2},_sum:{value:'1200.50'}},{currency:'USD',_count:{_all:1},_sum:{value:null}}]}},
  }
  const result=await getAgentTeam('org-a',new Date('2026-09-20T00:00:00Z'),new Date('2026-09-20T12:00:00Z'),new Date('2026-09-19T00:00:00Z'),db)
  assert.deepEqual(result.agents.a,{calls:4,conversations:3,qualified:2,meetings:1})
  for(const q of Object.values(queries)) assert.equal(q.where.orgId,'org-a')
  assert.equal(queries.counts.where.isTest,false)
  assert.equal(queries.previous.where.isTest,false)
  assert.equal(queries.meetings.where.call.isTest,false)
  assert.equal(queries.meetings.where.status.not,'cancelled')
  assert.equal(queries.previous.where.createdAt.lt.toISOString(),'2026-09-19T12:00:00.000Z')
  assert.equal(queries.recent.take,6)
  assert.equal(queries.recent.select.isTest,true)
  assert.deepEqual(queries.pipeline.where.stage.notIn,['closed_won','closed_lost'])
  assert.deepEqual(result.pipeline,[{currency:'EUR',count:2,value:1200.5},{currency:'USD',count:1,value:0}])
})
