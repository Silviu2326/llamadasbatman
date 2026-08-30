import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import type { CallContext } from '../intelligence/conversation/callContext'
import type { VoiceSession, VoiceSessionCallbacks, VoiceSessionEvent } from '../engine/voiceSession'
import { disclosureLine, mustGetRecordingConsent } from '../compliance'
import { agentPlaybook, playbookGreeting } from '../agentPlaybooks'
import { DeepgramFluxRealtime, type DeepgramFluxTurnEvent } from '../stt/deepgramFlux'
import { CartesiaRealtime, type CartesiaTurnEvent } from '../stt/cartesiaInk'
import { streamCerebras, streamOpenAICompatible, type ChatMessage } from '../intelligence/llm/cerebrasStream'
import { FishAudioSpeechTask } from '../tts/fishAudioTts'
import { MiniMaxSpeechTask } from '../tts/minimaxTts'
import { askGuru } from '../intelligence/conversation/vendravaGuru'
import { ProsodyMeter } from '../utils/prosody'
import { SpeechChunker } from '../utils/speechChunker'
import {
  missingRuntimeCredentials,
  resolveAgentRuntime,
  runtimePipelineLabel,
  runtimeProviderLabel,
  unsupportedRuntimeProviders,
  type AgentRuntimeConfig,
} from '../runtimeConfig'
import {
  DEFAULT_GREETING,
  DEFAULT_SETTINGS,
  TTS_SAMPLE_RATE,
  type CabinEvent,
  type EmotionReading,
  type PipelineStage,
  type ProviderName,
  type SessionSettings,
  type StageStatus,
} from './vendravaProtocol'

/**
 * Puerto del laboratorio (vendrava-voice-lab) al contrato VoiceSession del CRM:
 * Deepgram Flux Multilingual → Cerebras GPT-OSS 120B → Fish Audio S2.1 Pro, con turno
 * especulativo, barge-in, guru fuera del camino crítico y prosodia derivada.
 *
 * Entra PCM16 mono a 16 kHz (lo que ya entregan mediaStream y simStream) y sale
 * PCM16 mono a 24 kHz (lo que ya esperan AudioBridge y el navegador).
 */

/**
 * Reglas de entrega habladas. Van SIEMPRE al final del prompt para que ganen a
 * cualquier instrucción de formato que traiga el guion del agente, que está
 * escrito pensando en texto y en un motor que ya no existe.
 */
function voiceDeliveryRules(language: VoiceLanguage): string {
  return language === 'es'
    ? `--- REGLAS DE LLAMADA DE VOZ EN DIRECTO (anulan cualquier instrucción anterior) ---
Estás hablando por teléfono, no escribiendo. Responde siempre en español.
Mantén cada turno corto: normalmente una o dos frases y menos de 35 palabras.
Responde directamente, sin markdown, listas, acotaciones ni introducciones.
Usa un ritmo natural y no abuses de muletillas.
Si te preguntan si eres una persona, di claramente que eres un asistente de voz de IA.
No inventes datos del cliente, pedido o empresa. Si falta información, haz una sola pregunta breve.`
    : `--- LIVE VOICE CALL RULES (these override any conflicting instruction above) ---
You are speaking on a live phone call, not writing. Always reply in English.
Keep each turn short: normally one or two sentences and under 35 words.
Respond directly, without markdown, lists, stage directions, or prefacing your answer.
Use contractions and varied rhythm, but do not overuse filler words.
If asked whether you are human, clearly say you are an AI voice assistant.
Never invent customer, order, or company facts. Ask one concise follow-up question when information is missing.`
}

export type VoiceLanguage = 'en' | 'es'

function languageFromAccent(value?: string | null): VoiceLanguage | null {
  const language = value?.trim().toLowerCase()
  if (!language || /^en\b/.test(language) || language.includes('english')) return 'en'
  if (/^es\b/.test(language) || language.includes('spanish') || language.includes('español')) return 'es'
  return null
}

export function voiceLanguageForAgent(agentConfig: CallContext['agentConfig']): VoiceLanguage {
  return languageFromAccent(agentConfig?.identity?.agentAccent) ?? 'en'
}

/**
 * Persona de respaldo cuando la llamada no trae ni guion ni perfil de negocio
 * (cabina de pruebas, sobre todo).
 *
 * La marca es configurable porque estaba fija: una organización cuyo playbook
 * no traía `base_prompt` se presentaba al prospecto con una marca que no era la
 * suya. En una llamada real esto ya no debería llegar a usarse —el prompt lleva
 * la persona compuesta con la empresa de la organización—, pero si llega, más
 * vale que diga la marca correcta.
 */
function fallbackPersona(language: VoiceLanguage): string {
  const brand = process.env.VOICE_FALLBACK_BRAND?.trim()
  if (language === 'es') {
    return brand
      ? `Eres Alex, un asistente de voz de IA que llama en nombre de ${brand}.`
      : 'Eres Alex, un asistente de voz de IA. No afirmes representar a ninguna empresa que no te hayan indicado.'
  }
  return brand
    ? `You are Alex, an AI voice assistant calling on behalf of ${brand}.`
    : 'You are Alex, an AI voice assistant. Do not claim to represent any company you have not been told about.'
}

