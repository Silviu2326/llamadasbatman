import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'
import type { LeadStatus, MarketingCampaign } from '@prisma/client'
import { writeAuditLog } from '../lib/audit'
import { assertEmailSendAllowed } from '../lib/emailCompliance'
import { assignVariantKey } from './landingExperiments.service'
import { createNativeEmailDelivery, resolveNativeEmailDraft, type NativeEmailContent } from './nativeMarketingEmail.service'

export class CampaignNotFoundError extends Error { constructor() { super('Marketing campaign not found'); this.name = 'CampaignNotFoundError' } }
export class TemplateOwnershipError extends Error { constructor() { super('emailDraftId no pertenece a la organización'); this.name = 'TemplateOwnershipError' } }
export class CampaignStateError extends Error { constructor(message: string) { super(message); this.name = 'CampaignStateError' } }

export interface AudienceDefinition {
  status?: LeadStatus[]
  source?: string[]
  tags?: string[]
  subscribedPurpose?: string
}
interface CreateDraftInput { name: string; objective?: string }
export interface CampaignVariant { key: string; emailDraftId: string }
export const MAX_CAMPAIGN_VARIANTS = 4
interface UpdateCampaignInput {
  objective?: string
  audienceDefinition?: AudienceDefinition
  emailDraftId?: string
  variantDefinition?: CampaignVariant[] | null
  sender?: string
  replyTo?: string
  timezone?: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  attributionWindowDays?: number
}

export function readVariants(campaign: MarketingCampaign): CampaignVariant[] | null {
  const raw = campaign.variantDefinition
  if (!Array.isArray(raw) || raw.length < 2) return null
  const variants: CampaignVariant[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const record = entry as Record<string, unknown>
    const key = typeof record.key === 'string' ? record.key.trim() : ''
    const emailDraftId = typeof record.emailDraftId === 'string' ? record.emailDraftId.trim() : ''
    if (!key || !emailDraftId) return null
    variants.push({ key, emailDraftId })
  }
  return variants
}
function resolveVariants(campaign: MarketingCampaign): CampaignVariant[] {
  return readVariants(campaign) ?? (campaign.emailDraftId ? [{ key: 'default', emailDraftId: campaign.emailDraftId }] : [])
}

async function assertDraftOwned(orgId: string, emailDraftId: string): Promise<void> {
  const draft = await prisma.emailNewsletterDraft.findFirst({ where: { id: emailDraftId, orgId }, select: { id: true } })
  if (!draft) throw new TemplateOwnershipError()
}
async function assertVariantsOwned(orgId: string, variants: CampaignVariant[]): Promise<void> {
  if (variants.length < 2 || variants.length > MAX_CAMPAIGN_VARIANTS) throw new CampaignStateError(`Una prueba A/B necesita entre 2 y ${MAX_CAMPAIGN_VARIANTS} variantes.`)
  const keys = new Set<string>(), drafts = new Set<string>()
  for (const variant of variants) {
    if (!variant.key?.trim()) throw new CampaignStateError('Cada variante necesita una clave.')
    if (keys.has(variant.key)) throw new CampaignStateError(`Clave de variante repetida: ${variant.key}.`)
    keys.add(variant.key)
    if (!variant.emailDraftId?.trim()) throw new CampaignStateError(`La variante ${variant.key} necesita un borrador local.`)
    if (drafts.has(variant.emailDraftId)) throw new CampaignStateError('Dos variantes no pueden usar el mismo borrador.')
    drafts.add(variant.emailDraftId)
    await assertDraftOwned(orgId, variant.emailDraftId)
  }
}

export async function listCampaigns(orgId: string): Promise<MarketingCampaign[]> {
  return prisma.marketingCampaign.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } })
}
async function findOwned(orgId: string, id: string): Promise<MarketingCampaign> {
  const campaign = await prisma.marketingCampaign.findFirst({ where: { id, orgId } })
  if (!campaign) throw new CampaignNotFoundError()
  return campaign
}
export async function getCampaign(orgId: string, id: string): Promise<MarketingCampaign> { return findOwned(orgId, id) }

export async function createDraft(orgId: string, actorUserId: string, input: CreateDraftInput): Promise<MarketingCampaign> {
  const campaign = await prisma.marketingCampaign.create({ data: { orgId, name: input.name, objective: input.objective, status: 'draft', createdById: actorUserId } })
  await writeAuditLog({ orgId, actorUserId, action: 'campaign.create', entityType: 'MarketingCampaign', entityId: campaign.id, after: campaign })
  return campaign
}

