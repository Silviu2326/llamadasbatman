import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:9/sales_offline'
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL
process.env.REDIS_ENABLED = 'false'
process.env.BACKGROUND_WORKERS_ENABLED = 'false'
process.env.DEFAULT_PHONE_COUNTRY_CODE = '34'

test('sequence claims only the current step and rechecks pauses before execution', async t => {
  const { prisma } = await import('../lib/prisma')
  const { processSalesSequenceTick } = await import('../services/salesSequence.service')
  const db = prisma as any
  const writes: any[] = []
  let mode = 'paused'
  const stub = (obj: any, key: string, fn: any) => {
    const original = obj[key]; obj[key] = fn
    t.after(() => { obj[key] = original })
  }
  stub(globalThis, 'fetch', async () => { throw new Error('Unexpected network access') })
  stub(db, '$queryRaw', async (query: any) => {
    assert.ok(query.sql.includes('s."stepIndex" = e."currentStep"'))
    assert.ok(query.sql.includes('p."status" = \'active\''))
    return [{ id: 'current', stepIndex: 0 }]
  })
  stub(db.salesSequenceStepRun, 'updateMany', async (args: any) => { writes.push(args); return { count: 1 } })
  stub(db.salesSequenceStepRun, 'findUnique', async () => ({
    id: 'current', orgId: 'org-a', programId: 'p', enrollmentId: 'e', leadId: 'l',
    status: 'processing', workerId: mode === 'lease-lost' ? 'other-worker' : 'test-worker', stepIndex: 0, stepKey: 'first',
    enrollment: { status: 'active', currentStep: 0 }, lead: {},
    program: { status: mode === 'paused' ? 'paused' : 'active', archivedAt: null, config: { steps: [{ type: 'task', title: 'Revisar auditoría' }] } },
  }))
  stub(db.task, 'findFirst', async () => ({ id: 'existing-task' }))
  stub(db.salesSequenceStepRun, 'update', async ({ data }: any) => { writes.push({ data }); return { enrollmentId: 'e', stepIndex: 0 } })
  stub(db.salesSequenceStepRun, 'findFirst', async () => null)
  stub(db.salesSequenceEnrollment, 'updateMany', async (args: any) => { writes.push(args); return { count: 1 } })
  await processSalesSequenceTick(25, 'test-worker')
  assert.equal(writes.filter(row => row.data.status === 'processing').length, 1)
  assert.equal(writes[0].where.enrollment.currentStep, 0)
  assert.equal(writes[1].data.status, 'pending', 'A paused program must release its claim without executing')
  writes.length = 0; mode = 'lease-lost'
  await processSalesSequenceTick(25, 'test-worker')
  assert.equal(writes.length, 1, 'The old worker must not complete a reclaimed step')
  writes.length = 0; mode = 'active'
  await processSalesSequenceTick(25, 'test-worker')
  assert.equal(writes.find(row => row.data.status === 'succeeded').data.output.taskId, 'existing-task')
  assert.equal(writes.at(-1).data.status, 'completed')
})

test('call dispatch ignores paused campaigns, missing agents and draft agents', async t => {
  const { prisma } = await import('../lib/prisma')
  const { processLeadCallJob } = await import('../jobs/leadCallDispatch')
  const db = prisma as any
  let campaign: any = { status: 'paused' }
  const originalFind = db.lead.findFirst, originalUpdate = db.lead.update
  db.lead.findFirst = async () => ({ id: 'l', phone: '+34612345678', attempts: 0, campaignId: 'c', campaign })
  db.lead.update = async () => { throw new Error('Must not attempt a call') }
  t.after(() => { db.lead.findFirst = originalFind; db.lead.update = originalUpdate })
  await processLeadCallJob({ orgId: 'org-a', leadId: 'l' })
  campaign = { status: 'active', agent: null }
  await processLeadCallJob({ orgId: 'org-a', leadId: 'l' })
  campaign.agent = { orgId: 'org-a', isActive: true, lifecycleStatus: 'draft', voiceId: 'v', phoneNumber: '+34912345678', systemPrompt: 'Asistente virtual' }
  await processLeadCallJob({ orgId: 'org-a', leadId: 'l' })
})

