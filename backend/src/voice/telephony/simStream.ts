import { WebSocket } from 'ws'
import { DeepgramElevenLabsSession } from '../pipelines/deepgramElevenLabs'
import { createCallContext } from '../intelligence/conversation/callContext'
import { loadAgentConfig } from '../agentConfig'
import { SessionLogger } from '../sessionLogger'

const DEFAULT_PROMPT = `Eres Alex, asesor comercial de VozIA, una plataforma de agentes de voz con IA que hace llamadas de ventas automáticas en español.

PRODUCTO QUE VENDES:
VozIA permite a empresas lanzar agentes de IA que llaman a sus prospectos, califican leads, agendan reuniones y hacen seguimiento, sin necesidad de equipo humano. Los agentes hablan de forma natural, responden objeciones en tiempo real, y trabajan 24/7 sin descanso. El sistema se integra con el CRM, graba todas las conversaciones y genera analíticas de cada llamada (confianza STT, latencia, WPM, emociones detectadas).

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

export async function handleSimStream(socket: WebSocket): Promise<void> {
  let session: DeepgramElevenLabsSession | null = null
  let logger: SessionLogger | null = null
  let userSpeakingStarted = false

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
    logger?.flushTurn() // save partial agent audio on barge-in
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
      logger?.flushTurn()             // write user turn WAV
      logger?.startTurn('agente', 24000) // start collecting agent audio
    } else if (role === 'agente') {
      logger?.flushTurn()             // write agent turn WAV
    }

    return Promise.resolve()
  }

  socket.on('message', async (raw: Buffer | ArrayBuffer | string) => {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)

    if (buf[0] === 0x7b) {
      let msg: any
      try { msg = JSON.parse(buf.toString()) } catch { return }

      console.log('[SIM] msg type=%s', msg.type)

      if (msg.type === 'start' && !session) {
        const callSid = `sim_${Date.now()}`
        const agentConfig = msg.agentId
          ? await loadAgentConfig(msg.agentId).catch(() => null)
          : null

        logger = new SessionLogger(callSid, {
          agentId: msg.agentId || null,
          orgId:   msg.orgId   || null,
          phone:   msg.phone   || 'browser',
        })
        logger.log({ event: 'start' })

        const ctx = createCallContext({
          callSid,
          phone: msg.phone || 'browser',
          businessType: 'generico',
          businessName: '',
          orgId: msg.orgId || '',
          campaignId: '',
          agentId: msg.agentId || '',
          leadId: msg.leadId || '',
          agentConfig,
        })

        const systemPrompt = (agentConfig?.playbook?.scripts?.base_prompt as string) || DEFAULT_PROMPT
        session = new DeepgramElevenLabsSession(ctx, systemPrompt)
        await session.attach(onAudio, onInterrupt, onTranscript)
        session.run().catch(e => send({ type: 'error', message: e.message }))
        send({ type: 'status', status: 'session_started' })
        // opening greeting: agent turn starts when first audio chunk arrives via onAudio
        logger.startTurn('agente', 24000)

      } else if (msg.type === 'stop') {
        await session?.close().catch(() => {})
        socket.close()
      }
      return
    }

    if (session) {
      // only add user audio while a user turn is active (userSpeakingStarted)
      if (userSpeakingStarted) logger?.addChunk(buf)
      await session.sendAudio(buf).catch(() => {})
    }
  })

  socket.on('close', () => {
    logger?.log({ event: 'end' })
    logger?.close()
    session?.close().catch(() => {})
  })
  socket.on('error', (e) => console.error('[SIM] error:', e.message))
}
