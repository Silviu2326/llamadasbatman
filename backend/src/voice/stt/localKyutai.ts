import { WebSocket } from 'ws'
import type { TurnMeta } from './deepgram'

// Cliente del endpoint /stt del voice-engine (Kyutai stt-1b-en_fr, streaming real
// con VAD semantico). Interfaz identica a DeepgramSTT: se selecciona con
// STT_PROVIDER=kyutai sin tocar el pipeline.

interface LocalKyutaiSTTConfig {
  url?: string
  token?: string
  eotTimeoutMs?: number
  eotThreshold?: number
  eagerEotThreshold?: number
  onPartial?: (text: string) => void
  onEagerEnd?: (text: string, confidence: number, meta: TurnMeta) => void
  onTurnResumed?: () => void
  onFinal?: (text: string, confidence: number, meta: TurnMeta) => void
  onUserStartedSpeaking?: () => void
  onUserStoppedSpeaking?: () => void
}

export class LocalKyutaiSTT {
  private _cfg: LocalKyutaiSTTConfig
  private _ws: WebSocket | null = null
  private _queue: Buffer[] = []
  private _closed = false
  private _turnIndex = 0

  constructor(cfg: LocalKyutaiSTTConfig) {
    this._cfg = cfg
  }

  async start(): Promise<void> {
    const url = this._cfg.url ?? process.env.KYUTAI_STT_URL ?? 'ws://127.0.0.1:9100/stt'
    const token = this._cfg.token ?? process.env.VOICE_ENGINE_TOKEN
    const ws = new WebSocket(url, token ? { headers: { authorization: `Bearer ${token}` } } : undefined)

    ws.on('open', () => {
      console.log('[STT] connected Kyutai local %s', url)
      this._ws = ws
      void this.configure({
        eotTimeoutMs: this._cfg.eotTimeoutMs,
        eotThreshold: this._cfg.eotThreshold,
        eagerEotThreshold: this._cfg.eagerEotThreshold,
      })
      for (const chunk of this._queue) ws.send(chunk)
      this._queue = []
    })

    ws.on('message', (raw: Buffer) => {
      let event: any
      try { event = JSON.parse(raw.toString()) } catch { return }
      const meta = (eotType: TurnMeta['eotType'], durationSec = 0): TurnMeta =>
        ({ words: [], durationSec, turnIndex: this._turnIndex, eotType })

      switch (event.type) {
        case 'ready':
          console.log('[STT] Kyutai ready model=%s', event.model)
          break
        case 'speech.started':
          this._cfg.onUserStartedSpeaking?.()
          break
        case 'partial':
          if (event.text) this._cfg.onPartial?.(event.text)
          break
        case 'eager_end':
          if (event.text) this._cfg.onEagerEnd?.(event.text, event.confidence ?? 0.5, meta('EagerEndOfTurn'))
          break
        case 'turn_resumed':
          this._cfg.onTurnResumed?.()
          break
        case 'final':
          this._turnIndex++
          this._cfg.onUserStoppedSpeaking?.()
          if (event.text) this._cfg.onFinal?.(event.text, event.confidence ?? 0.9, meta('EndOfTurn', event.durationSec ?? 0))
          break
        case 'error':
          console.error('[STT] Kyutai error:', event.message)
          break
      }
    })

    ws.on('error', (e: Error) => console.error('[STT] Kyutai error', e.message))

    await new Promise<void>(resolve => {
      ws.on('close', (code: number) => { console.log('[STT] Kyutai closed', code); resolve() })
    })
  }

  async sendAudio(audio: Buffer): Promise<void> {
    if (this._closed) return
    if (this._ws?.readyState === WebSocket.OPEN) this._ws.send(audio)
    else this._queue.push(audio)
  }

  async configure(params: { eotTimeoutMs?: number; eotThreshold?: number; eagerEotThreshold?: number }): Promise<void> {
    const payload: Record<string, unknown> = { type: 'config' }
    if (params.eotTimeoutMs != null) payload.eotTimeoutMs = params.eotTimeoutMs
    if (params.eotThreshold != null) payload.eotThreshold = params.eotThreshold
    if (params.eagerEotThreshold != null) payload.eagerEotThreshold = params.eagerEotThreshold
    if (Object.keys(payload).length > 1 && this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(payload))
    }
  }

  async close(): Promise<void> {
    this._closed = true
    try { this._ws?.close() } catch {}
  }
}
