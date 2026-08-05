import { prisma } from '../lib/prisma'
import { getTwilioIntegrationConfig } from '../services/twilioIntegration.service'

export interface AgentConfig {
  softwareId: string
  activo: boolean
  agentType: string
  callDirection: string
  identity: { agentName: string; agentGender: 'male' | 'female' | 'neutral'; agentAccent: string }
  product: { companyName: string; productName: string; targetVertical: string; priceMonthly: number; currency: string; currencySymbol: string; marketCountry: string }
  playbook: { strategy: string; scripts: Record<string, string | string[]> }
  compliance: { disclosureText: string; disclosureAi: boolean; timezone: string; callHourStart: number; callHourEnd: number }
  voice: { twilioFromNumber?: string; elevenLabsVoiceId?: string; twilioName?: string }
}

// ponytail: 5min TTL cache
const _cache = new Map<string, { ts: number; config: AgentConfig }>()
const CACHE_TTL = 5 * 60 * 1000

export function defaultAgentConfig(): AgentConfig {
  return {
    softwareId: '',
    activo: true,
    agentType: 'sales',
    callDirection: 'both',
    identity: { agentName: 'Alex', agentGender: 'neutral', agentAccent: 'es' },
    product: { companyName: 'Vendrava', productName: 'Asistente IA', targetVertical: 'general', priceMonthly: 0, currency: 'EUR', currencySymbol: '€', marketCountry: 'ES' },
    playbook: { strategy: 'free_value_first', scripts: {} },
    compliance: { disclosureText: 'Esta llamada es con un asistente de IA', disclosureAi: true, timezone: 'America/Mexico_City', callHourStart: parseInt(process.env.CALL_HOUR_START ?? '9'), callHourEnd: parseInt(process.env.CALL_HOUR_END ?? '20') },
    voice: { twilioFromNumber: process.env.TWILIO_FROM_NUMBER, elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID },
  }
}

export async function loadAgentConfig(agentId: string, orgId: string): Promise<AgentConfig> {
  const cacheKey = `${orgId}:${agentId}`
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.config

  try {
    const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } })
    if (!agent) return defaultAgentConfig()
    const twilioConfig = await getTwilioIntegrationConfig(orgId)

    const config: AgentConfig = {
      softwareId: agent.id,
      activo: agent.isActive,
      agentType: agent.agentType,
      callDirection: agent.callDirection,
      identity: { agentName: agent.name, agentGender: 'neutral', agentAccent: agent.language ?? 'es' },
      product: { companyName: agent.name, productName: agent.role ?? '', targetVertical: agent.role ?? '', priceMonthly: 0, currency: 'EUR', currencySymbol: '€', marketCountry: 'ES' },
      playbook: { strategy: 'free_value_first', scripts: { base_prompt: agent.systemPrompt ?? '' } },
      compliance: { disclosureText: `Esta llamada es con un asistente de IA de ${agent.name}`, disclosureAi: true, timezone: 'America/Mexico_City', callHourStart: parseInt(process.env.CALL_HOUR_START ?? '9'), callHourEnd: parseInt(process.env.CALL_HOUR_END ?? '20') },
      voice: { twilioFromNumber: twilioConfig?.fromNumber, elevenLabsVoiceId: agent.voiceId ?? process.env.ELEVENLABS_VOICE_ID, twilioName: agent.name.slice(0, 15) },
    }
    _cache.set(cacheKey, { ts: Date.now(), config })
    return config
  } catch {
    return defaultAgentConfig()
  }
}
