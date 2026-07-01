import https from 'https'
import { VoiceProfile, DEFAULT_PROFILE, getProfile, applyModifiers, preprocessText } from './voiceProfiles'

type AudioCallback = (audio: Buffer) => Promise<void>

interface ElevenLabsTTSConfig {
  apiKey: string
  voiceId: string
  onAudio: AudioCallback
  sampleRate?: number
  outputFormat?: string
  modelId?: string
  latencyOptimization?: number
}

export class ElevenLabsTTS {
  private _cfg: Required<ElevenLabsTTSConfig>
  private _closed = false
  private _pending = ''
  private _cancelled = false
  private _profile: VoiceProfile = DEFAULT_PROFILE
  private _emocion = 'neutro'
  private _estadoAcustico = 'desconocido'

  constructor(cfg: ElevenLabsTTSConfig) {
    this._cfg = {
      sampleRate: 24000,
      outputFormat: 'pcm_24000',
      modelId: 'eleven_flash_v2_5',
      latencyOptimization: 0,
      ...cfg,
    }
  }

  async start(): Promise<void> {
    // REST-based: nothing to hold open
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

  async sendText(text: string, flush = false): Promise<void> {
    if (this._cancelled) return
    this._pending += text

    // Fire a TTS request for each complete sentence (.!?) as it accumulates
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
    await new Promise(r => setTimeout(r, 50))
    this._cancelled = false
  }

  private _effectiveProfile(): VoiceProfile {
    return applyModifiers(this._profile, this._emocion, this._estadoAcustico)
  }

  private async _generate(text: string): Promise<void> {
    if (this._cancelled || this._closed) return
    const profile = this._effectiveProfile()
    const processed = preprocessText(text, profile)

    const body = JSON.stringify({
      text: processed,
      model_id: this._cfg.modelId,
      voice_settings: {
        stability: profile.stability,
        similarity_boost: profile.similarityBoost,
        style: profile.style,
        use_speaker_boost: true,
        speed: profile.speed,
      },
    })

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this._cfg.voiceId}/stream?output_format=${this._cfg.outputFormat}`

    await new Promise<void>((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this._cfg.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        if (res.statusCode !== 200) {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            console.error('[TTS] Error HTTP', res.statusCode, Buffer.concat(chunks).toString().slice(0, 200))
            resolve()
          })
          return
        }

        // PCM16 = 2 bytes/sample. HTTP chunks can have odd length → keep
        // leftover byte and prepend it to the next chunk so we always send
        // an even number of bytes (complete samples, no boundary pops).
        let leftover = Buffer.alloc(0)

        res.on('data', (chunk: Buffer) => {
          if (this._cancelled) return
          const combined = leftover.length ? Buffer.concat([leftover, chunk]) : chunk
          const evenLen  = combined.length & ~1
          leftover       = evenLen < combined.length ? combined.slice(evenLen) : Buffer.alloc(0)
          if (evenLen > 0) this._cfg.onAudio(combined.slice(0, evenLen)).catch(() => {})
        })
        res.on('end', () => {
          if (leftover.length) {
            // Pad odd byte with a zero sample so the last frame is clean
            this._cfg.onAudio(Buffer.concat([leftover, Buffer.alloc(1)])).catch(() => {})
          }
          resolve()
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }
}
