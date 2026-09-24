import { prisma } from '../lib/prisma'
import { CampaignStatus } from '@prisma/client'
import { randomUUID } from 'crypto'
import { enqueueLeadCall } from './leadIngestion.service'
import { normalizeE164 } from '../voice/compliance'
import { OPT_OUT_TAG } from './leads.service'

/** `agentId` que no existe o no pertenece a la organización (create/update). */
export class CampaignAgentError extends Error {
  constructor() {
    super('agentId no pertenece a la organización')
    this.name = 'CampaignAgentError'
  }
}

/** Activación rechazada con un código estable para el frontend (409) o 404. */
export class CampaignStartError extends Error {
  constructor(public code: 'CAMPAIGN_NOT_FOUND' | 'AGENT_MISSING' | 'AGENT_NOT_PUBLISHED', message: string, public status: 404 | 409 = 409) {
    super(message)
    this.name = 'CampaignStartError'
  }
}

async function assertOwnedAgent(orgId: string, agentId?: string | null) {
  if (!agentId) return
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true } })
  if (!agent) throw new CampaignAgentError()
}

/** Mismo valor que MAX_CALL_ATTEMPTS en jobs/leadCallDispatch.ts (no se importa: ese módulo arranca la cola). */
const MAX_CALL_ATTEMPTS = 3

export async function listCampaigns(orgId: string, opts: {
  page?: number
  limit?: number
  status?: CampaignStatus
  search?: string
} = {}) {
  const page = opts.page && opts.page > 0 ? opts.page : 1
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 50

  const where: any = { orgId }
  if (opts.status) where.status = opts.status
  if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' }

  const [items, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: { agent: true, playbook: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.campaign.count({ where }),
  ])

  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
}

export async function createCampaign(orgId: string, data: {
  name: string
  agentId?: string | null
  playbookId?: string | null
  objective?: string | null
  startDate?: string | null
  endDate?: string | null
  landingSlug?: string
  adAssets?: Record<string, unknown>
  budgetCents?: number | null
  goal?: string | null
  settings?: Record<string, unknown>
}) {
  await assertOwnedAgent(orgId, data.agentId)
  return prisma.campaign.create({
    data: {
      orgId,
      name: data.name,
      agentId: data.agentId,
      playbookId: data.playbookId,
      objective: data.objective,
      startDate: data.startDate ? new Date(data.startDate) : data.startDate === null ? null : undefined,
      endDate: data.endDate ? new Date(data.endDate) : data.endDate === null ? null : undefined,
      landingSlug: data.landingSlug,
      adAssets: data.adAssets as any,
      budgetCents: data.budgetCents,
      goal: data.goal,
      settings: data.settings as any,
    },
  })
}

export async function updateCampaignLanding(orgId: string, id: string, data: {
  landingSlug?: string | null
  adAssets?: Record<string, unknown>
}) {
  return prisma.campaign.updateMany({
    where: { id, orgId },
    data: {
      ...(data.landingSlug !== undefined ? { landingSlug: data.landingSlug } : {}),
      ...(data.adAssets !== undefined ? { adAssets: data.adAssets as any } : {}),
    },
  })
}

export async function updateCampaign(orgId: string, id: string, data: {
  name?: string
  agentId?: string | null
  playbookId?: string | null
  objective?: string | null
  startDate?: string | null
  endDate?: string | null
  status?: CampaignStatus
  budgetCents?: number | null
  goal?: string | null
  settings?: Record<string, unknown>
}) {
  await assertOwnedAgent(orgId, data.agentId)
  return prisma.campaign.updateMany({
    where: { id, orgId },
    data: {
      ...data,
      settings: data.settings as any,
      startDate: data.startDate ? new Date(data.startDate) : data.startDate === null ? null : undefined,
      endDate: data.endDate ? new Date(data.endDate) : data.endDate === null ? null : undefined,
    },
  })
}

