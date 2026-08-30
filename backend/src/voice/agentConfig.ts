import { prisma } from '../lib/prisma'
import { getTwilioIntegrationConfig } from '../services/twilioIntegration.service'

export interface AgentConfig {
  softwareId: string
  activo: boolean
  agentType: string
  callDirection: string
  identity: { agentName: string; agentGender: 'male' | 'female' | 'neutral'; agentAccent: string }
  product: { companyName: string; productName: string; targetVertical: string; priceMonthly: number; currency: string; currencySymbol: string; marketCountry: string }
  playbook: { strategy: string; customPlaybookId?: string; scripts: Record<string, string | string[]> }
  compliance: { disclosureText: string; disclosureAi: boolean; timezone: string; callHourStart: number; callHourEnd: number }
  voice: { twilioFromNumber?: string; ttsVoiceId?: string; twilioName?: string; speed?: number; speculative?: boolean }
  /** Proveedores y modelos elegidos por agente; las credenciales viven en la org. */
  runtime?: Record<string, unknown>
  // Tono, estructura y prohibiciones que el cliente configura al crear el
  // agente. Va crudo hasta el prompt: quien lo traduce a inglés es
  // promptContext.renderBehaviorNotes, que es donde vive el texto del prompt.
  behavior?: Record<string, unknown>
}

// ponytail: 5min TTL cache
const _cache = new Map<string, { ts: number; config: AgentConfig }>()
const CACHE_TTL = 5 * 60 * 1000

export function invalidateAgentConfigCache(orgId: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${orgId}:`)) _cache.delete(key)
  }
}

function currencySymbol(currency: string): string {
  return ({ EUR: '€', USD: '$', GBP: '£', MXN: '$' } as Record<string, string>)[currency] ?? currency
}

function firstOfferPrice(settings: unknown): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 0
  const profile = (settings as Record<string, unknown>).businessProfile
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return 0
  const offers = (profile as Record<string, unknown>).offers
  if (!Array.isArray(offers)) return 0
  const offer = offers.find(item => item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>).active !== false)
  const cents = offer && typeof offer === 'object' && !Array.isArray(offer) ? (offer as Record<string, unknown>).priceCents : null
  return typeof cents === 'number' && Number.isFinite(cents) ? cents / 100 : 0
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringSetting(settings: Record<string, unknown>, key: string): string {
  return typeof settings[key] === 'string' ? String(settings[key]).trim() : ''
}

function compactPlaybookSteps(value: unknown): string {
  if (value == null) return ''
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  return serialized.length <= 4_000 ? serialized : `${serialized.slice(0, 3_999)}…`
}

export function defaultAgentConfig(): AgentConfig {
  return {
    softwareId: '',
    activo: true,
    agentType: 'sales',
    callDirection: 'both',
    identity: { agentName: 'Alex', agentGender: 'neutral', agentAccent: 'en' },
    product: { companyName: 'Vendrava', productName: 'Asistente IA', targetVertical: 'general', priceMonthly: 0, currency: 'EUR', currencySymbol: '€', marketCountry: 'ES' },
    playbook: { strategy: 'permission_diagnosis', scripts: {} },
    compliance: { disclosureText: 'This call is handled by an AI assistant', disclosureAi: true, timezone: 'America/Mexico_City', callHourStart: parseInt(process.env.CALL_HOUR_START ?? '9'), callHourEnd: parseInt(process.env.CALL_HOUR_END ?? '20') },
    voice: { twilioFromNumber: process.env.TWILIO_FROM_NUMBER, ttsVoiceId: undefined, speed: 1, speculative: true },
  }
}

export async function loadAgentConfig(agentId: string, orgId: string): Promise<AgentConfig> {
  const cacheKey = `${orgId}:${agentId}`
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.config

  try {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, orgId },
      include: { org: { select: { name: true, industry: true, currency: true, timezone: true, settings: true } } },
    })
    if (!agent) return defaultAgentConfig()
    const settings = jsonRecord(agent.settings)
    const configuredSpeed = Number(settings.speechSpeed)
    const voiceSpeed = Number.isFinite(configuredSpeed) ? Math.min(1.2, Math.max(0.8, configuredSpeed)) : 1
    const speculative = typeof settings.speculative === 'boolean' ? settings.speculative : true
    const activePlaybookId = stringSetting(settings, 'activePlaybookId')
    const [twilioConfig, customPlaybook] = await Promise.all([
      getTwilioIntegrationConfig(orgId),
      activePlaybookId
        ? prisma.playbook.findFirst({
            where: { id: activePlaybookId, orgId, isActive: true },
            select: { id: true, name: true, description: true, steps: true, tags: true },
          })
        : Promise.resolve(null),
    ])

    const scripts: Record<string, string | string[]> = {
      base_prompt: agent.systemPrompt ?? '',
      key_messages: stringSetting(settings, 'keyMessages'),
      escalation_rules: stringSetting(settings, 'escalationRules'),
    }
    if (customPlaybook) {
      scripts.custom_playbook = [
        `Name: ${customPlaybook.name}`,
        customPlaybook.description ? `Purpose: ${customPlaybook.description}` : '',
        customPlaybook.tags.length ? `Tags: ${customPlaybook.tags.join(', ')}` : '',
        customPlaybook.steps ? `Steps: ${compactPlaybookSteps(customPlaybook.steps)}` : '',
      ].filter(Boolean).join('\n')
    }

    const config: AgentConfig = {
      softwareId: agent.id,
      activo: agent.isActive,
      agentType: agent.agentType,
      callDirection: agent.callDirection,
      identity: { agentName: agent.name, agentGender: 'neutral', agentAccent: agent.language ?? 'en' },
      product: { companyName: agent.org.name, productName: agent.role ?? '', targetVertical: agent.org.industry ?? agent.role ?? '', priceMonthly: firstOfferPrice(agent.org.settings), currency: agent.org.currency, currencySymbol: currencySymbol(agent.org.currency), marketCountry: 'ES' },
      playbook: {
        strategy: stringSetting(settings, 'strategyId') || 'permission_diagnosis',
        customPlaybookId: customPlaybook?.id,
        scripts,
      },
      compliance: { disclosureText: `This call is handled by an AI assistant from ${agent.org.name}`, disclosureAi: true, timezone: agent.org.timezone, callHourStart: parseInt(process.env.CALL_HOUR_START ?? '9'), callHourEnd: parseInt(process.env.CALL_HOUR_END ?? '20') },
      voice: { twilioFromNumber: twilioConfig?.fromNumber, ttsVoiceId: agent.voiceId ?? undefined, twilioName: agent.name.slice(0, 15), speed: voiceSpeed, speculative },
      runtime: jsonRecord(settings.runtime),
      behavior: jsonRecord(settings.behavior),
    }
    _cache.set(cacheKey, { ts: Date.now(), config })
    return config
  } catch {
    return defaultAgentConfig()
  }
}