test('Spanish numbers, hours, explicit voice permission and WhatsApp policy', async () => {
  const { normalizeE164, withinLegalHours, nextCallWindow, detectVoiceConsentReply } = await import('../voice/compliance')
  const { whatsappWindowOpen, whatsappOptOut, canAutomaticallyReply } = await import('../services/whatsappPolicy')
  assert.equal(normalizeE164('612 345 678'), '+34612345678')
  assert.equal(normalizeE164('0034 912 345 678'), '+34912345678')
  assert.equal(normalizeE164('+14155552671'), '+14155552671')
  assert.equal(normalizeE164('123456789'), null)
  assert.equal(withinLegalHours('+34612345678', new Date('2026-09-15T08:00:00Z')), true)
  assert.equal(withinLegalHours('+34612345678', new Date('2026-09-15T19:00:00Z')), false)
  assert.equal(withinLegalHours('+34612345678', new Date('2026-09-19T10:00:00Z')), false)
  assert.equal(withinLegalHours('+34612345678', new Date(), 'bad/timezone'), false)
  assert.equal(nextCallWindow('+34612345678', new Date('2026-09-18T19:00:00Z'))?.toISOString(), '2026-09-21T07:00:00.000Z')
  assert.equal(detectVoiceConsentReply('sí'), false)
  assert.equal(detectVoiceConsentReply('vale, envíame la auditoría'), false)
  assert.equal(detectVoiceConsentReply('sí', true), true)
  assert.equal(detectVoiceConsentReply('no me llames', true), false)
  assert.equal(detectVoiceConsentReply('llámame con tu asistente de IA'), true)
  assert.equal(whatsappWindowOpen(new Date(Date.now() + 1000)), false)
  assert.equal(whatsappWindowOpen(new Date(Date.now() - 86_400_000)), false)
  assert.equal(whatsappWindowOpen(new Date(Date.now() - 1000)), true)
  assert.equal(whatsappOptOut('BAJA'), true)
  assert.equal(whatsappOptOut('Por favor, no me escribas más'), true)
  assert.equal(whatsappOptOut('Me interesa bajar el coste'), false)
  assert.equal(canAutomaticallyReply({ status: 'assigned', assignedUserId: 'seller' }), false)
})

test('audit context does not turn unverified findings into facts', async () => {
  const { salesAuditContext } = await import('../services/salesAuditContext')
  const result = salesAuditContext({ salesAudit: { summary: 'Informe externo', findings: [{ title: 'Supuesto problema', status: 'fail' }, { title: '404', status: 'fail', evidence: 'HTTP 404 en /producto' }] } })
  assert.equal(result.available, true)
  assert.equal(result.findings[0].status, 'needs_review')
  assert.equal(result.findings[1].status, 'verified')
  assert.equal(salesAuditContext({}).available, false)
})