export async function getCampaign(orgId: string, id: string) {
  return prisma.campaign.findFirst({
    where: { id, orgId },
    include: { agent: true, playbook: true },
  })
}

export async function getCampaignStats(orgId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id, orgId } })
  if (!campaign) return null

  const conversionRate =
    campaign.totalLeads > 0
      ? Math.round((campaign.meetingsScheduled / campaign.totalLeads) * 100)
      : 0

  return {
    totalLeads: campaign.totalLeads,
    contacted: campaign.contacted,
    meetingsScheduled: campaign.meetingsScheduled,
    conversionRate,
  }
}

/**
 * Condición única de "lead que startCampaign va a llamar": estado `new` y con
 * teléfono no vacío. La comparten el arranque real y la vista previa de solo
 * lectura para que el número que ve el usuario en la confirmación sea el mismo
 * que se encola.
 */
export const START_LEAD_WHERE = {
  status: 'new',
  phone: { not: null },
  NOT: { phone: '' },
} as const

export interface CampaignStartBreakdown {
  /** Leads `new` con teléfono E.164, sin opt-out, con consentimiento si aplica y con intentos disponibles. */
  eligible: number
  /** Solo en `startCampaign`: elegibles con un trabajo de llamada ya pendiente o en curso (reintento), no se reencolan. */
  alreadyQueued?: number
  withoutPhone: number
  invalidPhone: number
  optOut: number
  missingConsent: number
  maxAttempts: number
}

/**
 * Clasifica los leads `new` de la campaña con las mismas reglas que
 * `canCall()`/el dispatch aplicarán al marcar (salvo horario y cuota, que
 * dependen del momento). Lo comparten la vista previa y `startCampaign`
 * para que el número que confirma el usuario sea exactamente el que se
 * encola, y para que un lead excluido o sin consentimiento no "queme" un
 * trabajo de cola que el worker descartaría en silencio.
 */
export async function classifyCampaignLeads(orgId: string, campaignId: string): Promise<{ eligible: Array<{ id: string; phone: string }>; breakdown: CampaignStartBreakdown }> {
  const leads = await prisma.lead.findMany({
    where: { orgId, campaignId, status: 'new' },
    select: { id: true, phone: true, tags: true, attempts: true },
  })
  const breakdown: CampaignStartBreakdown = { eligible: 0, withoutPhone: 0, invalidPhone: 0, optOut: 0, missingConsent: 0, maxAttempts: 0 }
  const candidates: Array<{ id: string; phone: string; tags: string[]; attempts: number }> = []
  for (const lead of leads) {
    if (!lead.phone || !lead.phone.trim()) { breakdown.withoutPhone++; continue }
    const phone = normalizeE164(lead.phone)
    if (!phone) { breakdown.invalidPhone++; continue }
    candidates.push({ id: lead.id, phone, tags: lead.tags ?? [], attempts: lead.attempts })
  }
  if (!candidates.length) return { eligible: [], breakdown }

  const requireConsentAll = process.env.REQUIRE_VOICE_CONSENT === 'true'
  const [optOuts, consents] = await Promise.all([
    prisma.optOut.findMany({ where: { orgId, phone: { in: candidates.map(c => c.phone) } }, select: { phone: true } }),
    prisma.contactConsent.findMany({
      where: { orgId, leadId: { in: candidates.map(c => c.id) }, channel: 'voice', purpose: { in: ['contact', 'marketing'] } },
      select: { leadId: true, status: true, expiresAt: true, occurredAt: true, id: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    }),
  ])
  const optedOut = new Set(optOuts.map(o => o.phone))
  // La decisión más reciente por lead manda (mismo criterio que hasContactConsent).
  const latestConsent = new Map<string, { status: string; expiresAt: Date | null }>()
  for (const consent of consents) {
    if (consent.leadId && !latestConsent.has(consent.leadId)) latestConsent.set(consent.leadId, { status: consent.status, expiresAt: consent.expiresAt })
  }
  const now = Date.now()
  const eligible: Array<{ id: string; phone: string }> = []
  for (const lead of candidates) {
    if (optedOut.has(lead.phone) || lead.tags.includes(OPT_OUT_TAG)) { breakdown.optOut++; continue }
    if (lead.attempts >= MAX_CALL_ATTEMPTS) { breakdown.maxAttempts++; continue }
    if (lead.phone.startsWith('+34') || requireConsentAll) {
      const consent = latestConsent.get(lead.id)
      const granted = consent?.status === 'granted' && (!consent.expiresAt || consent.expiresAt.getTime() > now)
      if (!granted) { breakdown.missingConsent++; continue }
    }
    eligible.push({ id: lead.id, phone: lead.phone })
  }
  breakdown.eligible = eligible.length
  return { eligible, breakdown }
}

/**
 * Vista previa de solo lectura de startCampaign: cuántas llamadas se
 * encolarían si se activa ahora y por qué no se llamaría al resto. No
 * escribe nada ni toca la cola. Devuelve null si la campaña no pertenece a
 * la organización.
 */
export async function getStartPreview(orgId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      name: true,
      status: true,
      agent: { select: { id: true, name: true, isActive: true, lifecycleStatus: true } },
    },
  })
  if (!campaign) return null

  const { breakdown } = await classifyCampaignLeads(orgId, id)

  return {
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status,
    agent: campaign.agent
      ? {
          id: campaign.agent.id,
          name: campaign.agent.name,
          isActive: campaign.agent.isActive,
          lifecycleStatus: campaign.agent.lifecycleStatus,
        }
      : null,
    // Agente publicado = lifecycleStatus 'active' (agents.service). Sin eso
    // /start responde 409 AGENT_NOT_PUBLISHED.
    canStart: Boolean(campaign.agent && campaign.agent.isActive && campaign.agent.lifecycleStatus === 'active'),
    eligibleLeads: breakdown.eligible,
    newLeadsWithoutPhone: breakdown.withoutPhone,
    breakdown,
  }
}

