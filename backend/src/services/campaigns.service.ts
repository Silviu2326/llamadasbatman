import { prisma } from '../lib/prisma'
import { CampaignStatus } from '@prisma/client'
import { enqueueLeadCall } from './leadIngestion.service'

export async function listCampaigns(orgId: string) {
  return prisma.campaign.findMany({
    where: { orgId },
    include: { agent: true, playbook: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createCampaign(orgId: string, data: {
  name: string
  agentId?: string
  playbookId?: string
  objective?: string
  startDate?: string
  endDate?: string
}) {
  return prisma.campaign.create({
    data: {
      orgId,
      name: data.name,
      agentId: data.agentId,
      playbookId: data.playbookId,
      objective: data.objective,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    },
  })
}

export async function updateCampaign(orgId: string, id: string, data: {
  name?: string
  agentId?: string
  playbookId?: string
  objective?: string
  startDate?: string
  endDate?: string
  status?: CampaignStatus
}) {
  return prisma.campaign.updateMany({
    where: { id, orgId },
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
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
 * Dispatch masivo: encola una llamada por cada lead "new" de la campaña en la
 * cola real (`lead-call-dispatch`, la misma que usa la llamada individual y
 * el webhook de Meta) — antes esto pegaba a un VOICE_SERVICE_URL externo que
 * ya no existe, así que el botón no disparaba ninguna llamada real.
 */
export async function startCampaign(orgId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, orgId },
    include: { leads: { where: { status: 'new' } } },
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
