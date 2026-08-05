import { WebSocket } from 'ws'
import { createCallContext } from '../intelligence/conversation/callContext'
import { loadAgentConfig } from '../agentConfig'
import { SessionLogger } from '../sessionLogger'
import { analyzePostCall } from '../analysis/postCallAnalysis'
import { prisma } from '../../lib/prisma'
import { createVoiceSession, type VoicePipelineOverride } from '../engine/factory'
import { QwenOmniRealtimeSession, qwenOmniConfigured } from '../engine/qwenOmni'
import type { VoiceSession } from '../engine/voiceSession'

export interface VoiceSimulationPrincipal {
  userId: string
  orgId: string
  role: string
  email: string
}

const DEFAULT_PROMPT = `Eres Alex, asesor comercial de Vendrava, una plataforma de agentes de voz con IA que hace llamadas de ventas automáticas en español.

PRODUCTO QUE VENDES:
Vendrava permite a empresas lanzar agentes de IA que llaman a sus prospectos, califican leads, agendan reuniones y hacen seguimiento, sin necesidad de equipo humano. Los agentes hablan de forma natural, responden objeciones en tiempo real, y trabajan 24/7 sin descanso. El sistema se integra con el CRM, graba todas las conversaciones y genera analíticas de cada llamada (confianza STT, latencia, WPM, emociones detectadas).

BENEFICIOS CLAVE:
- Coste por llamada 10x menor que un comercial humano
- Consistencia: mismo pitch perfecto en cada llamada, sin días malos
- Escala instantánea: 1 agente o 1.000 agentes, mismo coste marginal
- Velocidad: primer contacto en segundos, no en días
- Datos: cada llamada genera insights accionables del prospecto

PERFIL DEL CLIENTE IDEAL:
Empresas con equipos comerciales que hacen llamadas en frío o seguimiento: SaaS B2B, inmobiliarias, clínicas, academias, concesionarios, aseguradoras.

REGLAS DE CONVERSACIÓN:
- Habla como una persona real, no como folleto de marketing. Sé directo y concreto.
- Frases cortas. Máximo 2-3 frases por turno. Deja espacio para que el prospecto hable.
- Usa preguntas abiertas para descubrir su situación actual: cuántos comerciales tienen, cuántas llamadas hacen al día, cuál es su tasa de contacto.
- Si el prospecto pone objeciones de precio: ancla primero el valor (coste de un comercial humano) antes de hablar de precio.
- Si pregunta por el precio: di que depende del volumen de llamadas, pero que el ROI típico es positivo en el primer mes.
- Objetivo de la llamada: conseguir que el prospecto acepte una demo de 20 minutos.
- Si ya está interesado: propón directamente día y hora para la demo.
- Nunca prometas cosas que no puedes cumplir. Si no sabes algo, dilo y ofrece seguimiento.
- Siempre en español. Tono cálido, seguro, sin presión.`

const MAX_SIM_JSON_BYTES = 16 * 1024
const MAX_SIM_AUDIO_BYTES = 128 * 1024
const MAX_SIM_MESSAGES_PER_SECOND = 200
const MAX_SIM_BYTES_PER_SECOND = 1024 * 1024
const START_DEADLINE_MS = 15_000
const DEFAULT_MAX_SIM_DURATION_MS = 10 * 60 * 1000
const activeByUser = new Map<string, number>()
const activeByOrg = new Map<string, number>()

