import { prisma } from '../lib/prisma'
import type { LeadStatus, Prisma } from '@prisma/client'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  fetchWithTimeout,
  getOrganizationIntegrationOverride,
  integrationCredentialScope,
  redactProviderError,
  responseErrorCode,
} from '../lib/integrationRuntime'
import { resolveOrganizationCredentialConfig } from './organizationCredentials.service'

/**
 * Sync de contactos CRM → Mautic. Calca la forma de metaConversions.service.ts
 * (un solo punto de salida por evento, best-effort, nunca revienta el flujo
 * que lo llama).
 *
 * Instancia única de Mautic para todas las organizaciones: el aislamiento
 * entre organizaciones se hace con un tag `org-<orgId>`
 * en cada contacto, no con una instancia por cliente. `crm_lead_id` es el ID
 * maestro (mismo `Lead.id` del CRM) — evita el matching por email/teléfono
 * que el plan señala como la causa más probable de duplicados.
 *
 * Requiere que en Mautic exista de antemano un campo de contacto custom con
 * alias `crmleadid` (texto) — se crea una sola vez desde el admin de Mautic,
 * no lo crea este código.
 */

const SEGMENT_BY_STATUS: Record<LeadStatus, string | null> = {
  new: 'nuevo',
  contacted: 'contactado',
  qualified: 'interesado',
  unqualified: null,
  converted: 'ganado',
}

type MauticConfig = { baseUrl: string; clientId: string; clientSecret: string; webhookSecret?: string }
const cachedTokens = new Map<string, { value: string; expiresAt: number }>()

function overrideString(override: Record<string, unknown> | null, key: string): string | undefined {
  const value = override?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function config(orgId?: string): Promise<MauticConfig | null> {
  const resolved = orgId ? await resolveOrganizationCredentialConfig(orgId, 'mautic') : null
  const override = resolved?.config ?? (orgId ? null : getOrganizationIntegrationOverride('mautic', undefined))
  const baseUrl = overrideString(override, 'baseUrl') || (!orgId ? process.env.MAUTIC_BASE_URL : undefined)
  const clientId = overrideString(override, 'clientId') || (!orgId ? process.env.MAUTIC_CLIENT_ID : undefined)
  const clientSecret = overrideString(override, 'clientSecret') || (!orgId ? process.env.MAUTIC_CLIENT_SECRET : undefined)
  if (!baseUrl || !clientId || !clientSecret) return null
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    clientId,
    clientSecret,
    webhookSecret: overrideString(override, 'webhookSecret') || (!orgId ? process.env.MAUTIC_WEBHOOK_SECRET : undefined),
  }
}

export function isConfigured(orgId?: string): boolean {
  const override = getOrganizationIntegrationOverride('mautic', orgId)
  return Boolean(
    (overrideString(override, 'baseUrl') || (!orgId ? process.env.MAUTIC_BASE_URL : undefined))
    && (overrideString(override, 'clientId') || (!orgId ? process.env.MAUTIC_CLIENT_ID : undefined))
    && (overrideString(override, 'clientSecret') || (!orgId ? process.env.MAUTIC_CLIENT_SECRET : undefined)),
  )
}

export async function isConfiguredForOrg(orgId: string): Promise<boolean> {
  return Boolean(await config(orgId))
}

export async function connectionMetadata(orgId?: string) {
  const provider = await config(orgId)
  return {
    provider: 'mautic_email',
    configured: Boolean(provider),
    credentialScope: integrationCredentialScope('mautic', orgId),
    auth: {
      mode: 'client_credentials',
      oauthCallback: null,
      scopes: [],
      refreshSupported: false,
      revokeSupported: 'local_cache_clear_and_provider_admin',
    },
    webhook: {
      header: 'X-Mautic-Webhook-Secret or Authorization: Bearer',
      hmacHeader: 'X-Mautic-Signature',
      signatureAlgorithm: 'HMAC-SHA256',
      querySecretAllowed: process.env.MAUTIC_WEBHOOK_ALLOW_QUERY_SECRET === 'true' && process.env.NODE_ENV !== 'production',
    },
    note: provider ? 'Mautic usa client credentials; se solicita un token nuevo al caducar y se puede limpiar la caché local.' : 'Configura Mautic globalmente o mediante override de organización.',
  } as const
}

const orgTag = (orgId: string) => `org-${orgId}`
const campaignPrefix = (orgId: string) => `[org:${orgId}]`

function hasOrgTag(contact: Record<string, unknown>, orgId: string): boolean {
  const tags = contact.tags
  if (Array.isArray(tags)) return tags.some(tag => typeof tag === 'string' && tag === orgTag(orgId))
  if (tags && typeof tags === 'object') return Object.keys(tags).includes(orgTag(orgId))
  return false
}

function ownedCampaign(campaign: MauticCampaign, orgId: string): boolean {
  return typeof campaign.name === 'string' && campaign.name.startsWith(campaignPrefix(orgId))
}

