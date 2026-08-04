import { WebSocket } from 'ws'
import type { CallContext } from '../intelligence/conversation/callContext'
import type { VoiceSession, VoiceSessionCallbacks } from './voiceSession'

const DEFAULT_WS_URL = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime'
const DEFAULT_MODEL = 'qwen3.5-omni-flash-realtime'

export function qwenOmniConfigured(): boolean {
  return Boolean(process.env.DASHSCOPE_API_KEY)
}

/**
 * Qwen3.5-Omni Realtime (DashScope, Alibaba Cloud) speech-to-speech session.
 * Motor experimental para comparar contra la cascada autoalojada; hoy solo se
 * activa desde la página de prueba del navegador (engine: 'qwen-omni').
 *
 * Formatos: entrada PCM16 16 kHz mono, salida PCM16 24 kHz — los mismos que ya
 * usa el canal /voice-sim/live, por lo que no hay resampling en medio.
 */
export class QwenOmniRealtimeSession implements VoiceSession {
  private ws: WebSocket | null = null
  private callbacks: VoiceSessionCallbacks | null = null
  private userPartial = ''
  private agentText = ''
  private readonly done: Promise<void>
  private finish!: () => void
  private fail!: (error: Error) => void
  // DashScope descarta todo lo enviado antes de session.created, así que la
  // configuración y el saludo se encadenan por eventos: created → session.update
  // → updated → saludo. `ready` se resuelve al recibir session.updated.
  private readonly ready: Promise<void>
  private markReady!: () => void

  constructor(private readonly ctx: CallContext, private readonly systemPrompt: string) {
    this.done = new Promise<void>((resolve, reject) => {
      this.finish = resolve
      this.fail = reject
    })
    // run() entrega esta promesa a quien quiera el error; sin este catch un
    // fallo del WS antes de run() sería un unhandled rejection.
    this.done.catch(() => {})
    this.ready = new Promise<void>(resolve => { this.markReady = resolve })
  }

  async attach(callbacks: VoiceSessionCallbacks): Promise<void> {
    this.callbacks = callbacks
  }

  async connect(): Promise<void> {
    const apiKey = process.env.DASHSCOPE_API_KEY
    if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured')
    const base = process.env.QWEN_OMNI_WS_URL?.trim() || DEFAULT_WS_URL
    const model = process.env.QWEN_OMNI_MODEL?.trim() || DEFAULT_MODEL
    const ws = new WebSocket(`${base}?model=${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      handshakeTimeout: 10_000,
    })
    this.ws = ws
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    ws.on('error', error => this.fail(error instanceof Error ? error : new Error(String(error))))
    ws.on('close', () => this.finish())
    ws.on('message', raw => {
      try {
        this.handleServerEvent(JSON.parse(raw.toString()))
      } catch {
        /* frames no-JSON se ignoran */
      }
    })
    console.info('[QWEN_OMNI] session connected call=%s model=%s', this.ctx.callSid, model)
  }

  handleServerEvent(event: Record<string, unknown>): void {
    if (typeof event.type !== 'string') return
    if (event.type === 'session.created') {
      this.send({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          voice: process.env.QWEN_OMNI_VOICE?.trim() || 'Ethan',
          input_audio_format: 'pcm',
          output_audio_format: 'pcm',
          instructions: this.systemPrompt,
          turn_detection: { type: 'semantic_vad' },
        },
      })
      return
    }
    if (event.type === 'session.updated') {
      this.markReady()
      return
    }
    const cb = this.callbacks
    if (!cb) return
    switch (event.type) {
      case 'response.audio.delta':
        if (typeof event.delta === 'string') void cb.onAudio(Buffer.from(event.delta, 'base64'))
        break
      case 'input_audio_buffer.speech_started':
        this.userPartial = ''
        void cb.onInterrupt?.()
        break
      case 'conversation.item.input_audio_transcription.delta':
        // DashScope manda preview completo en `text` (+ `stash` sin confirmar);
        // el formato OpenAI-compatible manda incrementos en `delta`.
        if (typeof event.text === 'string') {
          this.userPartial = event.text + (typeof event.stash === 'string' ? event.stash : '')
        } else if (typeof event.delta === 'string') {
          this.userPartial += event.delta
        }
        if (this.userPartial) void cb.onTranscript?.('partial', this.userPartial)
        break
      case 'conversation.item.input_audio_transcription.completed': {
        const text = typeof event.transcript === 'string' ? event.transcript : this.userPartial
        this.userPartial = ''
        if (text) void cb.onTranscript?.('prospecto', text)
        break
      }
      case 'response.audio_transcript.delta':
        if (typeof event.delta === 'string') this.agentText += event.delta
        break
      case 'response.audio_transcript.done': {
        const text = typeof event.transcript === 'string' ? event.transcript : this.agentText
        this.agentText = ''
        if (text) void cb.onTranscript?.('agente', text, { provider: 'qwen-omni' })
        break
      }
      case 'response.done':
        this.agentText = ''
        break
      case 'error':
        console.error('[QWEN_OMNI] server error call=%s: %j', this.ctx.callSid, event)
        break
      default:
        break
    }
  }

  async sendAudio(pcm16k: Buffer): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.send({ type: 'input_audio_buffer.append', audio: pcm16k.toString('base64') })
  }

  async updateEotTimeout(): Promise<void> {
    /* el VAD semántico es del servidor; no hay timeout local que ajustar */
  }

  run(): Promise<void> {
    // Saludo inicial, igual que el motor autoalojado, en cuanto la sesión está
    // configurada (session.updated). DashScope rechaza un response.create sin
    // ningún turno de usuario, así que se inyecta un primer turno sintético.
    void this.ready.then(() => {
      this.send({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hola, ya estoy al teléfono. Salúdame y arranca la conversación.' }] },
      })
      this.send({ type: 'response.create' })
    })
    return this.done
  }

  async close(): Promise<void> {
    try {
      this.ws?.close()
    } catch {
      /* ya cerrado */
    }
    this.finish()
  }

  private send(payload: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload))
  }
}
