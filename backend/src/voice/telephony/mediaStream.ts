import { WebSocket } from 'ws'
import { AudioBridge } from '../audio/bridge'
import { InboundAudioProcessor, rmsLevel } from '../audio/dsp'
import { NoiseClassifier } from '../audio/noiseClassifier'
import { detectOptout, registerOptout, detectTransferRequest, detectRecordingConsentResponse } from '../compliance'
import { createCallContext, CallContext } from '../intelligence/conversation/callContext'
import { loadAgentConfig } from '../agentConfig'
import { createVoiceSession } from '../engine/factory'
import { buildIntelligentPrompt } from '../intelligence/promptContext'
import type { VoiceSession, VoiceSessionEvent } from '../engine/voiceSession'
import { endCall, recordingPolicy, startCallRecording, transferCall } from './twilioClient'
import { getTwilioIntegrationConfig } from '../../services/twilioIntegration.service'
import { emitToOrg } from '../../websockets/index'
import { ingestCall as persistCall } from '../../services/calls.service'
import { prisma } from '../../lib/prisma'
import type { MediaStreamClaims } from './streamAuth'
import { registerLiveCall, unregisterLiveCall } from './liveCalls'
import { buildVoiceRuntimeSnapshot, VoiceTrace } from '../observability/voiceTrace'
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
  transferido: 'human_requested',
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
      transcriptWords: Array.isArray(ctx.metadata.transcriptWords) ? ctx.metadata.transcriptWords : undefined,
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
  const inboundAudio = new InboundAudioProcessor()
  const noiseCLF = new NoiseClassifier()
  const allowMessage = createRateGuard()
  let trace: VoiceTrace | null = null
  let assistantAudioActive = false
  let inputSpeaking = false
  let lastUserTurnFinishedAt = 0

  const startDeadline = setTimeout(() => {
    if (!started) closeUnsafeConnection(connection, 'start event deadline exceeded')
  }, START_DEADLINE_MS)

  async function sendToTwilio(audio: Buffer): Promise<void> {
    if (!streamSid || connection.readyState !== WebSocket.OPEN) return
    const audible = rmsLevel(audio) >= 0.0015
    if (!assistantAudioActive && audible) {
      assistantAudioActive = true
      trace?.record({ type: 'audio.output_started', role: 'assistant', payload: { bytes: audio.length, audible: true }, component: 'mediaStream' })
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
      contact: callCtx.businessName,
      emotion: callCtx.emotion,
      reason,
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
    if (role === 'prospecto_partial' || role === 'partial') {
      trace?.record({ type: 'stt.partial', role: 'user', payload: { text: text.slice(0, 1000), ...meta }, component: 'mediaStream' })
      return
    }
    if (role !== 'prospecto' && role !== 'agente') return
    trace?.record({
      type: role === 'prospecto' ? 'stt.final' : 'transcript.final',
      role: role === 'prospecto' ? 'user' : 'assistant',
      payload: { role, text: text.slice(0, 4000), ...meta },
      component: 'mediaStream',
    })
    ctx.turns++
    ctx.transcript.push({ role, text })
    if (role === 'prospecto' && Array.isArray(meta?.words)) {
      const existing = Array.isArray(ctx.metadata.transcriptWords) ? ctx.metadata.transcriptWords : []
      ctx.metadata.transcriptWords = [...existing, {
        turnId: meta?.turnId,
        generationId: meta?.generationId,
        provider: meta?.provider,
        model: meta?.model,
        confidence: meta?.confidence,
        words: meta.words,
      }].slice(-200)
    }

    if (role !== 'prospecto') return

    assistantAudioActive = false
    lastUserTurnFinishedAt = Date.now()
    trace?.record({ type: 'turn.user_finished', role: 'user', payload: { textLength: text.length }, component: 'mediaStream' })
    if (ctx.transcript.filter(item => item.role === 'prospecto').length === 1) {
      const opening = classifyAmd({ answeredBy: 'human', speechResult: text })
      ctx.metadata.contactClassification = opening.classification
      ctx.metadata.contactClassificationConfidence = opening.confidence
      ctx.metadata.amdResult = { ...opening, source: 'opening_speech' }
      trace?.record({ type: 'contact.classified', role: 'system', payload: opening, component: 'amd', provider: 'opening_speech' })
    }

    if (ctx.recordingConsentPending) {
      const consent = detectRecordingConsentResponse(text)
      if (consent) {
        ctx.recordingConsentPending = false
        ctx.recordingConsented = consent === 'granted'
        trace?.record({ type: 'compliance.recording_consent', role: 'user', payload: { consent }, component: 'compliance' })
        if (consent === 'granted') {
          void startCallRecording({ callSid: ctx.callSid, orgId: ctx.orgId, campaignId: ctx.campaignId, agentId: ctx.agentId, leadId: ctx.leadId })
            .catch(error => {
              trace?.record({ type: 'runtime.warning', role: 'system', payload: { code: 'RECORDING_START_FAILED' }, component: 'compliance' })
              console.warn('[MEDIA] startCallRecording failed:', error)
            })
        }
      }
    }

    const optedOut = detectOptout(text)
    const explicitTransfer = !ctx.transferRequested && detectTransferRequest(text)
    const frustrated = ['molesto', 'frustrado', 'agitado'].includes(ctx.emotion)
    ctx.frustration = frustrated ? ctx.frustration + 1 : 0
    const frustrationTransfer = !ctx.transferRequested && ctx.frustration >= 3
    let action: 'respond' | 'transfer' | 'stop' = 'respond'
    let reason: string | undefined
    if (optedOut) {
      action = 'stop'
      reason = 'opt_out'
      ctx.outcome = 'optout'
    } else if (explicitTransfer || frustrationTransfer) {
      action = 'transfer'
      reason = explicitTransfer ? 'solicitado_explicitamente' : 'frustracion_alta'
    }

    if (action === 'stop' || action === 'transfer') {
      trace?.record({ type: 'turn.blocked', role: 'system', payload: { action, reason }, component: 'compliance' })
      await session?.stopResponding(reason ?? action)
      bridge.clearOutput()
      assistantAudioActive = false
      if (streamSid && connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ event: 'clear', streamSid }))
    }
    if (optedOut) {
      trace?.record({ type: 'compliance.opt_out', role: 'user', payload: { text: text.slice(0, 500) }, component: 'compliance' })
      await registerOptout(ctx.orgId, ctx.phone, 'detected_in_call')
      try {
        await endCall(ctx.callSid, ctx.orgId)
        trace?.record({ type: 'compliance.opt_out_completed', role: 'system', component: 'compliance' })
      } catch (error) {
        trace?.record({ type: 'runtime.warning', role: 'system', payload: { code: 'OPT_OUT_HANGUP_FAILED' }, component: 'compliance' })
        console.warn('[MEDIA] opt-out hangup failed:', error)
      }
    } else if (action === 'transfer') {
      await requestTransfer(ctx, reason ?? 'policy_transfer')
    }
  }

  // ponytail: el barge-in lo decide Flux por semántica de turno, no el RMS.
  // Aquí solo se marca si entra voz, para las métricas de solape.
  function checkBargeIn(rms: number): void {
    inputSpeaking = rms >= 0.04
  }

  function onSessionEvent(event: VoiceSessionEvent): void {
    trace?.record(event)
    const latencyMs = typeof event.payload?.latencyMs === 'number' ? event.payload.latencyMs : null
    if (latencyMs !== null) {
      if (event.type === 'turn.directive_applied') trace?.metric('turn.policy_gate_ms', latencyMs, 'ms')
      else if (event.type === 'supervisor.updated') trace?.metric('turn.supervisor_latency_ms', latencyMs, 'ms', { model: event.model })
      else if (event.type.startsWith('stt.')) trace?.metric(`turn.${event.type.replaceAll('.', '_')}_ms`, latencyMs, 'ms', { model: event.model })
    }
    const metadata = event.payload?.metadata
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const timing = metadata as Record<string, unknown>
      if (typeof timing.queueWaitMs === 'number') trace?.metric('turn.stt_queue_wait_ms', timing.queueWaitMs, 'ms', { model: event.model })
      if (typeof timing.inferenceMs === 'number') trace?.metric('turn.stt_inference_ms', timing.inferenceMs, 'ms', { model: event.model })
    }
    if (!ctx || event.type !== 'turn.emotion') return
    const label = typeof event.payload?.label === 'string' ? event.payload.label.toLowerCase() : ''
    const confidence = typeof event.payload?.confidence === 'number' ? event.payload.confidence : 0
    if (!label || confidence < 0.4) return
    const normalized: Record<string, string> = {
      neutral: 'neutro',
      positive: 'interesado',
      engaged: 'interesado',
      concerned: 'frustrado',
      frustrated: 'frustrado',
      angry: 'molesto',
      confused: 'neutro',
      uncertain: 'neutro',
    }
    ctx.emotion = normalized[label] ?? label
    ctx.metadata.lastEmotion = {
      label,
      normalized: ctx.emotion,
      confidence,
      scores: event.payload?.scores,
      generationId: event.payload?.generationId,
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
      direction: claims.direction,
    })
    // With policy 'consent' the Twilio call was created without record:true;
    // the agent must obtain consent in-call before any recording starts.
    if (recordingPolicy() === 'consent') ctx.recordingConsentPending = true
    registerLiveCall({
      callSid: claims.callSid,
      orgId: claims.orgId,
      leadId: claims.leadId,
      agentId: claims.agentId,
      campaignId: claims.campaignId,
      phone: claims.phone,
      startedAt: ctx.startedAt,
    })

    const systemPrompt = await buildIntelligentPrompt({
      orgId: ctx.orgId,
      basePrompt: (agentConfig?.playbook?.scripts?.base_prompt as string) ?? '',
      leadId: ctx.leadId,
      agentId: ctx.agentId || null,
      agentType: agentConfig?.agentType,
      direction: ctx.direction,
      strategyId: agentConfig?.playbook.strategy,
      keyMessages: agentConfig?.playbook.scripts.key_messages as string | undefined,
      escalationRules: agentConfig?.playbook.scripts.escalation_rules as string | undefined,
      customPlaybook: agentConfig?.playbook.scripts.custom_playbook as string | undefined,
      behavior: agentConfig?.behavior,
      agentName: agentConfig?.identity?.agentName,
    })
    const experiment = await resolveVoiceExperiment(ctx.orgId, ctx.leadId, ctx.campaignId).catch(error => {
      console.warn('[VOICE_EXPERIMENT] assignment failed:', error)
      return null
    })
    if (experiment) ctx.metadata.voiceExperiment = experiment
    trace = new VoiceTrace(ctx, buildVoiceRuntimeSnapshot(ctx, systemPrompt, experiment))
    if (experiment) trace.record({ type: 'experiment.assigned', role: 'system', payload: experiment, component: 'voiceExperiment' })
    trace.record({ type: 'call.connected', role: 'system', payload: { streamSid }, component: 'mediaStream' })
    session = await createVoiceSession(ctx, systemPrompt)
    await session.attach({ onAudio: sendToTwilio, onInterrupt, onTranscript, onEvent: onSessionEvent })
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
      await session.sendAudio(inboundAudio.process(pcm16k))
    } else if (data.event === 'stop') {
      console.info('[MEDIA] Stop received stream=%s', streamSid)
    }
  })

  connection.on('close', async () => {
    clearTimeout(startDeadline)
    if (sessionDeadline) clearTimeout(sessionDeadline)
    if (ownsCallSid) {
      activeCallSids.delete(claims.callSid)
      unregisterLiveCall(claims.callSid)
    }
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