async function getAccessToken(orgId?: string): Promise<string | null> {
  const provider = await config(orgId)
  if (!provider) return null
  // The key contains no secret and intentionally retains the org prefix so a
  // targeted local revoke can remove only that organization's session.
  const cacheKey = `${orgId ?? 'global'}|${provider.baseUrl}|${provider.clientId}`
  const cachedToken = cachedTokens.get(cacheKey)
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value

  try {
    const res = await fetchWithTimeout(`${provider.baseUrl}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
      }),
    })
    if (!res.ok) {
      console.warn('[MauticSync] token request failed:', await responseErrorCode(res))
      return null
    }
    const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
    if (!data?.access_token) return null
    const token = { value: data.access_token, expiresAt: Date.now() + Math.max(30, (data.expires_in ?? 3600) - 60) * 1000 }
    cachedTokens.set(cacheKey, token)
    return token.value
  } catch (err) {
    console.warn('[MauticSync] token request error:', redactProviderError(err))
    return null
  }
}

/** Client-credentials has no provider refresh/revoke endpoint; clear our token cache. */
export function revokeLocalSession(orgId?: string): void {
  if (!orgId) {
    cachedTokens.clear()
    return
  }
  for (const key of cachedTokens.keys()) if (key.startsWith(`${orgId}|`)) cachedTokens.delete(key)
}

export function verifyMauticWebhookSignature(rawBody: string, signature: string | undefined, secret: string | undefined): boolean {
  if (!rawBody || !signature || !secret) return false
  const normalized = signature.trim().replace(/^sha256=/i, '')
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const actual = Buffer.from(normalized, 'hex')
  const wanted = Buffer.from(expected, 'hex')
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

/** Resolves the webhook secret only after the CRM lead identifies its tenant. */
export async function mauticWebhookSecretForOrg(orgId: string): Promise<string | undefined> {
  const provider = await config(orgId)
  return provider?.webhookSecret
}

export function verifyMauticWebhookSecret(value: string | undefined, secret: string | undefined): boolean {
  if (!value || !secret) return false
  const actual = Buffer.from(value)
  const wanted = Buffer.from(secret)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

const MAUTIC_TIMEOUT_MS = 10_000
const MAUTIC_RETRY_DELAY_MS = 500
const EMAIL_DELIVERY_LEASE_MS = Math.max(30_000, Number(process.env.EMAIL_DELIVERY_LEASE_MS ?? 2 * 60_000))
const MAX_EMAIL_DELIVERY_ATTEMPTS = Math.max(1, Number(process.env.EMAIL_DELIVERY_MAX_ATTEMPTS ?? 5))
const MAX_EMAIL_DELIVERY_BACKOFF_MINUTES = 60
const DEFAULT_EMAIL_WORKER_ID = process.env.EMAIL_DELIVERY_WORKER_ID?.trim() || `email-${process.pid}`

/**
 * EM-103: timeout con AbortController + un único retry con backoff corto.
 * El retry solo aplica a lecturas (GET) — un POST/PUT de Mautic puede no ser
 * idempotente (p.ej. "enviar email"), así que nunca se reintenta solo, se
 * deja como fallo para que el caller decida (idempotency key propia si hace
 * falta, ver EmailDelivery/EM-102).
 */
async function mauticFetch(path: string, init: RequestInit = {}, orgId?: string): Promise<Response | null> {
  const provider = await config(orgId)
  const token = await getAccessToken(orgId)
  if (!token) return null
  const method = (init.method ?? 'GET').toUpperCase()
  const isRead = method === 'GET'

  const attempt = async (): Promise<Response | 'network-error'> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MAUTIC_TIMEOUT_MS)
    try {
      return await fetchWithTimeout(`${provider!.baseUrl}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
    } catch (err) {
      console.warn('[MauticSync] request failed:', redactProviderError(err))
      return 'network-error'
    } finally {
      clearTimeout(timer)
    }
  }

  let result = await attempt()
  const shouldRetry = isRead && (result === 'network-error' || (result instanceof Response && result.status >= 500))
  if (shouldRetry) {
    await new Promise(resolve => setTimeout(resolve, MAUTIC_RETRY_DELAY_MS))
        result = await attempt()
  }
  return result === 'network-error' ? null : result
}

interface MauticContact {
  id: number
  tags?: unknown
  [key: string]: unknown
}
interface MauticContactListResponse {
  contacts?: Record<string, MauticContact>
}
interface MauticContactDetailResponse {
  contact?: MauticContact
}

/**
 * EM-101: preferir el binding local (MauticContactBinding) antes de pegarle
 * a la API remota de Mautic — evita un round-trip por cada envío/segmento.
 * Solo se usa un binding en estado `synced`; `pending`/`error` no son un ID
 * de contacto real y deben caer al fallback remoto.
 */
async function getBindingContactId(orgId: string, leadId: string): Promise<number | null> {
  const binding = await prisma.mauticContactBinding.findUnique({
    where: { orgId_leadId: { orgId, leadId } },
    select: { externalContactId: true, syncStatus: true },
  })
  if (!binding || binding.syncStatus !== 'synced') return null
  const id = Number(binding.externalContactId)
  return Number.isFinite(id) ? id : null
}

/**
 * Upsert best-effort del binding tras un intento de `syncContact`. En error
 * sin binding previo no hay un `externalContactId` real que guardar (la
 * columna es NOT NULL + unique por org) — se usa un placeholder único por
 * lead que `getBindingContactId` nunca devuelve como válido (solo lee
 * bindings `synced`), así que no hay riesgo de que se use como ID real.
 */
async function upsertContactBinding(
  orgId: string,
  leadId: string,
  params: { externalContactId?: string; syncStatus: 'synced' | 'error'; lastError?: string }
): Promise<void> {
  const externalContactId = params.externalContactId ?? `pending:${leadId}`
  try {
    await prisma.mauticContactBinding.upsert({
      where: { orgId_leadId: { orgId, leadId } },
      create: {
        orgId,
        leadId,
        externalContactId,
        syncStatus: params.syncStatus,
        lastSyncedAt: params.syncStatus === 'synced' ? new Date() : null,
        lastError: params.lastError ?? null,
      },
      update: {
        ...(params.externalContactId ? { externalContactId: params.externalContactId } : {}),
        syncStatus: params.syncStatus,
        ...(params.syncStatus === 'synced' ? { lastSyncedAt: new Date() } : {}),
        lastError: params.lastError ?? null,
      },
    })
  } catch (err) {
    console.warn('[MauticSync] binding upsert failed:', (err as Error).message)
  }
}

export async function getContactIdForLead(leadId: string, orgId?: string): Promise<number | null> {
  if (orgId) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } })
    if (!lead) return null
    const cached = await getBindingContactId(orgId, leadId)
    if (cached) return cached
  }
  const res = await mauticFetch(`/api/contacts?search=${encodeURIComponent(`crmleadid:${leadId}`)}&limit=1`, {}, orgId)
  if (!res?.ok) return null
  const data = (await res.json()) as MauticContactListResponse
  const first = data.contacts ? Object.values(data.contacts)[0] : null
  if (!first || typeof first.id !== 'number') return null
  return orgId && !hasOrgTag(first, orgId) ? null : first.id
}

async function getOwnedContactId(contactId: string, orgId: string): Promise<number | null> {
  if (!/^\d{1,20}$/.test(contactId)) return null
  const res = await mauticFetch(`/api/contacts/${contactId}`, {}, orgId)
  if (!res?.ok) return null
  const data = (await res.json()) as MauticContactDetailResponse
  const contact = data.contact
  return contact && hasOrgTag(contact, orgId) && typeof contact.id === 'number' ? contact.id : null
}

interface SyncableLead {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  status: LeadStatus
  orgId: string
}

