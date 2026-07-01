import { CallContext, elapsedSeconds } from '../intelligence/conversation/callContext'
import { GuruBrief, defaultBrief, briefToSystemPrompt } from '../intelligence/conversation/guruBrief'
import { DeepgramSTT, TurnMeta } from '../stt/deepgram'
import { ElevenLabsTTS } from '../tts/elevenLabsTts'
import { CerebrasAgent } from '../intelligence/llm/cerebras'
import { GuruSupervisor, detectObjection, detectLoop, detectStall } from '../intelligence/conversation/guruSupervisor'
import { ProsodicBuffer, AcousticState } from '../audio/prosodic'
import {
  CallRhythm, createRhythm, sttConfigForFormat, classifyUtterance,
  utteranceVoiceOverlay, suggestedMaxFrases, formatForInterruptionLevel,
  rhythmInterruptionRate,
} from '../coordinator'
import { getProfile } from '../tts/voiceProfiles'

type AudioSender = (audio: Buffer) => Promise<void>
type InterruptCallback = () => Promise<void>
type TranscriptCallback = (role: string, text: string, meta?: Record<string, unknown>) => Promise<void>

export class DeepgramElevenLabsSession {
  private _stt: DeepgramSTT | null = null
  private _tts: ElevenLabsTTS | null = null
  private _llm: CerebrasAgent | null = null
  private _guru: GuruSupervisor | null = null
  private _currentBrief: GuruBrief
  private _prosodic = new ProsodicBuffer()
  private _lastAcoustic: AcousticState | null = null
  private _turnCount = 0
  private _agentResponses: string[] = []
  private _neutralTurns = 0
  private _triedEstructuras: string[] = []
  private _lastObjection = ''
  private _rhythm: CallRhythm
  private _agentTurnActive = false
  private _speculativeTask: Promise<void> | null = null
  private _speculativeText = ''
  private _activeAbort: AbortController | null = null
  private _closed = false
  private _history: Array<{ role: string; content: string }> = []
  private _onAudio: AudioSender | null = null
  private _onInterrupt: InterruptCallback | null = null
  private _onTranscript: TranscriptCallback | null = null

  // latency tracking
  private _tEot  = 0 // when user finished speaking (EndOfTurn / onFinal received)
  private _tLlm  = 0 // when LLM response ready
  private _tTts  = 0 // when first TTS audio sent
  private _tTtsFirstPending = false

  constructor(private ctx: CallContext, private systemPrompt: string) {
    this._currentBrief = defaultBrief()
    this._rhythm = createRhythm()
  }

  async attach(onAudio: AudioSender, onInterrupt?: InterruptCallback, onTranscript?: TranscriptCallback): Promise<void> {
    this._onAudio = onAudio
    this._onInterrupt = onInterrupt ?? null
    this._onTranscript = onTranscript ?? null
  }

  async sendAudio(pcm16k: Buffer): Promise<void> {
    this._prosodic.add(pcm16k)
    await this._stt?.sendAudio(pcm16k)
  }

  async updateEotTimeout(ms: number): Promise<void> {
    await this._stt?.configure({ eotTimeoutMs: ms })
  }

  async close(): Promise<void> {
    this._closed = true
    await this._stt?.close()
    await this._tts?.close()
    await this._llm?.close()
    await this._guru?.close()
  }

  async run(): Promise<void> {
    const cfg = this.ctx.agentConfig

    if (process.env.DUAL_MODEL_ENABLED === 'true' && process.env.CLAUDE_API_KEY) {
      this._guru = new GuruSupervisor(process.env.CLAUDE_API_KEY, process.env.CLAUDE_MODEL)
    }

    this._llm = new CerebrasAgent(
      process.env.CEREBRAS_API_KEY!,
      process.env.CEREBRAS_MODEL ?? 'llama-3.3-70b',
      parseInt(process.env.CEREBRAS_TIMEOUT_SECONDS ?? '8'),
      this.systemPrompt,
    )

    this._tts = new ElevenLabsTTS({
      apiKey: process.env.ELEVENLABS_API_KEY!,
      voiceId: cfg?.voice?.elevenLabsVoiceId ?? process.env.ELEVENLABS_VOICE_ID!,
      onAudio: this._onTtsAudio.bind(this),
      outputFormat: process.env.ELEVENLABS_TTS_FORMAT ?? 'pcm_24000',
      modelId: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_flash_v2_5',
      latencyOptimization: parseInt(process.env.ELEVENLABS_LATENCY_OPT ?? '0'),
    })
    this._tts.setVoiceProfile(this._currentBrief.formato)

    const initStt = sttConfigForFormat(this._currentBrief.formato)
    this._stt = new DeepgramSTT({
      apiKey: process.env.DEEPGRAM_API_KEY!,
      model: process.env.DEEPGRAM_MODEL ?? 'flux-general-multi',
      language: process.env.DEEPGRAM_LANGUAGE ?? 'es',
      eotTimeoutMs: initStt.eotTimeoutMs,
      eotThreshold: initStt.eotThreshold,
      eagerEotThreshold: initStt.eagerEotThreshold,
      onPartial: t => { this._onTranscript?.('partial', t) },
      onEagerEnd: (t, c, meta) => { this._onEagerEnd(t, c, meta) },
      onTurnResumed: () => { this._cancelSpeculative() },
      onFinal: (t, c, meta) => { this._tEot = Date.now(); this._onSttFinal(t, c, meta) },
      onUserStartedSpeaking: () => { this._onSpeakingStart() },
      onUserStoppedSpeaking: () => { this._prosodic.stopTurn() },
    })

    // Send opening greeting and start loops
    setTimeout(() => this._sendOpening(), 300)

    const ttsTask = this._tts.start()
    const sttTask = this._stt.start()
    await Promise.race([ttsTask, sttTask])
  }

