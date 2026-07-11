import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { LeadStatus } from '@prisma/client'
import { auditBusiness } from './digitalAudit.service'
import { getPresignedUrl, putObject } from '../lib/s3'
import { syncContact } from './mauticSync.service'

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
  externalLeadId?: string
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
  const created = []
  for (const row of rows) {
    if (!row.name) continue
    created.push(
      await prisma.lead.create({
        data: { orgId, campaignId, name: row.name, phone: row.phone, email: row.email, company: row.company, status: 'new' as LeadStatus },
      })
    )
  }

  await prisma.campaign.updateMany({
    where: { id: campaignId, orgId },
    data: { totalLeads: { increment: created.length } },
  })

  return { imported: created.length, leads: created }
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
  const result = await prisma.lead.updateMany({
    where: { id, orgId },
    data: data as any,
  })

  // Solo re-sincroniza si cambió el estado (el segmento de Mautic depende
  // de eso) — evita un fetch a Mautic en cada edición de nombre/tags.
  if (data.status) {
    const lead = await prisma.lead.findFirst({ where: { id, orgId } })
    if (lead) await syncContact(lead).catch(() => {})
  }

  return result
}

export async function auditLead(
  orgId: string,
  id: string,
  opts: { website?: string; sector?: string; city?: string } = {}
) {
  const lead = await prisma.lead.findFirst({ where: { id, orgId } })
  if (!lead) return null

  const customFields = (lead.customFields as Record<string, unknown>) ?? {}
  const website = opts.website ?? (customFields.website as string | undefined)
  const sector = opts.sector ?? (customFields.sector as string | undefined)
  const city = opts.city ?? (customFields.city as string | undefined)

  const result = await auditBusiness({
    name: lead.name,
    website,
    sector,
    city,
    gbpRating: customFields.rating as number | undefined,
    gbpReviews: customFields.userRatingCount as number | undefined,
    gbpPhotosCount: customFields.photosCount as number | undefined,
  })

  await prisma.lead.update({
    where: { id },
    data: { customFields: { ...customFields, website: website ?? null, digitalAudit: result } as any },
  })
  await prisma.leadAudit.create({ data: { orgId, leadId: id, result: result as any } })

  return result
}

export async function getLeadAudit(orgId: string, id: string) {
  const lead = await prisma.lead.findFirst({ where: { id, orgId } })
  if (!lead) return undefined
  const customFields = (lead.customFields as Record<string, unknown>) ?? {}
  return customFields.digitalAudit ?? null
}

export async function getAuditHistory(orgId: string, leadId: string) {
  return prisma.leadAudit.findMany({ where: { orgId, leadId }, orderBy: { createdAt: 'desc' } })
}

/**
 * Audita en bloque los leads de una campaña que tienen web pero todavía no
 * fueron auditados. Secuencial (cada auditoría hace un fetch externo) y
 * acotado a `limit` por corrida — el frontend puede volver a llamar si queda
 * `remaining`.
 */
export async function auditBulk(orgId: string, campaignId: string, opts: { force?: boolean; limit?: number } = {}) {
  const limit = opts.limit ?? 50
  const leads = await prisma.lead.findMany({ where: { orgId, campaignId }, select: { id: true, customFields: true } })

  const candidates = leads.filter((l) => {
    const cf = (l.customFields as Record<string, unknown>) ?? {}
    if (!cf.website) return false
    if (!opts.force && cf.digitalAudit) return false
    return true
  })
  const toRun = candidates.slice(0, limit)

  let audited = 0
  for (const lead of toRun) {
    await auditLead(orgId, lead.id, {}).catch(() => null)
    audited++
  }

  return {
    audited,
    skipped: leads.length - candidates.length,
    remaining: candidates.length - toRun.length,
  }
}

/**
 * Claves ya presentes en la organización para deduplicar importaciones de
 * prospección (por placeId o teléfono). Solo mira leads con
 * source="prospecting" — un lead manual con el mismo teléfono no bloquea la
 * importación, la prospección solo evita duplicarse a sí misma.
 */
export async function getExistingProspectKeys(orgId: string): Promise<{ placeIds: Set<string>; phones: Set<string> }> {
  const existing = await prisma.lead.findMany({
    where: { orgId, source: 'prospecting' },
    select: { phone: true, customFields: true },
  })
  const placeIds = new Set<string>()
  const phones = new Set<string>()
  for (const lead of existing) {
    const cf = (lead.customFields as Record<string, unknown>) ?? {}
    if (typeof cf.placeId === 'string') placeIds.add(cf.placeId)
    if (lead.phone) phones.add(lead.phone)
  }
  return { placeIds, phones }
}

export async function listFiles(orgId: string, leadId: string) {
  const files = await prisma.leadFile.findMany({ where: { orgId, leadId }, orderBy: { createdAt: 'desc' } })
  return Promise.all(files.map(async (f) => ({ ...f, url: await getPresignedUrl(f.storageKey) })))
}

export async function uploadFile(orgId: string, leadId: string, name: string, buffer: Buffer, mimeType?: string) {
  const storageKey = `leads/${leadId}/${randomUUID()}-${name}`
  await putObject(storageKey, buffer, mimeType)
  return prisma.leadFile.create({ data: { orgId, leadId, name, sizeBytes: buffer.length, storageKey } })
}

export async function listNotes(orgId: string, leadId: string) {
  return prisma.leadNote.findMany({ where: { orgId, leadId }, orderBy: { createdAt: 'desc' } })
}

export async function createNote(orgId: string, leadId: string, authorId: string, text: string) {
  const user = await prisma.user.findUnique({ where: { id: authorId }, select: { name: true } })
  return prisma.leadNote.create({
    data: { orgId, leadId, authorName: user?.name ?? 'Usuario', text },
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