/**
 * Upsert best-effort del contacto — se llama desde ingestLead() y desde
 * cualquier cambio de Lead.status. Si Mautic no está configurado para la
 * organización (mauticEnabled=false) o no responde, no rompe el flujo que
 * llama a esta función.
 */
export async function syncContact(lead: SyncableLead): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: lead.orgId },
    select: { mauticEnabled: true },
  })
  if (!org?.mauticEnabled) return
  if (!lead.email && !lead.phone) return

  const payload = {
    firstname: lead.name,
    email: lead.email || undefined,
    phone: lead.phone || undefined,
    tags: [orgTag(lead.orgId)],
    crmleadid: lead.id,
  }

  const existingId = await getContactIdForLead(lead.id, lead.orgId)
  const res = existingId
    ? await mauticFetch(`/api/contacts/${existingId}/edit`, { method: 'PATCH', body: JSON.stringify(payload) }, lead.orgId)
    : await mauticFetch('/api/contacts/new', { method: 'POST', body: JSON.stringify(payload) }, lead.orgId)

  if (!res?.ok) {
    const errMsg = res ? await responseErrorCode(res) : 'Sin respuesta de Mautic'
    if (res) console.warn('[MauticSync] upsert failed:', errMsg)
    await upsertContactBinding(lead.orgId, lead.id, { syncStatus: 'error', lastError: errMsg.slice(0, 500) })
    return
  }

  const data = (await res.json()) as MauticContactDetailResponse
  const contactId = data.contact?.id ?? existingId
  if (contactId) {
    await upsertContactBinding(lead.orgId, lead.id, { externalContactId: String(contactId), syncStatus: 'synced' })
  }

  const segmentAlias = SEGMENT_BY_STATUS[lead.status]
  if (!segmentAlias) return
  if (contactId) await addToSegment(contactId, segmentAlias, lead.orgId)
}

async function addToSegment(contactId: number, segmentAlias: string, orgId?: string): Promise<void> {
  const res = await mauticFetch(`/api/segments/${encodeURIComponent(segmentAlias)}/contact/${contactId}/add`, { method: 'POST' }, orgId)
  if (res && !res.ok) console.warn(`[MauticSync] add to segment ${segmentAlias} failed:`, await responseErrorCode(res))
}

/**
 * Acción "enviar a segmento de Mautic" de Automatizaciones (sección 4 punto
 * 5/6 del plan) — a diferencia de `syncContact`, el segmento no sale del
 * `Lead.status` sino que lo elige quien configura la automatización.
 */
export async function sendLeadToSegment(leadId: string, segmentAlias: string, orgId?: string): Promise<boolean> {
  const resolvedOrgId = orgId ?? (await prisma.lead.findUnique({ where: { id: leadId }, select: { orgId: true } }))?.orgId
  if (!resolvedOrgId) return false
  const contactId = await getContactIdForLead(leadId, resolvedOrgId)
  if (!contactId) return false
  await addToSegment(contactId, segmentAlias, resolvedOrgId)
  return true
}

/**
 * EM-102: registro normalizado e idempotente de cada intento real de envío,
 * previo a invocar Mautic — `idempotencyKey` es único por intento (no por
 * reintento de red: cada llamada a esta función es un intento nuevo).
 * Exportada para que `leads.controller.ts#sendEmail` y
 * `automations.service.ts` (`send_email_template`) la usen antes de disparar
 * el envío real.
 */
export interface CreateEmailDeliveryInput {
  campaignId?: string
  templateExternalId?: string
  toAddress: string
  /** Identifies the business command that is allowed to be retried safely. */
  idempotencyScope?: string
}

function deterministicDeliveryKey(orgId: string, leadId: string, input: CreateEmailDeliveryInput): string {
  const address = input.toAddress.trim().toLowerCase()
  const scope = input.idempotencyScope?.trim()
    || `one-off:${input.templateExternalId ?? ''}:${address}`
  return createHash('sha256')
    .update([orgId, leadId, input.campaignId ?? '', input.templateExternalId ?? '', address, scope].join('\u0000'))
    .digest('hex')
}

export async function createEmailDelivery(
  orgId: string,
  leadId: string,
  input: CreateEmailDeliveryInput
) {
  const idempotencyKey = deterministicDeliveryKey(orgId, leadId, input)
  return prisma.emailDelivery.upsert({
    where: { idempotencyKey },
    create: {
      orgId,
      leadId,
      campaignId: input.campaignId,
      templateExternalId: input.templateExternalId,
      toAddress: input.toAddress,
      idempotencyKey,
      status: 'queued',
    },
    // Retrying a command must not reset the delivery to queued after the
    // provider has already accepted it.
    update: {},
  })
}

export type EmailDeliveryClaim = 'claimed' | 'accepted' | 'in_progress' | 'uncertain' | 'failed' | 'missing'

function dueEmailDeliveryWhere(now: Date): Prisma.EmailDeliveryWhereInput {
  return {
    OR: [
      { status: 'queued', availableAt: { lte: now } },
      // A processing delivery without a provider attempt is safe to recover:
      // no external POST has been durably started yet.
      {
        status: 'processing',
        providerAttemptedAt: null,
        OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }],
      },
    ],
  }
}

/**
 * Marks abandoned deliveries whose provider POST might have happened as
 * `uncertain`. We intentionally do not retry them: without a provider-side
 * idempotency guarantee, a retry could send the same email twice.
 */
async function quarantineAmbiguousEmailDelivery(
  deliveryId: string,
  orgId: string,
  leadId: string,
  templateExternalId: string,
  now: Date
): Promise<boolean> {
  const quarantined = await prisma.emailDelivery.updateMany({
    where: {
      id: deliveryId,
      orgId,
      leadId,
      templateExternalId,
      status: 'processing',
      providerAttemptedAt: { not: null },
      OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }],
    },
    data: {
      status: 'uncertain',
      failedAt: now,
      failureCode: 'OUTCOME_UNKNOWN',
      failureDetail: 'La lease expiró después de iniciar el envío al proveedor. Se requiere revisión para evitar un reenvío duplicado.',
      lockedAt: null,
      leaseExpiresAt: null,
      workerId: null,
    },
  })
  return quarantined.count === 1
}

