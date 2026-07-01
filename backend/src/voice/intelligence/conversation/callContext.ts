import type { Redis } from 'ioredis'

export interface AgentConfig {
  softwareId: string
  activo: boolean
  identity: { agentName: string; agentGender: string; agentAccent: string }
  product: { companyName: string; productName: string; targetVertical: string; priceMonthly: number; currency: string; currencySymbol: string; marketCountry: string }
  playbook: { strategy: string; scripts: Record<string, string | string[]> }
  compliance: { disclosureText: string; disclosureAi: boolean; timezone: string; callHourStart: number; callHourEnd: number }
  voice: { twilioFromNumber?: string; elevenLabsVoiceId?: string; twilioName?: string }
}

export interface CallContext {
  callSid: string
  phone: string
  businessType: string
  businessName: string
  city: string
  orgId: string
  campaignId: string
  agentId: string
  leadId: string
  agentConfig: AgentConfig | null
  prospect: Record<string, unknown>
  turns: number
  transcript: Array<{ role: string; text: string }>
  transferRequested: boolean
  transferReason: string
  frustration: number
  emotion: string
  outcome: string
  startedAt: number
  metadata: Record<string, unknown>
  recordingConsentPending: boolean
  recordingConsented: boolean
}

export function createCallContext(params: Partial<CallContext> & { callSid: string; phone: string }): CallContext {
  return {
    callSid: params.callSid,
    phone: params.phone,
    businessType: params.businessType ?? 'generico',
    businessName: params.businessName ?? '',
    city: params.city ?? '',
    orgId: params.orgId ?? '',
    campaignId: params.campaignId ?? '',
    agentId: params.agentId ?? '',
    leadId: params.leadId ?? '',
    agentConfig: params.agentConfig ?? null,
    prospect: params.prospect ?? {},
    turns: 0,
    transcript: [],
    transferRequested: false,
    transferReason: '',
    frustration: 0,
    emotion: 'neutro',
    outcome: 'en_curso',
    startedAt: Date.now(),
    metadata: {},
    recordingConsentPending: false,
    recordingConsented: false,
  }
}

export function elapsedSeconds(ctx: CallContext): number {
  return (Date.now() - ctx.startedAt) / 1000
}

export class ConversationStore {
  constructor(private redis: Redis) {}

  async save(ctx: CallContext): Promise<void> {
    await this.redis.set(`call:${ctx.callSid}`, JSON.stringify(ctx), 'EX', 86400)
  }

  async load(callSid: string): Promise<CallContext | null> {
    const raw = await this.redis.get(`call:${callSid}`)
    return raw ? JSON.parse(raw) : null
  }
}