export function vendravaVoiceConfigured(agentConfig?: CallContext['agentConfig'] | null): boolean {
  const runtime = resolveAgentRuntime(agentConfig)
  return unsupportedRuntimeProviders(runtime).length === 0 && missingRuntimeCredentials(runtime).length === 0
}

/**
 * Flux Multilingual admite inglés y español. Un agente configurado en otro
 * idioma no puede llamar: es preferible fallar con un motivo legible a llamar
 * al prospecto con un guion que no es el suyo.
 */
export function vendravaVoiceLanguageSupported(agentConfig: CallContext['agentConfig']): boolean {
  const language = agentConfig?.identity?.agentAccent?.trim()
  return !language || languageFromAccent(language) !== null
}

/** Ajustes que el navegador puede elegir en el mensaje `start`. Todo lo demás se ignora. */
export function sanitizeVendravaSettings(input: unknown, language: VoiceLanguage = 'en'): SessionSettings {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const voiceCandidate = typeof record.voiceId === 'string' ? record.voiceId.trim() : ''
  const envVoice = (language === 'es' ? process.env.FISH_VOICE_ID_ES : process.env.FISH_VOICE_ID_EN)?.trim() || DEFAULT_SETTINGS.voiceId
  return {
    speculative: record.speculative === undefined ? DEFAULT_SETTINGS.speculative : Boolean(record.speculative),
    voiceId: /^[A-Za-z0-9_-]{1,128}$/.test(voiceCandidate) ? voiceCandidate : envVoice,
    ttsModel: 's2.1-pro',
    speed: Math.min(1.2, Math.max(0.8, Number(record.speed) || DEFAULT_SETTINGS.speed)),
  }
}

interface PreparedTts {
  task: FishAudioSpeechTask | MiniMaxSpeechTask
  deliver?: (chunk: Buffer) => void
}

interface GenerationState {
  id: string
  userText: string
  speculative: boolean
  committed: boolean
  cancelled: boolean
  abort: AbortController
  speech: PreparedTts
  text: string
  displayedText: string
  bufferedAudio: Buffer[]
  audioStarted: boolean
  audioEnded: boolean
  llmDone: boolean
  ttsDone: boolean
  storedInHistory: boolean
  startedAt: number
  committedAt?: number
  firstTokenAt?: number
  firstTextQueuedAt?: number
  firstAudioAt?: number
  ttsQueue: Promise<void>
}

interface StaticSpeechState {
  id: string
  speech: PreparedTts
  cancelled: boolean
  audioStarted: boolean
}

function normalizeTranscript(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').trim()
}

export class VendravaVoiceSession implements VoiceSession {
  private readonly settings: SessionSettings
  private readonly runtime: AgentRuntimeConfig
  private readonly systemPrompt: string
  private transcriptionStt?: DeepgramFluxRealtime | CartesiaRealtime
  private emotionStt?: DeepgramFluxRealtime | CartesiaRealtime
  private readonly transcriptionProvider: 'deepgram' | 'cartesia'
  private readonly emotionProvider: 'deepgram' | 'cartesia'
  private readonly llmProvider: 'cerebras' | 'groq' | 'deepseek'
  private readonly ttsProvider: 'fish' | 'minimax'
  private readonly language: VoiceLanguage
  private history: ChatMessage[]
  private activeGeneration?: GenerationState
  private activeStaticSpeech?: StaticSpeechState
  private prewarmedSpeech?: PreparedTts
  private live = false
  private turnLastUpdateAt?: number
  private turnEagerAt?: number
  private turnFinalAt?: number
  private disposed = false
  private readonly prosody = new ProsodyMeter()
  private lastEmotion?: EmotionReading
  private secondaryEmotionTranscript?: string
  private agentFinishedAt?: number
  private guruDirective?: string
  private guruAbort?: AbortController
  private blockResponses = false

  private onAudio?: VoiceSessionCallbacks['onAudio']
  private onInterrupt?: VoiceSessionCallbacks['onInterrupt']
  private onTranscript?: VoiceSessionCallbacks['onTranscript']
  private onEvent?: VoiceSessionCallbacks['onEvent']

  /**
   * El guion viene del CRM (agente + playbook + contexto del lead, ya compuesto
   * por buildIntelligentPrompt) y las reglas de voz se añaden al final para que
   * ganen al formato pensado para texto.
   */
  constructor(private readonly ctx: CallContext, systemPrompt: string, settings?: SessionSettings) {
    // La voz del agente configurada en el CRM manda sobre la del entorno.
    this.language = voiceLanguageForAgent(ctx.agentConfig)
    this.runtime = resolveAgentRuntime(ctx.agentConfig)
    this.transcriptionProvider = this.runtime.transcriptionStt.provider === 'cartesia' ? 'cartesia' : 'deepgram'
    this.emotionProvider = this.runtime.emotionStt.provider === 'cartesia' ? 'cartesia' : 'deepgram'
    this.llmProvider = this.runtime.primaryLlm.provider === 'groq' || this.runtime.primaryLlm.provider === 'deepseek' ? this.runtime.primaryLlm.provider : 'cerebras'
    this.ttsProvider = this.runtime.tts.provider === 'minimax' ? 'minimax' : 'fish'
    this.settings = sanitizeVendravaSettings({
      ...settings,
      voiceId: settings?.voiceId || ctx.agentConfig?.voice?.ttsVoiceId,
    }, this.language)
    this.systemPrompt = `${systemPrompt?.trim() || fallbackPersona(this.language)}\n\n${voiceDeliveryRules(this.language)}`
    this.history = [{ role: 'system', content: this.systemPrompt }]
  }