/** Atomic conditional claim used by both HTTP sends and the campaign worker. */
export async function claimEmailDelivery(
  deliveryId: string,
  orgId: string,
  leadId: string,
  templateExternalId: string,
  workerId = DEFAULT_EMAIL_WORKER_ID
): Promise<EmailDeliveryClaim> {
  const now = new Date()
  // First convert an expired, externally ambiguous operation into a visible
  // terminal state. This is the at-most-once fence for providers such as
  // Mautic that do not document a durable idempotency API for this endpoint.
  if (await quarantineAmbiguousEmailDelivery(deliveryId, orgId, leadId, templateExternalId, now)) return 'uncertain'

  const claimed = await prisma.emailDelivery.updateMany({
    where: { id: deliveryId, orgId, leadId, templateExternalId, ...dueEmailDeliveryWhere(now) },
    data: {
      status: 'processing',
      attempts: { increment: 1 },
      lockedAt: now,
      leaseExpiresAt: new Date(now.getTime() + EMAIL_DELIVERY_LEASE_MS),
      workerId,
    },
  })
  if (claimed.count === 1) return 'claimed'

  const delivery = await prisma.emailDelivery.findFirst({
    where: { id: deliveryId, orgId, leadId, templateExternalId },
    select: { status: true },
  })
  if (!delivery) return 'missing'
  if (delivery.status === 'accepted' || delivery.status === 'delivered') return 'accepted'
  if (delivery.status === 'processing') return 'in_progress'
  if (delivery.status === 'uncertain') return 'uncertain'
  return 'failed'
}

async function renewEmailDeliveryLease(deliveryId: string, workerId: string): Promise<boolean> {
  const now = new Date()
  const renewed = await prisma.emailDelivery.updateMany({
    where: { id: deliveryId, status: 'processing', workerId, leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt: new Date(now.getTime() + EMAIL_DELIVERY_LEASE_MS) },
  })
  return renewed.count === 1
}

async function withEmailDeliveryLease<T>(deliveryId: string, workerId: string, work: () => Promise<T>) {
  let leaseLost = false
  let renewal = Promise.resolve()
  const heartbeat = () => {
    renewal = renewal.then(async () => {
      try {
        if (!await renewEmailDeliveryLease(deliveryId, workerId)) leaseLost = true
      } catch {
        leaseLost = true
      }
    })
  }
  const timer = setInterval(heartbeat, Math.max(1_000, Math.floor(EMAIL_DELIVERY_LEASE_MS / 3)))
  timer.unref()
  try {
    const value = await work()
    clearInterval(timer)
    await renewal
    return { value, leaseLost }
  } catch (error) {
    clearInterval(timer)
    await renewal
    throw error
  }
}

async function markEmailDeliveryAccepted(deliveryId: string, workerId: string, providerMessageId?: string): Promise<boolean> {
  const accepted = await prisma.emailDelivery
    .updateMany({
      where: { id: deliveryId, status: 'processing', workerId },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
        ...(providerMessageId ? { providerMessageId } : {}),
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
      },
    })
    .catch(err => {
      console.warn('[MauticSync] markEmailDeliveryAccepted failed:', (err as Error).message)
      return { count: 0 }
    })
  return accepted.count === 1
}

async function markEmailDeliveryFailed(deliveryId: string, workerId: string | undefined, failureCode?: string, failureDetail?: string): Promise<void> {
  const where = workerId
    ? { id: deliveryId, status: 'processing', workerId }
    : { id: deliveryId, status: { in: ['queued', 'processing'] } }
  await prisma.emailDelivery
    .updateMany({
      where,
      data: {
        status: 'failed',
        failedAt: new Date(),
        failureCode,
        failureDetail: failureDetail?.slice(0, 1000),
        lockedAt: null,
        leaseExpiresAt: null,
        workerId: null,
      },
    })
    .catch(err => console.warn('[MauticSync] markEmailDeliveryFailed failed:', (err as Error).message))
}

async function retryEmailDeliveryBeforeProvider(
  deliveryId: string,
  workerId: string,
  errorCode: string,
  errorDetail: string
): Promise<void> {
  const delivery = await prisma.emailDelivery.findFirst({
    where: { id: deliveryId, status: 'processing', workerId },
    select: { attempts: true },
  })
  if (!delivery) return
  if (delivery.attempts >= MAX_EMAIL_DELIVERY_ATTEMPTS) {
    await markEmailDeliveryFailed(deliveryId, workerId, 'MAX_ATTEMPTS_EXCEEDED', errorDetail)
    return
  }
  const delayMinutes = Math.min(MAX_EMAIL_DELIVERY_BACKOFF_MINUTES, 2 ** Math.max(0, delivery.attempts - 1))
  await prisma.emailDelivery.updateMany({
    where: { id: deliveryId, status: 'processing', workerId, providerAttemptedAt: null },
    data: {
      status: 'queued',
      availableAt: new Date(Date.now() + delayMinutes * 60_000),
      failureCode: errorCode,
      failureDetail: errorDetail.slice(0, 1000),
      lockedAt: null,
      leaseExpiresAt: null,
      workerId: null,
    },
  })
}

async function markEmailDeliveryProviderAttempted(deliveryId: string, workerId: string): Promise<boolean> {
  const marked = await prisma.emailDelivery.updateMany({
    where: { id: deliveryId, status: 'processing', workerId },
    data: { providerAttemptedAt: new Date() },
  })
  return marked.count === 1
}

async function markEmailDeliveryUncertain(deliveryId: string, workerId: string, failureCode: string, failureDetail?: string): Promise<void> {
  await prisma.emailDelivery.updateMany({
    where: { id: deliveryId, status: 'processing', workerId },
    data: {
      status: 'uncertain',
      failedAt: new Date(),
      failureCode,
      failureDetail: failureDetail?.slice(0, 1000),
      lockedAt: null,
      leaseExpiresAt: null,
      workerId: null,
    },
  })
}

/** Marks deliveries accepted only after Mautic has confirmed campaign enrollment and publication. */
export async function markCampaignDeliveriesAccepted(deliveryIds: string[]): Promise<void> {
  if (!deliveryIds.length) return
  await prisma.emailDelivery.updateMany({
    where: { id: { in: deliveryIds }, status: 'queued' },
    data: { status: 'accepted', acceptedAt: new Date() },
  })
}

