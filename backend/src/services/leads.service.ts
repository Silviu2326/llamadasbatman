import { prisma } from '../lib/prisma'
import { LeadStatus } from '@prisma/client'

interface LeadFilters {
  campaignId?: string
  status?: LeadStatus
  page?: number
  limit?: number
}

export async function listLeads(orgId: string, filters: LeadFilters = {}) {
  const { campaignId, status, page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { orgId }
  if (campaignId) where.campaignId = campaignId
  if (status) where.status = status

  const [data, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ])

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getLead(orgId: string, id: string) {
  return prisma.lead.findFirst({ where: { id, orgId } })
}

export async function createLead(orgId: string, data: {
  name: string
  phone?: string
  email?: string
  company?: string
  campaignId?: string
  source?: string
  tags?: string[]
  customFields?: Record<string, unknown>
}) {
  const lead = await prisma.lead.create({
    data: { orgId, ...data } as any,
  })

  // Update campaign totalLeads
  if (data.campaignId) {
    await prisma.campaign.updateMany({
      where: { id: data.campaignId, orgId },
      data: { totalLeads: { increment: 1 } },
    })
  }

  return lead
}

export async function importLeads(
  orgId: string,
  campaignId: string,
  rows: Array<{ name: string; phone?: string; email?: string; company?: string }>
) {
  const leads = await prisma.lead.createMany({
    data: rows.map((row) => ({
      orgId,
      campaignId,
      name: row.name,
      phone: row.phone,
      email: row.email,
      company: row.company,
      status: 'new' as LeadStatus,
    })),
    skipDuplicates: true,
  })

  // Update campaign totalLeads
  await prisma.campaign.updateMany({
    where: { id: campaignId, orgId },
    data: { totalLeads: { increment: leads.count } },
  })

  return { imported: leads.count }
}

export async function updateLead(orgId: string, id: string, data: {
  name?: string
  phone?: string
  email?: string
  company?: string
  status?: LeadStatus
  source?: string
  tags?: string[]
  customFields?: Record<string, unknown>
  campaignId?: string
}) {
  return prisma.lead.updateMany({
    where: { id, orgId },
    data: data as any,
  })
}

export async function getLeadTimeline(orgId: string, id: string) {
  const [lead, calls, meetings, opportunities] = await Promise.all([
    prisma.lead.findFirst({ where: { id, orgId } }),
    prisma.call.findMany({
      where: { leadId: id, orgId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.meeting.findMany({
      where: { leadId: id, orgId },
      orderBy: { scheduledAt: 'desc' },
    }),
    prisma.opportunity.findMany({
      where: { leadId: id, orgId },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return { lead, calls, meetings, opportunities }
}