  async attach(callbacks: VoiceSessionCallbacks): Promise<void> {
    this.onAudio = callbacks.onAudio
    this.onInterrupt = callbacks.onInterrupt
    this.onTranscript = callbacks.onTranscript
    this.onEvent = callbacks.onEvent
  }

  async sendAudio(pcm16k: Buffer): Promise<void> {
    if (!this.live) return
    this.transcriptionStt?.sendAudio(pcm16k)
    this.emotionStt?.sendAudio(pcm16k)
    this.prosody.pushAudio(pcm16k)
  }

  /** Opt-out o transferencia: calla ya y no vuelve a generar en esta llamada. */
  async stopResponding(reason: string): Promise<void> {
    this.blockResponses = true
    this.interruptOutput(reason)
  }

  async cancelResponse(reason: string): Promise<void> {
    this.interruptOutput(reason)
  }

  /** Turno escrito desde la cabina: mismo camino que un turno hablado, sin STT. */
  async sendTextTurn(text: string): Promise<void> {
    const clean = text.trim().slice(0, 800)
    if (!clean || !this.live) return
    this.interruptOutput('new typed turn')
    this.prewarmTts()
    this.turnFinalAt = performance.now()
    this.send({ type: 'transcript', id: randomUUID(), speaker: 'user', text: clean, final: true })
    this.trace('Typed test turn', 'browser')
    void this.onTranscript?.('prospecto', clean, { typed: true })
    await this.beginGeneration(clean, false)
  }

  /** Flux fija los umbrales semánticos de turno en el `Configure` inicial. */
  async updateEotTimeout(_ms: number): Promise<void> {}

  async run(): Promise<void> {
    const unsupported = unsupportedRuntimeProviders(this.runtime)
    if (unsupported.length) {
      this.sendError('runtime_provider_unsupported', `Proveedores no soportados: ${unsupported.join(', ')}.`, true)
      return
    }
    const missing = missingRuntimeCredentials(this.runtime)
    if (missing.length) {
      this.sendError('missing_credentials', `Faltan ${missing.join(', ')} en el servidor.`, true)
      return
    }
    if (!vendravaVoiceLanguageSupported(this.ctx.agentConfig)) {
      this.sendError(
        'voice_language_unsupported',
        `El motor de voz solo admite inglés y español; el agente está configurado en "${this.ctx.agentConfig?.identity?.agentAccent}".`,
        true,
      )
      return
    }

    this.live = true
    this.send({ type: 'session.status', status: 'connecting', message: `Opening ${runtimeProviderLabel(this.transcriptionProvider)}` })
    this.provider(this.transcriptionProvider, 'connecting')
    this.trace('Opening realtime transcription', this.transcriptionProvider)

    const onTranscriptionEvent = (event: DeepgramFluxTurnEvent | CartesiaTurnEvent) => this.handleRealtimeEvent(event)
    const onTranscriptionError = (error: Error) => {
      this.provider(this.transcriptionProvider, 'error')
      this.sendError(`${this.transcriptionProvider}_error`, error.message)
    }
    this.transcriptionStt = this.createStt(this.runtime.transcriptionStt.provider, this.runtime.transcriptionStt.model, onTranscriptionEvent, onTranscriptionError)
    if (this.runtime.emotionStt.enabled === true && this.runtime.emotionMode !== 'off') {
      this.provider(this.emotionProvider, 'connecting')
      this.emotionStt = this.createStt(this.runtime.emotionStt.provider, this.runtime.emotionStt.model,
        event => this.handleEmotionRealtimeEvent(event),
        error => {
          this.provider(this.emotionProvider, 'error')
          this.sendError(`${this.emotionProvider}_emotion_error`, error.message)
        })
    }

    try {
      await this.transcriptionStt.connect()
      if (this.emotionStt) await this.emotionStt.connect()
      if (this.disposed || !this.live) return
      this.provider(this.transcriptionProvider, 'active')
      if (this.emotionStt) this.provider(this.emotionProvider, 'active')
      this.send({ type: 'session.status', status: 'live', message: 'Listening' })
      this.send({ type: 'trace', id: randomUUID(), at: Date.now(), label: 'Call session ready', stage: 'system' })
      void this.onEvent?.({ type: 'session.ready', role: 'system', component: 'vendravaVoice', provider: runtimePipelineLabel(this.runtime) })
      await this.speakStatic(this.greeting(), true)
    } catch (error) {
      this.live = false
      this.provider(this.transcriptionProvider, 'error')
      this.sendError(`${this.transcriptionProvider}_connect`, (error as Error).message, true)
    }
  }

  async close(): Promise<void> {
    this.disposed = true
    this.live = false
    this.transcriptionStt?.closeGracefully()
    this.transcriptionStt = undefined
    this.emotionStt?.closeGracefully()
    this.emotionStt = undefined
    this.interruptOutput('session closed', false)
    this.prewarmedSpeech?.task.cancel()
    this.prewarmedSpeech = undefined
    this.guruAbort?.abort()
    this.send({ type: 'session.status', status: 'stopped', message: 'Call ended' })
  }