/** Records a terminal recipient-level exclusion without changing other queued deliveries. */
export async function markCampaignDeliveriesFailed(
  deliveryIds: string[],
  failureCode: string,
  failureDetail: string
): Promise<void> {
  if (!deliveryIds.length) return
  await prisma.emailDelivery.updateMany({
    where: { id: { in: deliveryIds }, status: 'queued' },
    data: { status: 'failed', failedAt: new Date(), failureCode, failureDetail: failureDetail.slice(0, 1000) },
  })
}

async function extractProviderMessageId(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as Record<string, unknown>
    // `id` and `emailId` are normally template identifiers in Mautic. Persist
    // only an identifier explicitly described as a message/statistic ID.
    const message = data.providerMessageId
      ?? data.provider_message_id
      ?? data.messageId
      ?? data.message_id
      ?? data.statId
      ?? data.stat_id
    return message === undefined || message === null ? undefined : String(message)
  } catch {
    return undefined
  }
}

/**
 * Disparo manual de una plantilla puntual (sección 7.3 de la plataforma).
 * `deliveryId` es opcional y best-effort: cuando se pasa (viene de
 * `createEmailDelivery`), esta función actualiza su estado según el
 * resultado real del envío a Mautic.
 */
export async function sendEmailToLead(
  leadId: string,
  mauticEmailId: string,
  orgId?: string,
  deliveryId?: string,
  workerId = DEFAULT_EMAIL_WORKER_ID
): Promise<boolean> {
  const resolvedOrgId = orgId ?? (await prisma.lead.findUnique({ where: { id: leadId }, select: { orgId: true } }))?.orgId
  if (!resolvedOrgId) {
    if (deliveryId) await markEmailDeliveryFailed(deliveryId, undefined, 'ORG_NOT_RESOLVED', 'No se pudo resolver la organización del lead')
    return false
  }

  if (deliveryId) {
    const claimed = await claimEmailDelivery(deliveryId, resolvedOrgId, leadId, mauticEmailId, workerId)
    // Never repeat a provider POST when the same delivery was already
    // accepted or is currently owned by another worker/process.
    if (claimed === 'accepted' || claimed === 'in_progress') return true
    if (claimed !== 'claimed') return false

    const outcome = await withEmailDeliveryLease(deliveryId, workerId, async () => {
      const contactId = await getContactIdForLead(leadId, resolvedOrgId)
      if (!contactId) {
        // No provider POST happened, so this retry is safe and gets an
        // exponential backoff instead of being stranded in processing.
        await retryEmailDeliveryBeforeProvider(deliveryId, workerId, 'CONTACT_NOT_SYNCED', 'El lead no está sincronizado en Mautic')
        return { sent: false, providerAttempted: false }
      }
      if (!await markEmailDeliveryProviderAttempted(deliveryId, workerId)) {
        return { sent: false, providerAttempted: false }
      }
      const res = await mauticFetch(`/api/emails/${mauticEmailId}/contact/${contactId}/send`, {
        method: 'POST',
        // Mautic may ignore this header, which is why the durable
        // providerAttemptedAt/uncertain fence remains necessary. Compatible
        // gateways can nevertheless deduplicate the same command.
        headers: { 'Idempotency-Key': deliveryId },
      }, resolvedOrgId)
      return { sent: Boolean(res?.ok), providerAttempted: true, res }
    })

    if (outcome.leaseLost) {
      // Do not overwrite another worker's state. If the POST started, a
      // recovered worker will quarantine it as uncertain; otherwise it is
      // safe to reclaim after the expired lease.
      console.warn(`[MauticSync] lease perdida para EmailDelivery ${deliveryId}`)
      return false
    }
    if (!outcome.value.sent) {
      if (outcome.value.providerAttempted) {
        const res = outcome.value.res
        const detail = res ? await responseErrorCode(res) : 'Sin respuesta de Mautic'
        await markEmailDeliveryUncertain(deliveryId, workerId, res ? String(res.status) : 'NETWORK_ERROR', detail)
      }
      return false
    }
    await markEmailDeliveryAccepted(deliveryId, workerId, await extractProviderMessageId(outcome.value.res!))
    return true
  }

  // Legacy callers that have not materialized an EmailDelivery keep their
  // existing synchronous behaviour. All campaign sends use the leased path
  // above, where an external command has a durable idempotency fence.
  const contactId = await getContactIdForLead(leadId, resolvedOrgId)
  if (!contactId) return false
  const res = await mauticFetch(`/api/emails/${mauticEmailId}/contact/${contactId}/send`, { method: 'POST' }, resolvedOrgId)
  return Boolean(res?.ok)
}

/**
 * Campañas / plantillas de Mautic (sección 7 de BACKEND_PENDIENTE_PAGINAS.md).
 * Los paths exactos de la REST API de Mautic no se pudieron verificar contra un
 * despliegue real en este entorno (no hay instancia conectada). Se escriben
 * con la forma documentada típica de Mautic 4/5 — normalizar contra un
 * despliegue real antes de confiar en esto en producción.
 */

interface MauticCampaignEvent {
  id?: number | string
  type?: string
  eventType?: string
  properties?: Record<string, unknown>
  [key: string]: unknown
}

interface MauticCampaign {
  id: number
  name: string
  description?: string | null
  isPublished?: boolean
  publishUp?: string | null
  publishDown?: string | null
  category?: unknown
  events?: Record<string, MauticCampaignEvent> | MauticCampaignEvent[]
}

function campaignFromResponse(data: Record<string, unknown>): MauticCampaign | null {
  const campaign = data.campaign && typeof data.campaign === 'object'
    ? data.campaign as unknown as MauticCampaign
    : data as unknown as MauticCampaign
  return campaign && typeof campaign.id === 'number' && typeof campaign.name === 'string' ? campaign : null
}

function campaignEvents(campaign: MauticCampaign): MauticCampaignEvent[] {
  if (Array.isArray(campaign.events)) return campaign.events
  if (campaign.events && typeof campaign.events === 'object') return Object.values(campaign.events)
  return []
}

function hasConfiguredEmailAction(campaign: MauticCampaign, templateExternalId: string): boolean {
  return campaignEvents(campaign).some(event =>
    event.type === 'email.send'
    && event.eventType === 'action'
    && String(event.properties?.email ?? '') === templateExternalId
  )
}

