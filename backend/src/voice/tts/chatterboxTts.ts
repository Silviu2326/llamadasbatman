import http from 'http'
import { VoiceProfile, DEFAULT_PROFILE, getProfile, applyModifiers, preprocessText } from './voiceProfiles'
import { normalizeForSpeech } from './prosodyController'
import { TurnStyle, serToEmocion } from './mirroringPolicy'

type AudioCallback = (audio: Buffer) => Promise<void>

interface ChatterboxTTSConfig {
  onAudio: AudioCallback
  baseUrl?: string
}

const SAMPLE_RATE = 24000

function chatterboxBaseUrl(): string {
  return process.env.CHATTERBOX_URL ?? 'http://127.0.0.1:8600'
}

// Capa 1 (oir): clasifica la emocion del prospecto desde su audio crudo (PCM16 16kHz)
// usando el endpoint /ser del servidor Chatterbox. Devuelve emocion del vocabulario
// del sistema o null si el servidor no responde.
export async function classifySpeechEmotion(pcm16k: Buffer, baseUrl = chatterboxBaseUrl()): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.request(`${baseUrl}/ser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': pcm16k.length },
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try {
          const { label, scores } = JSON.parse(Buffer.concat(chunks).toString())
          // ponytail: umbral 0.7 — el SER confunde energia alta con enfado; solo señales claras
          resolve(scores?.[label] >= 0.7 ? serToEmocion(label) : null)
        } catch { resolve(null) }
      })
      res.on('error', () => resolve(null))
    })
    req.on('error', () => resolve(null))
    req.setTimeout(2000, () => { req.destroy(); resolve(null) })
    req.write(pcm16k)
    req.end()
  })
}

// Cliente del servidor local tts-chatterbox/server.py (Chatterbox Turbo/Nano).
// Misma interfaz que ElevenLabsTTS: sendText por frases -> PCM16 mono 24kHz via onAudio.
// Capa 3 (transmitir): setTurnStyle aplica voz/ritmo/pausa decididos por mirrorPolicy.
export class ChatterboxTTS {
  private _baseUrl: string
  private _onAudio: AudioCallback
  private _closed = false
  private _pending = ''
  private _cancelled = false
  private _profile: VoiceProfile = DEFAULT_PROFILE
  private _emocion = 'neutro'
  private _estadoAcustico = 'desconocido'
  private _style: TurnStyle | null = null
  private _prePausePending = false

  constructor(cfg: ChatterboxTTSConfig) {
    this._onAudio = cfg.onAudio
    this._baseUrl = cfg.baseUrl ?? chatterboxBaseUrl()
  }

  async start(): Promise<void> {
    await new Promise<void>(resolve => { if (this._closed) resolve() })
  }

  async close(): Promise<void> { this._closed = true }

  setVoiceProfile(formato: string): void {
    this._profile = getProfile(formato)
  }

  setProspectSignals(emocion: string, estadoAcustico: string): void {
    this._emocion = emocion
    this._estadoAcustico = estadoAcustico
  }

  setTurnStyle(style: TurnStyle): void {
    this._style = style
    this._prePausePending = style.preResponsePauseMs > 0
  }

  async sendText(text: string, flush = false): Promise<void> {
    if (this._cancelled) return
    this._pending += text

    const re = /[.!?]+(?=\s|$)/
    let m: RegExpExecArray | null
    while ((m = re.exec(this._pending)) !== null) {
      const end = m.index + m[0].length
      const sentence = this._pending.slice(0, end).trim()
      this._pending = this._pending.slice(end).trimStart()
      if (sentence) await this._generate(sentence)
    }

    if (flush && this._pending.trim()) {
      await this._generate(this._pending.trim())
      this._pending = ''
    }
  }

  async flush(): Promise<void> {
    if (this._pending.trim()) {
      await this._generate(this._pending)
      this._pending = ''
    }
  }

  async cancel(): Promise<void> {
    this._cancelled = true
    this._pending = ''
    this._prePausePending = false
    await new Promise(r => setTimeout(r, 50))
    this._cancelled = false
  }

  private async _generate(text: string): Promise<void> {
    if (this._cancelled || this._closed) return
    const profile = applyModifiers(this._profile, this._emocion, this._estadoAcustico)
    const processed = preprocessText(normalizeForSpeech(text), profile)
    if (!processed) return
    // Pausa pre-respuesta adaptativa: silencio PCM antes del primer audio del turno
    if (this._prePausePending && this._style) {
      this._prePausePending = false
      await this._onAudio(Buffer.alloc(Math.round(this._style.preResponsePauseMs * SAMPLE_RATE * 2 / 1000) & ~1))
    }
    // ponytail: Turbo/Nano ignoran exaggeration — los actuadores reales son voice y rate.
    // rate del mirroring manda; sin estilo de turno, cae al speed del perfil de formato.
    const body = JSON.stringify({
      text: processed,
      voice: this._style?.voice ?? 'default',
      rate: this._style?.rate ?? profile.speed,
    })
    const t0 = Date.now()

    await new Promise<void>((resolve) => {
      const req = http.request(`${this._baseUrl}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          console.error('[TTS:chatterbox] Error HTTP', res.statusCode)
          res.on('end', resolve)
          return
        }
        let leftover = Buffer.alloc(0)
        res.on('data', (chunk: Buffer) => {
          if (this._cancelled) return
          const combined = leftover.length ? Buffer.concat([leftover, chunk]) : chunk
          const evenLen = combined.length & ~1
          leftover = evenLen < combined.length ? combined.slice(evenLen) : Buffer.alloc(0)
          if (evenLen > 0) this._onAudio(combined.slice(0, evenLen)).catch(() => {})
        })
        res.on('end', () => {
          if (leftover.length) this._onAudio(Buffer.concat([leftover, Buffer.alloc(1)])).catch(() => {})
          console.log('[TTS:chatterbox] generate done', { ms: Date.now() - t0, text: processed.slice(0, 60) })
          resolve()
        })
        res.on('error', () => resolve())
      })
      req.on('error', (e) => { console.error('[TTS:chatterbox] request error', e.message); resolve() })
      req.write(body)
      req.end()
    })
  }
}