  /**
   * Con agente configurado se usa su nombre y su empresa (openingGreeting, el
   * mismo saludo con compliance que usaba el resto del producto). Sin agente,
   * el saludo de la cabina. En ambos casos, disclosure de IA salvo
   * DISCLOSE_AI=false, y consentimiento de grabación si está pendiente.
   */
  private greeting(): string {
    const identity = this.ctx.agentConfig?.identity
    const consent = this.ctx.recordingConsentPending ? ` ${mustGetRecordingConsent(this.language)}` : ''
    if (identity?.agentName) {
      // El saludo lo decide el playbook: quien llama a un desconocido tiene que
      // justificarse en una frase; quien atiende una llamada, no.
      const playbook = agentPlaybook(this.ctx.agentConfig?.agentType)
      const disclosure = disclosureLine(identity.agentName, this.language)
      const opening = this.language === 'es'
        ? this.spanishPlaybookGreeting(playbook.type, identity.agentName, this.ctx.agentConfig?.product?.companyName)
        : playbookGreeting(playbook, this.ctx.direction, {
            agentName: identity.agentName,
            companyName: this.ctx.agentConfig?.product?.companyName,
          })
      return `${disclosure ? `${disclosure} ` : ''}${opening}${consent}`
    }
    const disclosure = disclosureLine('Carlos', this.language)
    const fallback = this.language === 'es' ? 'Hola, soy Carlos. Seré breve: ¿cómo va tu día?' : DEFAULT_GREETING
    return `${disclosure ? `${disclosure} ` : ''}${fallback}${consent}`
  }

  private spanishPlaybookGreeting(type: string, agentName: string, companyName?: string): string {
    const company = companyName?.trim()
    const from = company ? `, de ${company}` : ''
    const at = company ? ` ${company}` : ''
    if (this.ctx.direction === 'inbound') {
      if (type === 'support') return `Gracias por llamar${at}. Soy ${agentName}. ¿En qué puedo ayudarte?`
      if (type === 'handoff') return `Gracias por llamar${at}. Soy ${agentName}. ¿Con quién hablo y en qué puedo ayudarte?`
      if (type === 'appointment') return `Gracias por llamar${at}. Soy ${agentName}. ¿Llamas por tu cita?`
      return `Gracias por llamar${at}. Soy ${agentName}. ¿En qué puedo ayudarte?`
    }
    if (type === 'appointment') return `Hola, soy ${agentName}${from}. Llamo por tu próxima cita. ¿Te viene bien hablar un momento?`
    if (type === 'collections') return `Hola, soy ${agentName}${from}. Llamo por una factura pendiente. ¿Hablo con la persona responsable?`
    if (type === 'qualification') return `Hola, soy ${agentName}${from}. Seré breve: solo necesito un par de datos para ver si encajamos.`
    return `Hola, soy ${agentName}${from}. Seré breve: ¿cómo va tu día?`
  }

  // ── STT primario y canal emocional ─────────────────────────────────────────

  private createStt(
    provider: string,
    model: string,
    onEvent: (event: DeepgramFluxTurnEvent | CartesiaTurnEvent) => void,
    onError: (error: Error) => void,
  ): DeepgramFluxRealtime | CartesiaRealtime {
    if (provider === 'cartesia') {
      return new CartesiaRealtime({
        apiKey: process.env.CARTESIA_API_KEY!,
        version: process.env.CARTESIA_VERSION?.trim() || '2025-04-16',
        model,
        turnTaking: this.runtime.turnTaking,
        onEvent,
        onError,
      })
    }
    return new DeepgramFluxRealtime({
      apiKey: process.env.DEEPGRAM_API_KEY!,
      language: this.runtime.transcriptionLanguage === 'auto' ? this.language : this.runtime.transcriptionLanguage,
      model,
      turnTaking: this.runtime.turnTaking,
      onEvent,
      onError,
    })
  }

  private handleEmotionRealtimeEvent(event: DeepgramFluxTurnEvent | CartesiaTurnEvent): void {
    if (event.type === 'connected') {
      this.provider(this.emotionProvider, 'active')
      return
    }
    if (event.type === 'error') return
    if (event.type === 'turn.end' && 'transcript' in event && event.transcript.trim()) {
      this.secondaryEmotionTranscript = event.transcript.trim().slice(0, 500)
      this.trace('Emotion STT context updated', this.emotionProvider)
    }
  }