  // ── TTS audio ──────────────────────────────────────────────────────────────

  private async _onTtsAudio(audio: Buffer): Promise<void> {
    if (this._tTtsFirstPending) { this._tTts = Date.now(); this._tTtsFirstPending = false }
    if (this._onAudio) await this._onAudio(audio)
  }

  // ── STT callbacks ──────────────────────────────────────────────────────────

  private _onEagerEnd(text: string, _conf: number, _meta?: TurnMeta): void {
    if (this._speculativeTask) return // ponytail: one speculative generation in flight at a time — avoids duplicate 'agente' responses when Flux refires EagerEndOfTurn
    this._speculativeText = text
    this._speculativeTask = this._handleUserText(text, true).catch(() => {})
  }

  private _cancelSpeculative(): boolean {
    if (this._speculativeTask || this._speculativeText) {
      this._activeAbort?.abort() // stop the in-flight LLM call for real, not just the bookkeeping
      this._activeAbort = null
      this._speculativeTask = null
      this._speculativeText = ''
      return true
    }
    return false
  }

  private _onSpeakingStart(): void {
    this._prosodic.startTurn()
    if (this._agentTurnActive) this._rhythm.interruptionCount++
    this._cancelSpeculative() // barge-in: kill any pending speculative before user speaks
    this._onInterrupt?.()
  }

  private _onSttFinal(text: string, confidence: number, sttMeta: TurnMeta): void {
    text = text.trim()
    if (!text) return

    const wordList = text.toLowerCase().split(/\s+/)
    if (wordList.length >= 4) {
      const top = wordList.reduce((acc: Record<string, number>, w) => { acc[w] = (acc[w] ?? 0) + 1; return acc }, {})
      const maxCount = Math.max(...Object.values(top))
      if (maxCount / wordList.length > 0.6) { this._cancelSpeculative(); return }
    }

    const acoustic = this._prosodic.analyze(wordList.length)
    this._lastAcoustic = acoustic

    this._turnCount++
    this._rhythm.prospectWordCounts.push(wordList.length)
    if (this._rhythm.prospectWordCounts.length > 6) this._rhythm.prospectWordCounts.shift()

    const wpm = sttMeta.durationSec > 0.5
      ? Math.round(wordList.length / sttMeta.durationSec * 60)
      : undefined

    this._onTranscript?.('prospecto', text, {
      confidence,
      words: sttMeta.words,
      durationSec: sttMeta.durationSec,
      wpm,
      eotType: sttMeta.eotType,
      language: sttMeta.language,
    })

    const acousticLabel = acoustic?.label ?? 'desconocido'
    const emocionNow = this.ctx.emotion

    this._tts?.setProspectSignals(emocionNow, acousticLabel)

    // Background emotion classification
    this._llm?.classifyEmotion(text, acousticLabel).then(emotion => {
      if (emotion !== 'neutro' && this.ctx.emotion === 'neutro') {
        this.ctx.emotion = emotion
        this._tts?.setProspectSignals(emotion, acousticLabel)
      }
    }).catch(() => {})

    const obj = detectObjection(text)
    if (obj) this._lastObjection = obj

    if (emocionNow === 'interesado') this._neutralTurns = 0
    else this._neutralTurns++

    if (this._guru) {
      const interval = parseInt(process.env.GURU_CHECK_INTERVAL ?? '3')
      const turnTrigger = this._turnCount % interval === 0
      const signalTrigger = ['molesto', 'agitado', 'sarcastico'].includes(emocionNow) || acoustic?.label === 'agitado' || !!obj || detectStall(this._neutralTurns)
      if (turnTrigger || signalTrigger) {
        this._runGuru(acousticLabel).catch(() => {})
      }
    }

    // Check both running (task != null) AND already-completed (task == null but text still set)
    if (this._speculativeText === text) {
      this._speculativeTask = null
      this._speculativeText = ''
      return
    }

    this._cancelSpeculative()
    this._handleUserText(text, false).catch(() => {})
  }

  // ── LLM + TTS ──────────────────────────────────────────────────────────────

