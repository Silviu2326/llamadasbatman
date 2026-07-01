import { DeepgramClient } from '@deepgram/sdk'

type VADCallback = () => void

export interface TurnMeta {
  words: Array<{ word: string; confidence: number; start?: number; end?: number }>
  durationSec: number
  turnIndex: number
  language?: string
  eotType: 'EndOfTurn' | 'EagerEndOfTurn'
}

interface DeepgramSTTConfig {
  apiKey: string
  model?: string
  language?: string
  eotTimeoutMs?: number
  eotThreshold?: number
  eagerEotThreshold?: number
  onPartial?: (text: string) => void
  onEagerEnd?: (text: string, confidence: number, meta: TurnMeta) => void
  onTurnResumed?: VADCallback
  onFinal?: (text: string, confidence: number, meta: TurnMeta) => void
  onUserStartedSpeaking?: VADCallback
  onUserStoppedSpeaking?: VADCallback
}

function avgConf(words: any[]): number {
  if (!words?.length) return 1
  return words.reduce((s, w) => s + (w.confidence ?? 1), 0) / words.length
}

export class DeepgramSTT {
  private _cfg: Required<Pick<DeepgramSTTConfig, 'apiKey' | 'model' | 'language'>> & DeepgramSTTConfig
  private _closed = false
  private _conn: any = null
  private _queue: Buffer[] = []

  constructor(cfg: DeepgramSTTConfig) {
    this._cfg = {
      model: 'flux-general-multi',
      language: 'es',
      eotTimeoutMs: 1500,
      eotThreshold: 0.7,
      eagerEotThreshold: 0.5,
      ...cfg,
    } as any
  }

  async start(): Promise<void> {
    const client = new DeepgramClient(this._cfg.apiKey)

    const conn = await (client.listen as any).v2.createConnection({
      model: this._cfg.model,
      encoding: 'linear16',
      sample_rate: 16000,
      language_hint: this._cfg.language,
      eot_threshold: this._cfg.eotThreshold,
      eager_eot_threshold: this._cfg.eagerEotThreshold,
      eot_timeout_ms: this._cfg.eotTimeoutMs,
    })

    conn.on('open', () => {
      console.log('[STT] connected Deepgram Flux model=%s', this._cfg.model)
      this._conn = conn
      console.log('[STT] draining %d queued chunks', this._queue.length)
      for (const chunk of this._queue) conn.sendMedia(chunk)
      this._queue = []
    })

    conn.on('message', (data: any) => {
      if (data?.type !== 'TurnInfo') {
        // nova-2 Results fallback
        if (data?.type === 'Results') {
          const alt = data?.channel?.alternatives?.[0]
          if (!alt?.transcript?.trim()) return
          const text = alt.transcript.trim()
          const conf = alt.confidence ?? 0
          if (!data.is_final) { this._cfg.onPartial?.(text); return }
          const meta: TurnMeta = { words: alt.words ?? [], durationSec: 0, turnIndex: 0, eotType: 'EndOfTurn' }
          if (!data.speech_final) {
            if (conf >= (this._cfg.eagerEotThreshold ?? 0.5)) this._cfg.onEagerEnd?.(text, conf, { ...meta, eotType: 'EagerEndOfTurn' })
            return
          }
          this._cfg.onUserStoppedSpeaking?.()
          this._cfg.onFinal?.(text, conf, meta)
        }
        return
      }

      // Flux: everything is TurnInfo, discriminated by `event`
      const text = (data.transcript ?? '').trim()
      const conf = avgConf(data.words)
      const meta: TurnMeta = {
        words: (data.words ?? []).map((w: any) => ({ word: w.word, confidence: w.confidence ?? 1, start: w.start, end: w.end })),
        durationSec: Math.max(0, (data.audio_window_end ?? 0) - (data.audio_window_start ?? 0)),
        turnIndex: data.turn_index ?? 0,
        language: data.languages?.[0] ?? undefined,
        eotType: 'EndOfTurn',
      }

      switch (data.event) {
        case 'StartOfTurn':
          this._cfg.onUserStartedSpeaking?.()
          break
        case 'Update':
          if (text) this._cfg.onPartial?.(text)
          break
        case 'EagerEndOfTurn':
          console.log('[STT] EagerEndOfTurn text=%j conf=%s', text, conf)
          if (text) this._cfg.onEagerEnd?.(text, conf, { ...meta, eotType: 'EagerEndOfTurn' })
          break
        case 'EndOfTurn':
          console.log('[STT] EndOfTurn text=%j conf=%s dur=%ss', text, conf, meta.durationSec.toFixed(2))
          this._cfg.onUserStoppedSpeaking?.()
          if (text) this._cfg.onFinal?.(text, conf, meta)
          break
        case 'TurnResumed':
          this._cfg.onTurnResumed?.()
          break
      }
    })

    conn.on('error', (e: any) => console.error('[STT] error', e))

    await new Promise<void>(resolve => {
      conn.on('close', (e: any) => { console.log('[STT] closed', e?.code); resolve() })
      conn.connect()
    })
  }

  async sendAudio(audio: Buffer): Promise<void> {
    if (this._closed) return
    if (this._conn) {
      this._conn.sendMedia(audio)
    } else {
      if (this._queue.length === 0) console.log('[STT] queueing (not open yet)')
      this._queue.push(audio)
    }
  }

  async configure(params: { eotTimeoutMs?: number; eotThreshold?: number; eagerEotThreshold?: number }): Promise<void> {
    if (params.eotTimeoutMs)      this._cfg.eotTimeoutMs      = params.eotTimeoutMs
    if (params.eotThreshold)      this._cfg.eotThreshold      = params.eotThreshold
    if (params.eagerEotThreshold) this._cfg.eagerEotThreshold = params.eagerEotThreshold
  }

  async close(): Promise<void> {
    this._closed = true
    try { this._conn?.sendFinalize() } catch {}
  }
}
