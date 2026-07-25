import { WebSocket } from 'ws'
import { AudioBridge } from '../audio/bridge'
import { rmsLevel, preprocessInbound } from '../audio/dsp'
import { NoiseClassifier } from '../audio/noiseClassifier'
import { detectOptout, registerOptout, detectTransferRequest } from '../compliance'
import { createCallContext, CallContext } from '../intelligence/conversation/callContext'
import { loadAgentConfig } from '../agentConfig'
import { createVoiceSession } from '../engine/factory'
import type { VoiceSession } from '../engine/voiceSession'
import { transferCall } from './twilioClient'
import { getTwilioIntegrationConfig } from '../../services/twilioIntegration.service'
import { emitToOrg } from '../../websockets/index'
import { ingestCall as persistCall } from '../../services/calls.service'
import { prisma } from '../../lib/prisma'
import type { MediaStreamClaims } from './streamAuth'
import { buildVoiceRuntimeSnapshot, VoiceTrace } from '../observability/voiceTrace'
import { TurnManager } from '../turn/turnManager'
import { decideNextAction } from '../intelligence/salesBrain'
import { classifyAmd } from './amd'
import { evaluateVoiceCall } from '../evaluation/callJudgeService'
import { recordVoiceExperimentOutcome, resolveVoiceExperiment } from '../experiments/voiceExperiment'

const SENTIMENT_MAP: Record<string, { sentiment: string; score: number }> = {
  interesado: { sentiment: 'positive', score: 0.8 },
  neutro: { sentiment: 'neutral', score: 0.5 },
  frustrado: { sentiment: 'negative', score: 0.2 },
  molesto: { sentiment: 'negative', score: 0.1 },
}

const OUTCOME_MAP: Record<string, string> = {
  demo_agendada: 'meeting_scheduled',
  transferido: 'callback_requested',
  rechazado: 'not_interested',
  optout: 'not_interested',
  en_curso: 'none',
}

const activeCallSids = new Set<string>()
const MAX_MEDIA_MESSAGE_BYTES = 256 * 1024
const MAX_MEDIA_MESSAGES_PER_SECOND = 500
const MAX_MEDIA_BYTES_PER_SECOND = 2 * 1024 * 1024
const START_DEADLINE_MS = 15_000
const MAX_CALL_DURATION_MS = 4 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function rawToBuffer(raw: Buffer | ArrayBuffer | Buffer[] | string): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  if (typeof raw === 'string') return Buffer.from(raw)
  if (Array.isArray(raw)) return Buffer.concat(raw)
  return Buffer.from(raw)
}

function closeUnsafeConnection(connection: WebSocket, reason: string): void {
  console.warn('[MEDIA] Closing untrusted stream: %s', reason)
  if (connection.readyState === WebSocket.OPEN || connection.readyState === WebSocket.CONNECTING) {
    connection.close(1008, 'Unauthorized stream')
  }
}

function createRateGuard() {
  let windowStartedAt = Date.now()
  let messageCount = 0
  let byteCount = 0

  return (size: number): boolean => {
    const now = Date.now()
    if (now - windowStartedAt >= 1000) {
      windowStartedAt = now
      messageCount = 0
      byteCount = 0
    }
    messageCount += 1
    byteCount += size
    return messageCount <= MAX_MEDIA_MESSAGES_PER_SECOND && byteCount <= MAX_MEDIA_BYTES_PER_SECOND
  }
}

async function trustedResourcesExist(claims: MediaStreamClaims): Promise<boolean> {
  const checks: Array<Promise<unknown>> = []
  if (claims.agentId) {
    checks.push(prisma.agent.findFirst({
      where: { id: claims.agentId, orgId: claims.orgId, isActive: true },
      select: { id: true },
    }))
  }
  if (claims.leadId) {
    checks.push(prisma.lead.findFirst({
      where: { id: claims.leadId, orgId: claims.orgId },
      select: { id: true },
    }))
  }
  if (claims.campaignId) {
    checks.push(prisma.campaign.findFirst({
      where: { id: claims.campaignId, orgId: claims.orgId },
      select: { id: true },
    }))
  }

  const matches = await Promise.all(checks)
  return matches.every(Boolean)
}

