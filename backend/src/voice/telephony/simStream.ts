import { WebSocket } from 'ws'
import { createCallContext } from '../intelligence/conversation/callContext'
import { loadAgentConfig } from '../agentConfig'
import { agentPlaybook } from '../agentPlaybooks'
import { SessionLogger } from '../sessionLogger'
import { prisma } from '../../lib/prisma'
import { buildIntelligentPrompt } from '../intelligence/promptContext'
import { VendravaVoiceSession, sanitizeVendravaSettings, vendravaVoiceConfigured, vendravaVoiceLanguageSupported } from '../pipelines/vendravaVoice'
import { missingRuntimeCredentials, resolveAgentRuntime, runtimePipelineLabel, unsupportedRuntimeProviders } from '../runtimeConfig'
import type { VoiceSession } from '../engine/voiceSession'

export interface VoiceSimulationPrincipal {
  userId: string
  orgId: string
  role: string
  email: string
}

// Guion de respaldo de la cabina cuando la prueba no elige agente. En inglés,
// como el resto del producto de voz (decisión del 11/08/2026).
const DEFAULT_PROMPT = `You are Alex, a sales rep for Vendrava, a platform of AI voice agents that make outbound sales calls.

WHAT YOU SELL:
Vendrava lets companies launch AI agents that call their prospects, qualify leads, book meetings and follow up without a human team. The agents speak naturally, handle objections in real time and work around the clock. Everything lands in the CRM: recordings, transcripts and per-call analytics.

KEY BENEFITS:
- Cost per call roughly ten times lower than a human rep
- Consistency: the same pitch on every call, no bad days
- Instant scale: one agent or a thousand, same marginal cost
- Speed: first contact in seconds, not days
- Data: every call produces something actionable about the prospect

IDEAL CUSTOMER:
Companies with sales teams doing cold calling or follow-up: B2B SaaS, real estate, clinics, training academies, car dealers, insurers.

CONVERSATION RULES:
- Talk like a real person, not a brochure. Be direct and concrete.
- Short sentences. Two or three per turn at most. Leave room for the prospect to speak.
- Use open questions to uncover their situation: how many reps they have, how many calls a day, what their contact rate is.
- On price objections: anchor the value (the cost of a human rep) before talking about price.
- If they ask for the price: it depends on call volume, and the typical ROI is positive in the first month.
- Goal of the call: get the prospect to accept a twenty-minute demo.
- If they are already interested: propose a day and time for the demo directly.
- Never promise what you cannot deliver. If you do not know something, say so and offer to follow up.
- Warm, confident tone, no pressure.`

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
    // Mantén el formato anunciado por `audio.start`: PCM16 little-endian.
    // Convertirlo a Float32 aquí hacía que el navegador tuviera que adivinar
    // el formato y producía una voz metálica o acelerada.
    send(pcm24k)
    return Promise.resolve()
  }

  function onInterrupt(): Promise<void> {
    logger?.log({ event: 'interrupt' })
    logger?.flushTurn()
    send({ type: 'interrupt' })
    return Promise.resolve()
  }

  async function onTranscript(role: string, text: string, meta?: Record<string, unknown>): Promise<void> {
    if (role === 'partial') {
      if (!userSpeakingStarted) {
        userSpeakingStarted = true
        logger?.startTurn('prospecto', 16000)
      }
      send({ type: 'partial', text })
      return
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

    // La cabina prueba el turno como si nosotros hubiéramos llamado, salvo que
    // el agente sea de los que solo atienden: entonces se prueba en entrante.
    const direction = message.direction === 'inbound' || agentPlaybook(agentConfig?.agentType).directions[0] === 'inbound'
      ? 'inbound' as const
      : 'outbound' as const

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
      direction,
    })

    const systemPrompt = await buildIntelligentPrompt({
      orgId: principal.orgId,
      basePrompt: (agentConfig?.playbook?.scripts?.base_prompt as string) || DEFAULT_PROMPT,
      agentType: agentConfig?.agentType,
      direction,
      strategyId: agentConfig?.playbook.strategy,
      keyMessages: agentConfig?.playbook.scripts.key_messages as string | undefined,
      escalationRules: agentConfig?.playbook.scripts.escalation_rules as string | undefined,
      customPlaybook: agentConfig?.playbook.scripts.custom_playbook as string | undefined,
      behavior: agentConfig?.behavior,
    })
    const runtime = resolveAgentRuntime(agentConfig)
    const unsupported = unsupportedRuntimeProviders(runtime)
    const missing = missingRuntimeCredentials(runtime)
    if (unsupported.length) {
      releaseSession?.()
      releaseSession = null
      send({ type: 'error', message: `Proveedores no soportados: ${unsupported.join(', ')}.` })
      return closeWithPolicy(socket, 'voice runtime provider unsupported')
    }
    if (!vendravaVoiceConfigured(agentConfig)) {
      releaseSession?.()
      releaseSession = null
      send({ type: 'error', message: `Faltan credenciales para el runtime seleccionado: ${missing.join(', ')}.` })
      return closeWithPolicy(socket, 'voice pipeline not configured')
    }
    if (!vendravaVoiceLanguageSupported(agentConfig)) {
      releaseSession?.()
      releaseSession = null
      send({ type: 'error', message: `El motor de voz solo admite inglés y español; este agente está configurado en "${agentConfig?.identity?.agentAccent}".` })
      return closeWithPolicy(socket, 'voice language unsupported')
    }
    try {
      session = new VendravaVoiceSession(ctx, systemPrompt, sanitizeVendravaSettings(message.settings))
    } catch (error) {
      releaseSession?.()
      releaseSession = null
      send({ type: 'error', message: `No se pudo abrir el motor de voz (${runtimePipelineLabel(runtime)}).` })
      console.error('[SIM] voice engine unavailable:', error)
      return closeWithPolicy(socket, 'voice engine unavailable')
    }
    await session.attach({
      onAudio,
      onInterrupt,
      onTranscript,
      onEvent: event => {
        logger?.log({ event: event.type, ...event.payload, provider: event.provider, model: event.model })
        send({ type: 'voice_event', event })
      },
    })
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
      } else if (message.type === 'interrupt') {
        // Botón "Interrupt" de la cabina: mismo camino de cancelación que el barge-in.
        await session?.cancelResponse('manual interrupt').catch(() => {})
      } else if (message.type === 'text' && session instanceof VendravaVoiceSession) {
        if (typeof message.text !== 'string') return closeWithPolicy(socket, 'invalid text turn')
        await session.sendTextTurn(message.text).catch(() => {})
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
    session?.close().catch(() => {})
  })
  socket.on('error', (error: Error) => console.error('[SIM] error:', error.message))
}
