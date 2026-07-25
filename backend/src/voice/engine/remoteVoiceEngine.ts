import { WebSocket } from 'ws'
import type { VoiceArchitecture } from './architecture'
import type { VoiceSession, VoiceSessionCallbacks, VoiceSessionContext, VoiceSessionMeta, VoiceSessionEvent } from './voiceSession'

const DEFAULT_CONNECT_TIMEOUT_MS = 3_000
const MAX_EVENT_BYTES = 512 * 1024
const MAX_QUEUED_AUDIO_CHUNKS = 100

type EngineEvent = {
  type?: unknown
  role?: unknown
  text?: unknown
  event?: unknown
  audio?: unknown
  pcmBase64?: unknown
  sampleRate?: unknown
  metadata?: unknown
  meta?: unknown
  confidence?: unknown
  words?: unknown
  reason?: unknown
  message?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function metaValue(value: unknown): VoiceSessionMeta | undefined {
  const record = asRecord(value)
  return record ?? undefined
}

function normalizeEvent(raw: unknown): EngineEvent | null {
  const record = asRecord(raw)
  if (!record) return null
  const type = stringValue(record.type) ?? stringValue(record.event)
  return type ? { ...record, type } as EngineEvent : null
}

export function decodeVoiceEngineEvent(raw: Buffer | string): EngineEvent | null {
  const bytes = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.byteLength
  if (bytes > MAX_EVENT_BYTES) return null

  try {
    const parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'))
    return normalizeEvent(parsed)
  } catch {
    return null
  }
}

/**
 * WebSocket client for a self-hosted voice-engine.
 *
 * The engine receives PCM16/16 kHz and emits PCM16/24 kHz. It never receives
 * authority over tenant identity; Node sends already validated context and
 * authenticates the connection with VOICE_ENGINE_TOKEN.
 */
export class RemoteVoiceEngineSession implements VoiceSession {
  readonly architecture: VoiceArchitecture
  private connection: WebSocket | null = null
  private callbacks: VoiceSessionCallbacks | null = null
  private closed = false
  private connected = false
  private sequence = 0
  private queuedAudio: Buffer[] = []
  private closePromise: Promise<void>
  private resolveClose!: () => void
  private connectPromise: Promise<void> | null = null

  constructor(
    private readonly ctx: VoiceSessionContext,
    private readonly systemPrompt: string,
    options: {
      architecture?: VoiceArchitecture
      url?: string
      token?: string
    } = {},
  ) {
    this.architecture = options.architecture ?? 'modular'
    this.url = options.url ?? process.env.VOICE_ENGINE_URL?.trim() ?? ''
    this.token = options.token ?? process.env.VOICE_ENGINE_TOKEN?.trim() ?? ''
    this.closePromise = new Promise(resolve => { this.resolveClose = resolve })
  }

  private readonly url: string
  private readonly token: string

  async attach(callbacks: VoiceSessionCallbacks): Promise<void> {
    this.callbacks = callbacks
  }

  async connect(): Promise<void> {
    if (this.connected) return
    if (this.closed) throw new Error('VOICE_ENGINE_SESSION_CLOSED')
    if (!this.url) {
      const variable = this.architecture === 'duplex' ? 'VOICE_DUPLEX_ENGINE_URL' : 'VOICE_ENGINE_URL'
      throw new Error(`${variable} is required when VOICE_ENGINE_MODE=remote`)
    }
    if (this.connectPromise) return this.connectPromise

    const timeoutMs = positiveInt(process.env.VOICE_ENGINE_CONNECT_TIMEOUT_MS, DEFAULT_CONNECT_TIMEOUT_MS)
    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false
      const socket = new WebSocket(this.url, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
        perMessageDeflate: false,
      })
      this.connection = socket

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        socket.close()
        reject(new Error(`VOICE_ENGINE_CONNECT_TIMEOUT_${timeoutMs}MS`))
      }, timeoutMs)

      socket.on('open', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.connected = true
        this.sendJson({
          type: 'session.start',
          architecture: this.architecture,
          engine: this.architecture === 'duplex'
            ? { family: 'moshi', role: 'speech-to-speech', controlPlane: 'node-policy-engine' }
            : { family: 'oss-cascade', role: 'stt-llm-tts', controlPlane: 'node-policy-engine' },
          sessionId: this.ctx.callSid,
          context: {
            callSid: this.ctx.callSid,
            orgId: this.ctx.orgId,
            leadId: this.ctx.leadId,
            agentId: this.ctx.agentId,
            campaignId: this.ctx.campaignId,
            phone: this.ctx.phone,
            businessType: this.ctx.businessType,
            businessName: this.ctx.businessName,
          },
          agent: {
            language: this.ctx.agentConfig?.identity.agentAccent?.trim()
              || (this.architecture === 'duplex'
                ? process.env.VOICE_DUPLEX_LANGUAGE?.trim()
                : process.env.VOICE_CALL_LANGUAGE?.trim())
              || 'es-ES',
            voice: this.ctx.agentConfig?.voice?.elevenLabsVoiceId || process.env.VOICE_ENGINE_VOICE || 'default',
            agentType: this.ctx.agentConfig?.agentType || 'sales',
            callDirection: this.ctx.agentConfig?.callDirection || 'both',
            systemPrompt: this.systemPrompt,
          },
          audio: { inputSampleRate: 16_000, outputSampleRate: 24_000, encoding: 'pcm_s16le' },
        })
        this.flushAudioQueue()
        resolve()
      })

      socket.on('message', raw => this.handleMessage(raw as Buffer))
      socket.on('error', error => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(error)
        }
        console.warn('[VOICE_ENGINE] websocket error:', error.message)
      })
      socket.on('close', () => {
        this.connected = false
        this.connection = null
        this.resolveClose()
      })
    }).finally(() => {
      this.connectPromise = null
    })

    return this.connectPromise
  }

  async sendAudio(pcm16k: Buffer): Promise<void> {
    if (this.closed) return
    if (!this.connected || !this.connection || this.connection.readyState !== WebSocket.OPEN) {
      if (this.queuedAudio.length >= MAX_QUEUED_AUDIO_CHUNKS) this.queuedAudio.shift()
      this.queuedAudio.push(Buffer.from(pcm16k))
      return
    }
    this.sendJson({
      type: 'audio.in',
      seq: this.sequence++,
      timestampMs: Math.round(performance.now()),
      sampleRate: 16_000,
      encoding: 'pcm_s16le',
      pcmBase64: pcm16k.toString('base64'),
    })
  }

  async updateEotTimeout(ms: number): Promise<void> {
    this.sendJson({ type: 'turn.config', eotTimeoutMs: Math.max(250, Math.min(ms, 10_000)) })
  }

  async run(): Promise<void> {
    await this.connect()
    await this.closePromise
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.queuedAudio = []
    this.sendJson({ type: 'session.end', reason: 'backend_close' })
    if (this.connection && this.connection.readyState === WebSocket.OPEN) this.connection.close(1000, 'session ended')
    else this.resolveClose()
  }

  private flushAudioQueue(): void {
    const queued = this.queuedAudio
    this.queuedAudio = []
    for (const audio of queued) void this.sendAudio(audio)
  }

  private sendJson(payload: Record<string, unknown>): void {
    const socket = this.connection
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    try { socket.send(JSON.stringify(payload)) } catch (error) {
      console.warn('[VOICE_ENGINE] send failed:', error)
    }
  }

  private handleMessage(raw: Buffer): void {
    const event = decodeVoiceEngineEvent(raw)
    if (!event) {
      console.warn('[VOICE_ENGINE] ignored invalid event')
      return
    }

    const type = String(event.type)
    const role = event.role === 'user' || event.role === 'assistant' || event.role === 'tool' || event.role === 'system'
      ? event.role
      : undefined
    const eventPayload: Record<string, unknown> = {}
    for (const key of ['text', 'sampleRate', 'confidence', 'words', 'reason', 'message', 'metadata', 'meta']) {
      if (event[key as keyof EngineEvent] !== undefined) eventPayload[key] = event[key as keyof EngineEvent]
    }
    const observed: VoiceSessionEvent = {
      type,
      role,
      payload: eventPayload,
      component: 'remoteVoiceEngine',
      provider: 'self-hosted',
    }
    void this.callbacks?.onEvent?.(observed)
    if (type === 'assistant.audio') {
      const encoded = stringValue(event.pcmBase64) ?? stringValue(asRecord(event.audio)?.pcmBase64)
      const sampleRate = Number(event.sampleRate ?? asRecord(event.audio)?.sampleRate ?? 24_000)
      if (!encoded || sampleRate !== 24_000) {
        console.warn('[VOICE_ENGINE] ignored audio with unsupported format', { sampleRate })
        return
      }
      const audio = Buffer.from(encoded, 'base64')
      void this.callbacks?.onAudio(audio)
      return
    }

    if (type === 'assistant.interrupt' || type === 'barge_in') {
      void this.callbacks?.onInterrupt?.()
      return
    }

    if (type === 'speech.started') {
      // The local media stream also detects this acoustically. Keeping this
      // event makes the remote engine useful when its semantic turn detector
      // sees speech before the local RMS threshold does.
      void this.callbacks?.onInterrupt?.()
      return
    }

    if (type === 'transcript.partial') {
      const text = stringValue(event.text)
      if (text) void this.callbacks?.onTranscript?.('prospecto_partial', text, metaValue(event.metadata ?? event.meta))
      return
    }

    if (type === 'transcript.final' || type === 'turn.final') {
      const text = stringValue(event.text)
      if (!text) return
      const role = stringValue(event.role) ?? 'prospecto'
      void this.callbacks?.onTranscript?.(role, text, {
        ...metaValue(event.metadata ?? event.meta),
        confidence: event.confidence,
        words: event.words,
      })
      return
    }

    if (type === 'voice.error' || type === 'error') {
      console.warn('[VOICE_ENGINE] remote error:', event.message ?? event.reason ?? 'unknown')
      return
    }

    if (type !== 'session.ready' && type !== 'turn.eager_end') {
      console.info('[VOICE_ENGINE] event=%s', type)
    }
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