/** Leads (de la lista dada) con un trabajo `lead-call-dispatch` pendiente o en curso. */
async function findLeadsWithPendingCallJobs(orgId: string, leadIds: string[]): Promise<Set<string>> {
  const wanted = new Set(leadIds)
  const jobs = await prisma.workerQueueJob.findMany({
    where: { queue: 'lead-call-dispatch', status: { in: ['pending', 'processing'] }, payload: { path: ['orgId'], equals: orgId } },
    select: { payload: true },
  })
  const found = new Set<string>()
  for (const job of jobs) {
    const leadId = (job.payload as { leadId?: unknown } | null)?.leadId
    if (typeof leadId === 'string' && wanted.has(leadId)) found.add(leadId)
  }
  return found
}

/** Clave idempotente del trabajo de llamada de campaña: reactivar no duplica. */
export function campaignCallDedupeKey(leadId: string, campaignId: string) {
  return `lead-call:${leadId}:${campaignId}`
}

/**
 * Dispatch masivo: encola una llamada por cada lead "new" llamable de la
 * campaña en la cola real (`lead-call-dispatch`, la misma que usa la llamada
 * individual y el webhook de Meta). Rechaza con 409 si el agente no está
 * publicado: activar sin agente publicado dejaba la campaña "activa" con
 * todos los trabajos descartados en silencio por el worker.
 */
