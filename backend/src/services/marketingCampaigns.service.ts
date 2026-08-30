import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'
import type { LeadStatus, MarketingCampaign } from '@prisma/client'
import { writeAuditLog } from '../lib/audit'
import * as mauticSync from './mauticSync.service'
import { assertEmailSendAllowed } from '../lib/emailCompliance'
import { assignVariantKey } from './landingExperiments.service'

/**
 * EM-104/EM-105/EM-106/EM-107: proyección operativa en el CRM de una campaña
 * de email — audiencia, plantilla, remitente y calendario viven aquí con
 * ownership real (ver docs/auditoria-nutricion-ventas/01-email-marketing.md).
 * Mautic sigue siendo el motor de envío remoto; este servicio nunca asume el
 * estado optimista de lo que manda a Mautic, lo reconcilia (EM-107).
 */

/** 404: la campaña no existe o no pertenece a la organización. */
export class CampaignNotFoundError extends Error {
  constructor() {
    super('Marketing campaign not found')
    this.name = 'CampaignNotFoundError'
  }
}

/** 404: el templateBindingId recibido no está vinculado a esta organización. */
export class TemplateOwnershipError extends Error {
  constructor() {
    super('templateBindingId no pertenece a la organización')
    this.name = 'TemplateOwnershipError'
  }
}

/** 400: la acción no es válida para el estado actual de la campaña. */
export class CampaignStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CampaignStateError'
  }
}

// EM-106: audiencia dinámica básica — objeto de filtros planos, no un AST
// genérico (sobre-ingeniería para esta versión). `hasEmail` no es un filtro
// configurable: toda campaña de email exige email no nulo, siempre.
export interface AudienceDefinition {
  status?: LeadStatus[]
  source?: string[]
  tags?: string[]
  /**
   * EM-112: categoría de suscripción (ContactConsent.purpose con channel=email).
   * Es lo que convierte una campaña en una newsletter: la audiencia deja de ser
   * "leads que cumplen filtros" y pasa a ser "leads que dieron permiso para
   * esta categoría". Filtra por `status: 'granted'`, así que las bajas, los
   * rebotes y las quejas quedan fuera por construcción.
   */
  subscribedPurpose?: string
}

interface CreateDraftInput {
  name: string
  objective?: string
}

/**
 * EM-113: una variante de la prueba A/B. El asunto no se guarda aquí a
 * propósito — vive en la plantilla de Mautic, que es quien lo envía. Duplicarlo
 * daría dos fuentes de verdad y la pantalla acabaría enseñando un asunto que no
 * es el que salió.
 */
export interface CampaignVariant {
  key: string
  templateExternalId: string
  /** Campaña remota de esta variante; se rellena al publicar. */
  externalCampaignId?: string | null
}

export const MAX_CAMPAIGN_VARIANTS = 4

interface UpdateCampaignInput {
  objective?: string
  audienceDefinition?: AudienceDefinition
  templateBindingId?: string
  variantDefinition?: CampaignVariant[] | null
  sender?: string
  replyTo?: string
  timezone?: string
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  attributionWindowDays?: number
}

/** Lee `variantDefinition` sin confiar en su forma: JSON libre en base. */
export function readVariants(campaign: MarketingCampaign): CampaignVariant[] | null {
  const raw = campaign.variantDefinition
  if (!Array.isArray(raw) || raw.length < 2) return null
  const variants: CampaignVariant[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const record = entry as Record<string, unknown>
    const key = typeof record.key === 'string' ? record.key.trim() : ''
    const templateExternalId = typeof record.templateExternalId === 'string' ? record.templateExternalId.trim() : ''
    if (!key || !templateExternalId) return null
    variants.push({
      key,
      templateExternalId,
      externalCampaignId: typeof record.externalCampaignId === 'string' ? record.externalCampaignId : null,
    })
  }
  return variants
}

/**
 * Variantes efectivas: las de la prueba, o una sola implícita con la plantilla
 * de siempre. El resto del servicio trabaja con esta lista y no necesita saber
 * si hay experimento — la campaña de una versión es el caso de una variante.
 */
