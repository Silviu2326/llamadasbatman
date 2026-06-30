import { prisma } from '../lib/prisma'
import { CampaignStatus } from '@prisma/client'

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

export async function startCampaign(orgId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, orgId },
    include: { agent: true, leads: { where: { status: 'new' } } },
  })

  if (!campaign) throw new Error('Campaign not found')

  await prisma.campaign.updateMany({
    where: { id, orgId },
    data: { status: 'active' },
  })

  // Notify voice service — non-blocking
  try {
    const voiceUrl = process.env.VOICE_SERVICE_URL ?? 'http://localhost:4000'
    await fetch(`${voiceUrl}/campaigns/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voice-service-secret': process.env.VOICE_SERVICE_SECRET ?? '',
      },
      body: JSON.stringify({
        campaignId: id,
        orgId,
        agent: campaign.agent,
        leads: campaign.leads.map((l) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
        })),
      }),
    })
  } catch (err) {
    console.error('[startCampaign] Failed to notify voice service:', err)
  }

  return { ok: true }
}

export async function pauseCampaign(orgId: string, id: string) {
  await prisma.campaign.updateMany({
    where: { id, orgId },
    data: { status: 'paused' },
  })

  try {
    const voiceUrl = process.env.VOICE_SERVICE_URL ?? 'http://localhost:4000'
    await fetch(`${voiceUrl}/campaigns/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voice-service-secret': process.env.VOICE_SERVICE_SECRET ?? '',
      },
      body: JSON.stringify({ campaignId: id, orgId }),
    })
  } catch (err) {
    console.error('[pauseCampaign] Failed to notify voice service:', err)
  }

  return { ok: true }
}
