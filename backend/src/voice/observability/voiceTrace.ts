import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { CallContext } from '../intelligence/conversation/callContext'
import type { VoiceExperimentSnapshot } from '../experiments/voiceExperiment'
import { DEFAULT_SETTINGS } from '../pipelines/vendravaProtocol'
import { resolveAgentRuntime } from '../runtimeConfig'

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
  llm: { provider: string; model: string; supervisor?: { provider: string; model: string; mode: string } }
  tts: { provider: string; model: string; voice: string; speed: number }
  turnDetector: { provider: string; version: string }
  prosodyVersion: string
  salesBrainVersion: string
  playbookVersion: string
  strategyId?: string
  customPlaybookId?: string
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
  const runtime = resolveAgentRuntime(ctx.agentConfig)
  const language = /^es\b/i.test(ctx.agentConfig?.identity?.agentAccent ?? '') ? 'es' : 'en'
  const voice = runtime.tts.provider === 'minimax'
    ? process.env.MINIMAX_VOICE_ID?.trim() || ctx.agentConfig?.voice?.ttsVoiceId || DEFAULT_SETTINGS.voiceId
    : (language === 'es' ? process.env.FISH_VOICE_ID_ES : process.env.FISH_VOICE_ID_EN)?.trim() || ctx.agentConfig?.voice?.ttsVoiceId || DEFAULT_SETTINGS.voiceId
  return {
    engineMode: 'vendrava',
    architecture: 'modular',
    engineVersion: process.env.VOICE_ENGINE_VERSION?.trim() || '3.0.0',
    stt: {
      provider: runtime.transcriptionStt.provider,
      model: runtime.transcriptionStt.model,
      language,
    },
    llm: {
      provider: runtime.primaryLlm.provider,
      model: runtime.primaryLlm.model,
      // El guru corre en el hueco muerto mientras habla el agente.
      supervisor: { provider: runtime.guru.provider, model: runtime.guru.model, mode: runtime.guru.enabled === false ? 'disabled' : 'async' },
    },
    tts: {
      provider: runtime.tts.provider,
      model: runtime.tts.model,
      voice,
      speed: ctx.agentConfig?.voice?.speed ?? DEFAULT_SETTINGS.speed,
    },
    turnDetector: {
      provider: `${runtime.transcriptionStt.provider}-semantic`,
      version: process.env.VOICE_TURN_VERSION?.trim() || '1',
    },
    prosodyVersion: process.env.VOICE_PROSODY_VERSION?.trim() || 'derived-1',
    salesBrainVersion: process.env.VOICE_SALES_BRAIN_VERSION?.trim() || 'vendrava-guru',
    playbookVersion: process.env.VOICE_PLAYBOOK_VERSION?.trim() || '1',
    strategyId: ctx.agentConfig?.playbook.strategy || undefined,
    customPlaybookId: ctx.agentConfig?.playbook.customPlaybookId || undefined,
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
