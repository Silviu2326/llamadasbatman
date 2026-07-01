import { FastifyInstance } from 'fastify'
import { authenticateVoiceService } from '../middlewares/authenticateVoiceService'
import { prisma } from '../lib/prisma'
import { buildStreamTwiml, startOutboundCall } from '../voice/telephony/twilioClient'
import { loadAgentConfig } from '../voice/agentConfig'
import { canCall } from '../voice/compliance'

export async function voiceRoutes(app: FastifyInstance) {
  // ── Existing: agent config (para el servicio externo) ─────────────────────
  app.get<{ Params: { agentId: string } }>(
    '/config/:agentId',
    { preHandler: authenticateVoiceService },
    async (req, reply) => {
      const { agentId } = req.params
      const agent = await prisma.agent.findUnique({ where: { id: agentId } })
      if (!agent) return reply.status(404).send({ success: false, error: 'Not found' })
      return reply.send({
        success: true,
        data: {
          software_id: agent.id,
          activo: agent.isActive,
          identity: { agent_name: agent.name, agent_gender: 'neutral', agent_accent: agent.language ?? 'es' },
          product: { company_name: agent.name, product_name: agent.role, target_vertical: agent.role, price_monthly: 0, currency: 'EUR', currency_symbol: '€', market_country: 'ES' },
          playbook: { strategy: 'free_value_first', scripts: { base_prompt: agent.systemPrompt ?? '' } },
          compliance: { disclose_ai: true, timezone: 'America/Mexico_City', call_hour_start: 9, call_hour_end: 20, disclosure_text: `Esta llamada es con un asistente de IA de ${agent.name}` },
          voice: { twilio_cnam_name: agent.name.slice(0, 15), elevenlabs_voice_id: agent.voiceId ?? '' },
        },
      })
    }
  )

  // ── POST /voice — Twilio inbound webhook ─────────────────────────────────
  // Twilio envía form-data (x-www-form-urlencoded) cuando el prospecto contesta
  app.post('/webhook/voice', async (req, reply) => {
    const body = req.body as Record<string, string>
    const callSid = body.CallSid ?? ''
    const from = body.From ?? ''
    const orgId = (req.query as any).orgId ?? ''
    const campaignId = (req.query as any).campaignId ?? ''
    const agentId = (req.query as any).agentId ?? ''
    const leadId = (req.query as any).leadId ?? ''

    const params: Record<string, string> = {
      callSid,
      phone: from,
      orgId,
      campaignId,
      agentId,
      leadId,
      businessType: (req.query as any).businessType ?? 'generico',
      businessName: (req.query as any).businessName ?? '',
    }

    const twiml = buildStreamTwiml(params)
    return reply.type('text/xml').send(twiml)
  })

  // ── POST /outbound — Iniciar llamada saliente ─────────────────────────────
  app.post<{ Body: { toNumber: string; orgId: string; campaignId: string; agentId: string; leadId: string; businessType?: string; businessName?: string } }>(
    '/outbound',
    { preHandler: authenticateVoiceService },
    async (req, reply) => {
      const { toNumber, orgId, campaignId, agentId, leadId, businessType, businessName } = req.body
      if (!toNumber) return reply.status(400).send({ error: 'toNumber required' })

      const compliance = await canCall(toNumber)
      if (!compliance.allowed) return reply.status(403).send({ error: compliance.reason })

      const result = await startOutboundCall({ toNumber, orgId, campaignId, agentId, leadId, businessType, businessName })
      return reply.send(result)
    }
  )
}

