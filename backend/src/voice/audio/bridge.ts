// μ-law G.711 table (256 entries) — ITU-T G.711 decode
const ULAW_TABLE = (() => {
  const t = new Int16Array(256)
  for (let i = 0; i < 256; i++) {
    let u = ~i & 0xff
    const sign = u & 0x80
    const exp = (u >> 4) & 0x07
    let data = u & 0x0f
    data = (data << 1) | 1
    data <<= exp + 2
    data -= 33
    t[i] = sign ? -data : data
  }
  return t
})()

// μ-law encode: linear PCM16 → μ-law byte
function lin2ulaw(sample: number): number {
  const BIAS = 0x84
  const CLIP = 32767
  let sign = 0
  if (sample < 0) { sign = 0x80; sample = -sample }
  if (sample > CLIP) sample = CLIP
  sample += BIAS
  let exp = 7
  for (let expMask = 0x4000; (sample & expMask) === 0 && exp > 0; exp--, expMask >>= 1) {}
  const mantissa = (sample >> (exp + 3)) & 0x0f
  return ~(sign | (exp << 4) | mantissa) & 0xff
}

const TWILIO_RATE = 8000
const GEMINI_IN_RATE = 16000
const GEMINI_OUT_RATE = 24000
const TWILIO_FRAME_BYTES = 160

export class AudioBridge {
  private _outBuffer = Buffer.alloc(0)

  // μ-law 8k → PCM16 16k (upsample ×2 via linear interpolation)
  twilioToGemini(ulaw8k: Buffer): Buffer {
    const n = ulaw8k.length
    const pcm8k = new Int16Array(n)
    for (let i = 0; i < n; i++) pcm8k[i] = ULAW_TABLE[ulaw8k[i]]

    // Upsample 8k→16k: linear interp
    const out = new Int16Array(n * 2)
    for (let i = 0; i < n - 1; i++) {
      out[i * 2] = pcm8k[i]
      out[i * 2 + 1] = (pcm8k[i] + pcm8k[i + 1]) >> 1
    }
    if (n > 0) {
      out[(n - 1) * 2] = pcm8k[n - 1]
      out[(n - 1) * 2 + 1] = pcm8k[n - 1]
    }
    return Buffer.from(out.buffer)
  }

  // PCM16 24k → μ-law 8k frames (decimate by 3)
  geminiToTwilioFrames(pcm24k: Buffer): Buffer[] {
    const samples = new Int16Array(pcm24k.buffer, pcm24k.byteOffset, pcm24k.byteLength >> 1)
    const decimated = Math.floor(samples.length / 3)
    const ulaw = Buffer.allocUnsafe(decimated)
    for (let i = 0; i < decimated; i++) ulaw[i] = lin2ulaw(samples[i * 3])
    this._outBuffer = Buffer.concat([this._outBuffer, ulaw])
    return this._drainFullFrames()
  }

  // ElevenLabs ulaw_8000 direct → frames
  packUlawFrames(ulaw: Buffer): Buffer[] {
    this._outBuffer = Buffer.concat([this._outBuffer, ulaw])
    return this._drainFullFrames()
  }

  clearOutput(): void {
    this._outBuffer = Buffer.alloc(0)
  }

  flush(): Buffer[] {
    if (this._outBuffer.length === 0) return []
    const rem = this._outBuffer.length % TWILIO_FRAME_BYTES
    if (rem !== 0) {
      const pad = Buffer.alloc(TWILIO_FRAME_BYTES - rem, 0xff)
      this._outBuffer = Buffer.concat([this._outBuffer, pad])
    }
    return this._drainFullFrames()
  }

  private _drainFullFrames(): Buffer[] {
    const frames: Buffer[] = []
    while (this._outBuffer.length >= TWILIO_FRAME_BYTES) {
      frames.push(this._outBuffer.slice(0, TWILIO_FRAME_BYTES))
      this._outBuffer = this._outBuffer.slice(TWILIO_FRAME_BYTES)
    }
    return frames
  }
}