function resolveVariants(campaign: MarketingCampaign): Array<{ key: string | null; templateExternalId: string; externalCampaignId?: string | null }> {
  const variants = readVariants(campaign)
  if (variants) return variants
  return [{ key: null, templateExternalId: campaign.templateBindingId ?? '', externalCampaignId: campaign.externalCampaignId }]
}

/** Valida forma y propiedad; lanza si algo no cuadra. */
async function assertVariantsOwned(orgId: string, variants: CampaignVariant[]): Promise<void> {
  if (variants.length < 2 || variants.length > MAX_CAMPAIGN_VARIANTS) {
    throw new CampaignStateError(`Una prueba A/B necesita entre 2 y ${MAX_CAMPAIGN_VARIANTS} variantes.`)
  }
  const keys = new Set<string>()
  const templates = new Set<string>()
  for (const variant of variants) {
    if (!variant.key?.trim()) throw new CampaignStateError('Cada variante necesita una clave.')
    if (keys.has(variant.key)) throw new CampaignStateError(`Clave de variante repetida: ${variant.key}.`)
    keys.add(variant.key)
    if (!variant.templateExternalId?.trim()) throw new CampaignStateError(`La variante ${variant.key} necesita plantilla.`)
    // Dos variantes con la misma plantilla no son una prueba: darían siempre
    // empate y consumirían audiencia sin aprender nada.
    if (templates.has(variant.templateExternalId)) throw new CampaignStateError('Dos variantes no pueden usar la misma plantilla.')
    templates.add(variant.templateExternalId)
    if (!(await mauticSync.isTemplateOwnedByOrg(orgId, variant.templateExternalId))) throw new TemplateOwnershipError()
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

export async function getCampaign(orgId: string, id: string): Promise<MarketingCampaign> {
  return findOwned(orgId, id)
}

/** EM-105: crea el borrador — el resto de campos se completan con updateCampaign. */
export async function createDraft(
  orgId: string,
  actorUserId: string,
  input: CreateDraftInput
): Promise<MarketingCampaign> {
  const campaign = await prisma.marketingCampaign.create({
    data: {
      orgId,
      name: input.name,
      objective: input.objective,
      status: 'draft',
      createdById: actorUserId,
    },
  })
  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'campaign.create',
    entityType: 'MarketingCampaign',
    entityId: campaign.id,
    after: campaign,
  })
  return campaign
}

/**
 * EM-104/EM-105/EM-106: actualiza los campos configurables del borrador.
 * templateBindingId se valida contra MauticAssetBinding (mismo patrón que
 * `isTemplateOwnedByOrg` en mauticSync.service.ts): el selector de
 * plantillas del frontend solo lista bindings ya autorizados para la org
 * (GET /api/mautic/templates), así que aquí se re-verifica ese mismo
 * externalId para no confiar en lo que manda el navegador.
 */
export async function updateCampaign(
  orgId: string,
  actorUserId: string,
  id: string,
  input: UpdateCampaignInput
): Promise<MarketingCampaign> {
  const existing = await findOwned(orgId, id)

  if (input.templateBindingId) {
    const binding = await prisma.mauticAssetBinding.findFirst({
      where: { orgId, assetType: 'template', externalId: input.templateBindingId, isActive: true },
      select: { id: true },
    })
    if (!binding) throw new TemplateOwnershipError()
  }

  if (input.variantDefinition) {
    if (existing.status !== 'draft' && existing.status !== 'validating' && existing.status !== 'ready' && existing.status !== 'error') {
      throw new CampaignStateError('El reparto de una prueba A/B no se puede cambiar con la campaña ya publicada.')
    }
    await assertVariantsOwned(orgId, input.variantDefinition)
  }

  const data: Record<string, unknown> = {}
  if (input.objective !== undefined) data.objective = input.objective
  if (input.audienceDefinition !== undefined) data.audienceDefinition = input.audienceDefinition
  if (input.templateBindingId !== undefined) data.templateBindingId = input.templateBindingId
  if (input.variantDefinition !== undefined) {
    data.variantDefinition = input.variantDefinition ?? Prisma.DbNull
    // La variante A pasa a ser la plantilla base para que validar, reconciliar
    // y el resto del código que solo conoce `templateBindingId` sigan valiendo.
    if (input.variantDefinition?.length) data.templateBindingId = input.variantDefinition[0].templateExternalId
  }
  if (input.sender !== undefined) data.sender = input.sender
  if (input.replyTo !== undefined) data.replyTo = input.replyTo
  if (input.timezone !== undefined) data.timezone = input.timezone
  if (input.scheduledStartAt !== undefined) data.scheduledStartAt = input.scheduledStartAt ? new Date(input.scheduledStartAt) : null
  if (input.scheduledEndAt !== undefined) data.scheduledEndAt = input.scheduledEndAt ? new Date(input.scheduledEndAt) : null
  if (input.attributionWindowDays !== undefined) data.attributionWindowDays = input.attributionWindowDays

  await prisma.marketingCampaign.updateMany({ where: { id, orgId }, data })
  const updated = await findOwned(orgId, id)

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'campaign.update',
    entityType: 'MarketingCampaign',
    entityId: id,
    before: existing,
    after: updated,
  })
  return updated
}