/** GET /api/campaigns — Mautic devuelve `{ campaigns: { "1": {...}, ... } }`. */
export async function getCampaigns(orgId: string): Promise<MauticCampaign[] | null> {
  const res = await mauticFetch('/api/campaigns', {}, orgId)
  if (!res?.ok) return null
  const data = (await res.json()) as { campaigns?: Record<string, MauticCampaign> }
  return data.campaigns ? Object.values(data.campaigns).filter(campaign => ownedCampaign(campaign, orgId)) : []
}

/** POST /api/campaigns/new. */
export async function createCampaign(orgId: string, name: string, description?: string): Promise<MauticCampaign | null> {
  const res = await mauticFetch('/api/campaigns/new', {
    method: 'POST',
    body: JSON.stringify({ name: `${campaignPrefix(orgId)} ${name}`, description, isPublished: false }),
  }, orgId)
  if (!res?.ok) return null
  const data = (await res.json()) as { campaign?: MauticCampaign }
  return data.campaign && ownedCampaign(data.campaign, orgId) ? data.campaign : null
}

/**
 * Creates a Mautic campaign graph that has a single, immediate email action.
 * The graph is deliberately created unpublished; contacts are enrolled only
 * after the response proves that the configured template action exists.
 */
export async function createConfiguredEmailCampaign(
  orgId: string,
  name: string,
  description: string | undefined,
  templateExternalId: string
): Promise<MauticCampaign | null> {
  if (!/^\d+$/.test(templateExternalId)) return null

  const res = await mauticFetch('/api/campaigns/new', {
    method: 'POST',
    body: JSON.stringify({
      name: `${campaignPrefix(orgId)} ${name}`,
      description,
      isPublished: false,
      events: [{
        id: 'new1',
        name: `Send email ${templateExternalId}`,
        type: 'email.send',
        eventType: 'action',
        order: 1,
        properties: { email: Number(templateExternalId) },
        triggerMode: 'immediate',
        triggerDate: null,
        triggerInterval: null,
        triggerIntervalUnit: null,
        children: [],
        parent: null,
        decisionPath: null,
      }],
    }),
  }, orgId)
  if (!res?.ok) return null
  const body = (await res.json()) as Record<string, unknown>
  const created = campaignFromResponse(body)
  if (!created || !ownedCampaign(created, orgId)) return null

  // Do not trust a successful HTTP status alone. Mautic versions differ in
  // their campaign-builder payload support, so read back the graph and prove
  // the send action before allowing recipients or publication.
  const detail = await getCampaignStats(String(created.id), orgId)
  const verified = detail ? campaignFromResponse(detail) : null
  return verified && hasConfiguredEmailAction(verified, templateExternalId) ? verified : null
}

export async function getConfiguredEmailCampaign(
  orgId: string,
  campaignId: string,
  templateExternalId: string
): Promise<MauticCampaign | null> {
  const detail = await getCampaignStats(campaignId, orgId)
  const campaign = detail ? campaignFromResponse(detail) : null
  return campaign && hasConfiguredEmailAction(campaign, templateExternalId) ? campaign : null
}

export interface CampaignEnrollmentResult {
  enrolledLeadIds: string[]
  unsyncedLeadIds: string[]
  failedLeadIds: string[]
  error?: string
}

/**
 * Adds the concrete CRM audience to an already verified, unpublished Mautic
 * campaign. The endpoint response must explicitly be `{ success: true }`;
 * a 2xx response without that acknowledgement is not enough to publish.
 */
export async function enrollLeadsInConfiguredCampaign(
  orgId: string,
  campaignId: string,
  templateExternalId: string,
  leadIds: string[]
): Promise<CampaignEnrollmentResult> {
  const campaign = await getConfiguredEmailCampaign(orgId, campaignId, templateExternalId)
  if (!campaign || campaign.isPublished) {
    return { enrolledLeadIds: [], unsyncedLeadIds: [], failedLeadIds: leadIds, error: 'La campaña remota no está configurada como borrador verificable' }
  }

  const enrolledLeadIds: string[] = []
  const unsyncedLeadIds: string[] = []
  const failedLeadIds: string[] = []
  for (const leadId of leadIds) {
    const contactId = await getContactIdForLead(leadId, orgId)
    if (!contactId) {
      unsyncedLeadIds.push(leadId)
      continue
    }
    const res = await mauticFetch(`/api/campaigns/${campaignId}/contact/${contactId}/add`, { method: 'POST' }, orgId)
    if (!res?.ok) {
      failedLeadIds.push(leadId)
      continue
    }
    try {
      const payload = (await res.json()) as { success?: unknown }
      if (payload.success === true) enrolledLeadIds.push(leadId)
      else failedLeadIds.push(leadId)
    } catch {
      failedLeadIds.push(leadId)
    }
  }
  return { enrolledLeadIds, unsyncedLeadIds, failedLeadIds }
}

/** Publishes a fully configured and populated Mautic campaign, then reads it back. */
export async function publishConfiguredEmailCampaign(
  orgId: string,
  campaignId: string,
  templateExternalId: string,
  publishUp?: string,
  publishDown?: string
): Promise<MauticCampaign | null> {
  const existing = await getConfiguredEmailCampaign(orgId, campaignId, templateExternalId)
  if (!existing || existing.isPublished) return null

  const res = await mauticFetch(`/api/campaigns/${campaignId}/edit`, {
    method: 'PATCH',
    body: JSON.stringify({ isPublished: true, publishUp, publishDown }),
  }, orgId)
  if (!res?.ok) return null

  // The PATCH response can be stale on some Mautic installations. Reconcile
  // through GET and only report success when Mautic confirms publication and
  // the originally requested email action still exists.
  const detail = await getCampaignStats(campaignId, orgId)
  const published = detail ? campaignFromResponse(detail) : null
  return published?.isPublished && hasConfiguredEmailAction(published, templateExternalId) ? published : null
}

interface MauticEmailTemplate {
  id: number | string
  name?: string
  subject?: string
  [key: string]: unknown
}

