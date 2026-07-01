import { WebSocket } from 'ws'
import { AudioBridge } from '../audio/bridge'
import { rmsLevel, preprocessInbound } from '../audio/dsp'
import { NoiseClassifier } from '../audio/noiseClassifier'
import { detectOptout, registerOptout } from '../compliance'
import { createCallContext, CallContext } from '../intelligence/conversation/callContext'
import { loadAgentConfig } from '../agentConfig'
import { DeepgramElevenLabsSession } from '../pipelines/deepgramElevenLabs'
import { transferCall } from './twilioClient'
import { prisma } from '../../lib/prisma'
import { emitToOrg } from '../../websockets/index'

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

async function ingestCall(ctx: CallContext, durationS: number): Promise<void> {
  if (!ctx.orgId) return
  const { sentiment, score } = SENTIMENT_MAP[ctx.emotion] ?? { sentiment: 'neutral', score: 0.5 }
  const transcript = ctx.transcript.map(t => `${t.role}: ${t.text}`).join('\n')
  const outcome = OUTCOME_MAP[ctx.outcome] ?? 'none'

  try {
    const call = await prisma.call.create({
      data: {
        direction: 'outbound',
        status: 'completed',
        durationSeconds: durationS,
        transcript,
        sentiment,
        sentimentScore: score,
        outcome,
        externalCallId: ctx.callSid,
        leadId: ctx.leadId || '',
        agentId: ctx.agentId || undefined,
        campaignId: ctx.campaignId || undefined,
        orgId: ctx.orgId,
      },
    })
    emitToOrg(ctx.orgId, 'call:completed', call)
  } catch (e) {
    console.warn('[MEDIA] Error ingesting call:', e)
  }
}

export async function handleMediaStream(connection: WebSocket): Promise<void> {
  let streamSid: string | null = null
  let ctx: CallContext | null = null
  let session: DeepgramElevenLabsSession | null = null
  const bridge = new AudioBridge()
  const noiseCLF = new NoiseClassifier()

  // Barge-in state
  let energyFrames = 0
  let speechStartMs = 0
  let isInterrupting = false
  let lastClearMs = 0
  const BARGE_THRESHOLD = 0.04
  const BARGE_FRAMES = 4
  const BARGE_MIN_MS = 200
  const BARGE_DEBOUNCE_MS = 500

  async function sendToTwilio(audio: Buffer): Promise<void> {
    if (!streamSid || connection.readyState !== WebSocket.OPEN) return
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
    if (streamSid) connection.send(JSON.stringify({ event: 'clear', streamSid }))
  }

  async function onTranscript(role: string, text: string): Promise<void> {
    if (!ctx || role === 'prospecto_partial') return
    ctx.turns++
    ctx.transcript.push({ role, text })

    if (role === 'prospecto') {
      if (detectOptout(text)) {
        ctx.outcome = 'optout'
        await registerOptout(ctx.phone, 'detected_in_call')
      }
    }
  }

  async function checkBargeIn(rms: number): Promise<void> {
    const nowMs = Date.now()
    if (nowMs - lastClearMs < BARGE_DEBOUNCE_MS) return

    if (rms > BARGE_THRESHOLD) {
      energyFrames++
      if (speechStartMs === 0) speechStartMs = nowMs
    } else {
      energyFrames = Math.max(0, energyFrames - 1)
      if (energyFrames === 0) { speechStartMs = 0; isInterrupting = false }
    }

    if (energyFrames >= BARGE_FRAMES) {
      const dur = nowMs - speechStartMs
      if (dur >= BARGE_MIN_MS && !isInterrupting) {
        isInterrupting = true
        lastClearMs = nowMs
        await onInterrupt()
      }
    }
  }

  connection.on('message', async (raw: Buffer | string) => {
    let data: any
    try { data = JSON.parse(raw.toString()) } catch { return }

    const event = data.event

    if (event === 'start') {
      const start = data.start
      streamSid = start.streamSid
      const callSid = start.callSid ?? streamSid
      const params = start.customParameters ?? {}

      const agentId = params.agentId ?? ''
      const agentConfig = agentId ? await loadAgentConfig(agentId).catch(() => null) : null

      ctx = createCallContext({
        callSid,
        phone: params.phone ?? 'unknown',
        businessType: params.businessType ?? 'generico',
        businessName: params.businessName ?? '',
        orgId: params.orgId ?? '',
        campaignId: params.campaignId ?? '',
        agentId,
        leadId: params.leadId ?? '',
        agentConfig,
      })

      // Build system prompt from agent config
      const systemPrompt = agentConfig?.playbook?.scripts?.base_prompt as string ?? ''
      session = new DeepgramElevenLabsSession(ctx, systemPrompt)
      await session.attach(sendToTwilio, onInterrupt, onTranscript)
      session.run().catch(e => console.error('[MEDIA] session.run error:', e))

      console.info('[MEDIA] Call started stream=%s phone=%s', streamSid, ctx.phone)

    } else if (event === 'media' && session) {
      const ulaw = Buffer.from(data.media.payload, 'base64')
      const pcm16k = bridge.twilioToGemini(ulaw)
      const rms = rmsLevel(pcm16k)

      await checkBargeIn(rms)

      noiseCLF.setSpeaking(isInterrupting || rms > 0.02)
      noiseCLF.update(rms)
      if (noiseCLF.noiseTypeChanged()) {
        await session.updateEotTimeout(noiseCLF.suggestedEotMs())
      }

      const clean = preprocessInbound(pcm16k)
      await session.sendAudio(clean)

    } else if (event === 'stop') {
      console.info('[MEDIA] Stop received stream=%s', streamSid)
    }
  })

  connection.on('close', async () => {
    if (session) await session.close().catch(() => {})

    if (ctx) {
      const durationS = Math.round((Date.now() - ctx.startedAt) / 1000)

      if (ctx.transferRequested && process.env.HUMAN_TRANSFER_NUMBER) {
        await transferCall(ctx.callSid, process.env.HUMAN_TRANSFER_NUMBER).catch(() => {})
      }

      await ingestCall(ctx, durationS)
      console.info('[MEDIA] Call ended stream=%s outcome=%s dur=%ds', streamSid, ctx.outcome, durationS)
    }
  })

  connection.on('error', (e: Error) => console.error('[MEDIA] WS error:', e.message))
}
