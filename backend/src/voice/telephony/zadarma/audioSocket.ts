import { StreamingFir, windowedLowPass } from '../../audio/bridge'

// Asterisk AudioSocket: type uint8, length uint16 BE, payload. PCM is LE.
export function packet(type: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  if (payload.length > 65535) throw new Error('AUDIOSOCKET_PACKET_TOO_LARGE')
  const header = Buffer.alloc(3)
  header[0] = type
  header.writeUInt16BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

export class AudioSocketParser {
  private pending = Buffer.alloc(0)
  push(chunk: Buffer): Array<{ type: number; payload: Buffer }> {
    this.pending = Buffer.concat([this.pending, chunk])
    const messages = []
    while (this.pending.length >= 3) {
      const type = this.pending[0]
      const length = this.pending.readUInt16BE(1)
      if (!([0, 1, 3, 0x10, 0xff].includes(type))) throw new Error('AUDIOSOCKET_UNSUPPORTED_TYPE')
      if ((type === 0 && length !== 0) || (type === 1 && length !== 16)
        || (type === 3 && length !== 1) || (type === 0xff && length > 1)
        || (type === 0x10 && (!length || length > 3200 || length % 2))) {
        throw new Error('AUDIOSOCKET_INVALID_LENGTH')
      }
      if (this.pending.length < length + 3) break
      messages.push({ type, payload: this.pending.subarray(3, 3 + length) })
      this.pending = this.pending.subarray(3 + length)
    }
    return messages
  }
}

export function uuidFromBytes(bytes: Buffer): string {
  if (bytes.length !== 16) throw new Error('AUDIOSOCKET_INVALID_UUID')
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const clip = (value: number) => Math.max(-32768, Math.min(32767, Math.round(value)))

/** Stateful PCM conversion without a lossy intermediate G.711 encode/decode. */
export class SipPcmBridge {
  private inputFilter = new StreamingFir(windowedLowPass(31, 3600 / 16000, 2))
  private outputFilter = new StreamingFir(windowedLowPass(47, 3600 / 24000))
  private phase = 0
  private oddByte = Buffer.alloc(0)

  input(pcm8k: Buffer): Buffer {
    if (pcm8k.length % 2) throw new Error('PCM_INPUT_ODD_LENGTH')
    const result = Buffer.alloc(pcm8k.length * 2)
    for (let i = 0; i < pcm8k.length; i += 2) {
      result.writeInt16LE(clip(this.inputFilter.process(pcm8k.readInt16LE(i))), i * 2)
      result.writeInt16LE(clip(this.inputFilter.process(0)), i * 2 + 2)
    }
    return result
  }

  output(chunk: Buffer): Buffer {
    const pcm = Buffer.concat([this.oddByte, chunk])
    const samples: number[] = []
    for (let i = 0; i + 1 < pcm.length; i += 2) {
      const sample = clip(this.outputFilter.process(pcm.readInt16LE(i)))
      if (this.phase === 0) samples.push(sample)
      this.phase = (this.phase + 1) % 3
    }
    this.oddByte = pcm.length % 2 ? Buffer.from(pcm.subarray(-1)) : Buffer.alloc(0)
    const result = Buffer.alloc(samples.length * 2)
    samples.forEach((value, i) => result.writeInt16LE(value, i * 2))
    return result
  }

  clearOutput(): void {
    this.outputFilter.reset()
    this.phase = 0
    this.oddByte = Buffer.alloc(0)
  }
}

/** Bytes de PCM16 mono a 8 kHz por milisegundo. */
const PCM8K_BYTES_PER_MS = 16

/**
 * AudioSocket does not pace audio. Send at most one 20 ms frame per tick.
 *
 * TTS delivers a whole turn in a burst, so the queue routinely holds several
 * seconds. Instead of hanging up when it exceeds a limit, `push` applies
 * backpressure: the promise resolves once the backlog drains below the soft
 * limit. Only the hard limit (a runaway response) still rejects.
 */
export class PcmPlaybackQueue {
  private data = Buffer.alloc(0)
  private waiters: Array<() => void> = []
  readonly softBytes: number
  readonly hardBytes: number
  constructor(softMs = 15_000, hardMs = 60_000) {
    this.softBytes = Math.max(320, Math.round(softMs * PCM8K_BYTES_PER_MS))
    this.hardBytes = Math.max(this.softBytes, Math.round(hardMs * PCM8K_BYTES_PER_MS))
  }
  /** Milliseconds of audio still queued. */
  get queuedMs(): number { return this.data.length / PCM8K_BYTES_PER_MS }
  get queuedBytes(): number { return this.data.length }
  /** Throws synchronously on the hard limit; otherwise resolves once below the soft limit. */
  push(pcm8k: Buffer): Promise<void> {
    if (pcm8k.length % 2) throw new Error('PCM_OUTPUT_ODD_LENGTH')
    if (this.data.length + pcm8k.length > this.hardBytes) throw new Error('AUDIO_PLAYBACK_BACKLOG')
    this.data = Buffer.concat([this.data, pcm8k])
    if (this.data.length <= this.softBytes) return Promise.resolve()
    return new Promise(resolve => { this.waiters.push(resolve) })
  }
  nextFrame(): Buffer | null {
    if (!this.data.length) return null
    const frame = Buffer.alloc(320)
    this.data.copy(frame, 0, 0, 320)
    this.data = this.data.subarray(Math.min(320, this.data.length))
    if (this.data.length <= this.softBytes) this.release()
    return frame
  }
  clear(): void {
    this.data = Buffer.alloc(0)
    this.release()
  }
  private release(): void {
    if (!this.waiters.length) return
    const waiters = this.waiters
    this.waiters = []
    for (const resolve of waiters) resolve()
  }
}
