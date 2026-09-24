import { readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../../../lib/prisma'
import { canStartWhiteLabelVoice } from '../../../services/whiteLabel.service'
import { ingestCall } from '../../../services/calls.service'
import { assertVoiceTestCallAllowed } from '../../../services/voiceTestCall.service'
import { emitToOrg } from '../../../websockets'
import { loadAgentConfig } from '../../agentConfig'
import { canCall, detectOptout, detectTransferRequest, normalizeE164, registerOptout } from '../../compliance'
import { createVoiceSession } from '../../engine/factory'
import { evaluateVoiceCall } from '../../evaluation/callJudgeService'
import { classifyCallOutcome, type TranscriptTurn } from '../../intelligence/callOutcomeClassifier'
import { createCallContext } from '../../intelligence/conversation/callContext'
import { buildIntelligentPrompt } from '../../intelligence/promptContext'
import { buildVoiceRuntimeSnapshot, VoiceTrace } from '../../observability/voiceTrace'
import { missingRuntimeCredentials, resolveAgentRuntime, unsupportedRuntimeProviders } from '../../runtimeConfig'
import { classifyOpeningSpeech } from '../amd'
import { registerLiveCall, unregisterLiveCall } from '../liveCalls'
import type { SipVoiceCall } from './audioServer'
import { RECORDING_UUID, assertCompleteRecordingAvailable, recordingDirectory, recordingUrl, waitForRecordingStart } from './recordings'

/** Ventana desde el descolgado en la que lo que se oye puede ser un buzón o una centralita. */
const OPENING_SPEECH_WINDOW_MS = Number(process.env.ZADARMA_AMD_WINDOW_MS) > 0 ? Number(process.env.ZADARMA_AMD_WINDOW_MS) : 10_000

type IngestPayload = Parameters<typeof ingestCall>[1]

/**
 * Lo que hace falta para volver a intentar la ingesta si la base de datos
 * falló al colgar. Se escribe junto al WAV, en el directorio privado de
 * grabaciones, como `<uuid>.pending.json`.
 */
export interface PendingCallFile {
  version: 1
  uuid: string
  orgId: string
  isTest: boolean
  failedAt: string
  attempts: number
  lastError: string | null
  data: IngestPayload
}

export function pendingCallPath(uuid: string, directory = recordingDirectory()): string {
  if (!RECORDING_UUID.test(uuid)) throw new Error('INVALID_RECORDING_ID')
  return path.join(directory, `${uuid}.pending.json`)
}

export async function writePendingCall(uuid: string, orgId: string, data: IngestPayload, error: unknown, directory = recordingDirectory()): Promise<void> {
  const file: PendingCallFile = {
    version: 1, uuid, orgId, isTest: data.isTest === true, failedAt: new Date().toISOString(), attempts: 1,
    lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500), data,
  }
  const target = pendingCallPath(uuid, directory)
  // Escritura atómica: nadie reconcilia un JSON a medias.
  await writeFile(`${target}.tmp`, JSON.stringify(file), { mode: 0o640 })
  await rename(`${target}.tmp`, target)
}

export interface SipCallRequest { orgId: string; leadId: string; campaignId: string; agentId: string }
export interface SipTestCallRequest { orgId: string; leadId: string; agentId: string }

interface PreparedCallInput {
  orgId: string
  campaignId: string | null
  isTest: boolean
  agent: { id: string; systemPrompt: string | null; phoneNumber: string | null }
  lead: { id: string; company: string | null }
  phone: string
}

/**
 * Llamada de campaña: agente publicado dentro de una campaña activa. Es el
 * único camino para marcar a un prospecto.
 */
export async function prepareSipCall(request: SipCallRequest, callerId: string) {
  await assertCompleteRecordingAvailable()
  const lead = await prisma.lead.findFirst({
    where: { id: request.leadId, orgId: request.orgId, campaignId: request.campaignId },
    include: { campaign: { include: { agent: true } } },
  })
  const campaign = lead?.campaign
  const agent = campaign?.agent
  if (!lead || !campaign || campaign.orgId !== request.orgId || campaign.status !== 'active'
    || !agent || agent.id !== request.agentId || agent.orgId !== request.orgId
    || !agent.isActive || agent.lifecycleStatus !== 'active' || !agent.voiceId || !agent.systemPrompt
    || agent.callDirection === 'inbound') throw new Error('ZADARMA_CALL_NOT_READY')
  const phone = normalizeE164(lead.phone ?? '')
  if (!phone) throw new Error('ZADARMA_PHONE_MISMATCH')
  return prepareCall({ orgId: request.orgId, campaignId: campaign.id, isTest: false, agent, lead, phone }, callerId)
}

