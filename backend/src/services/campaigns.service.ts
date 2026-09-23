import { prisma } from '../lib/prisma'
import { CampaignStatus } from '@prisma/client'
import { randomUUID } from 'crypto'
import { enqueueLeadCall } from './leadIngestion.service'

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

/**
 * Vista previa de solo lectura de startCampaign: cuántas llamadas se
 * encolarían si se activa ahora. No escribe nada ni toca la cola. Devuelve
 * null si la campaña no pertenece a la organización.
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

  const [eligibleLeads, newLeadsWithoutPhone] = await Promise.all([
    prisma.lead.count({ where: { orgId, campaignId: id, ...START_LEAD_WHERE } }),
    prisma.lead.count({
      where: { orgId, campaignId: id, status: 'new', OR: [{ phone: null }, { phone: '' }] },
    }),
  ])

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
    eligibleLeads,
    newLeadsWithoutPhone,
  }
}

/**
 * Dispatch masivo: encola una llamada por cada lead "new" de la campaña en la
 * cola real (`lead-call-dispatch`, la misma que usa la llamada individual y
 * el webhook de Meta) — antes esto pegaba a un VOICE_SERVICE_URL externo que
 * ya no existe, así que el botón no disparaba ninguna llamada real.
 */
export async function startCampaign(orgId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, orgId },
    include: { leads: { where: START_LEAD_WHERE } },
  })

  if (!campaign) throw new Error('Campaign not found')

  await prisma.campaign.updateMany({
    where: { id, orgId },
    data: { status: 'active' },
  })

  let queued = 0
  for (const lead of campaign.leads) {
    if (!lead.phone) continue
    if (await enqueueLeadCall(orgId, lead.id)) queued++
  }

  return { ok: true, queued }
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
