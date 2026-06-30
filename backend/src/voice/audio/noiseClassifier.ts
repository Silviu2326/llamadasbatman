export type NoiseType = 'limpio' | 'ruido_constante' | 'ruido_impulsivo'

const EOT_MS: Record<NoiseType, number> = {
  limpio: 2500,
  ruido_constante: 3500,
  ruido_impulsivo: 4000,
}

const WINDOW = 150
const UPDATE_EVERY = 30
const CLEAN_MAX = 0.008
const CONSTANT_MAX = 0.025

export class NoiseClassifier {
  private _buf: number[] = []
  private _noiseType: NoiseType = 'limpio'
  private _lastReported: NoiseType = 'limpio'
  private _speaking = false
  private _tick = 0

  setSpeaking(speaking: boolean): void { this._speaking = speaking }

  update(rms: number): void {
    if (this._speaking) return
    this._buf.push(rms)
    if (this._buf.length > WINDOW) this._buf.shift()
    this._tick++
    if (this._tick >= UPDATE_EVERY && this._buf.length >= UPDATE_EVERY) {
      this._noiseType = this._classify()
      this._tick = 0
    }
  }

  noiseTypeChanged(): boolean {
    if (this._noiseType !== this._lastReported) {
      this._lastReported = this._noiseType
      return true
    }
    return false
  }

  currentType(): NoiseType { return this._noiseType }
  suggestedEotMs(): number { return EOT_MS[this._noiseType] }

  private _classify(): NoiseType {
    const arr = this._buf
    const n = arr.length
    const mean = arr.reduce((a, b) => a + b, 0) / n
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n
    const std = Math.sqrt(variance)

    if (mean < CLEAN_MAX) return 'limpio'
    const cv = mean > 1e-6 ? std / mean : 0
    if (cv > 0.7) return 'ruido_impulsivo'
    if (mean < CONSTANT_MAX) return 'ruido_constante'
    return 'ruido_impulsivo'
  }
}