/**
 * Llamada de prueba de un agente en borrador. No hay campaña y el destino sale
 * de la lista de números propios verificados; `assertVoiceTestCallAllowed`
 * comprueba aquí, contra la base de datos, exactamente lo mismo que comprobó la
 * API — esta pasarela es quien marca y no se fía de quien la llama.
 */
export async function prepareSipTestCall(request: SipTestCallRequest, callerId: string) {
  await assertCompleteRecordingAvailable()
  const gate = await assertVoiceTestCallAllowed(request.orgId, request.agentId, request.leadId)
  if (!gate.allowed) throw new Error(`ZADARMA_TEST_CALL_BLOCKED_${gate.reason.toUpperCase()}`)
  return prepareCall({ orgId: request.orgId, campaignId: null, isTest: true, agent: gate.agent, lead: gate.lead, phone: gate.phone }, callerId)
}

async function prepareCall(input: PreparedCallInput, callerId: string) {
  const { agent, lead, phone, orgId, campaignId, isTest } = input
  if (normalizeE164(agent.phoneNumber ?? '') !== callerId) throw new Error('ZADARMA_PHONE_MISMATCH')
  if (!await canStartWhiteLabelVoice(orgId)) throw new Error('ZADARMA_VOICE_QUOTA')
  if (!(await canCall(orgId, phone, lead.id, isTest ? { internalTestAgentId: agent.id } : {})).allowed) throw new Error('ZADARMA_CALL_NOT_ALLOWED')
  const agentConfig = await loadAgentConfig(agent.id, orgId)
  // loadAgentConfig has a fallback for simulations. Never dial with that fallback.
  if (agentConfig.softwareId !== agent.id || agentConfig.playbook.scripts.base_prompt !== agent.systemPrompt) {
    throw new Error('ZADARMA_AGENT_CONFIG_UNAVAILABLE')
  }
  if (!/^(es|en)(\b|[-_])/i.test(agentConfig.identity.agentAccent)) throw new Error('ZADARMA_LANGUAGE_UNSUPPORTED')
  const runtime = resolveAgentRuntime(agentConfig)
  if (missingRuntimeCredentials(runtime).length || unsupportedRuntimeProviders(runtime).length) throw new Error('ZADARMA_VOICE_RUNTIME_UNAVAILABLE')
  const prompt = await buildIntelligentPrompt({
    orgId, leadId: lead.id, agentId: agent.id, basePrompt: agent.systemPrompt ?? '',
    agentType: agentConfig.agentType, direction: 'outbound', strategyId: agentConfig.playbook.strategy,
    keyMessages: agentConfig.playbook.scripts.key_messages as string | undefined,
    escalationRules: agentConfig.playbook.scripts.escalation_rules as string | undefined,
    customPlaybook: agentConfig.playbook.scripts.custom_playbook as string | undefined,
    behavior: agentConfig.behavior, agentName: agentConfig.identity.agentName,
  })
  return {
    phone,
    async start(uuid: string, hangup: () => void): Promise<SipVoiceCall> {
      await waitForRecordingStart(uuid)
      const ctx = createCallContext({
        orgId, agentId: agent.id, leadId: lead.id, campaignId: campaignId ?? '',
        callSid: `zadarma:${uuid}`, phone, businessName: lead.company ?? '', agentConfig, direction: 'outbound',
      })
      ctx.metadata.recordingPolicy = 'always'
      if (isTest) ctx.metadata.callKind = 'test'
      const trace = new VoiceTrace(ctx, buildVoiceRuntimeSnapshot(ctx, prompt))
      const session = await createVoiceSession(ctx, prompt)
      // MixMonitor starts before AudioSocket in the dedicated dialplan. The
      // greeting announces recording; no affirmative consent is fabricated.
      trace.record({ type: 'call.connected', role: 'system', provider: 'zadarma', payload: { transport: 'asterisk-audiosocket', recording: true, recordingPolicy: 'always', test: isTest } })
      registerLiveCall({ orgId, agentId: agent.id, leadId: lead.id, campaignId: campaignId ?? '', callSid: ctx.callSid, phone, startedAt: ctx.startedAt })
      let finished = false
      let endTimer: ReturnType<typeof setTimeout> | undefined
      let openingSpeech = ''
      let machineDetected = false
      const turns: TranscriptTurn[] = []
      const elapsed = () => Date.now() - ctx.startedAt

      /**
       * Buzón o centralita en los primeros segundos: se calla el agente y se
       * cuelga sin discurso. Sobre parciales, para cortar cuanto antes; el
       * saludo ya puede haber empezado, pero no se deja un mensaje grabado.
       */
      const checkOpeningSpeech = async (text: string): Promise<boolean> => {
        if (machineDetected || elapsed() > OPENING_SPEECH_WINDOW_MS) return false
        openingSpeech = text.length >= openingSpeech.length ? text : `${openingSpeech} ${text}`
        const amd = classifyOpeningSpeech(openingSpeech)
        if (amd.classification !== 'VOICEMAIL' && amd.classification !== 'IVR') return false
        machineDetected = true
        ctx.outcome = amd.classification === 'VOICEMAIL' ? 'voicemail' : 'ivr'
        ctx.metadata.amdResult = { classification: amd.classification, confidence: amd.confidence, reason: amd.reason, atMs: elapsed(), speech: openingSpeech.slice(0, 300) }
        trace.record({ type: 'amd.detected', role: 'system', provider: 'zadarma', payload: ctx.metadata.amdResult as Record<string, unknown> })
        try { await session.stopResponding('machine_detected') } finally { hangup() }
        return true
      }

      return {
        session,
        callbacks: {
          onEvent: event => {
            trace.record(event)
            if (event.type === 'error' && event.payload?.fatal === true) hangup()
            // El pipeline se ha despedido o el prospecto lleva demasiado
            // callado: se cuelga cuando termine de sonar lo que ya está en cola.
            if (event.type === 'call.end_requested' && !endTimer && !finished) {
              const drainMs = Math.min(15_000, Math.max(0, Number(event.payload?.drainMs) || 0))
              ctx.metadata.endRequestedBy = String(event.payload?.reason ?? 'pipeline')
              endTimer = setTimeout(hangup, drainMs)
            }
          },
          onTranscript: async (role, text, meta) => {
            if (role === 'partial') { await checkOpeningSpeech(text); return }
            if (role !== 'prospecto' && role !== 'agente') return
            ctx.turns++
            ctx.transcript.push({ role, text })
            turns.push({ role, text, atMs: elapsed() })
            // `payload.role` en agente/prospecto es lo que lee el juez; `role`
            // del evento sigue el vocabulario user/assistant de la traza.
            trace.record({ type: 'transcript.final', role: role === 'prospecto' ? 'user' : 'assistant', payload: { text, role, ...meta } })
            if (role !== 'prospecto') return
            if (await checkOpeningSpeech(text)) return
            if (detectOptout(text)) {
              ctx.outcome = 'optout'
              trace.record({ type: 'compliance.opt_out', role: 'system', payload: { text } })
              // El opt-out se registra aunque el pipeline falle al callarse: es
              // la obligación legal, no un detalle de la sesión.
              try { await session.stopResponding('opt_out') }
              catch (error) { console.warn('[ZADARMA] stopResponding tras opt-out falló:', error instanceof Error ? error.message : 'unknown') }
              try { await registerOptout(ctx.orgId, phone, 'detected_in_call') }
              catch (error) { console.error('[ZADARMA] no se pudo registrar el opt-out de la llamada %s:', ctx.callSid, error instanceof Error ? error.message : 'unknown') }
              finally { hangup() }
            } else if (!ctx.transferRequested && detectTransferRequest(text)) {
              ctx.transferRequested = true
              ctx.outcome = 'callback_requested'
              trace.record({ type: 'compliance.transfer_requested', role: 'system', payload: { text } })
              try { await session.stopResponding('human_requested') }
              catch (error) { console.warn('[ZADARMA] stopResponding tras transferencia falló:', error instanceof Error ? error.message : 'unknown') }
              emitToOrg(ctx.orgId, 'call:transfer_requested', {
                callSid: ctx.callSid, leadId: lead.id, contact: ctx.businessName,
                reason: 'human_callback_required', transcript: ctx.transcript.slice(-6),
              })
              // No successful live transfer is claimed. The CRM records a callback.
              hangup()
            }
          },
        },
        async finish(reason) {
          if (finished) return
          finished = true
          if (endTimer) clearTimeout(endTimer)
          unregisterLiveCall(ctx.callSid)
          const endedAt = new Date()
          const duration = Math.round((endedAt.getTime() - ctx.startedAt) / 1000)
          const endReason = ctx.metadata.endRequestedBy ? `${reason}:${String(ctx.metadata.endRequestedBy)}` : reason
          trace.record({ type: 'call.ended', role: 'system', provider: 'zadarma', payload: { reason: endReason, durationSeconds: duration } })
          // Resultado real: el LLM primario lee la conversación con un límite
          // de 8 s; si falla, el mapeo antiguo. Nunca bloquea la ingesta.
          const classified = await classifyCallOutcome({
            turns, ctxOutcome: ctx.outcome, transferRequested: ctx.transferRequested, endReason,
            language: /^es/i.test(agentConfig.identity.agentAccent) ? 'es' : 'en',
            timeZone: agentConfig.compliance?.timezone || 'Europe/Madrid',
            startedAt: new Date(ctx.startedAt), now: endedAt, durationSeconds: duration, businessName: ctx.businessName,
          }, { runtime: resolveAgentRuntime(agentConfig) })
          trace.record({ type: 'outcome.classified', role: 'system', payload: { ...classified } })
          const amd = ctx.metadata.amdResult as Record<string, unknown> | undefined
          const payload: IngestPayload = {
            externalCallId: ctx.callSid, telephonyProvider: 'zadarma', leadId: lead.id,
            recordingUrl: recordingUrl(uuid),
            agentId: agent.id, campaignId: campaignId ?? undefined, isTest, duration,
            transcript: ctx.transcript.map(turn => `${turn.role}: ${turn.text}`).join('\n'),
            transcriptTurns: turns,
            outcome: classified.outcome,
            summary: classified.summary,
            sentiment: classified.sentiment,
            callbackAt: classified.callbackAt ?? undefined,
            meetingAt: classified.meetingAt ?? undefined,
            highIntent: classified.highIntent,
            ...(amd ? { contactClassification: String(amd.classification), contactClassificationConfidence: Number(amd.confidence), amdResult: amd } : {}),
            startedAt: new Date(ctx.startedAt).toISOString(), endedAt: endedAt.toISOString(),
          }
          let call: Awaited<ReturnType<typeof ingestCall>>
          try {
            call = await ingestCall(ctx.orgId, payload)
          } catch (error) {
            // Sin fila `Call` la transcripción y el WAV quedarían huérfanos. Se
            // vuelca todo junto a la grabación y `reconcilePendingCalls` reintenta.
            console.error('[ZADARMA] ingesta de la llamada %s fallida; se guarda pendiente:', ctx.callSid, error instanceof Error ? error.message : 'unknown')
            try { await writePendingCall(uuid, ctx.orgId, payload, error) }
            catch (writeError) { console.error('[ZADARMA] no se pudo escribir %s.pending.json:', uuid, writeError instanceof Error ? writeError.message : 'unknown') }
            throw error
          }
          await trace.flush(call.id)
          // La evaluación no bloquea el cierre: la prueba se espera porque de
          // ella depende publicar; la campaña se evalúa en segundo plano.
          const evaluation = evaluateVoiceCall(ctx.orgId, call.id)
            .catch(error => console.warn(`[ZADARMA] evaluación de la llamada ${call.id} fallida:`, error instanceof Error ? error.message : 'unknown'))
          if (isTest) await evaluation
          emitToOrg(ctx.orgId, 'call:completed', call)
        },
      }
    },
  }
}