export async function updateCampaign(orgId: string, actorUserId: string, id: string, input: UpdateCampaignInput): Promise<MarketingCampaign> {
  const existing = await findOwned(orgId, id)
  if (input.emailDraftId !== undefined) await assertDraftOwned(orgId, input.emailDraftId)
  if (input.variantDefinition) {
    if (!['draft', 'validating', 'ready', 'error'].includes(existing.status)) throw new CampaignStateError('El reparto A/B no se puede cambiar con la campaña ya publicada.')
    await assertVariantsOwned(orgId, input.variantDefinition)
  }
  const data: Record<string, unknown> = {}
  if (input.objective !== undefined) data.objective = input.objective
  if (input.audienceDefinition !== undefined) data.audienceDefinition = input.audienceDefinition
  if (input.emailDraftId !== undefined) data.emailDraftId = input.emailDraftId
  if (input.variantDefinition !== undefined) {
    data.variantDefinition = input.variantDefinition ?? Prisma.DbNull
    if (input.variantDefinition?.length) data.emailDraftId = input.variantDefinition[0].emailDraftId
  }
  if (input.sender !== undefined) data.sender = input.sender
  if (input.replyTo !== undefined) data.replyTo = input.replyTo
  if (input.timezone !== undefined) data.timezone = input.timezone
  if (input.scheduledStartAt !== undefined) data.scheduledStartAt = input.scheduledStartAt ? new Date(input.scheduledStartAt) : null
  if (input.scheduledEndAt !== undefined) data.scheduledEndAt = input.scheduledEndAt ? new Date(input.scheduledEndAt) : null
  if (input.attributionWindowDays !== undefined) data.attributionWindowDays = input.attributionWindowDays
  await prisma.marketingCampaign.updateMany({ where: { id, orgId }, data })
  const updated = await findOwned(orgId, id)
  await writeAuditLog({ orgId, actorUserId, action: 'campaign.update', entityType: 'MarketingCampaign', entityId: id, before: existing, after: updated })
  return updated
}

export async function validateCampaign(orgId: string, id: string): Promise<{ valid: boolean; missing: string[] }> {
  const campaign = await findOwned(orgId, id), missing: string[] = []
  if (!campaign.name?.trim()) missing.push('name')
  const audience = campaign.audienceDefinition as AudienceDefinition | null
  if (!audience || Object.keys(audience).length === 0) missing.push('audienceDefinition')
  const variants = readVariants(campaign)
  if (variants) {
    for (const variant of variants) {
      const draft = await prisma.emailNewsletterDraft.findFirst({ where: { id: variant.emailDraftId, orgId }, select: { id: true } })
      if (!draft) missing.push(`variant:${variant.key}`)
    }
  } else if (!campaign.emailDraftId || !(await prisma.emailNewsletterDraft.findFirst({ where: { id: campaign.emailDraftId, orgId }, select: { id: true } }))) {
    missing.push('emailDraftId')
  }
  if (!campaign.sender) missing.push('sender')
  const valid = missing.length === 0
  if (valid && ['draft', 'validating', 'error'].includes(campaign.status)) await prisma.marketingCampaign.updateMany({ where: { id, orgId }, data: { status: 'ready' } })
  else if (!valid && campaign.status === 'draft') await prisma.marketingCampaign.updateMany({ where: { id, orgId }, data: { status: 'validating' } })
  return { valid, missing }
}

function buildAudienceWhere(orgId: string, audience: AudienceDefinition): Record<string, unknown> {
  const where: Record<string, unknown> = { orgId, email: { not: null } }
  if (audience.status?.length) where.status = { in: audience.status }
  if (audience.source?.length) where.source = { in: audience.source }
  if (audience.tags?.length) where.tags = { hasSome: audience.tags }
  if (audience.subscribedPurpose) where.contactConsents = { some: { channel: 'email', purpose: audience.subscribedPurpose, status: 'granted' } }
  return where
}
export async function previewAudience(orgId: string, audienceDefinition: AudienceDefinition): Promise<{ count: number; sample: Array<{ id: string; name: string; email: string | null; status: LeadStatus; source: string | null; tags: string[] }> }> {
  const where = buildAudienceWhere(orgId, audienceDefinition)
  const [count, sample] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({ where, take: 5, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, email: true, status: true, source: true, tags: true } }),
  ])
  return { count, sample }
}
export interface PublishCampaignResult { campaign: MarketingCampaign; enrolled: number; skipped: number }

async function failCampaignPublication(campaign: MarketingCampaign, actorUserId: string, message: string): Promise<never> {
  await prisma.marketingCampaign.updateMany({ where: { id: campaign.id, orgId: campaign.orgId, status: 'publishing' }, data: { status: 'error' } })
  await writeAuditLog({ orgId: campaign.orgId, actorUserId, action: 'campaign.publish.failed', entityType: 'MarketingCampaign', entityId: campaign.id, before: campaign, after: { status: 'error', reason: message } })
  throw new CampaignStateError(message)
}

