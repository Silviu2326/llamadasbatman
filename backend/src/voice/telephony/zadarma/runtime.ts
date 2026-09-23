import { prisma } from '../../../lib/prisma'
import { canStartWhiteLabelVoice } from '../../../services/whiteLabel.service'
import { ingestCall } from '../../../services/calls.service'
import { assertVoiceTestCallAllowed } from '../../../services/voiceTestCall.service'
import { emitToOrg } from '../../../websockets'
import { loadAgentConfig } from '../../agentConfig'
import { canCall, detectOptout, detectTransferRequest, normalizeE164, registerOptout } from '../../compliance'
import { createVoiceSession } from '../../engine/factory'
import { evaluateVoiceCall } from '../../evaluation/callJudgeService'
import { createCallContext } from '../../intelligence/conversation/callContext'
import { buildIntelligentPrompt } from '../../intelligence/promptContext'
import { buildVoiceRuntimeSnapshot, VoiceTrace } from '../../observability/voiceTrace'
import { missingRuntimeCredentials, resolveAgentRuntime, unsupportedRuntimeProviders } from '../../runtimeConfig'
import { registerLiveCall, unregisterLiveCall } from '../liveCalls'
import type { SipVoiceCall } from './audioServer'
import { assertCompleteRecordingAvailable, recordingUrl, waitForRecordingStart } from './recordings'

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
    orgId, leadId: lead.id, basePrompt: agent.systemPrompt ?? '',
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
      return {
        session,
        callbacks: {
          onEvent: event => {
            trace.record(event)
            if (event.type === 'error' && event.payload?.fatal === true) hangup()
          },
          onTranscript: async (role, text, meta) => {
            if (role !== 'prospecto' && role !== 'agente') return
            ctx.turns++
            ctx.transcript.push({ role, text })
            trace.record({ type: 'transcript.final', role: role === 'prospecto' ? 'user' : 'assistant', payload: { text, ...meta } })
            if (role !== 'prospecto') return
            if (detectOptout(text)) {
              ctx.outcome = 'optout'
              await session.stopResponding('opt_out')
              try { await registerOptout(ctx.orgId, phone, 'detected_in_call') }
              finally { hangup() }
            } else if (!ctx.transferRequested && detectTransferRequest(text)) {
              ctx.transferRequested = true
              ctx.outcome = 'callback_requested'
              await session.stopResponding('human_requested')
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
          unregisterLiveCall(ctx.callSid)
          const duration = Math.round((Date.now() - ctx.startedAt) / 1000)
          trace.record({ type: 'call.ended', role: 'system', provider: 'zadarma', payload: { reason, durationSeconds: duration } })
          const call = await ingestCall(ctx.orgId, {
            externalCallId: ctx.callSid, telephonyProvider: 'zadarma', leadId: lead.id,
            recordingUrl: recordingUrl(uuid),
            agentId: agent.id, campaignId: campaignId ?? undefined, isTest, duration,
            transcript: ctx.transcript.map(turn => `${turn.role}: ${turn.text}`).join('\n'),
            outcome: ctx.outcome === 'optout' ? 'not_interested' : ctx.outcome === 'callback_requested' ? 'callback_requested' : 'none',
            startedAt: new Date(ctx.startedAt).toISOString(), endedAt: new Date().toISOString(),
          })
          await trace.flush(call.id)
          // La prueba solo sirve para publicar si alguien la puntúa. Se evalúa
          // con los eventos ya volcados; si el juez falla, la llamada queda
          // guardada igual y se puede reevaluar a mano desde la ficha.
          if (isTest) {
            try { await evaluateVoiceCall(ctx.orgId, call.id) }
            catch (error) { console.warn(`[ZADARMA] evaluación de la prueba ${call.id} fallida:`, error instanceof Error ? error.message : 'unknown') }
          }
          emitToOrg(ctx.orgId, 'call:completed', call)
        },
      }
    },
  }
}
