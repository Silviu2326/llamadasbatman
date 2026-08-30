// PCM16 LE utilities — no external deps

function rmsFloat(pcm: Buffer): number {
  if (pcm.length < 2) return 0
  const n = pcm.length >> 1
  let sum = 0
  for (let i = 0; i < n; i++) {
    const s = pcm.readInt16LE(i * 2) / 32768
    sum += s * s
  }
  return Math.sqrt(sum / n)
}

export function rmsLevel(pcm: Buffer): number {
  return Math.min(rmsFloat(pcm), 1)
}

export function isSpeech(pcm: Buffer, threshold = 0.02): boolean {
  return rmsLevel(pcm) >= threshold
}

export function autoGain(pcm: Buffer, targetRms = 0.12, maxGain = 4.0): Buffer {
  if (pcm.length < 2) return pcm
  const level = rmsFloat(pcm)
  if (level < 1e-5) return pcm
  const gain = Math.min(targetRms / level, maxGain)
  const out = Buffer.allocUnsafe(pcm.length)
  const n = pcm.length >> 1
  for (let i = 0; i < n; i++) {
    const s = Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i * 2) * gain)))
    out.writeInt16LE(s, i * 2)
  }
  return out
}

export function noiseGate(pcm: Buffer, floor = 0.01): Buffer {
  if (pcm.length < 2) return pcm
  const level = rmsFloat(pcm)
  if (level >= floor) return pcm
  const out = Buffer.allocUnsafe(pcm.length)
  const n = pcm.length >> 1
  for (let i = 0; i < n; i++) {
    out.writeInt16LE(Math.round(pcm.readInt16LE(i * 2) * 0.3), i * 2)
  }
  return out
}

export type InboundAudioProcessorOptions = {
  sampleRate?: number
  targetRms?: number
  maxGain?: number
  noiseFloor?: number
  closedGateGain?: number
  gainAttackMs?: number
  gainReleaseMs?: number
  gateAttackMs?: number
  gateReleaseMs?: number
}

/**
 * Stateful telephony AGC and soft gate.
 *
 * Gain and gate envelopes survive across Twilio frames, preventing the audible
 * pumping caused by recalculating both independently every 20 ms.
 */
export class InboundAudioProcessor {
  private gain = 1
  private gate = 1
  private readonly sampleRate: number
  private readonly targetRms: number
  private readonly maxGain: number
  private readonly noiseFloor: number
  private readonly closedGateGain: number
  private readonly gainAttackMs: number
  private readonly gainReleaseMs: number
  private readonly gateAttackMs: number
  private readonly gateReleaseMs: number

  constructor(options: InboundAudioProcessorOptions = {}) {
    this.sampleRate = options.sampleRate ?? 16_000
    this.targetRms = options.targetRms ?? 0.1
    this.maxGain = options.maxGain ?? 3
    this.noiseFloor = options.noiseFloor ?? 0.008
    this.closedGateGain = options.closedGateGain ?? 0.25
    this.gainAttackMs = options.gainAttackMs ?? 45
    this.gainReleaseMs = options.gainReleaseMs ?? 500
    this.gateAttackMs = options.gateAttackMs ?? 30
    this.gateReleaseMs = options.gateReleaseMs ?? 160
  }

  process(pcm: Buffer): Buffer {
    if (pcm.length < 2) return pcm
    const level = rmsFloat(pcm)
    const sampleCount = pcm.length >> 1
    const frameMs = sampleCount / this.sampleRate * 1000
    const desiredGate = level >= this.noiseFloor ? 1 : this.closedGateGain
    const gateTime = desiredGate > this.gate ? this.gateAttackMs : this.gateReleaseMs
    this.gate = smooth(this.gate, desiredGate, frameMs, gateTime)

    // Never amplify frames classified as noise. Speech gain changes quickly
    // when clipping is possible and slowly when recovering quiet voices.
    const desiredGain = level < this.noiseFloor || level < 1e-5
      ? Math.min(this.gain, 1)
      : Math.max(0.35, Math.min(this.targetRms / level, this.maxGain))
    const gainTime = desiredGain < this.gain ? this.gainAttackMs : this.gainReleaseMs
    this.gain = smooth(this.gain, desiredGain, frameMs, gainTime)

    const totalGain = this.gain * this.gate
    const out = Buffer.allocUnsafe(pcm.length)
    for (let index = 0; index < sampleCount; index += 1) {
      const value = Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(index * 2) * totalGain)))
      out.writeInt16LE(value, index * 2)
    }
    return out
  }

  reset(): void {
    this.gain = 1
    this.gate = 1
  }

  state(): { gain: number; gate: number } {
    return { gain: this.gain, gate: this.gate }
  }
}

function smooth(current: number, target: number, frameMs: number, timeMs: number): number {
  if (timeMs <= 0) return target
  const alpha = 1 - Math.exp(-Math.max(frameMs, 0.1) / timeMs)
  return current + (target - current) * alpha
}

export function preprocessInbound(pcm: Buffer): Buffer {
  return autoGain(noiseGate(pcm))
}
