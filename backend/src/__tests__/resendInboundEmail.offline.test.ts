import assert from 'node:assert/strict'
import test from 'node:test'
import { createHmac } from 'node:crypto'

process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:9/resend_webhook_offline'
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL
process.env.REDIS_ENABLED = 'false'
process.env.BACKGROUND_WORKERS_ENABLED = 'false'

function signed(secret: string, id: string, timestamp: string, rawBody: string) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  const signature = createHmac('sha256', key).update(id + '.' + timestamp + '.' + rawBody).digest('base64')
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + signature }
}

test('Resend signing secret validates raw webhook bytes and rejects stale or altered requests', async () => {
  const { verifyResendWebhookSignature } = await import('../services/resendInboundEmail.service')
  const secret = 'whsec_' + Buffer.from('offline-signing-secret').toString('base64')
  const id = 'evt_offline_1'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const rawBody = JSON.stringify({ type: 'email.received', data: { email_id: 'received_1' } })
  const headers = signed(secret, id, timestamp, rawBody)
  assert.equal(verifyResendWebhookSignature(secret, rawBody, headers), true)
  assert.equal(verifyResendWebhookSignature(secret, rawBody + ' ', headers), false, 'the exact raw request body is signed')
  assert.equal(verifyResendWebhookSignature(secret, rawBody, { ...headers, 'svix-timestamp': String(Number(timestamp) - 600) }), false)
  assert.equal(verifyResendWebhookSignature('whsec_' + Buffer.from('different-secret').toString('base64'), rawBody, headers), false)
})

test('Resend signature is scoped by selected organization secret; unauthenticated data cannot reach the body fetch', async () => {
  const { handleResendReceivedWebhook } = await import('../services/resendInboundEmail.service')
  const secret = 'whsec_' + Buffer.from('org-a-secret').toString('base64')
  const rawBody = JSON.stringify({ type: 'email.received', data: { email_id: 'received_2' } })
  const headers = signed(secret, 'evt-org-a', String(Math.floor(Date.now() / 1000)), rawBody)
  let fetched = false
  await assert.rejects(handleResendReceivedWebhook({
    orgId: 'org-b', rawBody, headers,
    body: JSON.parse(rawBody),
    resolveCredential: async (orgId: string) => ({
      secrets: { webhookSigningSecret: 'whsec_' + Buffer.from(orgId + '-secret').toString('base64'), apiKey: 'offline-key' },
    }),
    fetcher: async () => { fetched = true; throw new Error('must not fetch') },
  }), /RESEND_SIGNATURE_INVALID/)
  assert.equal(fetched, false)
})
test('Resend delivery events normalize into Vendrava email events', async () => {
  const { normalizeResendTrackedEvent } = await import('../services/resendInboundEmail.service')
  assert.equal(normalizeResendTrackedEvent({ type: 'email.sent' })?.type, 'sent')
  assert.equal(normalizeResendTrackedEvent({ type: 'email.delivered' })?.type, 'delivered')
  assert.equal(normalizeResendTrackedEvent({ type: 'email.opened' })?.type, 'open')
  assert.equal(normalizeResendTrackedEvent({ type: 'email.clicked', data: { click: { link: 'https://example.com' } } })?.type, 'click')
  assert.equal(normalizeResendTrackedEvent({ type: 'email.bounced' })?.type, 'hard_bounce')
  assert.equal(normalizeResendTrackedEvent({ type: 'email.complained' })?.type, 'complaint')
  assert.equal(normalizeResendTrackedEvent({ type: 'contact.updated', data: { unsubscribed: true } })?.type, 'unsubscribe')
  assert.equal(normalizeResendTrackedEvent({ type: 'contact.updated', data: { unsubscribed: false } }), null)
})

test('Resend delivered event persists once and transitions only the matching org delivery', async t => {
  const { prisma } = await import('../lib/prisma')
  const { persistResendTrackingEvent } = await import('../services/resendInboundEmail.service')
  const db = prisma as any
  const savedEvents = new Set<string>()
  const writes: any[] = []
  const stub = (obj: any, key: string, fn: any) => {
    const old = obj[key]; obj[key] = fn
    t.after(() => { obj[key] = old })
  }
  stub(db.emailDelivery, 'findFirst', async ({ where }: any) => where.orgId === 'org-r' && where.providerMessageId === 're_msg_1'
    ? { id: 'delivery-1', leadId: 'lead-1', toAddress: 'ada@example.com', status: 'accepted' } : null)
  stub(db.emailEvent, 'create', async ({ data }: any) => {
    writes.push(data)
    if (savedEvents.has(data.provider + ':' + data.externalEventId)) throw Object.assign(new Error('unique'), { code: 'P2002' })
    savedEvents.add(data.provider + ':' + data.externalEventId)
    return { id: 'event-1' }
  })
  stub(db.emailDelivery, 'updateMany', async (args: any) => ({ count: args.where.id === 'delivery-1' ? 1 : 0 }))
  const payload = { type: 'email.delivered', created_at: '2026-09-23T12:00:00.000Z', data: { email_id: 're_msg_1', to: ['ada@example.com'] } }
  const first = await persistResendTrackingEvent('org-r', 'svix-event-1', payload)
  const retry = await persistResendTrackingEvent('org-r', 'svix-event-1', payload)
  assert.equal(first.duplicate, false)
  assert.equal(retry.duplicate, true)
  assert.equal(writes.length, 2)
  assert.equal(writes[0].deliveryId, 'delivery-1')
  assert.equal(writes[0].orgId, 'org-r')
  assert.equal(writes[0].provider, 'resend')
  assert.equal(writes[0].type, 'delivered')
})