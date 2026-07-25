import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { CallContext } from '../intelligence/conversation/callContext'
import type { VoiceExperimentSnapshot } from '../experiments/voiceExperiment'
import { configuredVoiceArchitecture } from '../engine/architecture'

export type VoiceEventRole = 'system' | 'user' | 'assistant' | 'tool'

export type VoiceEventInput = {
  type: string
  role?: VoiceEventRole
  payload?: Record<string, unknown>
  component?: string
  componentVer?: string
  model?: string
  provider?: string
}

export type VoiceRuntimeSnapshot = {
  engineMode: string
  architecture: string
  engineVersion: string
  stt: { provider: string; model: string; language: string }
  llm: { provider: string; model: string }
  tts: { provider: string; model: string; voice: string }
  turnDetector: { provider: string; version: string }
  prosodyVersion: string
  salesBrainVersion: string
  playbookVersion: string
  experiment?: VoiceExperimentSnapshot
  campaignId?: string
  agentId?: string
  promptHash: string
  capturedAt: string
}

type BufferedEvent = VoiceEventInput & { seq: number; atMs: number }

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex')
}

export function buildVoiceRuntimeSnapshot(ctx: CallContext, systemPrompt: string, experiment?: VoiceExperimentSnapshot | null): VoiceRuntimeSnapshot {
  const proprietaryEnabled = process.env.VOICE_ENGINE_ALLOW_PROPRIETARY === 'true'
  const legacyRequested = process.env.VOICE_ENGINE_MODE?.trim().toLowerCase() === 'legacy'
  const remote = !(legacyRequested && proprietaryEnabled)
  return {
    engineMode: remote ? 'remote' : 'legacy',
    architecture: remote ? configuredVoiceArchitecture(ctx) : 'legacy',
    engineVersion: process.env.VOICE_ENGINE_VERSION?.trim() || '2.1.0',
    stt: {
      provider: process.env.VOICE_STT_PROVIDER?.trim() || (remote ? 'faster-whisper' : 'deepgram'),
      model: process.env.VOICE_ENGINE_STT_MODEL?.trim() || (remote ? 'large-v3-turbo' : 'flux-general-multi'),
      language: ctx.agentConfig?.identity.agentAccent?.trim() || process.env.VOICE_CALL_LANGUAGE?.trim() || process.env.VOICE_ENGINE_LANGUAGE?.trim() || process.env.DEEPGRAM_LANGUAGE?.trim() || 'es-ES',
    },
    llm: {
      provider: process.env.VOICE_LLM_PROVIDER?.trim() || (remote ? 'vllm-local' : 'cerebras'),
      model: process.env.VOICE_ENGINE_LLM_MODEL?.trim() || process.env.CEREBRAS_MODEL?.trim() || (remote ? 'Qwen/Qwen3-8B' : 'llama-3.3-70b'),
    },
    tts: {
      provider: process.env.VOICE_TTS_PROVIDER?.trim() || (remote ? 'piper' : 'elevenlabs'),
      model: process.env.VOICE_ENGINE_PIPER_MODEL?.trim() || process.env.VOICE_ENGINE_QWEN3_MODEL?.trim() || process.env.ELEVENLABS_MODEL_ID?.trim() || (remote ? 'local' : 'eleven_flash_v2_5'),
      voice: remote ? process.env.VOICE_ENGINE_VOICE || 'default' : ctx.agentConfig?.voice?.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID || 'default',
    },
    turnDetector: {
      provider: process.env.VOICE_TURN_PROVIDER?.trim() || (remote ? 'rms+smart-turn-optional' : 'deepgram-eot+rms'),
      version: process.env.VOICE_TURN_VERSION?.trim() || '1',
    },
    prosodyVersion: process.env.VOICE_PROSODY_VERSION?.trim() || '1',
    salesBrainVersion: process.env.VOICE_SALES_BRAIN_VERSION?.trim() || 'legacy-guru-supervisor',
    playbookVersion: process.env.VOICE_PLAYBOOK_VERSION?.trim() || '1',
    experiment: experiment ?? undefined,
    campaignId: ctx.campaignId || undefined,
    agentId: ctx.agentId || undefined,
    promptHash: hashPrompt(systemPrompt),
    capturedAt: new Date().toISOString(),
  }
}

export class VoiceTrace {
  private readonly startedAt = Date.now()
  private nextSeq = 0
  private events: BufferedEvent[] = []
  private metrics: Array<{ metric: string; value: number; unit?: string; dimensions?: Record<string, unknown> }> = []
  private flushed = false

  constructor(
    private readonly ctx: Pick<CallContext, 'callSid' | 'orgId'>,
    private readonly runtimeSnapshot: VoiceRuntimeSnapshot,
  ) {}

  record(input: VoiceEventInput): void {
    if (this.flushed) return
    this.events.push({
      ...input,
      payload: input.payload ?? {},
      seq: this.nextSeq++,
      atMs: Math.max(0, Date.now() - this.startedAt),
    })
  }

  metric(metric: string, value: number, unit?: string, dimensions?: Record<string, unknown>): void {
    if (this.flushed || !Number.isFinite(value)) return
    this.metrics.push({ metric, value, unit, dimensions })
  }

  eventCount(): number {
    return this.events.length
  }

  async flush(callId: string): Promise<void> {
    if (this.flushed || !callId || !this.ctx.orgId) return
    const events = this.events
    const metrics = this.metrics

    try {
      if (events.length > 0) {
        await prisma.voiceCallEvent.createMany({
          data: events.map(event => ({
            id: randomUUID(),
            orgId: this.ctx.orgId,
            callId,
            seq: event.seq,
            atMs: event.atMs,
            type: event.type,
            role: event.role,
            payload: (event.payload ?? {}) as Prisma.InputJsonValue,
            component: event.component,
            componentVer: event.componentVer,
            model: event.model,
            provider: event.provider,
          })),
          skipDuplicates: true,
        })
      }

      if (metrics.length > 0) {
        await prisma.voiceCallMetric.createMany({
          data: metrics.map(item => ({
            id: randomUUID(),
            orgId: this.ctx.orgId,
            callId,
            metric: item.metric,
            value: item.value,
            unit: item.unit,
            dimensions: item.dimensions as Prisma.InputJsonValue | undefined,
          })),
        })
      }

      await prisma.call.update({
        where: { id: callId },
        data: { runtimeSnapshot: this.runtimeSnapshot as unknown as Prisma.InputJsonValue },
      })
      this.events = []
      this.metrics = []
      this.flushed = true
    } catch (error) {
      console.warn('[VOICE_TRACE] flush failed call=%s events=%d', callId, events.length, error)
    }
  }
}