export async function publishCampaign(orgId: string, actorUserId: string, id: string): Promise<PublishCampaignResult> {
  const existing = await findOwned(orgId, id)
  if (existing.status !== 'ready') throw new CampaignStateError('La campaña debe estar validada (estado "ready") antes de publicarse')
  const claimed = await prisma.marketingCampaign.updateMany({ where: { id, orgId, status: 'ready' }, data: { status: 'publishing' } })
  if (claimed.count !== 1) throw new CampaignStateError('La campaña ya se está publicando o su estado cambió')
  const campaign = await findOwned(orgId, id)
  try {
    const variants = resolveVariants(campaign)
    if (!variants.length) return failCampaignPublication(campaign, actorUserId, 'Selecciona un borrador de newsletter local antes de publicar.')
    const resolved = new Map<string, NativeEmailContent>()
    for (const variant of variants) {
      const content = await resolveNativeEmailDraft(orgId, variant.emailDraftId)
      if (!content) return failCampaignPublication(campaign, actorUserId, `El borrador ${variant.key} ya no existe en esta organización.`)
      resolved.set(variant.key, content)
    }
    const where = buildAudienceWhere(orgId, (campaign.audienceDefinition as AudienceDefinition) ?? {})
    const audienceLeads = await prisma.lead.findMany({ where, select: { id: true, email: true } })
    const keys = variants.map(variant => variant.key)
    const snapshots = variants.map(variant => ({ key: variant.key, emailDraftId: variant.emailDraftId, subject: resolved.get(variant.key)!.subject, html: resolved.get(variant.key)!.html, content: resolved.get(variant.key)!.content }))
    let skipped = 0, enrolled = 0
    for (const lead of audienceLeads) {
      if (!lead.email) { skipped++; continue }
      const decision = await assertEmailSendAllowed(orgId, lead.id, 'marketing')
      if (!decision.allowed) { skipped++; continue }
      const key = assignVariantKey(`${id}:${lead.id}`, keys)
      const variant = variants.find(candidate => candidate.key === key) ?? variants[0]
      const delivery = await createNativeEmailDelivery({
        orgId, leadId: lead.id, emailDraftId: variant.emailDraftId, toAddress: lead.email,
        idempotencyScope: `campaign:${id}`, purpose: 'marketing', campaignId: id, variantKey: variants.length > 1 ? variant.key : null,
        content: resolved.get(variant.key),
      })
      if (delivery.status === 'queued' || delivery.status === 'processing' || delivery.status === 'accepted' || delivery.status === 'delivered') enrolled++
      else skipped++
    }
    const now = new Date(), nextStatus = campaign.scheduledStartAt && campaign.scheduledStartAt.getTime() > now.getTime() ? 'scheduled' : 'running'
    await prisma.marketingCampaign.updateMany({ where: { id, orgId, status: 'publishing' }, data: {
      contentSnapshot: { sender: campaign.sender, replyTo: campaign.replyTo, variants: snapshots } as Prisma.InputJsonObject,
      audienceSnapshotCount: audienceLeads.length, status: nextStatus, publishedAt: now, approvedById: actorUserId,
    } })
    const updated = await findOwned(orgId, id)
    await writeAuditLog({ orgId, actorUserId, action: 'campaign.publish', entityType: 'MarketingCampaign', entityId: id, before: campaign, after: { ...updated, enrolled, skipped } })
    return { campaign: updated, enrolled, skipped }
  } catch (err) {
    if (err instanceof CampaignStateError) throw err
    return failCampaignPublication(campaign, actorUserId, 'No se pudo preparar la campaña nativa; se ha detenido antes de enviar emails.')
  }
}

export async function pauseCampaign(orgId: string, actorUserId: string, id: string): Promise<MarketingCampaign> {
  const campaign = await findOwned(orgId, id)
  if (!['running', 'scheduled'].includes(campaign.status)) throw new CampaignStateError('Solo se pueden pausar campañas programadas o en curso.')
  await prisma.marketingCampaign.updateMany({ where: { id, orgId, status: { in: ['running', 'scheduled'] } }, data: { status: 'paused' } })
  const updated = await findOwned(orgId, id)
  await writeAuditLog({ orgId, actorUserId, action: 'campaign.pause', entityType: 'MarketingCampaign', entityId: id, before: campaign, after: updated })
  return updated
}

/** Reconciles campaign status from its durable local delivery ledger. */
export async function reconcileCampaignStatus(orgId: string, id: string): Promise<MarketingCampaign> {
  const campaign = await findOwned(orgId, id)
  if (['completed', 'error', 'paused', 'draft', 'ready'].includes(campaign.status)) return campaign
  const rows = await prisma.emailDelivery.groupBy({ by: ['status'], where: { orgId, campaignId: id }, _count: { _all: true } })
  const count = (status: string) => rows.find(row => row.status === status)?._count._all ?? 0
  if (count('queued') + count('processing') > 0) return campaign
  const status = count('uncertain') > 0 ? 'error' : 'completed'
  await prisma.marketingCampaign.updateMany({ where: { id, orgId, status: campaign.status }, data: { status } })
  return findOwned(orgId, id)
}