/**
 * EM-105: checklist de completitud antes de poder publicar. Si la campaña
 * queda completa la promueve a 'ready'; si estaba en 'draft' y todavía le
 * falta algo, la deja en 'validating' para reflejar que ya se intentó.
 */
export async function validateCampaign(orgId: string, id: string): Promise<{ valid: boolean; missing: string[] }> {
  const campaign = await findOwned(orgId, id)

  const missing: string[] = []
  if (!campaign.name?.trim()) missing.push('name')
  const audience = campaign.audienceDefinition as AudienceDefinition | null
  if (!audience || Object.keys(audience).length === 0) missing.push('audienceDefinition')
  const variants = readVariants(campaign)
  if (variants) {
    // Toda variante tiene que seguir siendo de la organización: una plantilla
    // desvinculada entre la configuración y la publicación invalida la prueba.
    for (const variant of variants) {
      if (!(await mauticSync.isTemplateOwnedByOrg(orgId, variant.templateExternalId))) {
        missing.push(`variant:${variant.key}`)
      }
    }
  } else if (!campaign.templateBindingId || !(await mauticSync.isTemplateOwnedByOrg(orgId, campaign.templateBindingId))) {
    missing.push('templateBindingId')
  }
  if (!campaign.sender) missing.push('sender')

  const valid = missing.length === 0

  if (valid && (campaign.status === 'draft' || campaign.status === 'validating' || campaign.status === 'error')) {
    await prisma.marketingCampaign.updateMany({ where: { id, orgId }, data: { status: 'ready' } })
  } else if (!valid && campaign.status === 'draft') {
    await prisma.marketingCampaign.updateMany({ where: { id, orgId }, data: { status: 'validating' } })
  }

  return { valid, missing }
}

/**
 * EM-106: traduce el objeto de filtros planos a un where de Prisma sobre
 * Lead. `email: { not: null }` siempre aplica — no tiene sentido una
 * audiencia de email sin dirección. Compartida entre previewAudience (solo
 * cuenta/muestra) y publishCampaign (necesita la lista completa de leads
 * para encolar los envíos) para no duplicar la lógica de filtro.
 */
function buildAudienceWhere(orgId: string, audienceDefinition: AudienceDefinition): Record<string, unknown> {
  const where: Record<string, unknown> = { orgId, email: { not: null } }
  if (audienceDefinition.status?.length) where.status = { in: audienceDefinition.status }
  if (audienceDefinition.source?.length) where.source = { in: audienceDefinition.source }
  if (audienceDefinition.tags?.length) where.tags = { hasSome: audienceDefinition.tags }
  if (audienceDefinition.subscribedPurpose) {
    // `some` sobre la relación: basta una fila de consentimiento concedido
    // para esa categoría. No sustituye a la barrera de envío
    // (lib/emailCompliance.ts), que se sigue evaluando contacto a contacto al
    // publicar — esto solo evita construir una audiencia que ya se sabe
    // inelegible.
    where.contactConsents = {
      some: { channel: 'email', purpose: audienceDefinition.subscribedPurpose, status: 'granted' },
    }
  }
  return where
}

