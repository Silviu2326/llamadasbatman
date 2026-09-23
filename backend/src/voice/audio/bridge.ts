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

export function windowedLowPass(taps: number, cutoff: number, gain = 1): Float64Array {
  if (taps < 3 || taps % 2 === 0) throw new Error('FIR taps must be an odd number >= 3')
  if (!(cutoff > 0 && cutoff < 0.5)) throw new Error('FIR cutoff must be between 0 and Nyquist')
  const coefficients = new Float64Array(taps)
  const midpoint = (taps - 1) / 2
  let sum = 0
  for (let index = 0; index < taps; index += 1) {
    const distance = index - midpoint
    const sinc = distance === 0
      ? 2 * cutoff
      : Math.sin(2 * Math.PI * cutoff * distance) / (Math.PI * distance)
    const hamming = 0.54 - 0.46 * Math.cos(2 * Math.PI * index / (taps - 1))
    coefficients[index] = sinc * hamming
    sum += coefficients[index]
  }
  for (let index = 0; index < taps; index += 1) coefficients[index] = coefficients[index] / sum * gain
  return coefficients
}

export class StreamingFir {
  private readonly history: Float64Array
  private cursor = 0

  constructor(private readonly coefficients: Float64Array) {
    this.history = new Float64Array(coefficients.length)
  }

  process(sample: number): number {
    this.history[this.cursor] = sample
    let value = 0
    for (let tap = 0; tap < this.coefficients.length; tap += 1) {
      const historyIndex = (this.cursor - tap + this.history.length) % this.history.length
      value += this.coefficients[tap] * this.history[historyIndex]
    }
    this.cursor = (this.cursor + 1) % this.history.length
    return value
  }

  reset(): void {
    this.history.fill(0)
    this.cursor = 0
  }
}

function clipPcm16(sample: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(sample)))
}

export class AudioBridge {
  private _outBuffer = Buffer.alloc(0)
  // 8 kHz contains no valid energy above 4 kHz. At the 16 kHz output rate a
  // 3.6 kHz cutoff leaves transition room and removes interpolation images.
  private readonly inboundFilter = new StreamingFir(windowedLowPass(31, 3_600 / GEMINI_IN_RATE, 2))
  // Before decimating 24 -> 8 kHz, remove content that would fold below the
  // 4 kHz telephony Nyquist frequency.
  private readonly outboundFilter = new StreamingFir(windowedLowPass(47, 3_600 / GEMINI_OUT_RATE))
  private outboundPhase = 0

  // μ-law 8k → PCM16 16k (zero insertion + stateful reconstruction FIR)
  twilioToGemini(ulaw8k: Buffer): Buffer {
    const n = ulaw8k.length
    const out = new Int16Array(n * 2)
    for (let i = 0; i < n; i += 1) {
      const sample = ULAW_TABLE[ulaw8k[i]]
      out[i * 2] = clipPcm16(this.inboundFilter.process(sample))
      out[i * 2 + 1] = clipPcm16(this.inboundFilter.process(0))
    }
    return Buffer.from(out.buffer, out.byteOffset, out.byteLength)
  }

  // PCM16 24k → low-pass → μ-law 8k frames (stateful decimation by 3)
  geminiToTwilioFrames(pcm24k: Buffer): Buffer[] {
    const sampleCount = pcm24k.byteLength >> 1
    const encoded: number[] = []
    for (let index = 0; index < sampleCount; index += 1) {
      const filtered = this.outboundFilter.process(pcm24k.readInt16LE(index * 2))
      if (this.outboundPhase === 0) encoded.push(lin2ulaw(clipPcm16(filtered)))
      this.outboundPhase = (this.outboundPhase + 1) % 3
    }
    const ulaw = Buffer.from(encoded)
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
    this.outboundFilter.reset()
    this.outboundPhase = 0
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
