// Elegibilidad visible de un lead: mismas reglas que jobs/leadCallDispatch + canCall.
process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/offline'
import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateLeadCallability, readLastCallBlock } from '../services/leadCallability'

// Martes 10:00 en Madrid: dentro del horario legal (9-20, laborable).
const NOW = new Date('2026-09-22T08:00:00Z')
const SATURDAY = new Date('2026-09-26T08:00:00Z')

const lead = (over: Record<string, unknown> = {}) => ({ id: 'l1', phone: '+34600111222', status: 'new', attempts: 0, tags: [], customFields: null, campaignId: 'c1', ...over })
const campaign = (over: Record<string, unknown> = {}) => ({ id: 'c1', status: 'active', agentId: 'a1', ...over })
const agent = (over: Record<string, unknown> = {}) => ({ id: 'a1', orgId: 'org', isActive: true, lifecycleStatus: 'active', voiceId: 'v', systemPrompt: 'p', phoneNumber: '+34919931802', ...over })
const ctx = (over: Record<string, unknown> = {}) => ({ orgId: 'org', voiceConsentGranted: true, optedOut: false, now: NOW, ...over })
const codes = (result: { reasons: Array<{ code: string }> }) => result.reasons.map(r => r.code)

test('lead completo con campaña activa, agente publicado y consentimiento → elegible', () => {
  const result = evaluateLeadCallability(lead(), campaign(), agent(), ctx())
  assert.equal(result.eligible, true)
  assert.deepEqual(result.reasons, [])
  assert.equal(result.phone, '+34600111222')
})

test('teléfono nacional se normaliza con el país por defecto (34) y sigue exigiendo consentimiento', () => {
  const ok = evaluateLeadCallability(lead({ phone: '600 111 222' }), campaign(), agent(), ctx())
  assert.equal(ok.phone, '+34600111222')
  assert.equal(ok.eligible, true)
  const noConsent = evaluateLeadCallability(lead({ phone: '600 111 222' }), campaign(), agent(), ctx({ voiceConsentGranted: false }))
  assert.deepEqual(codes(noConsent), ['missing_voice_consent'])
})

test('sin teléfono, teléfono inválido y sin campaña', () => {
  assert.deepEqual(codes(evaluateLeadCallability(lead({ phone: null }), campaign(), agent(), ctx())), ['missing_phone'])
  assert.deepEqual(codes(evaluateLeadCallability(lead({ phone: '12' }), campaign(), agent(), ctx())), ['invalid_phone'])
  assert.deepEqual(codes(evaluateLeadCallability(lead({ campaignId: null }), null, null, ctx())), ['lead_without_campaign'])
})

test('campaña no activa y agente ausente / en borrador / incompleto / de otra organización', () => {
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign({ status: 'paused' }), agent(), ctx())), ['campaign_not_active'])
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), null, ctx())), ['agent_missing'])
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), agent({ orgId: 'otra' }), ctx())), ['agent_missing'])
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), agent({ lifecycleStatus: 'draft' }), ctx())), ['agent_not_published'])
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), agent({ isActive: false }), ctx())), ['agent_not_published'])
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), agent({ voiceId: null }), ctx())), ['agent_incomplete'])
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), agent({ phoneNumber: '' }), ctx())), ['agent_incomplete'])
})

test('opt-out (lista o etiqueta), intentos agotados, cuota y horario', () => {
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), agent(), ctx({ optedOut: true }))), ['optout'])
  assert.deepEqual(codes(evaluateLeadCallability(lead({ tags: ['opt_out'] }), campaign(), agent(), ctx())), ['optout'])
  assert.deepEqual(codes(evaluateLeadCallability(lead({ attempts: 3 }), campaign(), agent(), ctx())), ['max_attempts_reached'])
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), agent(), ctx({ quotaExceeded: true }))), ['quota_exceeded'])
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), agent(), ctx({ now: SATURDAY }))), ['outside_hours'])
})

test('un número no español no exige consentimiento salvo REQUIRE_VOICE_CONSENT', () => {
  const mx = lead({ phone: '+525512345678' })
  const mxCtx = ctx({ voiceConsentGranted: false, now: new Date('2026-09-22T17:00:00Z') }) // 11:00 CDMX
  assert.equal(evaluateLeadCallability(mx, campaign(), agent(), mxCtx).eligible, true)
  assert.deepEqual(codes(evaluateLeadCallability(mx, campaign(), agent(), { ...mxCtx, requireVoiceConsent: true })), ['missing_voice_consent'])
})

test('acumula todos los motivos y muestra lastCallBlock del dispatch', () => {
  const result = evaluateLeadCallability(
    lead({ phone: null, attempts: 5, status: 'contacted', customFields: { lastCallBlock: { reason: 'missing_voice_consent', at: '2026-09-22T07:00:00Z' } } }),
    campaign({ status: 'draft' }), agent({ lifecycleStatus: 'draft' }), ctx({ optedOut: true }),
  )
  assert.equal(result.eligible, false)
  assert.deepEqual(codes(result), ['missing_phone', 'campaign_not_active', 'agent_not_published', 'optout', 'max_attempts_reached'])
  assert.ok(result.reasons.every(r => r.message.length > 10))
  assert.deepEqual(result.lastCallBlock, { reason: 'missing_voice_consent', at: '2026-09-22T07:00:00Z' })
  assert.equal(result.warnings.length, 1)
  assert.equal(readLastCallBlock({ lastCallBlock: { reason: '' } }), null)
  assert.equal(readLastCallBlock(null), null)
})

test('consentimiento de voz del agente caducado y límites operativos, como en el dispatch', () => {
  assert.deepEqual(codes(evaluateLeadCallability(lead(), campaign(), agent(), ctx({ agentVoiceConsentActive: false }))), ['agent_voice_consent_missing'])
  assert.equal(evaluateLeadCallability(lead(), campaign(), agent(), ctx({ agentVoiceConsentActive: true })).eligible, true)
  // Sin comprobar (undefined) no se inventa un bloqueo.
  assert.equal(evaluateLeadCallability(lead(), campaign(), agent(), ctx()).eligible, true)
  const limited = agent({ settings: { operationalLimits: { maxCallsPerDay: 1, timezone: 'Europe/Madrid' } } })
  const warned = evaluateLeadCallability(lead(), campaign(), limited, ctx({ agentCallsToday: 1 }))
  assert.equal(warned.eligible, true, 'los límites del agente no bloquean: el trabajo espera a la siguiente ventana')
  assert.deepEqual(warned.warnings.map(w => w.code), ['agent_limits'])
  assert.match(warned.warnings[0].message, /daily_limit/)
  assert.deepEqual(evaluateLeadCallability(lead(), campaign(), limited, ctx({ agentCallsToday: 0 })).warnings, [])
})

test('lastCallBlock conserva el detalle (código de pasarela) cuando existe', () => {
  assert.deepEqual(readLastCallBlock({ lastCallBlock: { reason: 'gateway_rejected', at: '2026-09-22T07:00:00Z', detail: 'ZADARMA_PHONE_MISMATCH' } }),
    { reason: 'gateway_rejected', at: '2026-09-22T07:00:00Z', detail: 'ZADARMA_PHONE_MISMATCH' })
  assert.deepEqual(readLastCallBlock({ lastCallBlock: { reason: 'optout', at: null, detail: '' } }), { reason: 'optout', at: null })
})