export async function previewAudience(
  orgId: string,
  audienceDefinition: AudienceDefinition
): Promise<{ count: number; sample: Array<{ id: string; name: string; email: string | null; status: LeadStatus; source: string | null; tags: string[] }> }> {
  const where = buildAudienceWhere(orgId, audienceDefinition)

  const [count, sample] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, email: true, status: true, source: true, tags: true },
    }),
  ])

  return { count, sample }
}

export interface PublishCampaignResult {
  campaign: MarketingCampaign
  /** Contacts explicitly added to the verified Mautic campaign. */
  enrolled: number
  /** Audience members omitted because of no email, consent, or missing Mautic contact. */
  skipped: number
}

async function failCampaignPublication(
  campaign: MarketingCampaign,
  actorUserId: string,
  message: string,
  externalCampaignId?: string
): Promise<never> {
  await prisma.marketingCampaign.updateMany({
    where: { id: campaign.id, orgId: campaign.orgId, status: 'publishing' },
    data: { status: 'error', ...(externalCampaignId ? { externalCampaignId } : {}) },
  })
  await writeAuditLog({
    orgId: campaign.orgId,
    actorUserId,
    action: 'campaign.publish.failed',
    entityType: 'MarketingCampaign',
    entityId: campaign.id,
    before: campaign,
    after: { status: 'error', externalCampaignId, reason: message },
  })
  throw new CampaignStateError(message)
}

/**
 * EM-105/EM-106: publica la campaña — exige que ya esté 'ready' (validada).
 * Construye primero el grafo remoto con la acción de plantilla, congela el
 * tamaño de audiencia y añade cada contacto elegible de forma explícita.
 * Solo después de que Mautic confirme todos esos pasos se publica y se
 * refleja un estado local 'scheduled' o 'running'.
 */