  private handleRealtimeEvent(event: DeepgramFluxTurnEvent | CartesiaTurnEvent): void {
    if (event.type === 'connected') {
      this.provider(this.transcriptionProvider, 'active')
      return
    }
    if (event.type === 'error') return

    const transcript = 'transcript' in event ? event.transcript : undefined
    this.send({ type: 'stt.event', event: event.type, transcript })

    switch (event.type) {
      case 'turn.start':
        this.turnLastUpdateAt = performance.now()
        this.turnEagerAt = undefined
        this.turnFinalAt = undefined
        this.stage(this.transcriptionProvider, 'active')
        this.trace('User started speaking', 'browser')
        if (this.activeGeneration || this.activeStaticSpeech) this.prosody.countInterruption()
        this.prosody.beginTurn(this.turnLastUpdateAt, this.agentFinishedAt)
        this.interruptOutput('barge-in')
        this.prewarmTts()
        break
      case 'turn.update':
        this.turnLastUpdateAt = performance.now()
        this.send({ type: 'transcript', id: 'active-user-turn', speaker: 'user', text: event.transcript, final: false })
        void this.onTranscript?.('partial', event.transcript)
        break
      case 'turn.eager_end':
        this.turnEagerAt = performance.now()
        this.trace('Semantic eager end', this.transcriptionProvider)
        if (this.settings.speculative && event.transcript.trim()) {
          void this.beginGeneration(event.transcript, true)
        }
        break
      case 'turn.resume':
        this.trace('User resumed — speculation cancelled', this.transcriptionProvider)
        if (this.activeGeneration?.speculative && !this.activeGeneration.committed) {
          this.cancelGeneration(this.activeGeneration, 'turn resumed')
        }
        this.prewarmTts()
        break
      case 'turn.end':
        this.finalizeUserTurn(event.transcript)
        break
    }
  }

  private finalizeUserTurn(transcript: string): void {
    const now = performance.now()
    const sttLatency = Math.max(0, now - (this.turnEagerAt ?? this.turnLastUpdateAt ?? now))
    this.turnFinalAt = now
    this.stage(this.transcriptionProvider, 'complete', sttLatency)
    this.send({ type: 'latency.update', stt: sttLatency })
    this.send({ type: 'transcript', id: randomUUID(), speaker: 'user', text: transcript, final: true })
    this.trace('User turn final', this.transcriptionProvider, sttLatency)

    this.lastEmotion = this.prosody.endTurn(now, transcript)
    this.send({ type: 'emotion.update', emotion: this.lastEmotion })
    // Sin turnId/generationId: esta ruta no usa el banco de aperturas del CRM,
    // así que el supervisor de Node no inyecta directivas en mitad del turno.
    void this.onTranscript?.('prospecto', transcript, {
      sttLatencyMs: Math.round(sttLatency),
      emotion: this.lastEmotion.label,
      wpm: this.lastEmotion.wordsPerMinute,
    })

    const speculative = this.activeGeneration
    if (
      speculative?.speculative &&
      !speculative.cancelled &&
      normalizeTranscript(speculative.userText) === normalizeTranscript(transcript)
    ) {
      this.commitGeneration(speculative, transcript)
      return
    }

    if (speculative?.speculative && !speculative.committed) {
      this.cancelGeneration(speculative, 'final transcript changed')
    }
    if (transcript.trim()) void this.beginGeneration(transcript, false)
  }

  // ── LLM + TTS ──────────────────────────────────────────────────────────────

  private async beginGeneration(userText: string, speculative: boolean): Promise<void> {
    if (this.blockResponses || !this.live) return
    if (this.activeGeneration && !this.activeGeneration.cancelled) {
      this.cancelGeneration(this.activeGeneration, 'superseded')
    }

    const id = randomUUID()
    const speech = this.takePrewarmedTts() ?? this.createPreparedTts()
    const generation: GenerationState = {
      id,
      userText,
      speculative,
      committed: !speculative,
      cancelled: false,
      abort: new AbortController(),
      speech,
      text: '',
      displayedText: '',
      bufferedAudio: [],
      audioStarted: false,
      audioEnded: false,
      llmDone: false,
      ttsDone: false,
      storedInHistory: false,
      startedAt: performance.now(),
      committedAt: speculative ? undefined : this.turnFinalAt ?? performance.now(),
      ttsQueue: Promise.resolve(),
    }
    speech.deliver = chunk => this.handleGenerationAudio(generation, chunk)
    this.activeGeneration = generation

    if (generation.committed) {
      this.history.push({ role: 'user', content: userText })
      this.emitAssistantTranscript(generation, false)
    } else {
      this.trace('Speculative response started', this.llmProvider)
    }

    this.stage(this.llmProvider, 'active')
    this.provider(this.llmProvider, 'active')
    this.stage(this.ttsProvider, 'connecting')
    void speech.task
      .connect()
      .then(() => {
        if (!generation.cancelled) {
          this.provider(this.ttsProvider, 'active')
          this.stage(this.ttsProvider, 'active')
        }
      })
      .catch(error => this.handleProviderError(this.ttsProvider, error))

    const priorMessages = generation.committed ? this.history.slice(0, -1) : this.history
    const messages: ChatMessage[] = [...priorMessages, ...this.turnCoaching(), { role: 'user', content: userText }]

    const chunker = new SpeechChunker()
    try {
      for await (const delta of this.streamPrimaryLlm(messages, generation.abort.signal)) {
        if (generation.cancelled) return
        if (!generation.firstTokenAt) {
          generation.firstTokenAt = performance.now()
          const llmLatency = generation.firstTokenAt - generation.startedAt
          this.send({ type: 'latency.update', llm: llmLatency })
          this.trace('First LLM token', this.llmProvider, llmLatency)
        }
        generation.text += delta
        if (generation.committed) this.emitAssistantTranscript(generation, false)
        for (const phrase of chunker.push(delta)) this.queueSpeech(generation, phrase)
      }

      for (const phrase of chunker.flush()) this.queueSpeech(generation, phrase)
      generation.llmDone = true
      this.stage(this.llmProvider, 'complete', generation.firstTokenAt ? generation.firstTokenAt - generation.startedAt : undefined)
      if (generation.committed) this.finishAssistantTranscript(generation)

      await generation.ttsQueue
      if (generation.cancelled) return
      await generation.speech.task.finish()
      generation.ttsDone = true
      this.finishGenerationAudio(generation)
      this.maybeReleaseGeneration(generation)
    } catch (error) {
      if (generation.cancelled || (error as Error).name === 'AbortError') return
      this.stage(this.llmProvider, 'error')
      this.sendError('generation_error', (error as Error).message)
      this.cancelGeneration(generation, 'provider error')
    }
  }

