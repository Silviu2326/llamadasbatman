export interface ProsodicFeatures {
  meanRms: number
  rmsStd: number
  zcrMean: number
  speechRatio: number
  speakingRate: number
  durationS: number
}

export type AcousticLabel = 'agitado' | 'energico' | 'tenso' | 'calmado' | 'plano'

export interface AcousticState {
  label: AcousticLabel
  confidence: number
  features: ProsodicFeatures
}

const FRAME_SAMPLES = 320   // 20ms @ 16kHz
const BYTES_PER_SEC = 32000 // PCM16 16kHz
const SPEECH_FLOOR = 0.02
const MIN_DURATION_S = 0.1

export class ProsodicBuffer {
  private _chunks: Buffer[] = []
  private _active = false

  startTurn(): void { this._chunks = []; this._active = true }
  add(pcm: Buffer): void { if (this._active) this._chunks.push(pcm) }
  stopTurn(): void { this._active = false }
  turnAudio(): Buffer | null { return this._chunks.length ? Buffer.concat(this._chunks) : null }

  analyze(wordCount = 0): AcousticState | null {
    if (this._chunks.length === 0) return null
    const raw = Buffer.concat(this._chunks)
    const durationS = raw.length / BYTES_PER_SEC
    if (durationS < MIN_DURATION_S) return null

    const n = raw.length >> 1
    const samples: number[] = []
    for (let i = 0; i < n; i++) samples.push(raw.readInt16LE(i * 2) / 32768)

    const nFrames = Math.floor(samples.length / FRAME_SAMPLES)
    if (nFrames < 3) return null

    // RMS per frame
    const rmsArr: number[] = []
    for (let f = 0; f < nFrames; f++) {
      const slice = samples.slice(f * FRAME_SAMPLES, (f + 1) * FRAME_SAMPLES)
      const rms = Math.sqrt(slice.reduce((s, v) => s + v * v, 0) / slice.length)
      rmsArr.push(rms)
    }

    const meanRms = rmsArr.reduce((a, b) => a + b, 0) / rmsArr.length
    const rmsVar = rmsArr.reduce((a, b) => a + (b - meanRms) ** 2, 0) / rmsArr.length
    const rmsStd = Math.sqrt(rmsVar)

    const speechMask = rmsArr.map(r => r > SPEECH_FLOOR)
    const speechRatio = speechMask.filter(Boolean).length / rmsArr.length

    // ZCR on voiced frames only
    let zcrSum = 0, zcrCount = 0
    for (let f = 0; f < nFrames; f++) {
      if (!speechMask[f]) continue
      const slice = samples.slice(f * FRAME_SAMPLES, (f + 1) * FRAME_SAMPLES)
      let crossings = 0
      for (let i = 1; i < slice.length; i++) {
        if ((slice[i] >= 0) !== (slice[i - 1] >= 0)) crossings++
      }
      zcrSum += crossings / FRAME_SAMPLES
      zcrCount++
    }
    const zcrMean = zcrCount > 0 ? zcrSum / zcrCount : 0

    const speakingRate = durationS > 0 && wordCount > 0 ? wordCount / durationS : 0

    const feats: ProsodicFeatures = { meanRms, rmsStd, zcrMean, speechRatio, speakingRate, durationS }
    return classify(feats)
  }
}

function classify(f: ProsodicFeatures): AcousticState {
  if (f.meanRms > 0.15 && f.zcrMean > 0.07)
    return { label: 'agitado', confidence: Math.min(1, f.meanRms * 3.5 + f.zcrMean * 2.5), features: f }
  if (f.meanRms > 0.08 && f.rmsStd > 0.035)
    return { label: 'energico', confidence: Math.min(1, f.rmsStd * 18 + f.meanRms * 2), features: f }
  if (f.zcrMean > 0.09 && f.meanRms > 0.03 && f.meanRms < 0.12)
    return { label: 'tenso', confidence: Math.min(1, f.zcrMean * 7), features: f }
  if (f.meanRms >= 0.03 && f.meanRms <= 0.10)
    return { label: 'calmado', confidence: 0.7, features: f }
  return { label: 'plano', confidence: 0.6, features: f }
}