function positiveInteger(envValue: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(envValue ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

function maxSessionsPerUser(): number {
  return positiveInteger(process.env.VOICE_SIM_MAX_CONCURRENT_PER_USER, 1, 10)
}

function maxSessionsPerOrg(): number {
  return positiveInteger(process.env.VOICE_SIM_MAX_CONCURRENT_PER_ORG, 3, 50)
}

function maxDurationMs(): number {
  return positiveInteger(process.env.VOICE_SIM_MAX_DURATION_SECONDS, DEFAULT_MAX_SIM_DURATION_MS / 1000, 60 * 60) * 1000
}

function rawToBuffer(raw: Buffer | ArrayBuffer | Buffer[] | string): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  if (typeof raw === 'string') return Buffer.from(raw)
  if (Array.isArray(raw)) return Buffer.concat(raw)
  return Buffer.from(raw)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// Valores que el navegador puede elegir en la página de laboratorio de voz.
// Todo lo que no esté en la lista se ignora y se usa la config del servidor.
const SIM_STT_OPTIONS = new Set(['whisper', 'kyutai'])
const SIM_TTS_OPTIONS = new Set(['qwen', 'chatterbox', 'piper'])

function pipelineOverride(message: Record<string, unknown>): VoicePipelineOverride | undefined {
  const stt = typeof message.stt === 'string' && SIM_STT_OPTIONS.has(message.stt) ? message.stt as VoicePipelineOverride['stt'] : undefined
  const tts = typeof message.tts === 'string' && SIM_TTS_OPTIONS.has(message.tts) ? message.tts as VoicePipelineOverride['tts'] : undefined
  return stt || tts ? { stt, tts } : undefined
}

function optionalId(value: unknown): string | null {
  if (value == null || value === '') return null
  return typeof value === 'string' && value.length <= 191 ? value : null
}

function closeWithPolicy(socket: WebSocket, reason: string): void {
  console.warn('[SIM] Closing simulation: %s', reason)
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(1008, 'Invalid voice simulation session')
  }
}

function acquireSession(principal: VoiceSimulationPrincipal): (() => void) | null {
  const userActive = activeByUser.get(principal.userId) ?? 0
  const orgActive = activeByOrg.get(principal.orgId) ?? 0
  if (userActive >= maxSessionsPerUser() || orgActive >= maxSessionsPerOrg()) return null

  activeByUser.set(principal.userId, userActive + 1)
  activeByOrg.set(principal.orgId, orgActive + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const nextUserCount = (activeByUser.get(principal.userId) ?? 1) - 1
    const nextOrgCount = (activeByOrg.get(principal.orgId) ?? 1) - 1
    if (nextUserCount > 0) activeByUser.set(principal.userId, nextUserCount)
    else activeByUser.delete(principal.userId)
    if (nextOrgCount > 0) activeByOrg.set(principal.orgId, nextOrgCount)
    else activeByOrg.delete(principal.orgId)
  }
}

function createRateGuard() {
  let windowStartedAt = Date.now()
  let messageCount = 0
  let byteCount = 0
  return (size: number): boolean => {
    const now = Date.now()
    if (now - windowStartedAt >= 1000) {
      windowStartedAt = now
      messageCount = 0
      byteCount = 0
    }
    messageCount += 1
    byteCount += size
    return messageCount <= MAX_SIM_MESSAGES_PER_SECOND && byteCount <= MAX_SIM_BYTES_PER_SECOND
  }
}

/**
 * A simulation is an authenticated, tenant-scoped cost centre. `orgId` and
 * all resources are derived from the JWT context, never from browser payloads.
 */
export async function handleSimStream(socket: WebSocket, principal: VoiceSimulationPrincipal): Promise<void> {
  let session: VoiceSession | null = null
  let startRequested = false
  let logger: SessionLogger | null = null
  let userSpeakingStarted = false
  let releaseSession: (() => void) | null = null
  let durationTimer: NodeJS.Timeout | null = null
  const allowMessage = createRateGuard()
  const startDeadline = setTimeout(() => closeWithPolicy(socket, 'start event deadline exceeded'), START_DEADLINE_MS)

  function send(data: object | ArrayBufferLike) {
    if (socket.readyState !== WebSocket.OPEN) return
    socket.send(data instanceof ArrayBuffer || Buffer.isBuffer(data) ? data : JSON.stringify(data))
  }

  function onAudio(pcm24k: Buffer): Promise<void> {
    logger?.addChunk(pcm24k)
    const n = pcm24k.length >> 1
    const f32 = new Float32Array(n)
    for (let i = 0; i < n; i++) f32[i] = pcm24k.readInt16LE(i * 2) / 32768
    send(f32.buffer)
    return Promise.resolve()
  }

  function onInterrupt(): Promise<void> {
    logger?.log({ event: 'interrupt' })
    logger?.flushTurn()
    send({ type: 'interrupt' })
    return Promise.resolve()
  }

  function onTranscript(role: string, text: string, meta?: Record<string, unknown>): Promise<void> {
    if (role === 'partial') {
      if (!userSpeakingStarted) {
        userSpeakingStarted = true
        logger?.startTurn('prospecto', 16000)
      }
      send({ type: 'partial', text })
      return Promise.resolve()
    }

    logger?.log({ role, text, ...meta })
    send({ type: 'transcript', role, text, ...meta })

    if (role === 'prospecto') {
      userSpeakingStarted = false
      logger?.flushTurn()
      logger?.startTurn('agente', 24000)
    } else if (role === 'agente') {
      logger?.flushTurn()
    }

    return Promise.resolve()
  }

  async function startSession(message: Record<string, unknown>): Promise<void> {
    if (session) return closeWithPolicy(socket, 'duplicate start event')
    const agentId = optionalId(message.agentId)

    if (message.agentId != null && message.agentId !== '' && !agentId) return closeWithPolicy(socket, 'invalid agent id')
    if (agentId) {
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, orgId: principal.orgId, isActive: true },
        select: { id: true },
      })
      if (!agent) return closeWithPolicy(socket, 'agent does not belong to authenticated organisation')
    }

    const release = acquireSession(principal)
    if (!release) {
      send({ type: 'error', message: 'Ya hay una sesión de voz activa para esta cuenta. Cierra la otra sesión e inténtalo de nuevo.' })
      return closeWithPolicy(socket, 'concurrency limit exceeded')
    }
    releaseSession = release
    clearTimeout(startDeadline)

    const callSid = `sim_${Date.now()}_${principal.userId.slice(0, 8)}`
    const agentConfig = agentId ? await loadAgentConfig(agentId, principal.orgId).catch(() => null) : null
    logger = new SessionLogger(callSid, {
      agentId: agentId ?? null,
      orgId: principal.orgId,
      phone: 'browser',
    })
    logger.log({ event: 'start', userId: principal.userId })

    const ctx = createCallContext({
      callSid,
      phone: 'browser',
      businessType: 'generico',
      businessName: '',
      orgId: principal.orgId,
      campaignId: '',
      agentId: agentId ?? '',
      leadId: '',
      agentConfig,
    })

    const systemPrompt = (agentConfig?.playbook?.scripts?.base_prompt as string) || DEFAULT_PROMPT
    const useQwenOmni = message.engine === 'qwen-omni'
    if (useQwenOmni && !qwenOmniConfigured()) {
      releaseSession?.()
      releaseSession = null
      send({ type: 'error', message: 'Qwen Omni no está configurado en el servidor (falta DASHSCOPE_API_KEY).' })
      return closeWithPolicy(socket, 'qwen omni not configured')
    }
    try {
      if (useQwenOmni) {
        const omni = new QwenOmniRealtimeSession(ctx, systemPrompt)
        await omni.connect()
        session = omni
      } else {
        session = await createVoiceSession(ctx, systemPrompt, pipelineOverride(message))
      }
    } catch (error) {
      releaseSession?.()
      releaseSession = null
      send({ type: 'error', message: useQwenOmni ? 'No se pudo conectar con Qwen Omni (DashScope).' : 'El motor de voz autoalojado no está disponible.' })
      console.error('[SIM] voice engine unavailable (%s):', useQwenOmni ? 'qwen-omni' : 'self-hosted', error)
      return closeWithPolicy(socket, 'voice engine unavailable')
    }
    await session.attach({ onAudio, onInterrupt, onTranscript })
    session.run().catch(error => send({ type: 'error', message: error.message }))
    send({ type: 'status', status: 'session_started' })
    logger.startTurn('agente', 24000)
    durationTimer = setTimeout(() => {
      send({ type: 'error', message: 'La sesión alcanzó su duración máxima y se ha cerrado.' })
      closeWithPolicy(socket, 'maximum session duration exceeded')
    }, maxDurationMs())
  }

  socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[] | string, isBinary?: boolean) => {
    const buffer = rawToBuffer(raw)
    if (!allowMessage(buffer.length)) return closeWithPolicy(socket, 'rate limit exceeded')

    // ws marca los frames de texto (control JSON) con isBinary=false. El audio
    // PCM16 puede empezar por 0x7b ("{") por puro azar, así que el sniffing de
    // contenido solo queda como fallback si la librería no informa del tipo.
    const looksLikeJson = isBinary === false || (isBinary === undefined && buffer[0] === 0x7b)
    if (looksLikeJson) {
      if (buffer.length > MAX_SIM_JSON_BYTES) return closeWithPolicy(socket, 'JSON message too large')
      let message: unknown
      try { message = JSON.parse(buffer.toString()) } catch { return closeWithPolicy(socket, 'invalid JSON message') }
      if (!isRecord(message) || typeof message.type !== 'string') return closeWithPolicy(socket, 'invalid control message')

      if (message.type === 'start') { startRequested = true; await startSession(message) }
      else if (message.type === 'stop') {
        await session?.close().catch(() => {})
        socket.close(1000, 'Session stopped')
      } else {
        closeWithPolicy(socket, 'unsupported control message')
      }
      return
    }

    if (buffer.length > MAX_SIM_AUDIO_BYTES) return closeWithPolicy(socket, 'audio message too large')
    // El micro empieza a emitir antes de que el handshake con el motor remoto
    // (~1-2 s) termine: esos frames se descartan, no son un abuso de protocolo.
    if (!session) return startRequested ? undefined : closeWithPolicy(socket, 'audio before authenticated start')
    if (userSpeakingStarted) logger?.addChunk(buffer)
    await session.sendAudio(buffer).catch(() => {})
  })

  socket.on('close', () => {
    clearTimeout(startDeadline)
    if (durationTimer) clearTimeout(durationTimer)
    releaseSession?.()
    logger?.log({ event: 'end' })
    logger?.close()
    if (logger) void analyzePostCall(logger.dir)
    session?.close().catch(() => {})
  })
  socket.on('error', (error: Error) => console.error('[SIM] error:', error.message))
}
