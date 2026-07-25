export type TurnState =
  | 'LISTENING'
  | 'USER_MAY_CONTINUE'
  | 'USER_FINISHED'
  | 'USER_INTERRUPTING'
  | 'BACKCHANNEL'
  | 'NOISE'

export type TurnDecision = {
  state: TurnState
  atMs: number
  rms: number
  reason: 'speech_energy' | 'speech_ended' | 'debounced' | 'silence'
}

export type TurnManagerOptions = {
  threshold: number
  requiredFrames: number
  minimumSpeechMs: number
  debounceMs: number
}

const DEFAULTS: TurnManagerOptions = {
  threshold: 0.04,
  requiredFrames: 4,
  minimumSpeechMs: 200,
  debounceMs: 500,
}

/**
 * Small synchronous turn guard for the telephony hot path.
 *
 * It deliberately does not pretend to be semantic turn detection. Its job is
 * to provide deterministic acoustic barge-in protection while a semantic
 * detector such as Smart Turn can be added behind the same interface.
 */
export class TurnManager {
  private readonly options: TurnManagerOptions
  private energyFrames = 0
  private speechStartMs = 0
  private lastInterruptMs = 0
  private state: TurnState = 'LISTENING'

  constructor(options: Partial<TurnManagerOptions> = {}) {
    this.options = { ...DEFAULTS, ...options }
  }

  observeRms(rms: number, nowMs = Date.now()): TurnDecision | null {
    if (!Number.isFinite(rms) || rms < 0) return null

    if (rms >= this.options.threshold) {
      this.energyFrames += 1
      if (this.speechStartMs === 0) this.speechStartMs = nowMs
      this.state = this.energyFrames >= this.options.requiredFrames
        ? 'USER_INTERRUPTING'
        : 'USER_MAY_CONTINUE'

      const duration = nowMs - this.speechStartMs
      if (
        this.state === 'USER_INTERRUPTING' &&
        duration >= this.options.minimumSpeechMs &&
        nowMs - this.lastInterruptMs >= this.options.debounceMs
      ) {
        this.lastInterruptMs = nowMs
        return { state: 'USER_INTERRUPTING', atMs: nowMs, rms, reason: 'speech_energy' }
      }

      return null
    }

    this.energyFrames = Math.max(0, this.energyFrames - 1)
    if (this.energyFrames === 0) {
      const hadSpeech = this.speechStartMs !== 0
      this.speechStartMs = 0
      this.state = 'LISTENING'
      if (hadSpeech) return { state: 'LISTENING', atMs: nowMs, rms, reason: 'speech_ended' }
    }
    return null
  }

  markSemanticFinished(nowMs = Date.now()): TurnDecision {
    this.state = 'USER_FINISHED'
    return { state: this.state, atMs: nowMs, rms: 0, reason: 'silence' }
  }

  markBackchannel(nowMs = Date.now()): TurnDecision {
    this.state = 'BACKCHANNEL'
    return { state: this.state, atMs: nowMs, rms: 0, reason: 'debounced' }
  }

  getState(): TurnState {
    return this.state
  }

  reset(): void {
    this.energyFrames = 0
    this.speechStartMs = 0
    this.lastInterruptMs = 0
    this.state = 'LISTENING'
  }
}
