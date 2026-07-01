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

export function preprocessInbound(pcm: Buffer): Buffer {
  return autoGain(noiseGate(pcm))
}
