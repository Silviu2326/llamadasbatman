import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:9/reconcile_offline'
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
process.env.REDIS_ENABLED = 'false'
process.env.WORKER_QUEUE_BACKEND = 'postgres'

const PENDING = '11111111-2222-4333-8444-555555555555'
const READY_LINKED = '22222222-2222-4333-8444-555555555555'
const READY_ORPHAN = '33333333-2222-4333-8444-555555555555'

async function stubCall(t: test.TestContext, rows: Record<string, { id: string; recordingUrl: string | null }>) {
  const { prisma } = await import('../lib/prisma')
  const delegate = (prisma as any).call
  const originals = { findFirst: delegate.findFirst, update: delegate.update }
  const updates: any[] = []
  delegate.findFirst = async (q: any) => rows[q.where.externalCallId] ?? null
  delegate.update = async (q: any) => { updates.push(q); return { id: q.where.id, ...q.data } }
  t.after(() => { delegate.findFirst = originals.findFirst; delegate.update = originals.update })
  return updates
}

test('writePendingCall + reconcilePendingCalls: reintenta la ingesta, enlaza WAV cerrados y cuenta los intentos', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vendrava-pending-'))
  const { writePendingCall, reconcilePendingCalls, pendingCallPath } = await import('../voice/telephony/zadarma/runtime')
  const payload = { externalCallId: `zadarma:${PENDING}`, telephonyProvider: 'zadarma', leadId: 'lead-1', agentId: 'agent-1', duration: 30, outcome: 'interested', isTest: false }
  await writePendingCall(PENDING, 'org-1', payload as any, new Error('ECONNREFUSED database'), dir)
  await writeFile(path.join(dir, `${READY_LINKED}.ready`), '')
  await writeFile(path.join(dir, `${READY_ORPHAN}.ready`), '')
  await writeFile(path.join(dir, 'not-a-uuid.pending.json'), '{}')
  assert.throws(() => pendingCallPath('../etc/passwd', dir), /INVALID_RECORDING_ID/)
  const written = JSON.parse(await readFile(pendingCallPath(PENDING, dir), 'utf8'))
  assert.equal(written.version, 1)
  assert.equal(written.attempts, 1)
  assert.equal(written.lastError, 'ECONNREFUSED database')
  assert.equal(written.data.leadId, 'lead-1')

  const updates = await stubCall(t, { [`zadarma:${READY_LINKED}`]: { id: 'call-linked', recordingUrl: null } })
  const ingested: Array<[string, any]> = []
  const evaluated: string[] = []
  // Primer intento: la base sigue caída; el fichero se conserva y suma un intento.
  const failed = await reconcilePendingCalls({
    directory: dir, ingest: async () => { throw new Error('still down') }, evaluate: async () => null as any,
  })
  assert.deepEqual(failed.ingested, [])
  assert.equal(failed.failed.find(item => item.uuid === PENDING)?.error, 'still down')
  assert.deepEqual(failed.linked, [READY_LINKED])
  assert.deepEqual(failed.orphans, [READY_ORPHAN])
  assert.equal(updates[0].data.recordingUrl, `/api/calls/recordings/${READY_LINKED}`)
  assert.equal(JSON.parse(await readFile(pendingCallPath(PENDING, dir), 'utf8')).attempts, 2)

  // Segundo intento: la ingesta funciona, el fichero desaparece y se evalúa en segundo plano.
  const ok = await reconcilePendingCalls({
    directory: dir,
    ingest: async (orgId, data) => { ingested.push([orgId, data]); return { id: 'call-new' } as any },
    evaluate: async (_orgId, callId) => { evaluated.push(callId); return null as any },
  })
  assert.deepEqual(ok.ingested, [PENDING])
  assert.equal(ingested[0][0], 'org-1')
  assert.equal(ingested[0][1].externalCallId, `zadarma:${PENDING}`)
  assert.equal(ingested[0][1].isTest, false)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(evaluated, ['call-new'])
  const remaining = await readdir(dir)
  assert.ok(!remaining.includes(`${PENDING}.pending.json`))
  assert.ok(remaining.includes('not-a-uuid.pending.json'), 'los nombres que no son uuid se ignoran, no se borran')
})

test('reconcilePendingCalls no lanza si el directorio no existe', async () => {
  const { reconcilePendingCalls } = await import('../voice/telephony/zadarma/runtime')
  const result = await reconcilePendingCalls({ directory: path.join(tmpdir(), 'vendrava-no-existe-' + Date.now()) })
  assert.deepEqual(result, { ingested: [], failed: [], linked: [], orphans: [] })
})