  private async _handleUserText(text: string, speculative: boolean): Promise<void> {
    if (!this._llm || !this._tts) return
    this._agentTurnActive = true
    const abort = new AbortController()
    this._activeAbort = abort
    let fullResponse = ''
    let firstToken = true
    try {
      this._history.push({ role: 'user', content: text })
      const brief = this._effectiveBrief()
      const extraInstructions = this._guru ? briefToSystemPrompt(brief) : ''

      this._tTtsFirstPending = true

      // Stream LLM tokens → TTS fires per sentence as they accumulate
      for await (const token of this._llm.generateResponseStream(text, {
        history: this._history.slice(-10),
        extraInstructions,
        signal: abort.signal,
      })) {
        if (this._closed || abort.signal.aborted) break
        if (firstToken) { this._tLlm = Date.now(); firstToken = false }
        fullResponse += token
        await this._tts.sendText(token)
      }
      if (abort.signal.aborted) return // superseded by a newer turn — don't report a stale response
      await this._tts.flush()

      this._history.push({ role: 'assistant', content: fullResponse })
      this._rhythm.agentWordCounts.push(fullResponse.split(/\s+/).length)
      if (this._rhythm.agentWordCounts.length > 6) this._rhythm.agentWordCounts.shift()

      this._agentResponses.push(fullResponse)
      if (this._agentResponses.length > 5) this._agentResponses.shift()

      const utype = classifyUtterance(fullResponse)
      if (utype !== 'statement') {
        const overlay = utteranceVoiceOverlay(this._tts['_profile'], utype)
        this._tts['_profile'] = overlay
      }

      // latency: llm = EOT → first token; tts = first token → first audio chunk
      const latency = this._tEot > 0 && this._tTts > 0 ? {
        llm: this._tLlm - this._tEot,
        tts: this._tTts  - this._tLlm,
        total: this._tTts - this._tEot,
      } : undefined

      await this._onTranscript?.('agente', fullResponse, latency ? { latency } : undefined)

      if (utype !== 'statement') this._tts.setVoiceProfile(brief.formato)
      this._rhythm.ttsCompletions++
    } catch (e: any) {
      if (!this._closed) console.warn('[LLM] Error:', e.message)
    } finally {
      this._agentTurnActive = false
      if (this._activeAbort === abort) this._activeAbort = null
      if (speculative) {
        this._speculativeTask = null
        // ponytail: keep _speculativeText alive so _onSttFinal can still match it
        // even when speculative completes before EndOfTurn arrives
      }
    }
  }

  private _effectiveBrief(): GuruBrief {
    const brief = this._currentBrief
    const suggested = suggestedMaxFrases(this._rhythm, brief.maxFrases)
    const emergencyFormat = formatForInterruptionLevel(this._rhythm.interruptionCount, brief.formato)
    if (suggested === brief.maxFrases && !emergencyFormat) return brief
    return { ...brief, maxFrases: suggested, formato: emergencyFormat ?? brief.formato }
  }

  // ── Guru ───────────────────────────────────────────────────────────────────

  private async _runGuru(estadoAcustico: string): Promise<void> {
    if (!this._guru) return
    try {
      const prevFormato = this._currentBrief.formato
      const newBrief = await this._guru.analyzeAndBrief({
        conversationHistory: this._history,
        lastResponse: this._agentResponses[this._agentResponses.length - 1] ?? '',
        objective: this.ctx.agentConfig?.playbook?.strategy ?? 'agendar demo',
        callContext: { company: this.ctx.businessName, niche: this.ctx.businessType },
        emocion: this.ctx.emotion,
        estadoAcustico,
        loopDetected: detectLoop(this._agentResponses),
        stallDetected: detectStall(this._neutralTurns),
        objecionTipo: this._lastObjection,
        triedEstructuras: [...this._triedEstructuras],
      })

      if (newBrief.estructura !== this._currentBrief.estructura && !this._triedEstructuras.includes(this._currentBrief.estructura)) {
        this._triedEstructuras.push(this._currentBrief.estructura)
        if (this._triedEstructuras.length > 8) this._triedEstructuras.shift()
      }
      this._lastObjection = ''
      this._currentBrief = newBrief

      if (newBrief.formato !== prevFormato) {
        this._tts?.setVoiceProfile(newBrief.formato)
        await this._stt?.configure(sttConfigForFormat(newBrief.formato))
      }
    } catch (e) {
      console.warn('[GURU] _runGuru error:', e)
    }
  }

  // ── Opening ────────────────────────────────────────────────────────────────

  private async _sendOpening(): Promise<void> {
    const name = this.ctx.agentConfig?.identity?.agentName ?? 'Alex'
    const company = this.ctx.agentConfig?.product?.companyName ?? 'VozIA'
    const greeting = `Hola, buenos días. Soy ${name}${company ? `, de ${company}` : ''}. ¿Está el responsable un momento?`
    this._history.push({ role: 'assistant', content: greeting })
    // audio first so logger captures chunks before the transcript flushes the turn
    await this._tts?.sendText(greeting, true)
    await this._onTranscript?.('agente', greeting)
  }
}