async function ingestCall(ctx: CallContext, durationS: number): Promise<{ id: string } | null> {
  if (!ctx.orgId) return null
  const { sentiment, score } = SENTIMENT_MAP[ctx.emotion] ?? { sentiment: 'neutral', score: 0.5 }
  const transcript = ctx.transcript.map(t => `${t.role}: ${t.text}`).join('\n')
  const outcome = OUTCOME_MAP[ctx.outcome] ?? 'none'

  try {
    if (!ctx.leadId) {
      console.warn('[MEDIA] Call %s has no leadId; skipping CRM ingestion', ctx.callSid)
      return null
    }
    const call = await persistCall(ctx.orgId, {
      externalCallId: ctx.callSid,
      leadId: ctx.leadId,
      agentId: ctx.agentId || undefined,
      campaignId: ctx.campaignId || undefined,
      duration: durationS,
      transcript,
      sentiment,
      sentimentScore: score,
      outcome,
      contactClassification: typeof ctx.metadata.contactClassification === 'string' ? ctx.metadata.contactClassification : undefined,
      contactClassificationConfidence: typeof ctx.metadata.contactClassificationConfidence === 'number' ? ctx.metadata.contactClassificationConfidence : undefined,
      amdResult: ctx.metadata.amdResult,
      startedAt: new Date(ctx.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
    })
    emitToOrg(ctx.orgId, 'call:completed', call)
    return call
  } catch (e) {
    console.warn('[MEDIA] Error ingesting call:', e)
    return null
  }
}

/**
 * The caller has already verified the short-lived capability during upgrade.
 * This handler intentionally never derives tenant context from the Twilio
 * `start.customParameters` payload, because that payload is client-controlled.
 */
export async function handleMediaStream(connection: WebSocket, trusted?: MediaStreamClaims): Promise<void> {
  if (!trusted) {
    closeUnsafeConnection(connection, 'missing verified media capability')
    return
  }
  const claims = trusted

  let streamSid: string | null = null
  let ctx: CallContext | null = null
  let session: VoiceSession | null = null
  let started = false
  let ownsCallSid = false
  let sessionDeadline: NodeJS.Timeout | null = null
  const bridge = new AudioBridge()
  const noiseCLF = new NoiseClassifier()
  const allowMessage = createRateGuard()
  let trace: VoiceTrace | null = null
  let assistantAudioActive = false
  let inputSpeaking = false
  let lastUserTurnFinishedAt = 0

  const startDeadline = setTimeout(() => {
    if (!started) closeUnsafeConnection(connection, 'start event deadline exceeded')
  }, START_DEADLINE_MS)

  const turnManager = new TurnManager({
    threshold: 0.04,
    requiredFrames: 4,
    minimumSpeechMs: 200,
    debounceMs: 500,
  })

  async function sendToTwilio(audio: Buffer): Promise<void> {
    if (!streamSid || connection.readyState !== WebSocket.OPEN) return
    if (!assistantAudioActive) {
      assistantAudioActive = true
      trace?.record({ type: 'audio.output_started', role: 'assistant', payload: { bytes: audio.length }, component: 'mediaStream' })
      if (lastUserTurnFinishedAt > 0) {
        trace?.metric('turn.time_to_first_audio_ms', Date.now() - lastUserTurnFinishedAt, 'ms')
        lastUserTurnFinishedAt = 0
      }
    }
    for (const frame of bridge.geminiToTwilioFrames(audio)) {
      connection.send(JSON.stringify({
        event: 'media',
        streamSid,
        media: { payload: frame.toString('base64') },
      }))
    }
  }

  async function onInterrupt(): Promise<void> {
    bridge.clearOutput()
    assistantAudioActive = false
    trace?.record({ type: 'barge_in.detected', role: 'user', payload: { source: 'turn_manager' }, component: 'mediaStream' })
    if (streamSid && connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ event: 'clear', streamSid }))
  }

  async function requestTransfer(callCtx: CallContext, reason: string): Promise<void> {
    callCtx.transferRequested = true
    callCtx.transferReason = reason
    callCtx.outcome = 'transferido'
    const summary = {
      callSid: callCtx.callSid,
      leadId: callCtx.leadId,
      contact: callCtx.prospectState.evidence.find(item => item.source === 'crm')?.text ?? callCtx.businessName,
      need: callCtx.prospectState.needs.at(-1) ?? null,
      objection: callCtx.prospectState.objections.find(item => !item.resolved)?.label ?? null,
      reason,
      nextBestAction: callCtx.prospectState.nextBestAction,
      transcript: callCtx.transcript.slice(-6),
    }
    trace?.record({ type: 'transfer.requested', role: 'system', payload: summary, component: 'transfer' })
    emitToOrg(callCtx.orgId, 'call:transfer_requested', summary)
    const twilioConfig = await getTwilioIntegrationConfig(callCtx.orgId).catch(() => null)
    if (twilioConfig?.humanTransferNumber) {
      try {
        await transferCall(callCtx.callSid, twilioConfig.humanTransferNumber, callCtx.orgId)
        trace?.record({ type: 'transfer.completed', role: 'system', payload: { reason }, component: 'transfer' })
      } catch (error) {
        trace?.record({ type: 'runtime.warning', role: 'system', payload: { code: 'TRANSFER_FAILED', reason }, component: 'transfer' })
        console.warn('[MEDIA] transfer failed:', error)
      }
    }
  }

  async function onTranscript(role: string, text: string, meta?: Record<string, unknown>): Promise<void> {
    if (!ctx) return
    if (role === 'prospecto_partial') {
      trace?.record({ type: 'stt.partial', role: 'user', payload: { text: text.slice(0, 1000), ...meta }, component: 'mediaStream' })
      return
    }
    trace?.record({
      type: role === 'prospecto' ? 'stt.final' : 'transcript.final',
      role: role === 'prospecto' ? 'user' : 'assistant',
      payload: { role, text: text.slice(0, 4000), ...meta },
      component: 'mediaStream',
    })
    if (role === 'prospecto') {
      assistantAudioActive = false
      lastUserTurnFinishedAt = Date.now()
      trace?.record({ type: 'turn.user_finished', role: 'user', payload: { textLength: text.length }, component: 'mediaStream' })
      const decision = decideNextAction(ctx.prospectState, text)
      ctx.prospectState = decision.state
      trace?.record({
        type: 'sales_action.selected',
        role: 'system',
        payload: { action: decision.action, stage: decision.state.stage, signal: decision.signal ?? null },
        component: 'salesBrain',
        componentVer: process.env.VOICE_SALES_BRAIN_VERSION?.trim() || '1',
      })
      trace?.record({
        type: 'prospect_state.updated',
        role: 'system',
        payload: decision.state as unknown as Record<string, unknown>,
        component: 'salesBrain',
      })
      if (ctx.transcript.filter(item => item.role === 'prospecto').length === 0) {
        const opening = classifyAmd({ answeredBy: 'human', speechResult: text })
        ctx.metadata.contactClassification = opening.classification
        ctx.metadata.contactClassificationConfidence = opening.confidence
        ctx.metadata.amdResult = { ...opening, source: 'opening_speech' }
        trace?.record({ type: 'contact.classified', role: 'system', payload: opening, component: 'amd', provider: 'opening_speech' })
      }
    }
    ctx.turns++
    ctx.transcript.push({ role, text })

    if (role === 'prospecto') {
      if (detectOptout(text)) {
        ctx.outcome = 'optout'
        trace?.record({ type: 'compliance.opt_out', role: 'user', payload: { text: text.slice(0, 500) }, component: 'compliance' })
        await registerOptout(ctx.orgId, ctx.phone, 'detected_in_call')
      } else if (!ctx.transferRequested && detectTransferRequest(text)) {
        await requestTransfer(ctx, 'solicitado_explicitamente')
      } else if (!ctx.transferRequested) {
        const frustrated = ['molesto', 'frustrado', 'agitado'].includes(ctx.emotion)
        ctx.frustration = frustrated ? ctx.frustration + 1 : 0
        if (ctx.frustration >= 3) await requestTransfer(ctx, 'frustracion_alta')
      }
    }
  }

  async function checkBargeIn(rms: number): Promise<void> {
    const decision = turnManager.observeRms(rms)
    if (decision?.state === 'USER_INTERRUPTING') {
      inputSpeaking = true
      trace?.record({ type: 'turn.interruption', role: 'user', payload: { source: 'rms', rms }, component: 'turnManager' })
      await onInterrupt()
    } else if (decision?.state === 'LISTENING') {
      inputSpeaking = false
    }
  }

  async function startSession(data: Record<string, unknown>): Promise<void> {
    if (started) return closeUnsafeConnection(connection, 'duplicate start event')
    const start = data.start
    if (!isRecord(start) || start.callSid !== claims.callSid || typeof start.streamSid !== 'string' || !start.streamSid) {
      return closeUnsafeConnection(connection, 'stream identity does not match capability')
    }

    try {
      if (!(await trustedResourcesExist(claims))) {
        return closeUnsafeConnection(connection, 'tenant-owned stream resource not found')
      }
    } catch (error) {
      console.warn('[MEDIA] Failed to validate stream resources:', error)
      return closeUnsafeConnection(connection, 'resource validation failure')
    }

    if (activeCallSids.has(claims.callSid)) {
      return closeUnsafeConnection(connection, 'duplicate call stream')
    }
    activeCallSids.add(claims.callSid)
    ownsCallSid = true
    started = true
    clearTimeout(startDeadline)
    streamSid = start.streamSid

    const agentConfig = claims.agentId ? await loadAgentConfig(claims.agentId, claims.orgId).catch(() => null) : null
    ctx = createCallContext({
      callSid: claims.callSid,
      phone: claims.phone || 'unknown',
      businessType: claims.businessType || 'generico',
      businessName: claims.businessName,
      orgId: claims.orgId,
      campaignId: claims.campaignId,
      agentId: claims.agentId,
      leadId: claims.leadId,
      agentConfig,
    })

    const systemPrompt = agentConfig?.playbook?.scripts?.base_prompt as string ?? ''
    const experiment = await resolveVoiceExperiment(ctx.orgId, ctx.leadId, ctx.campaignId).catch(error => {
      console.warn('[VOICE_EXPERIMENT] assignment failed:', error)
      return null
    })
    trace = new VoiceTrace(ctx, buildVoiceRuntimeSnapshot(ctx, systemPrompt, experiment))
    if (experiment) ctx.metadata.voiceExperiment = experiment
    if (experiment) trace.record({ type: 'experiment.assigned', role: 'system', payload: experiment, component: 'voiceExperiment' })
    trace.record({ type: 'call.connected', role: 'system', payload: { streamSid }, component: 'mediaStream' })
    session = await createVoiceSession(ctx, systemPrompt)
    await session.attach({ onAudio: sendToTwilio, onInterrupt, onTranscript, onEvent: event => trace?.record(event) })
    session.run().catch(error => console.error('[MEDIA] session.run error:', error))
    sessionDeadline = setTimeout(() => closeUnsafeConnection(connection, 'maximum call duration exceeded'), MAX_CALL_DURATION_MS)
    console.info('[MEDIA] Call started stream=%s call=%s org=%s', streamSid, claims.callSid, claims.orgId)
  }

  connection.on('message', async (raw: Buffer | ArrayBuffer | Buffer[] | string) => {
    const rawBuffer = rawToBuffer(raw)
    if (rawBuffer.length > MAX_MEDIA_MESSAGE_BYTES || !allowMessage(rawBuffer.length)) {
      return closeUnsafeConnection(connection, 'message size or rate limit exceeded')
    }

    let data: unknown
    try { data = JSON.parse(rawBuffer.toString()) } catch { return }
    if (!isRecord(data) || typeof data.event !== 'string') return

    if (data.event === 'start') {
      await startSession(data)
      return
    }

    if (data.event === 'media' && session) {
      const media = data.media
      if (!isRecord(media) || typeof media.payload !== 'string' || media.payload.length > MAX_MEDIA_MESSAGE_BYTES) {
        return closeUnsafeConnection(connection, 'invalid media frame')
      }
      const ulaw = Buffer.from(media.payload, 'base64')
      const pcm16k = bridge.twilioToGemini(ulaw)
      const rms = rmsLevel(pcm16k)

      await checkBargeIn(rms)
      noiseCLF.setSpeaking(inputSpeaking || rms > 0.02)
      noiseCLF.update(rms)
      if (noiseCLF.noiseTypeChanged()) await session.updateEotTimeout(noiseCLF.suggestedEotMs())
      await session.sendAudio(preprocessInbound(pcm16k))
    } else if (data.event === 'stop') {
      console.info('[MEDIA] Stop received stream=%s', streamSid)
    }
  })

  connection.on('close', async () => {
    clearTimeout(startDeadline)
    if (sessionDeadline) clearTimeout(sessionDeadline)
    if (ownsCallSid) activeCallSids.delete(claims.callSid)
    if (session) await session.close().catch(() => {})

    if (ctx) {
      const durationS = Math.round((Date.now() - ctx.startedAt) / 1000)
      trace?.record({ type: 'call.ended', role: 'system', payload: { durationSeconds: durationS, outcome: ctx.outcome }, component: 'mediaStream' })
      trace?.metric('call.duration_seconds', durationS, 'seconds')
      trace?.metric('call.turn_count', ctx.turns, 'turns')
      const call = await ingestCall(ctx, durationS)
      if (call && trace) {
        await trace.flush(call.id)
        void evaluateVoiceCall(ctx.orgId, call.id).catch(error => console.warn('[CALL_JUDGE] evaluation failed:', error))
      }
      const experiment = ctx.metadata.voiceExperiment
      if (experiment && typeof experiment === 'object' && !Array.isArray(experiment)) {
        void recordVoiceExperimentOutcome(ctx.orgId, experiment as Parameters<typeof recordVoiceExperimentOutcome>[1], ctx.leadId, ctx.campaignId, OUTCOME_MAP[ctx.outcome] ?? 'none')
          .catch(error => console.warn('[VOICE_EXPERIMENT] conversion failed:', error))
      }
      console.info('[MEDIA] Call ended stream=%s outcome=%s dur=%ds', streamSid, ctx.outcome, durationS)
    }
  })

  connection.on('error', (error: Error) => console.error('[MEDIA] WS error:', error.message))
}