test('WhatsApp journey: persistence, isolation, duplicate protection, consent and audio', async t => {
  const { prisma } = await import('../lib/prisma')
  const { sendWhatsApp, handleInbound, processWhatsAppReply, whatsappRuntime } = await import('../services/whatsapp.service')
  const { hasContactConsent } = await import('../services/contactConsent.service')
  const db = prisma as any
  const rows: any[] = [], events = new Set<string>(), outbox: any[] = [], enrollments: any[] = [], steps: any[] = []
  const conversation: any = { id: 'thread', orgId: 'org-a', leadId: 'lead-a', status: 'open', assignedUserId: null, metadata: {}, lastInboundAt: new Date() }
  let permission: any = { status: 'granted', expiresAt: null }
  let optedOut = false, providerCalls = 0, uncertain = false, grants = 0, generated = 0, media: any
  const stub = (obj: any, key: string, fn: any) => {
    const original = obj[key]; obj[key] = fn
    t.after(() => { obj[key] = original })
  }
  stub(globalThis, 'fetch', async () => { throw new Error('Unexpected network access') })
  stub(db, '$transaction', async (fn: any) => fn(db))
  stub(db.lead, 'findFirst', async ({ where }: any) => where.orgId === 'org-a' && (!where.id || where.id === 'lead-a') ? { id: 'lead-a', orgId: 'org-a', phone: '+34612345678' } : null)
  stub(db.conversation, 'findFirst', async ({ where }: any) => where.orgId === 'org-a' && (!where.id || where.id === 'thread') ? { ...conversation } : null)
  stub(db.conversation, 'update', async ({ data }: any) => Object.assign(conversation, data))
  stub(db.contactConsent, 'findFirst', async ({ where }: any) => { assert.equal(where.orgId, 'org-a'); return permission })
  stub(db.contactConsent, 'upsert', async () => { grants++; return {} })
  stub(db.contactConsent, 'updateMany', async () => { permission = { status: 'revoked' }; return { count: 1 } })
  stub(db.optOut, 'findUnique', async () => optedOut ? { reason: 'stop' } : null)
  stub(db.optOut, 'upsert', async () => { optedOut = true; return {} })
  stub(db.agencyClient, 'findUnique', async () => null)
  stub(db.channelIdentity, 'findFirst', async () => ({ orgId: 'org-a' }))
  stub(db.channelIdentity, 'upsert', async () => ({}))
  stub(db.webhookEvent, 'create', async ({ data }: any) => {
    if (events.has(data.externalEventId)) throw Object.assign(new Error('duplicate'), { code: 'P2002' })
    events.add(data.externalEventId); return data
  })
  stub(db.outboxEvent, 'create', async ({ data }: any) => { outbox.push(data); return data })
  stub(db.salesSequenceEnrollment, 'updateMany', async (args: any) => { enrollments.push(args); return { count: 1 } })
  stub(db.salesSequenceStepRun, 'updateMany', async (args: any) => { steps.push(args); return { count: 1 } })
  stub(db.message, 'create', async ({ data }: any) => {
    if (data.externalEventId && rows.some(row => row.externalEventId === data.externalEventId)) throw Object.assign(new Error('duplicate'), { code: 'P2002' })
    const row = { id: `m-${rows.length}`, createdAt: new Date(), ...data }; rows.push(row); return row
  })
  stub(db.message, 'update', async ({ where, data }: any) => Object.assign(rows.find(row => row.id === where.id), data))
  stub(db.message, 'findUnique', async ({ where }: any) => rows.find(row => row.orgId === where.orgId_externalEventId.orgId && row.externalEventId === where.orgId_externalEventId.externalEventId) ?? null)
  stub(db.message, 'findFirst', async ({ where }: any) => {
    const matches = rows.filter(row => (!where.orgId || row.orgId === where.orgId) && (!where.conversationId || row.conversationId === where.conversationId) && (!where.providerMessageId || row.providerMessageId === where.providerMessageId) && (!where.direction || row.direction === where.direction) && (!where.channel || row.channel === where.channel) && (!where.createdAt?.gt || row.createdAt > where.createdAt.gt) && (!where.createdAt?.lt || row.createdAt < where.createdAt.lt) && (!where.status?.in || where.status.in.includes(row.status)))
    return matches.at(-1) ?? null
  })
  stub(db.deliveryAttempt, 'create', async () => ({}))
  stub(db.asset, 'findFirst', async ({ where }: any) => where.id === 'audio-a' && where.orgId === 'org-a' ? { mimeType: 'audio/mpeg', bytes: 1000n, storageKey: 'org/org-a/audio.mp3' } : null)
  stub(whatsappRuntime, 'config', async () => ({ whatsappFrom: '+34912345678', webhookBaseUrl: 'https://example.com' }))
  stub(whatsappRuntime, 'client', () => ({ messages: { create: async (input: any) => { providerCalls++; media = input.mediaUrl; if (uncertain) throw new Error('connection lost'); return { sid: `SM-${providerCalls}`, status: 'sent' } } } }))
  stub(whatsappRuntime, 'reply', async () => { generated++; return { text: 'Soy el asistente virtual con IA. ¿Te explico el informe?' } })
  stub(whatsappRuntime, 'presign', async () => 'https://storage.example.com/audio.mp3?signature=test')
  const input = { orgId: 'org-a', leadId: 'lead-a', conversationId: 'thread', to: '+34612345678', body: 'Hola' }
  await assert.rejects(sendWhatsApp({ ...input, orgId: 'org-b' }), /LEAD_MISMATCH/)
  await assert.rejects(sendWhatsApp({ ...input, to: '+34699999999' }), /LEAD_MISMATCH/)
  await assert.rejects(sendWhatsApp({ ...input, conversationId: 'foreign-thread' }), /CONVERSATION_MISMATCH/)
  assert.equal(providerCalls, 0)
  permission = { status: 'granted', expiresAt: new Date(Date.now() - 1000) }
  assert.equal(await hasContactConsent('org-a', 'lead-a', 'whatsapp'), false)
  await assert.rejects(sendWhatsApp({ ...input, contentSid: 'HX-template' }), /CONSENT_REQUIRED/)
  permission = { status: 'granted', expiresAt: null }
  conversation.lastInboundAt = null
  await assert.rejects(sendWhatsApp(input), /24 horas/)
  await assert.rejects(sendWhatsApp({ ...input, body: undefined, audioAssetId: 'audio-a' }), /24 horas/)
  conversation.lastInboundAt = new Date()
  await sendWhatsApp({ ...input, idempotencyKey: 'one' })
  await sendWhatsApp({ ...input, idempotencyKey: 'one' })
  assert.equal(providerCalls, 1)
  uncertain = true
  await assert.rejects(sendWhatsApp({ ...input, idempotencyKey: 'uncertain' }), /connection lost/)
  await assert.rejects(sendWhatsApp({ ...input, idempotencyKey: 'uncertain' }), /REQUIRES_REVIEW/)
  assert.equal(providerCalls, 2)
  uncertain = false
  await assert.rejects(sendWhatsApp({ ...input, body: undefined, audioAssetId: 'foreign-audio' }), /AUDIO_INVALID/)
  await sendWhatsApp({ ...input, body: undefined, audioAssetId: 'audio-a' })
  assert.equal(media.length, 1)
  assert.equal(rows.at(-1).contentType, 'audio')
  const inbound = { From: 'whatsapp:+34612345678', To: 'whatsapp:+34912345678', MessageSid: 'SM-in', Body: 'sí', NumMedia: '0' }
  await handleInbound(inbound)
  assert.equal(grants, 0, 'A yes to an audit must not authorize calls')
  assert.equal(generated, 0, 'The webhook must not wait for AI')
  assert.equal(enrollments.at(-1).data.stopReason, 'reply')
  assert.equal(steps.at(-1).data.status, 'blocked')
  assert.ok(outbox.some(event => event.topic === 'whatsapp.reply.requested'))
  assert.equal((await handleInbound(inbound)).duplicate, true)
  await processWhatsAppReply('org-a', 'thread', 'SM-in')
  assert.equal(generated, 1)
  conversation.status = 'assigned'; conversation.assignedUserId = 'human'
  await processWhatsAppReply('org-a', 'thread', 'SM-in')
  assert.equal(generated, 1)
  await handleInbound({ ...inbound, MessageSid: 'SM-audio', Body: '', NumMedia: '1', MediaContentType0: 'audio/ogg' })
  assert.equal(conversation.status, 'needs_human', 'Incoming audio needs human attention until transcription is connected')
  assert.equal(rows.at(-1).contentType, 'audio')
  await handleInbound({ ...inbound, MessageSid: 'SM-stop', Body: 'BAJA' })
  assert.equal(conversation.status, 'closed')
  assert.equal(permission.status, 'revoked')
  await assert.rejects(sendWhatsApp(input), /OPTED_OUT/)
})