export interface ReconcileResult {
  ingested: string[]
  failed: Array<{ uuid: string; error: string }>
  /** WAV cerrados cuya fila `Call` existía sin `recordingUrl` y se ha enlazado. */
  linked: string[]
  /** WAV cerrados sin fila `Call` ni pendiente: no se puede saber a qué organización pertenecen. */
  orphans: string[]
}

/**
 * Reintenta las ingestas que fallaron al colgar y enlaza grabaciones cerradas
 * (`.ready`) con su `Call`. Pensada para el arranque de la pasarela o del
 * worker y para un temporizador periódico; es idempotente y no lanza.
 */
export async function reconcilePendingCalls(options: {
  directory?: string
  maxAttempts?: number
  /** Inyectables en pruebas; por defecto la ingesta y la evaluación reales. */
  ingest?: typeof ingestCall
  evaluate?: typeof evaluateVoiceCall
} = {}): Promise<ReconcileResult> {
  const directory = options.directory ?? recordingDirectory()
  const maxAttempts = options.maxAttempts ?? 20
  const ingest = options.ingest ?? ingestCall
  const evaluate = options.evaluate ?? evaluateVoiceCall
  const result: ReconcileResult = { ingested: [], failed: [], linked: [], orphans: [] }
  let entries: string[]
  try { entries = await readdir(directory) } catch { return result }
  const pending = new Set(entries.filter(name => name.endsWith('.pending.json')).map(name => name.slice(0, -'.pending.json'.length)).filter(uuid => RECORDING_UUID.test(uuid)))
  const ready = entries.filter(name => name.endsWith('.ready')).map(name => name.slice(0, -'.ready'.length)).filter(uuid => RECORDING_UUID.test(uuid))

  for (const uuid of pending) {
    const file = pendingCallPath(uuid, directory)
    let parsed: PendingCallFile
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as PendingCallFile
      if (parsed?.version !== 1 || !parsed.orgId || !parsed.data?.leadId) throw new Error('PENDING_FILE_INVALID')
    } catch (error) {
      result.failed.push({ uuid, error: error instanceof Error ? error.message : 'unknown' })
      continue
    }
    try {
      const call = await ingest(parsed.orgId, { ...parsed.data, isTest: parsed.isTest })
      await unlink(file).catch(() => {})
      result.ingested.push(uuid)
      void evaluate(parsed.orgId, call.id).catch(() => {})
      emitToOrg(parsed.orgId, 'call:completed', call)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      result.failed.push({ uuid, error: message })
      const attempts = (parsed.attempts ?? 0) + 1
      if (attempts >= maxAttempts) console.error('[ZADARMA] la llamada pendiente %s lleva %d intentos fallidos: %s', uuid, attempts, message)
      try { await writeFile(file, JSON.stringify({ ...parsed, attempts, lastError: message.slice(0, 500) })) } catch {}
    }
  }

  for (const uuid of ready) {
    if (pending.has(uuid)) continue
    const externalCallId = `zadarma:${uuid}`
    try {
      const call = await prisma.call.findFirst({ where: { externalCallId }, select: { id: true, recordingUrl: true } })
      if (!call) { result.orphans.push(uuid); continue }
      if (!call.recordingUrl) {
        await prisma.call.update({ where: { id: call.id }, data: { recordingUrl: recordingUrl(uuid) } })
        result.linked.push(uuid)
      }
    } catch (error) {
      result.failed.push({ uuid, error: error instanceof Error ? error.message : 'unknown' })
    }
  }
  if (result.orphans.length) console.warn('[ZADARMA] %d grabaciones cerradas sin fila Call ni pendiente (uuid): %s', result.orphans.length, result.orphans.slice(0, 10).join(', '))
  return result
}

/** Reconciliación periódica; devuelve la función que la detiene. */
export function startPendingCallReconciler(intervalMs = 5 * 60_000): () => void {
  const run = () => void reconcilePendingCalls().catch(error => console.warn('[ZADARMA] reconciliación fallida:', error instanceof Error ? error.message : 'unknown'))
  run()
  const timer = setInterval(run, Math.max(30_000, intervalMs))
  timer.unref?.()
  return () => clearInterval(timer)
}