export async function publishCampaign(orgId: string, actorUserId: string, id: string): Promise<PublishCampaignResult> {
  const existing = await findOwned(orgId, id)
  if (existing.status !== 'ready') {
    throw new CampaignStateError('La campaña debe estar validada (estado "ready") antes de publicarse')
  }

  // Atomic ownership of the publication command: a duplicated click or two
  // API workers cannot create/enroll two remote campaigns.
  const claimed = await prisma.marketingCampaign.updateMany({
    where: { id, orgId, status: 'ready' },
    data: { status: 'publishing' },
  })
  if (claimed.count !== 1) {
    throw new CampaignStateError('La campaña ya se está publicando o su estado cambió')
  }
  const campaign = await findOwned(orgId, id)

  try {

  // Una campaña de una versión es el caso de una variante: el bucle es el
  // mismo, así que no hay dos caminos de publicación que mantener.
  const variants = resolveVariants(campaign)
  for (const variant of variants) {
    if (!variant.templateExternalId || !(await mauticSync.isTemplateOwnedByOrg(orgId, variant.templateExternalId))) {
      return failCampaignPublication(campaign, actorUserId, 'La plantilla ya no pertenece a esta organización')
    }
  }
  const variantKeys = variants.map(variant => variant.key).filter((key): key is string => Boolean(key))

  // Lista completa de la audiencia (no la muestra de 5 de previewAudience) —
  // mismo `where` compartido vía buildAudienceWhere.
  const where = buildAudienceWhere(orgId, (campaign.audienceDefinition as AudienceDefinition) ?? {})
  const audienceLeads = await prisma.lead.findMany({ where, select: { id: true, email: true } })

  let skipped = 0
  let alreadyEnrolled = 0
  // El reparto es determinista por `campaña:lead`: republicar reparte igual y
  // un lead no cambia de variante a mitad de la prueba.
  const deliveriesByVariant = new Map<string, Map<string, string>>(variants.map(variant => [variant.key ?? '', new Map()]))
  for (const lead of audienceLeads) {
    if (!lead.email) { skipped++; continue }
    const decision = await assertEmailSendAllowed(orgId, lead.id, 'marketing')
    if (!decision.allowed) { skipped++; continue }
    const assignedKey = variantKeys.length ? assignVariantKey(`${id}:${lead.id}`, variantKeys) : null
    const variant = variants.find(candidate => candidate.key === assignedKey) ?? variants[0]
    const delivery = await mauticSync.createEmailDelivery(orgId, lead.id, {
      campaignId: id,
      templateExternalId: variant.templateExternalId,
      toAddress: lead.email,
      idempotencyScope: `campaign:${id}`,
      variantKey: variant.key ?? null,
    })
    if (delivery.status === 'accepted' || delivery.status === 'delivered') {
      alreadyEnrolled++
      continue
    }
    if (delivery.status !== 'queued') {
      skipped++
      continue
    }
    deliveriesByVariant.get(variant.key ?? '')!.set(lead.id, delivery.id)
  }

  const publishedVariants: CampaignVariant[] = []
  const resolvedExternalIds: string[] = []
  const enrolledDeliveryIds: string[] = []
  for (const variant of variants) {
    const deliveryByLeadId = deliveriesByVariant.get(variant.key ?? '')!
    const variantName = variant.key ? `${campaign.name} · ${variant.key}` : campaign.name

    let remoteCampaign = variant.externalCampaignId
      ? await mauticSync.getConfiguredEmailCampaign(orgId, variant.externalCampaignId, variant.templateExternalId)
      : null
    if (!remoteCampaign && !variant.externalCampaignId) {
      remoteCampaign = await mauticSync.createConfiguredEmailCampaign(
        orgId,
        variantName,
        campaign.objective ?? undefined,
        variant.templateExternalId
      )
    }
    if (!remoteCampaign) {
      return failCampaignPublication(
        campaign,
        actorUserId,
        'Mautic no confirmó una campaña con la plantilla configurada; no se ha publicado ni enviado ningún email',
        variant.externalCampaignId ?? undefined
      )
    }
    const externalCampaignId = String(remoteCampaign.id)

    const enrollment = await mauticSync.enrollLeadsInConfiguredCampaign(
      orgId,
      externalCampaignId,
      variant.templateExternalId,
      [...deliveryByLeadId.keys()]
    )
    if (enrollment.failedLeadIds.length || enrollment.error) {
      return failCampaignPublication(
        campaign,
        actorUserId,
        enrollment.error || 'Mautic no confirmó que todos los contactos se añadieran a la campaña',
        externalCampaignId
      )
    }

    const unsyncedDeliveryIds = enrollment.unsyncedLeadIds
      .map(leadId => deliveryByLeadId.get(leadId))
      .filter((deliveryId): deliveryId is string => Boolean(deliveryId))
    await mauticSync.markCampaignDeliveriesFailed(
      unsyncedDeliveryIds,
      'CONTACT_NOT_SYNCED',
      'El lead no tiene un contacto Mautic de esta organización verificable'
    )
    skipped += enrollment.unsyncedLeadIds.length

    const publishedRemote = await mauticSync.publishConfiguredEmailCampaign(
      orgId,
      externalCampaignId,
      variant.templateExternalId,
      campaign.scheduledStartAt?.toISOString(),
      campaign.scheduledEndAt?.toISOString()
    )
    if (!publishedRemote) {
      return failCampaignPublication(
        campaign,
        actorUserId,
        'Mautic no confirmó la publicación de la campaña configurada; no se marcará como activa',
        externalCampaignId
      )
    }

    enrolledDeliveryIds.push(
      ...enrollment.enrolledLeadIds
        .map(leadId => deliveryByLeadId.get(leadId))
        .filter((deliveryId): deliveryId is string => Boolean(deliveryId))
    )
    resolvedExternalIds.push(externalCampaignId)
    if (variant.key) publishedVariants.push({ key: variant.key, templateExternalId: variant.templateExternalId, externalCampaignId })
  }
  await mauticSync.markCampaignDeliveriesAccepted(enrolledDeliveryIds)

  const now = new Date()
  const nextStatus = campaign.scheduledStartAt && campaign.scheduledStartAt.getTime() > now.getTime() ? 'scheduled' : 'running'

  await prisma.marketingCampaign.updateMany({
    where: { id, orgId },
    data: {
      // La campaña remota de la variante A hace de principal: pausar y
      // reconciliar siguen teniendo un id al que apuntar.
      externalCampaignId: resolvedExternalIds[0] ?? null,
      ...(publishedVariants.length ? { variantDefinition: publishedVariants as unknown as Prisma.InputJsonValue } : {}),
      audienceSnapshotCount: audienceLeads.length,
      status: nextStatus,
      publishedAt: now,
      approvedById: actorUserId,
    },
  })
  const updated = await findOwned(orgId, id)

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'campaign.publish',
    entityType: 'MarketingCampaign',
    entityId: id,
    before: campaign,
    after: { ...updated, enrolled: alreadyEnrolled + enrolledDeliveryIds.length, skipped },
  })
  return { campaign: updated, enrolled: alreadyEnrolled + enrolledDeliveryIds.length, skipped }
  } catch (err) {
    if (err instanceof CampaignStateError) throw err
    return failCampaignPublication(
      campaign,
      actorUserId,
      'No se pudo configurar o publicar la campaña en Mautic; se ha detenido antes de enviar emails',
      campaign.externalCampaignId ?? undefined
    )
  }
}