  private async *streamPrimaryLlm(messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<string> {
    const options = {
      apiKey: process.env[`${this.llmProvider.toUpperCase()}_API_KEY`]!,
      model: this.runtime.primaryLlm.model,
      messages,
      signal,
      temperature: this.runtime.temperature,
    }
    if (this.llmProvider === 'cerebras') {
      yield* streamCerebras(options)
      return
    }
    const baseUrl = this.llmProvider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.deepseek.com/v1'
    yield* streamOpenAICompatible({ ...options, baseUrl, provider: runtimeProviderLabel(this.llmProvider) })
  }

  /**
   * Emoción fresca más la directiva vigente del guru, inyectadas en cada llamada
   * y nunca guardadas en `history`: si se guardaran, cada turno arrastraría el
   * coaching viejo de todos los anteriores.
   */
  private turnCoaching(): ChatMessage[] {
    const cues = [
      this.lastEmotion && `The caller sounds ${this.lastEmotion.label}.`,
      this.guruDirective && `Your strategist says: ${this.guruDirective}`,
    ].filter(Boolean)
    if (!cues.length) return []
    return [{ role: 'system', content: `${cues.join(' ')} Act on this without mentioning it.` }]
  }

  /**
   * Corre mientras Carlos ya está hablando, así su latencia cae en tiempo muerto.
   * El resultado dirige el turno siguiente; si tarda o falla, sigue el anterior.
   */
  private runGuru(): void {
    if (!this.live) return
    const guru = this.runtime.guru
    if (guru.enabled === false) return
    this.guruAbort?.abort()
    const abort = new AbortController()
    this.guruAbort = abort

    void askGuru({
      apiKey: process.env.CEREBRAS_API_KEY!,
      provider: guru.provider,
      model: guru.model,
      history: this.history,
      emotion: this.lastEmotion,
      previousDirective: this.guruDirective,
      agentContext: this.systemPrompt,
      structure: guru.structure,
      instructions: guru.instructions,
      signal: abort.signal,
    })
      .then(advice => {
        if (abort.signal.aborted || !advice || !this.live) return
        this.guruDirective = advice.directive
        this.send({ type: 'guru.update', read: advice.read, directive: advice.directive })
        this.trace('Guru updated the plan', 'system')
      })
      .catch(() => {
        // Solo asesora. Un fallo del guru nunca puede tumbar la llamada.
      })
  }

  private queueSpeech(generation: GenerationState, text: string): void {
    if (!text.trim() || generation.cancelled) return
    if (!generation.firstTextQueuedAt) generation.firstTextQueuedAt = performance.now()
    generation.ttsQueue = generation.ttsQueue.then(() => generation.speech.task.sendText(text))
  }

  private handleGenerationAudio(generation: GenerationState, chunk: Buffer): void {
    if (generation.cancelled || !chunk.length) return
    if (!generation.firstAudioAt) {
      generation.firstAudioAt = performance.now()
      const ttsLatency = generation.firstAudioAt - (generation.firstTextQueuedAt ?? generation.startedAt)
      this.send({ type: 'latency.update', tts: ttsLatency })
      this.stage(this.ttsProvider, 'complete', ttsLatency)
      this.trace('First synthesized audio', this.ttsProvider, ttsLatency)
    }

    if (!generation.committed) {
      generation.bufferedAudio.push(chunk)
      return
    }

    this.startGenerationAudio(generation)
    void this.onAudio?.(chunk)
  }

  private startGenerationAudio(generation: GenerationState): void {
    if (generation.audioStarted || generation.cancelled) return
    generation.audioStarted = true
    this.send({ type: 'audio.start', responseId: generation.id, sampleRate: TTS_SAMPLE_RATE, encoding: 'pcm_s16le' })
    const total = performance.now() - (generation.committedAt ?? generation.startedAt)
    this.send({ type: 'latency.update', total, record: true })
    this.sendTurnMetrics(generation)
    this.trace('Carlos starts speaking', 'browser', total)
  }

  private sendTurnMetrics(generation: GenerationState): void {
    const sttStart = this.turnEagerAt ?? this.turnLastUpdateAt ?? generation.startedAt
    const points = [
      sttStart,
      this.turnFinalAt,
      generation.startedAt,
      generation.firstTokenAt,
      generation.firstTextQueuedAt,
      generation.firstAudioAt,
    ].filter((point): point is number => point !== undefined)
    const origin = Math.min(...points)
    const end = Math.max(...points)
    const segments = [
      { stage: 'browser' as const, startMs: 0, endMs: 18 },
      this.turnFinalAt !== undefined
        ? { stage: this.transcriptionProvider, startMs: sttStart - origin, endMs: this.turnFinalAt - origin }
        : undefined,
      generation.firstTokenAt !== undefined
        ? { stage: this.llmProvider, startMs: generation.startedAt - origin, endMs: generation.firstTokenAt - origin }
        : undefined,
      generation.firstTextQueuedAt !== undefined && generation.firstAudioAt !== undefined
        ? { stage: this.ttsProvider, startMs: generation.firstTextQueuedAt - origin, endMs: generation.firstAudioAt - origin }
        : undefined,
    ].filter((segment): segment is NonNullable<typeof segment> => segment !== undefined)

    this.send({
      type: 'turn.metrics',
      turnId: generation.id,
      speculative: generation.speculative || generation.startedAt < (generation.committedAt ?? generation.startedAt),
      targetMs: 650,
      spanMs: Math.max(18, end - origin),
      segments,
    })
  }

  private commitGeneration(generation: GenerationState, finalTranscript: string): void {
    if (generation.cancelled || generation.committed) return
    generation.committed = true
    generation.speculative = false
    generation.userText = finalTranscript
    generation.committedAt = this.turnFinalAt ?? performance.now()
    this.history.push({ role: 'user', content: finalTranscript })
    this.trace('Speculation committed', 'system')
    this.emitAssistantTranscript(generation, generation.llmDone)

    if (generation.bufferedAudio.length) {
      this.startGenerationAudio(generation)
      for (const chunk of generation.bufferedAudio) void this.onAudio?.(chunk)
      generation.bufferedAudio = []
    }

    if (generation.llmDone) this.finishAssistantTranscript(generation)
    if (generation.ttsDone) this.finishGenerationAudio(generation)
    this.maybeReleaseGeneration(generation)
  }

  private emitAssistantTranscript(generation: GenerationState, final: boolean): void {
    if (!generation.committed) return
    const clean = generation.text.trimStart()
    if (!clean && !final) return
    if (clean === generation.displayedText && !final) return
    generation.displayedText = clean
    this.send({ type: 'transcript', id: generation.id, speaker: 'assistant', text: clean, final })
  }

  private finishAssistantTranscript(generation: GenerationState): void {
    if (!generation.committed || generation.storedInHistory) return
    const text = generation.text.trim()
    this.emitAssistantTranscript(generation, true)
    if (text) {
      this.history.push({ role: 'assistant', content: text })
      void this.onTranscript?.('agente', text, {
        latency: {
          llm: generation.firstTokenAt ? Math.round(generation.firstTokenAt - generation.startedAt) : undefined,
          tts: generation.firstAudioAt && generation.firstTextQueuedAt
            ? Math.round(generation.firstAudioAt - generation.firstTextQueuedAt)
            : undefined,
          total: generation.firstAudioAt
            ? Math.round(generation.firstAudioAt - (generation.committedAt ?? generation.startedAt))
            : undefined,
        },
        speculative: generation.speculative,
      })
    }
    generation.storedInHistory = true
    this.runGuru()
  }

  private finishGenerationAudio(generation: GenerationState): void {
    if (!generation.committed || !generation.audioStarted || generation.audioEnded) return
    generation.audioEnded = true
    this.agentFinishedAt = performance.now()
    this.send({ type: 'audio.end', responseId: generation.id })
  }

  private maybeReleaseGeneration(generation: GenerationState): void {
    if (generation.committed && generation.llmDone && generation.ttsDone && this.activeGeneration === generation) {
      this.activeGeneration = undefined
    }
  }

  private cancelGeneration(generation: GenerationState, reason: string): void {
    if (generation.cancelled) return
    generation.cancelled = true
    generation.abort.abort()
    generation.speech.task.cancel()
    generation.bufferedAudio = []
    if (generation.committed && generation.text.trim() && !generation.storedInHistory) {
      this.history.push({ role: 'assistant', content: generation.text.trim() })
      generation.storedInHistory = true
    }
    if (generation.audioStarted) this.send({ type: 'audio.clear', reason })
    this.send({ type: 'response.cancelled', responseId: generation.id, reason })
    if (this.activeGeneration === generation) this.activeGeneration = undefined
  }

  private prewarmTts(): void {
    if (this.prewarmedSpeech || this.activeGeneration || !this.live) return
    const speech = this.createPreparedTts()
    this.prewarmedSpeech = speech
    this.stage(this.ttsProvider, 'connecting')
    void speech.task
      .connect()
      .then(() => {
        if (this.prewarmedSpeech === speech) {
          this.provider(this.ttsProvider, 'active')
          this.trace('TTS connection prewarmed', this.ttsProvider)
        }
      })
      .catch(error => {
        if (this.prewarmedSpeech === speech) this.prewarmedSpeech = undefined
        this.handleProviderError(this.ttsProvider, error)
      })
  }

  private takePrewarmedTts(): PreparedTts | undefined {
    const speech = this.prewarmedSpeech
    this.prewarmedSpeech = undefined
    return speech
  }

  private createPreparedTts(): PreparedTts {
    const prepared = {} as PreparedTts
    if (this.ttsProvider === 'minimax') {
      const model = this.runtime.tts.model === 'speech-2.8-hd' ? 'speech-2.8-hd' : 'speech-2.8-turbo'
      prepared.task = new MiniMaxSpeechTask({
        apiKey: process.env.MINIMAX_API_KEY!,
        voiceId: this.settings.voiceId || process.env.MINIMAX_VOICE_ID?.trim() || 'female-shaonv',
        model,
        speed: this.settings.speed,
        onAudio: chunk => prepared.deliver?.(chunk),
        onError: error => this.handleProviderError(this.ttsProvider, error),
      })
    } else {
      const model = this.runtime.tts.model === 's2.1-pro-free' || this.runtime.tts.model === 's2-pro' ? this.runtime.tts.model : 's2.1-pro'
      prepared.task = new FishAudioSpeechTask({
        apiKey: process.env.FISH_API_KEY!,
        model,
        voiceId: this.settings.voiceId,
        speed: this.settings.speed,
        onAudio: chunk => prepared.deliver?.(chunk),
        onError: error => this.handleProviderError(this.ttsProvider, error),
      })
    }
    return prepared
  }

  private async speakStatic(text: string, addToHistory: boolean): Promise<void> {
    if (!this.live) return
    this.interruptOutput('new static speech', false)
    const id = randomUUID()
    const speech = this.createPreparedTts()
    const state: StaticSpeechState = { id, speech, cancelled: false, audioStarted: false }
    this.activeStaticSpeech = state

    const displayText = text.replace(/\s*\((?:breath|sighs|laughs)\)\s*/gi, ' ').replace(/\s{2,}/g, ' ')
    this.send({ type: 'transcript', id, speaker: 'assistant', text: displayText, final: true })
    if (addToHistory) this.history.push({ role: 'assistant', content: text })
    void this.onTranscript?.('agente', displayText)
    this.stage(this.ttsProvider, 'connecting')
    const startedAt = performance.now()
    speech.deliver = chunk => {
      if (state.cancelled) return
      if (!state.audioStarted) {
        state.audioStarted = true
        const latency = performance.now() - startedAt
        this.send({ type: 'audio.start', responseId: id, sampleRate: TTS_SAMPLE_RATE, encoding: 'pcm_s16le' })
        this.send({ type: 'latency.update', tts: latency, total: latency, record: false })
        this.stage(this.ttsProvider, 'complete', latency)
      }
      void this.onAudio?.(chunk)
    }

    try {
      await speech.task.connect()
      this.provider(this.ttsProvider, 'active')
      await speech.task.sendText(text)
      await speech.task.finish()
      if (!state.cancelled && state.audioStarted) {
        this.agentFinishedAt = performance.now()
        this.send({ type: 'audio.end', responseId: id })
      }
    } catch (error) {
      if (!state.cancelled) this.handleProviderError(this.ttsProvider, error)
    } finally {
      if (this.activeStaticSpeech === state) this.activeStaticSpeech = undefined
    }
  }

  private interruptOutput(reason: string, notify = true): void {
    const hadOutput = Boolean(this.activeGeneration?.audioStarted || this.activeStaticSpeech?.audioStarted)
    if (this.activeGeneration) this.cancelGeneration(this.activeGeneration, reason)
    if (this.activeStaticSpeech) {
      this.activeStaticSpeech.cancelled = true
      this.activeStaticSpeech.speech.task.cancel()
      this.activeStaticSpeech = undefined
      if (notify) this.send({ type: 'audio.clear', reason })
    }
    // Telefonía: hay que vaciar también la cola de Twilio, o el prospecto sigue
    // oyendo audio ya cancelado durante segundos.
    if (notify && hadOutput) void this.onInterrupt?.()
  }

  // ── Salida de eventos ──────────────────────────────────────────────────────

  private handleProviderError(provider: ProviderName, error: unknown): void {
    this.provider(provider, 'error')
    this.stage(provider, 'error')
    this.sendError(`${provider}_error`, (error as Error).message)
  }

  private provider(provider: ProviderName, status: StageStatus): void {
    this.send({ type: 'provider.status', provider, status })
  }

  private stage(stage: PipelineStage, status: StageStatus, latencyMs?: number): void {
    this.send({ type: 'pipeline.stage', stage, status, latencyMs })
  }

  private trace(label: string, stage: PipelineStage | 'system', durationMs?: number): void {
    this.send({ type: 'trace', id: randomUUID(), at: Date.now(), label, stage, durationMs })
  }

  private sendError(code: string, message: string, fatal = false): void {
    console.warn('[VENDRAVA_VOICE] %s: %s', code, message)
    this.send({ type: 'error', code, message, fatal })
  }

  /** Cada evento de la cabina viaja como VoiceSessionEvent: el logger y el navegador ya los reciben. */
  private send(event: CabinEvent): void {
    const voiceEvent: VoiceSessionEvent = {
      type: event.type,
      role: event.type === 'transcript' ? (event.speaker === 'user' ? 'user' : 'assistant') : 'system',
      payload: event as unknown as Record<string, unknown>,
      component: 'vendravaVoice',
    }
    void this.onEvent?.(voiceEvent)
  }
}