/**
 * GET /api/emails — en Mautic los "emails" son las plantillas/asset
 * reutilizable, pero la instancia es compartida entre organizaciones
 * (P0-04/EM-01): tras traer la lista remota se cruza con
 * `MauticAssetBinding(orgId, assetType='template')` y solo se devuelven las
 * plantillas vinculadas a esa organización.
 *
 * CORRECCIÓN (revisión posterior): la versión anterior de esta función
 * auto-vinculaba TODAS las plantillas remotas a la primera organización que
 * las consultara — como cada organización tiene su propia consulta de
 * bindings (vacía la primera vez), esto en la práctica regalaba el catálogo
 * completo a cualquier organización que llamara primero, reintroduciendo la
 * exposición cross-tenant que P0-04 debía cerrar. Ahora solo se devuelven
 * plantillas YA vinculadas explícitamente (ver claimTemplate). Si una
 * organización no tiene ninguna vinculada, la lista queda vacía — la UI debe
 * ofrecer vincular una desde /api/mautic/templates/unclaimed (admin).
 */
export async function getEmailTemplates(orgId: string): Promise<MauticEmailTemplate[] | null> {
  const res = await mauticFetch('/api/emails', {}, orgId)
  if (!res?.ok) return null
  const data = (await res.json()) as { emails?: Record<string, MauticEmailTemplate> }
  const remote = data.emails ? Object.values(data.emails) : []

  const bindings = await prisma.mauticAssetBinding.findMany({
    where: { orgId, assetType: 'template', isActive: true },
    select: { externalId: true },
  })
  const boundIds = new Set(bindings.map(b => b.externalId))

  return remote.filter(email => boundIds.has(String(email.id)))
}

/**
 * Plantillas remotas que NINGUNA organización ha vinculado todavía —
 * superficie deliberadamente admin-only (P0-03) para que vincular sea una
 * acción explícita y auditada, no un grant automático. Sigue existiendo
 * exposición de metadatos (nombre/asunto) entre organizaciones en este
 * listado de candidatas: sin una convención real del lado de Mautic
 * (categoría o etiqueta por organización, no verificado contra una
 * instancia real — EM-03/P0-11) no hay forma de saber de antemano a qué
 * organización pertenece cada plantilla sin que un admin la reconozca por
 * nombre.
 */
export async function getUnclaimedEmailTemplates(): Promise<MauticEmailTemplate[] | null> {
  const res = await mauticFetch('/api/emails')
  if (!res?.ok) return null
  const data = (await res.json()) as { emails?: Record<string, MauticEmailTemplate> }
  const remote = data.emails ? Object.values(data.emails) : []

  const allBindings = await prisma.mauticAssetBinding.findMany({
    where: { assetType: 'template' },
    select: { externalId: true },
  })
  const claimedIds = new Set(allBindings.map(b => b.externalId))
  return remote.filter(email => !claimedIds.has(String(email.id)))
}

/**
 * Vincula explícitamente una plantilla remota a una organización (acción de
 * admin, auditada por el controller). Falla si ya está vinculada a OTRA
 * organización, para que dos organizaciones nunca compartan la misma
 * plantilla sin decisión humana explícita.
 */
export async function claimEmailTemplate(orgId: string, externalId: string, name: string): Promise<boolean> {
  const existing = await prisma.mauticAssetBinding.findFirst({
    where: { assetType: 'template', externalId },
    select: { orgId: true },
  })
  if (existing && existing.orgId !== orgId) return false
  await prisma.mauticAssetBinding.upsert({
    where: { orgId_assetType_externalId: { orgId, assetType: 'template', externalId } },
    create: { orgId, assetType: 'template', externalId, name },
    update: { name, isActive: true },
  })
  return true
}

/**
 * Crea en Mautic la plantilla de email de una pieza aprobada — atomización de
 * la fase 2 (`docs/vendrava/roadmap.md`, idea 8).
 *
 * Se crea **despublicada y vinculada a la organización** en el mismo paso: una
 * plantilla creada sin binding sería una plantilla huérfana que cualquier otra
 * organización podría reclamar desde el listado de no vinculadas, que es justo
 * la exposición cross-tenant que cierra `claimEmailTemplate`.
 *
 * Devuelve el id remoto, o `null` si Mautic no está configurado o rechazó la
 * creación: quien llama tiene que poder decir por qué no hay email, no dar por
 * hecho que lo hay.
 */
export async function createEmailDraft(
  orgId: string,
  email: { name: string; subject: string; html: string },
): Promise<{ id: string; name: string } | null> {
  const name = `${campaignPrefix(orgId)} ${email.name}`.slice(0, 191)
  const res = await mauticFetch('/api/emails/new', {
    method: 'POST',
    body: JSON.stringify({
      name,
      subject: email.subject.slice(0, 191),
      customHtml: email.html,
      emailType: 'list',
      isPublished: false,
    }),
  }, orgId)
  if (!res?.ok) return null

  const data = (await res.json().catch(() => null)) as { email?: { id?: unknown } } | null
  const externalId = data?.email?.id ? String(data.email.id) : null
  if (!externalId) return null

  await claimEmailTemplate(orgId, externalId, name)
  return { id: externalId, name }
}

/**
 * Ownership de una plantilla puntual (P0-04/EM-01) — nunca hay que confiar en
 * un `emailId` que manda el navegador sin comprobar antes que está vinculado
 * a la organización que lo usa.
 */
export async function isTemplateOwnedByOrg(orgId: string, emailId: string): Promise<boolean> {
  const binding = await prisma.mauticAssetBinding.findFirst({
    where: { orgId, assetType: 'template', externalId: emailId, isActive: true },
    select: { id: true },
  })
  return Boolean(binding)
}

/**
 * Mautic no tiene un endpoint genérico de "enviar este email a cualquier
 * dirección arbitraria de prueba" sin pasar por un contacto ya existente —
 * se asume `POST /api/emails/:emailId/send/:testContactId` (envío puntual de
 * un email a un contacto puntual), suposición no verificada contra un
 * despliegue real; confirmar contra la documentación de la versión
 * desplegada antes de depender de esto.
 */