/** EM-107: pausa remota en Mautic y refleja el estado local. */
export async function pauseCampaign(orgId: string, actorUserId: string, id: string): Promise<MarketingCampaign> {
  const campaign = await findOwned(orgId, id)
  if (!campaign.externalCampaignId) {
    throw new CampaignStateError('La campaña todavía no se ha publicado en Mautic')
  }

  // Con prueba A/B hay una campaña remota por variante: pausar solo la
  // principal dejaría la otra enviando, que es lo contrario de lo que espera
  // quien pulsa "pausar".
  const remoteIds = [...new Set(
    (readVariants(campaign)?.map(variant => variant.externalCampaignId).filter((value): value is string => Boolean(value)) ?? [])
      .concat(campaign.externalCampaignId)
  )]
  const results = await Promise.all(remoteIds.map(remoteId => mauticSync.pauseCampaign(orgId, remoteId)))
  if (results.some(ok => !ok)) throw new CampaignStateError('No se pudo pausar la campaña en Mautic')

  await prisma.marketingCampaign.updateMany({ where: { id, orgId }, data: { status: 'paused' } })
  const updated = await findOwned(orgId, id)

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'campaign.pause',
    entityType: 'MarketingCampaign',
    entityId: id,
    before: campaign,
    after: updated,
  })
  return updated
}

/**
 * EM-107: la UI refleja estado confirmado, no optimista — lee el estado
 * remoto real (`isPublished`) y corrige el estado local si difiere, en vez
 * de asumir que lo que se mandó a Mautic se aplicó. Estados terminales
 * locales (completed/error) no se tocan porque Mautic no los modela.
 */
export async function reconcileCampaignStatus(orgId: string, id: string): Promise<MarketingCampaign> {
  const campaign = await findOwned(orgId, id)
  if (!campaign.externalCampaignId) return campaign
  if (campaign.status === 'completed' || campaign.status === 'error') return campaign

  const stats = await mauticSync.getCampaignStats(campaign.externalCampaignId, orgId)
  if (!stats) return campaign // Mautic inalcanzable: se conserva el último estado conocido

  const remoteCampaign = (stats.campaign && typeof stats.campaign === 'object' ? stats.campaign : stats) as Record<string, unknown>
  const isPublished = Boolean(remoteCampaign.isPublished)
  const remotePublishUp = typeof remoteCampaign.publishUp === 'string' ? new Date(remoteCampaign.publishUp) : null
  const isScheduledForFuture = Boolean(remotePublishUp && !Number.isNaN(remotePublishUp.getTime()) && remotePublishUp.getTime() > Date.now())
  const reconciledStatus = isPublished ? (isScheduledForFuture ? 'scheduled' : 'running') : 'paused'

  if (reconciledStatus === campaign.status) return campaign

  await prisma.marketingCampaign.updateMany({ where: { id, orgId }, data: { status: reconciledStatus } })
  return findOwned(orgId, id)
}
