import assert from 'node:assert/strict'
import test from 'node:test'

// No connection is opened: every Prisma method used by this workflow is mocked.
process.env.DATABASE_URL ||= 'postgresql://unused:unused@127.0.0.1:9/voice_upload_offline'

test('tenant ownership, idempotent creation, consent and recovery after a lost response', async t => {
  const { prisma } = await import('../lib/prisma')
  const { uploadAgentVoice, getVoiceUpload } = await import('../services/agentVoiceUpload.service')
  const jobs: any[] = []; const consents: any[] = []
  const mockMethod = (target: any, key: string, implementation: any) => {
    const original = target[key]
    target[key] = implementation
    t.after(() => { target[key] = original })
  }
  const jobDelegate = prisma.job
  const matches = (job: any, where: any) => Object.entries(where).every(([key, value]) => job[key] === value)
  mockMethod(prisma.agent, 'findFirst', async ({ where }: any) => where.orgId === 'org-a' ? { id: where.id } : null)
  mockMethod(jobDelegate, 'findUnique', async ({ where }: any) => jobs.find(job => matches(job, where.orgId_kind_idempotencyKey)) || null)
  mockMethod(jobDelegate, 'findFirst', async ({ where }: any) => jobs.find(job => matches(job, where)) || null)
  mockMethod(jobDelegate, 'create', async ({ data }: any) => {
    if (jobs.some(job => job.orgId === data.orgId && job.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error('duplicate'), { code: 'P2002' })
    const job = { ...data, id: `job-${jobs.length}`, providerJobId: null }; jobs.push(job); return job
  })
  mockMethod(jobDelegate, 'updateMany', async ({ where, data }: any) => { const job = jobs.find(job => matches(job, where)); if (!job) return { count: 0 }; Object.assign(job, data); return { count: 1 } })
  mockMethod(prisma, '$transaction', async (callback: any) => callback({ job: jobDelegate, consentGrant: { create: async ({ data }: any) => { consents.push(data); return data } } }))
  const oldKey = process.env.FISH_API_KEY; process.env.FISH_API_KEY = 'test-key'
  let posts = 0; let loseResponse = false
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    if (init.method === 'POST') {
      posts++
      if (loseResponse) throw new Error('connection lost')
      return Response.json({ _id: 'a'.repeat(32), visibility: 'private', state: 'trained' })
    }
    return Response.json({ items: [{ _id: 'b'.repeat(32), title: 'Vendrava job-1', visibility: 'private', state: 'trained' }] })
  })
  const wav = Buffer.alloc(200); wav.write('RIFF'); wav.write('WAVE', 8)
  const input = { name: 'My voice', subjectName: 'Voice owner', confirmed: true as const, audioBase64: wav.toString('base64') }
  try {
    await assert.rejects(uploadAgentVoice('org-b', 'agent', 'user', input), { statusCode: 404 }); assert.equal(posts, 0)
    await assert.rejects(uploadAgentVoice('org-a', 'agent', 'user', { ...input, confirmed: false as any }), { statusCode: 400 }); assert.equal(posts, 0)
    const results = await Promise.all([uploadAgentVoice('org-a', 'agent', 'user', input), uploadAgentVoice('org-a', 'agent', 'user', input)])
    assert.ok(results.some(result => result.status === 'ready')); assert.equal(posts, 1); assert.equal(consents.length, 1)
    assert.deepEqual(consents[0].scope.voiceIds, ['a'.repeat(32)])
    assert.equal('agentIds' in consents[0].scope, false)
    assert.equal(JSON.stringify(jobs).includes(input.audioBase64), false)
    assert.equal((await uploadAgentVoice('org-a', 'agent', 'user', input)).status, 'ready'); assert.equal(posts, 1)
    await assert.rejects(getVoiceUpload('org-a', 'different-agent', 'job-0'), { statusCode: 404 })
    await assert.rejects(getVoiceUpload('org-b', 'agent', 'job-0'), { statusCode: 404 })
    loseResponse = true
    const second = { ...input, name: 'Second voice' }
    assert.equal((await uploadAgentVoice('org-a', 'agent', 'user', second)).status, 'processing')
    assert.equal((await uploadAgentVoice('org-a', 'agent', 'user', second)).status, 'processing'); assert.equal(posts, 2)
    jobs[1].startedAt = new Date(Date.now() - 130_000)
    assert.equal((await getVoiceUpload('org-a', 'agent', 'job-1')).status, 'ready')
    assert.equal(posts, 2); assert.equal(consents.length, 2)
  } finally { if (oldKey === undefined) delete process.env.FISH_API_KEY; else process.env.FISH_API_KEY = oldKey }
})
