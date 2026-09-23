process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/test'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import { requestedInternalVoiceTest, isLicensedFishOfficialVoice } from '../services/internalVoiceTestRequest.service'

test('immediate internal request expires, binds destination/agent/voice and rejects campaign leads or revocations', async t => {
  const oldNumber = prisma.voiceTestNumber.findFirst
  const oldConsent = prisma.contactConsent.findFirst
  t.after(() => { prisma.voiceTestNumber.findFirst = oldNumber; prisma.contactConsent.findFirst = oldConsent })
  const lead = { phone: '+34683529629', source: 'internal_test', campaignId: null as string | null }
  const request: any = { agentId: 'a', phone: lead.phone, voiceId: 'v', recording: true, evidence: 'Owner requests a recorded test now',
    requestedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), allowOutsideHours: true, catalogVoice: true }
  const consent: any = { status: 'granted', expiresAt: null, metadata: { internalVoiceTest: request } }
  prisma.voiceTestNumber.findFirst = (async () => ({ lead })) as any
  prisma.contactConsent.findFirst = (async () => consent) as any
  const check = () => requestedInternalVoiceTest('o', 'l', 'a', lead.phone, 'v')
  assert.ok(await check())
  assert.equal(await requestedInternalVoiceTest('o', 'l', 'other', lead.phone, 'v'), null)
  assert.equal(await requestedInternalVoiceTest('o', 'l', 'a', lead.phone, 'other'), null)
  lead.campaignId = 'campaign'; assert.equal(await check(), null); lead.campaignId = null
  lead.source = 'import'; assert.equal(await check(), null); lead.source = 'internal_test'
  consent.status = 'revoked'; assert.equal(await check(), null); consent.status = 'granted'
  request.expiresAt = new Date(Date.now() - 1).toISOString(); assert.equal(await check(), null)
  request.expiresAt = new Date(Date.now() + 7200000).toISOString(); assert.equal(await check(), null)
})

test('catalog exception requires a live licensed, trained, official voice; failures remain blocked', async t => {
  const oldFetch = globalThis.fetch; const key = process.env.FISH_API_KEY
  t.after(() => { globalThis.fetch = oldFetch; process.env.FISH_API_KEY = key })
  process.env.FISH_API_KEY = 'offline-test'
  const voice: any = { _id: 'a'.repeat(32), licensed: true, visibility: 'public', type: 'tts', state: 'trained', author: { _id: 'd8b0991f96b44e489422ca2ddf0bd31d' } }
  globalThis.fetch = (async () => new Response(JSON.stringify(voice))) as any
  assert.equal(await isLicensedFishOfficialVoice(voice._id), true)
  voice.licensed = false; assert.equal(await isLicensedFishOfficialVoice(voice._id), false); voice.licensed = true
  voice.author._id = 'community'; assert.equal(await isLicensedFishOfficialVoice(voice._id), false)
  globalThis.fetch = (async () => { throw new Error('offline') }) as any
  assert.equal(await isLicensedFishOfficialVoice(voice._id), false)
})
