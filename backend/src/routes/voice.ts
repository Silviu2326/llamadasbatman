import { FastifyInstance } from 'fastify'
import { authenticateVoiceService } from '../middlewares/authenticateVoiceService'
import { prisma } from '../lib/prisma'
import { buildStreamTwiml } from '../voice/telephony/twilioClient'
import { startOutboundCall } from '../voice/telephony/outbound'
import { loadAgentConfig } from '../voice/agentConfig'
import { canCall, normalizeE164 } from '../voice/compliance'
import { scheduleRetry } from '../jobs/leadCallDispatch'
import { getTwilioIntegrationConfig, twilioWebhookUrl, verifyTwilioSignatureWithAuthToken } from '../services/twilioIntegration.service'
import { validateVoiceResourceOwnership } from '../services/calls.service'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import { voiceMetrics } from '../controllers/calls.controller'
import { persistAmdResult } from '../voice/telephony/amdService'
import { canStartWhiteLabelVoice } from '../services/whiteLabel.service'

type VoiceContext = { orgId: string; agentId: string; campaignId: string; leadId: string }

function queryValue(query: unknown, key: keyof VoiceContext): string {
  const value = (query as Record<string, unknown> | null | undefined)?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function voiceContextFromQuery(query: unknown): VoiceContext {
  return {
    orgId: queryValue(query, 'orgId'),
    agentId: queryValue(query, 'agentId'),
    campaignId: queryValue(query, 'campaignId'),
    leadId: queryValue(query, 'leadId'),
  }
}

async function isValidVoiceContext(context: VoiceContext): Promise<boolean> {
  return validateVoiceResourceOwnership(context, { requireAll: true, callDirection: 'outbound' })
}

async function verifyTwilioWebhook(req: { headers: Record<string, string | string[] | undefined>; url: string; body: unknown; query: unknown }): Promise<boolean> {
  const orgId = queryValue(req.query, 'orgId')
  if (!orgId) return false
  const config = await getTwilioIntegrationConfig(orgId)
  if (!config) return false
  const signatureHeader = req.headers['x-twilio-signature']
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader
  if (!signature) return false
  const body = (req.body ?? {}) as Record<string, string>
  const separator = req.url.indexOf('?')
  const path = separator >= 0 ? req.url.slice(0, separator) : req.url
  const query = separator >= 0 ? req.url.slice(separator + 1) : ''
  return verifyTwilioSignatureWithAuthToken(
    config.authToken,
    twilioWebhookUrl(config.webhookBaseUrl, path, query),
    body,
    signature,
  )
}

async function requireTwilioSignature(req: any, reply: any): Promise<unknown> {
  if (!(await verifyTwilioWebhook(req))) return reply.code(403).send({ error: 'Invalid Twilio signature' })
}

export async function voiceRoutes(app: FastifyInstance) {
  app.get('/metrics', {
    preHandler: [authenticate, requirePermission('calls.read', { scope: 'org' })],
  }, voiceMetrics as any)

  // ── Existing: agent config (para el servicio externo) ─────────────────────
  app.get<{ Params: { agentId: string } }>(
    '/config/:agentId',
    { preHandler: authenticateVoiceService },
    async (req, reply) => {
      const { agentId } = req.params
      const orgId = queryValue(req.query, 'orgId')
      if (!orgId) return reply.status(400).send({ success: false, error: 'orgId required' })
      const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } })
      if (!agent) return reply.status(404).send({ success: false, error: 'Not found' })
      const config = await loadAgentConfig(agentId, orgId)
      return reply.send({
        success: true,
        data: {
          software_id: config.softwareId,
          activo: config.activo,
          identity: { agent_name: config.identity.agentName, agent_gender: config.identity.agentGender, agent_accent: config.identity.agentAccent },
          product: {
            company_name: config.product.companyName,
            product_name: config.product.productName,
            target_vertical: config.product.targetVertical,
            price_monthly: config.product.priceMonthly,
            currency: config.product.currency,
            currency_symbol: config.product.currencySymbol,
            market_country: config.product.marketCountry,
          },
          playbook: config.playbook,
          compliance: { disclose_ai: config.compliance.disclosureAi, timezone: config.compliance.timezone, call_hour_start: config.compliance.callHourStart, call_hour_end: config.compliance.callHourEnd, disclosure_text: config.compliance.disclosureText },
          voice: { twilio_cnam_name: config.voice.twilioName, elevenlabs_voice_id: config.voice.ttsVoiceId ?? '' },
          routing: { agent_type: config.agentType, call_direction: config.callDirection },
        },
      })
    }
  )

  // ── POST /voice — Twilio inbound webhook ─────────────────────────────────
  // Twilio envía form-data (x-www-form-urlencoded) cuando el prospecto contesta
  app.post('/webhook/voice', { preHandler: requireTwilioSignature }, async (req, reply) => {
    const body = req.body as Record<string, string>
    const callSid = body.CallSid ?? ''
    const from = body.From ?? ''
    const context = voiceContextFromQuery(req.query)
    if (!(await isValidVoiceContext(context))) {
      return reply.status(400).send({ error: 'Invalid voice resource context' })
    }

    const params: Record<string, string> = {
      callSid,
      phone: from,
      orgId: context.orgId,
      campaignId: context.campaignId,
      agentId: context.agentId,
      leadId: context.leadId,
      businessType: (req.query as any).businessType ?? 'generico',
      businessName: (req.query as any).businessName ?? '',
    }

    const twiml = await buildStreamTwiml(params)
    return reply.type('text/xml').send(twiml)
  })

  // ── POST /webhook/recording — Twilio avisa cuando la grabación está lista ──
  app.post('/webhook/recording', { preHandler: requireTwilioSignature }, async (req, reply) => {
    const body = req.body as Record<string, string>
    const callSid = body.CallSid ?? ''
    const recordingUrl = body.RecordingUrl ?? ''
    const context = voiceContextFromQuery(req.query)
    if (callSid && recordingUrl && body.RecordingStatus === 'completed' && await isValidVoiceContext(context)) {
      // Twilio expone el audio agregando la extensión al final de la URL base.
      await prisma.call.updateMany({
        where: {
          externalCallId: callSid,
          orgId: context.orgId,
          leadId: context.leadId,
          agentId: context.agentId,
          campaignId: context.campaignId,
        },
        data: { recordingUrl: `${recordingUrl}.mp3` },
      })
    }
    return reply.status(204).send()
  })

  // ── POST /webhook/status — Twilio avisa el estado final de la llamada ─────
  // Si nunca se contestó (no-answer/busy/failed/canceled), reintenta con
  // backoff. Si se completó (se conectó al media stream), no hace nada —
  // ingestCall() en mediaStream.ts ya crea el registro real con transcript.
  app.post('/webhook/status', { preHandler: requireTwilioSignature }, async (req, reply) => {
    const body = req.body as Record<string, string>
    const callStatus = body.CallStatus ?? ''
    const context = voiceContextFromQuery(req.query)

    const retryableStatuses = new Set(['no-answer', 'busy', 'failed', 'canceled'])
    if (retryableStatuses.has(callStatus) && await isValidVoiceContext(context)) {
      const lead = await prisma.lead.findFirst({ where: { id: context.leadId, orgId: context.orgId }, select: { attempts: true } })
      if (lead) await scheduleRetry(context.orgId, context.leadId, lead.attempts)
    }

    return reply.status(204).send()
  })

  // Async AMD is optional in Twilio; receiving it keeps the callback harmless
  // when enabled and allows signature validation on the same public endpoint.
  app.post('/webhook/amd', { preHandler: requireTwilioSignature }, async (req, reply) => {
    const body = req.body as Record<string, string>
    const context = voiceContextFromQuery(req.query)
    if (!(await isValidVoiceContext(context))) return reply.status(400).send({ error: 'Invalid voice resource context' })

    const output = await persistAmdResult(context, {
      callSid: body.CallSid ?? '',
      answeredBy: body.AnsweredBy,
      machineDetectionDuration: body.MachineDetectionDuration,
      callStatus: body.CallStatus,
      speechResult: body.SpeechResult,
      digits: body.Digits,
    })
    return reply.send({ ok: true, ...output })
  })

  // POST /webhook/voice/inbound — llamada entrante asociada a un agente.
  // El número de Twilio debe apuntar a esta URL con orgId y agentId como
  // parámetros fijos; el caller puede o no existir todavía como lead.
  app.post('/webhook/voice/inbound', { preHandler: requireTwilioSignature }, async (req, reply) => {
    const body = req.body as Record<string, string>
    const orgId = queryValue(req.query, 'orgId')
    const agentId = queryValue(req.query, 'agentId')
    const from = body.From ?? ''
    const callSid = body.CallSid ?? ''
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, orgId, isActive: true },
      select: { id: true, callDirection: true },
    })
    if (!agent || (agent.callDirection !== 'both' && agent.callDirection !== 'inbound')) {
      return reply.status(400).send({ error: 'Agent is not configured for inbound calls' })
    }
    if (!await canStartWhiteLabelVoice(orgId)) {
      return reply.type('text/xml').send('<Response><Say language="es-ES">Este servicio no está disponible en este momento. Inténtalo más tarde.</Say><Hangup/></Response>')
    }

    const lead = from
      ? await prisma.lead.findFirst({ where: { orgId, phone: from }, select: { id: true, campaignId: true } })
      : null
    const params: Record<string, string> = {
      callSid,
      phone: from,
      orgId,
      agentId: agent.id,
      leadId: lead?.id ?? '',
      campaignId: lead?.campaignId ?? '',
      direction: 'inbound',
    }
    const twiml = await buildStreamTwiml(params)
    return reply.type('text/xml').send(twiml)
  })

  // ── POST /outbound — Iniciar llamada saliente ─────────────────────────────
  app.post<{ Body: { toNumber: string; orgId: string; campaignId: string; agentId: string; leadId: string; businessType?: string; businessName?: string } }>(
    '/outbound',
    { preHandler: authenticateVoiceService },
    async (req, reply) => {
      const { toNumber, orgId, campaignId, agentId, leadId, businessType, businessName } = req.body
      const normalizedPhone = toNumber ? normalizeE164(toNumber) : null
      if (!normalizedPhone) return reply.status(400).send({ error: 'valid E.164 toNumber required' })

      const validContext = await validateVoiceResourceOwnership(
        { orgId, campaignId, agentId, leadId },
        { requireAll: true, requireActiveAgent: true, callDirection: 'outbound' },
      )
      if (!validContext) return reply.status(400).send({ error: 'Invalid voice resource context' })

      const compliance = await canCall(orgId, normalizedPhone, leadId)
      if (!compliance.allowed) return reply.status(403).send({ error: compliance.reason })

      const result = await startOutboundCall({ toNumber: normalizedPhone, orgId, campaignId, agentId, leadId, businessType, businessName })
      return reply.send(result)
    }
  )
}
