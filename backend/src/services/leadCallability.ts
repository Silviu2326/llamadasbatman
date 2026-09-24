import { prisma } from '../lib/prisma'
import { hasContactConsent } from './contactConsent.service'
import { assertConsumptionLimit } from '../access-control/consumption'
import { normalizeE164, withinLegalHours } from '../voice/compliance'
import { checkAgentOperationalLimits } from '../voice/agentLimits'
import { findActiveVoiceConsent } from './voiceConsent.service'
import { OPT_OUT_TAG } from './leads.service'

/**
 * Mismo valor que `MAX_CALL_ATTEMPTS` en jobs/leadCallDispatch.ts. No se
 * importa de allí porque ese módulo arranca la cola al cargarse y esta
 * evaluación debe poder ejecutarse (y probarse) sin cola ni Redis.
 */
const DEFAULT_MAX_CALL_ATTEMPTS = 3

/**
 * Elegibilidad visible de un lead para ser llamado por el agente. Replica
 * las mismas reglas que aplica `jobs/leadCallDispatch.ts` + `canCall()` en
 * el momento de marcar, pero como función pura y explicable: el CRM la
 * muestra en la ficha («Este lead no se llamará porque…») y la vista previa
 * de campaña la usa para desglosar motivos. Si cambian las reglas del
 * dispatch, hay que cambiarlas aquí también (tests offline lo cubren).
 */

export type CallabilityReasonCode =
  | 'missing_phone'
  | 'invalid_phone'
  | 'lead_without_campaign'
  | 'campaign_not_active'
  | 'agent_missing'
  | 'agent_not_published'
  | 'agent_incomplete'
  | 'agent_voice_consent_missing'
  | 'agent_limits'
  | 'optout'
  | 'missing_voice_consent'
  | 'max_attempts_reached'
  | 'outside_hours'
  | 'quota_exceeded'

export interface CallabilityReason {
  code: CallabilityReasonCode
  message: string
}

export interface CallabilityLead {
  id: string
  phone: string | null
  status?: string
  attempts: number
  tags?: string[] | null
  customFields?: unknown
  campaignId: string | null
}

export interface CallabilityCampaign {
  id: string
  status: string
  agentId?: string | null
}

export interface CallabilityAgent {
  id: string
  orgId: string
  isActive: boolean
  lifecycleStatus: string
  voiceId: string | null
  systemPrompt: string | null
  phoneNumber: string | null
  /** `settings.operationalLimits` (voice/agentLimits.ts); opcional para evaluar `agent_limits`. */
  settings?: unknown
  monthlyMinuteLimit?: number | null
}

export interface CallabilityContext {
  orgId: string
  /** ContactConsent(channel=voice) concedido y vigente. */
  voiceConsentGranted: boolean
  /** Teléfono en la lista OptOut de la organización. */
  optedOut: boolean
  now?: Date
  /** `customFields.callTimeZone` si el pipeline lo guardó. */
  callTimeZone?: string | null
  /** Resultado de assertConsumptionLimit('call_minutes'); undefined = no comprobado. */
  quotaExceeded?: boolean
  /** REQUIRE_VOICE_CONSENT=true exige consentimiento a cualquier prefijo. */
  requireVoiceConsent?: boolean
  maxAttempts?: number
  /** ConsentGrant de voz vigente para el agente; undefined = no comprobado. */
  agentVoiceConsentActive?: boolean
  /** Llamadas no de prueba del agente hoy, para `operationalLimits.maxCallsPerDay`. */
  agentCallsToday?: number
  agentMinutesThisMonth?: number
}

export interface LeadCallability {
  eligible: boolean
  reasons: CallabilityReason[]
  /** Avisos que no bloquean el dispatch pero sí explican por qué una campaña no lo encolaría. */
  warnings: CallabilityReason[]
  phone: string | null
  /** Último bloqueo escrito por el dispatch en `customFields.lastCallBlock` ({ reason, at, detail }). */
  lastCallBlock: { reason: string; at: string | null; detail?: string } | null
  evaluatedAt: string
}

const MESSAGES: Record<CallabilityReasonCode, string> = {
  missing_phone: 'El lead no tiene teléfono.',
  invalid_phone: 'El teléfono no se puede normalizar a formato internacional (E.164).',
  lead_without_campaign: 'El lead no está asignado a ninguna campaña.',
  campaign_not_active: 'La campaña del lead no está activa.',
  agent_missing: 'La campaña no tiene agente asignado.',
  agent_not_published: 'El agente de la campaña no está publicado.',
  agent_incomplete: 'Al agente le falta voz, instrucciones o número de salida.',
  agent_voice_consent_missing: 'El consentimiento de voz del agente no está vigente.',
  agent_limits: 'El agente ha alcanzado sus límites operativos (horario, días o llamadas al día); la llamada esperará a la siguiente ventana.',
  optout: 'El teléfono está en la lista de exclusión (opt-out).',
  missing_voice_consent: 'No hay consentimiento de voz registrado y vigente para este lead.',
  max_attempts_reached: 'Se agotaron los intentos de llamada permitidos.',
  outside_hours: 'Ahora mismo está fuera del horario legal de llamadas para este número.',
  quota_exceeded: 'La organización ha agotado su cuota de minutos de llamada.',
}

function reason(code: CallabilityReasonCode): CallabilityReason {
  return { code, message: MESSAGES[code] }
}