export async function startCampaign(orgId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, orgId },
    select: { id: true, agent: { select: { id: true, orgId: true, isActive: true, lifecycleStatus: true, name: true } } },
  })

  if (!campaign) throw new CampaignStartError('CAMPAIGN_NOT_FOUND', 'Campaign not found', 404)
  if (!campaign.agent || campaign.agent.orgId !== orgId) {
    throw new CampaignStartError('AGENT_MISSING', 'La campaña no tiene agente asignado. Asigna un agente publicado antes de activarla.')
  }
  if (!campaign.agent.isActive || campaign.agent.lifecycleStatus !== 'active') {
    throw new CampaignStartError('AGENT_NOT_PUBLISHED', `El agente ${campaign.agent.name} no está publicado. Publícalo (prueba real y consentimiento de voz) antes de activar la campaña.`)
  }

  const { eligible, breakdown } = await classifyCampaignLeads(orgId, id)

  await prisma.campaign.updateMany({
    where: { id, orgId },
    data: { status: 'active' },
  })

  // Un lead con un reintento (`retry:<org>:<lead>:<n>`) u otro trabajo de
  // llamada pendiente o en curso ya va a ser llamado: reencolarlo con `requeue`
  // duplicaría la llamada. Se localizan con una sola consulta por organización.
  const alreadyQueued = eligible.length ? await findLeadsWithPendingCallJobs(orgId, eligible.map(lead => lead.id)) : new Set<string>()
  breakdown.alreadyQueued = alreadyQueued.size

  let queued = 0
  for (const lead of eligible) {
    if (alreadyQueued.has(lead.id)) continue
    // Al reactivar una campaña, un lead que sigue en `new` (p. ej. bloqueado
    // por horario o consentimiento en el intento anterior) debe volver a
    // encolarse aunque su dedupeKey ya se completara: de ahí `requeue`.
    if (await enqueueLeadCall(orgId, lead.id, campaignCallDedupeKey(lead.id, id), 0, { campaignId: id, onFinished: 'requeue' })) queued++
  }

  return { ok: true, queued, breakdown }
}

export async function pauseCampaign(orgId: string, id: string) {
  await prisma.campaign.updateMany({
    where: { id, orgId },
    data: { status: 'paused' },
  })

  return { ok: true }
}

export async function duplicateCampaign(orgId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id, orgId } })
  if (!campaign) return null

  return prisma.campaign.create({
    data: {
      orgId,
      name: `${campaign.name} (copia)`,
      status: 'draft',
      agentId: campaign.agentId,
      playbookId: campaign.playbookId,
      adPlaybookId: campaign.adPlaybookId,
      objective: campaign.objective,
      budgetCents: campaign.budgetCents,
      goal: campaign.goal,
      settings: campaign.settings as any,
      totalLeads: 0,
      contacted: 0,
      meetingsScheduled: 0,
    },
  })
}

/**
 * Timeline simple de actividad: combina leads, llamadas y reuniones de la
 * campaña (las reuniones no tienen campaignId propio, se filtran por el
 * lead al que pertenecen) y devuelve los ~20 eventos más recientes.
 */
export async function getCampaignActivity(orgId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id, orgId }, select: { id: true } })
  if (!campaign) return null

  const [leads, calls, meetings] = await Promise.all([
    prisma.lead.findMany({
      where: { orgId, campaignId: id },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.call.findMany({
      where: { orgId, campaignId: id },
      select: { id: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.meeting.findMany({
      where: { orgId, lead: { campaignId: id } },
      select: { id: true, title: true, scheduledAt: true },
      orderBy: { scheduledAt: 'desc' },
      take: 20,
    }),
  ])

  const events = [
    ...leads.map(l => ({ type: 'lead' as const, title: `Nuevo lead: ${l.name}`, at: l.createdAt })),
    ...calls.map(c => ({ type: 'call' as const, title: `Llamada (${c.status})`, at: c.createdAt })),
    ...meetings.map(m => ({ type: 'meeting' as const, title: m.title, at: m.scheduledAt })),
  ]

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20)
}

export async function getOrCreateShareToken(orgId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id, orgId } })
  if (!campaign) return null
  if (campaign.shareToken) return campaign.shareToken

  const token = randomUUID()
  await prisma.campaign.updateMany({ where: { id, orgId }, data: { shareToken: token } })
  return token
}

export async function getCampaignByShareToken(token: string) {
  return prisma.campaign.findFirst({
    where: { shareToken: token },
    select: {
      name: true,
      status: true,
      objective: true,
      totalLeads: true,
      contacted: true,
      meetingsScheduled: true,
    },
  })
}