export async function sendTestEmail(
  emailId: string,
  testContactId: string,
  deliveryId?: string,
  workerId = DEFAULT_EMAIL_WORKER_ID,
  orgId?: string
): Promise<boolean> {
  if (!deliveryId) {
    const res = await mauticFetch(`/api/emails/${emailId}/send/${testContactId}`, { method: 'POST' }, orgId)
    return Boolean(res?.ok)
  }

  const delivery = await prisma.emailDelivery.findUnique({
    where: { id: deliveryId },
    select: { orgId: true, leadId: true, templateExternalId: true },
  })
  if (!delivery?.templateExternalId || delivery.templateExternalId !== emailId) return false
  const claimed = await claimEmailDelivery(deliveryId, delivery.orgId, delivery.leadId, emailId, workerId)
  if (claimed === 'accepted' || claimed === 'in_progress') return true
  if (claimed !== 'claimed') return false

  const outcome = await withEmailDeliveryLease(deliveryId, workerId, async () => {
    if (!await markEmailDeliveryProviderAttempted(deliveryId, workerId)) return { sent: false, res: null as Response | null }
    const res = await mauticFetch(`/api/emails/${emailId}/send/${testContactId}`, {
      method: 'POST',
      headers: { 'Idempotency-Key': deliveryId },
    }, delivery.orgId)
    return { sent: Boolean(res?.ok), res }
  })
  if (outcome.leaseLost) return false
  if (!outcome.value.sent) {
    const res = outcome.value.res
    const detail = res ? await responseErrorCode(res) : 'Sin respuesta de Mautic'
    await markEmailDeliveryUncertain(deliveryId, workerId, res ? String(res.status) : 'NETWORK_ERROR', detail)
    return false
  }
  await markEmailDeliveryAccepted(deliveryId, workerId, await extractProviderMessageId(outcome.value.res!))
  return true
}

export async function getOwnedTestContactId(orgId: string, contactId: string): Promise<number | null> {
  return getOwnedContactId(contactId, orgId)
}

/** PATCH /api/campaigns/:id/edit con las fechas de publicación. */
export async function scheduleCampaign(
  orgId: string,
  campaignId: string,
  publishUp?: string,
  publishDown?: string
): Promise<MauticCampaign | null> {
  const owned = await getCampaignStats(campaignId, orgId)
  if (!owned) return null
  const res = await mauticFetch(`/api/campaigns/${campaignId}/edit`, {
    method: 'PATCH',
    body: JSON.stringify({ publishUp, publishDown }),
  }, orgId)
  if (!res?.ok) return null
  const data = (await res.json()) as { campaign?: MauticCampaign }
  return data.campaign && ownedCampaign(data.campaign, orgId) ? data.campaign : null
}

/** PATCH /api/campaigns/:id/edit con isPublished:false. */
export async function pauseCampaign(orgId: string, campaignId: string): Promise<boolean> {
  if (!(await getCampaignStats(campaignId, orgId))) return false
  const res = await mauticFetch(`/api/campaigns/${campaignId}/edit`, {
    method: 'PATCH',
    body: JSON.stringify({ isPublished: false }),
  }, orgId)
  if (!res?.ok) return false
  const detail = await getCampaignStats(campaignId, orgId)
  const campaign = detail ? campaignFromResponse(detail) : null
  return campaign?.isPublished === false
}

/** GET /api/campaigns/:id — Mautic suele incluir conteos/stats en el detalle. */
export async function getCampaignStats(campaignId: string, orgId?: string): Promise<Record<string, unknown> | null> {
  const res = await mauticFetch(`/api/campaigns/${campaignId}`, {}, orgId)
  if (!res?.ok) return null
  const data = (await res.json()) as Record<string, unknown>
  const campaign = (data.campaign && typeof data.campaign === 'object'
    ? data.campaign
    : data) as MauticCampaign
  if (orgId && !ownedCampaign(campaign, orgId)) return null
  return data
}

/**
 * Vista agregada para la página de Email marketing — no hay un modelo
 * dedicado a "campañas de email" en el schema (esas viven en Mautic), así que
 * se arma leyendo lo mismo que ya guarda cada lead: `customFields.mauticActivity`
 * (aperturas/clics registrados por el webhook) y `Lead.status` (mismo mapeo de
 * segmento que usa `syncContact`).
 */
export async function getOverview(orgId: string) {
  const [totalLeads, syncable, leads, statusGroups] = await Promise.all([
    prisma.lead.count({ where: { orgId } }),
    prisma.lead.count({ where: { orgId, email: { not: null } } }),
    prisma.lead.findMany({ where: { orgId }, select: { id: true, name: true, customFields: true } }),
    prisma.lead.groupBy({ by: ['status'], where: { orgId }, _count: { id: true } }),
  ])

  let opens = 0
  let clicks = 0
  const recentActivity: Array<{ leadId: string; name: string; type: string; detail?: string; at: string }> = []

  for (const lead of leads) {
    const activity = (lead.customFields as Record<string, unknown> | null)?.mauticActivity
    if (!Array.isArray(activity)) continue
    for (const a of activity as Array<{ type: string; detail?: string; at: string }>) {
      if (a.type === 'open') opens++
      if (a.type === 'click') clicks++
      recentActivity.push({ leadId: lead.id, name: lead.name, type: a.type, detail: a.detail, at: a.at })
    }
  }
  recentActivity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return {
    totalLeads,
    syncable,
    opens,
    clicks,
    bySegment: statusGroups.map(g => ({ status: g.status, count: g._count.id, segmentAlias: SEGMENT_BY_STATUS[g.status] })),
    recentActivity: recentActivity.slice(0, 10),
  }
}

/**
 * Webhook de vuelta (Mautic → CRM, sección 4 punto 5 del plan): registra
 * apertura/clic en `Lead.customFields.mauticActivity`, igual que ya se hace
 * con `digitalAudit` — no hay modelo dedicado para esto, no se justifica uno
 * para un array chico de eventos por lead.
 */
export async function recordActivityByCrmLeadId(
  crmLeadId: string,
  type: 'open' | 'click' | 'bounce' | 'unsubscribe',
  detail?: string,
  eventId?: string
): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: crmLeadId } })
  if (!lead) return
  const customFields = (lead.customFields as Record<string, unknown>) ?? {}
  const activity = Array.isArray(customFields.mauticActivity) ? customFields.mauticActivity : []
  const fingerprint = eventId || createHash('sha256').update(`${crmLeadId}|${type}|${detail || ''}`).digest('hex')
  const eventIds = Array.isArray(customFields.mauticWebhookEventIds) ? customFields.mauticWebhookEventIds : []
  if (eventIds.includes(fingerprint)) return
  eventIds.unshift(fingerprint)
  activity.unshift({ type, detail, at: new Date().toISOString(), eventId: fingerprint })
  await prisma.lead.update({
    where: { id: crmLeadId },
    data: { customFields: { ...customFields, mauticActivity: activity.slice(0, 50), mauticWebhookEventIds: eventIds.slice(0, 100) } as any },
  })
}