/** Lee `customFields.lastCallBlock` con forma `{ reason, at }` si existe. */
export function readLastCallBlock(customFields: unknown): { reason: string; at: string | null; detail?: string } | null {
  if (!customFields || typeof customFields !== 'object') return null
  const raw = (customFields as Record<string, unknown>).lastCallBlock
  if (!raw || typeof raw !== 'object') return null
  const block = raw as { reason?: unknown; at?: unknown; detail?: unknown }
  if (typeof block.reason !== 'string' || !block.reason) return null
  const at = typeof block.at === 'string' ? block.at : block.at instanceof Date ? block.at.toISOString() : null
  // `detail` es el código concreto (p. ej. ZADARMA_PHONE_MISMATCH, daily_limit).
  return typeof block.detail === 'string' && block.detail ? { reason: block.reason, at, detail: block.detail } : { reason: block.reason, at }
}

export function evaluateLeadCallability(
  lead: CallabilityLead,
  campaign: CallabilityCampaign | null | undefined,
  agent: CallabilityAgent | null | undefined,
  ctx: CallabilityContext,
): LeadCallability {
  const reasons: CallabilityReason[] = []
  const warnings: CallabilityReason[] = []
  const maxAttempts = ctx.maxAttempts ?? DEFAULT_MAX_CALL_ATTEMPTS
  const tags = Array.isArray(lead.tags) ? lead.tags : []

  const phone = lead.phone ? normalizeE164(lead.phone) : null
  if (!lead.phone) reasons.push(reason('missing_phone'))
  else if (!phone) reasons.push(reason('invalid_phone'))

  if (!lead.campaignId || !campaign) reasons.push(reason('lead_without_campaign'))
  else {
    if (campaign.status !== 'active') reasons.push(reason('campaign_not_active'))
    if (!agent || agent.orgId !== ctx.orgId) reasons.push(reason('agent_missing'))
    else {
      if (!agent.isActive || agent.lifecycleStatus !== 'active') reasons.push(reason('agent_not_published'))
      if (!agent.voiceId || !agent.systemPrompt || !agent.phoneNumber) reasons.push(reason('agent_incomplete'))
      // Mismas comprobaciones que el dispatch justo antes de marcar.
      if (ctx.agentVoiceConsentActive === false) reasons.push(reason('agent_voice_consent_missing'))
      const limits = checkAgentOperationalLimits(agent, { now: ctx.now, callsToday: ctx.agentCallsToday, minutesThisMonth: ctx.agentMinutesThisMonth })
      if (!limits.allowed) warnings.push({ code: 'agent_limits', message: `${MESSAGES.agent_limits} (${limits.reason ?? 'limits'})` })
    }
  }

  if (ctx.optedOut || tags.includes(OPT_OUT_TAG)) reasons.push(reason('optout'))
  if (lead.attempts >= maxAttempts) reasons.push(reason('max_attempts_reached'))
  if (ctx.quotaExceeded) reasons.push(reason('quota_exceeded'))

  if (phone) {
    const needsConsent = phone.startsWith('+34') || ctx.requireVoiceConsent === true
    if (needsConsent && !ctx.voiceConsentGranted) reasons.push(reason('missing_voice_consent'))
    if (!withinLegalHours(phone, ctx.now, ctx.callTimeZone)) reasons.push(reason('outside_hours'))
  }

  if (lead.status && lead.status !== 'new') {
    warnings.push({ code: 'campaign_not_active', message: 'La activación de campaña solo encola leads en estado «nuevo»; este lead solo se llamará a mano.' })
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    warnings,
    phone,
    lastCallBlock: readLastCallBlock(lead.customFields),
    evaluatedAt: (ctx.now ?? new Date()).toISOString(),
  }
}

/** Carga lo necesario de la base y evalúa. `null` si el lead no es de la organización. */
export async function getLeadCallability(orgId: string, leadId: string, now = new Date()): Promise<LeadCallability | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId },
    select: {
      id: true, phone: true, status: true, attempts: true, tags: true, customFields: true, campaignId: true,
      campaign: {
        select: {
          id: true, status: true, agentId: true,
          agent: { select: { id: true, orgId: true, isActive: true, lifecycleStatus: true, voiceId: true, systemPrompt: true, phoneNumber: true, settings: true, monthlyMinuteLimit: true } },
        },
      },
    },
  })
  if (!lead) return null

  const phone = lead.phone ? normalizeE164(lead.phone) : null
  const agent = lead.campaign?.agent ?? null
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
  const [voiceConsentGranted, optOut, quotaExceeded, agentConsent, agentCallsToday] = await Promise.all([
    hasContactConsent(orgId, lead.id, 'voice'),
    phone ? prisma.optOut.findUnique({ where: { orgId_phone: { orgId, phone } }, select: { id: true } }) : Promise.resolve(null),
    assertConsumptionLimit(orgId, 'call_minutes', 1, now).then(() => false).catch(() => true),
    agent ? findActiveVoiceConsent(orgId, agent.id, agent.voiceId, now) : Promise.resolve(null),
    agent ? prisma.call.count({ where: { orgId, agentId: agent.id, isTest: false, createdAt: { gte: dayStart } } }) : Promise.resolve(0),
  ])
  const fields = (lead.customFields ?? {}) as Record<string, unknown>

  return evaluateLeadCallability(
    lead,
    lead.campaign,
    lead.campaign?.agent ?? null,
    {
      orgId,
      voiceConsentGranted,
      optedOut: Boolean(optOut),
      now,
      callTimeZone: typeof fields.callTimeZone === 'string' ? fields.callTimeZone : null,
      quotaExceeded,
      requireVoiceConsent: process.env.REQUIRE_VOICE_CONSENT === 'true',
      agentVoiceConsentActive: agent ? Boolean(agentConsent) : undefined,
      agentCallsToday,
    },
  )
}
