import { prisma } from '../lib/prisma'
import type { LeadStatus } from '@prisma/client'
import { createHash } from 'node:crypto'

/**
 * Sync de contactos CRM → Mautic. Calca la forma de metaConversions.service.ts
 * (un solo punto de salida por evento, best-effort, nunca revienta el flujo
 * que lo llama) — ver PLAN_IMPLEMENTACION_POSTIZ_MAUTIC.md sección 4.
 *
 * Instancia única de Mautic para todas las organizaciones (decisión 2.2 del
 * plan): el aislamiento entre organizaciones se hace con un tag `org-<orgId>`
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

let cachedToken: { value: string; expiresAt: number } | null = null

function isConfigured(): boolean {
  return Boolean(process.env.MAUTIC_BASE_URL && process.env.MAUTIC_CLIENT_ID && process.env.MAUTIC_CLIENT_SECRET)
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

async function getAccessToken(): Promise<string | null> {
  if (!isConfigured()) return null
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value

  try {
    const res = await fetch(`${process.env.MAUTIC_BASE_URL}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.MAUTIC_CLIENT_ID!,
        client_secret: process.env.MAUTIC_CLIENT_SECRET!,
      }),
    })
    if (!res.ok) {
      console.warn('[MauticSync] token request failed:', await res.text())
      return null
    }
    const data = (await res.json()) as { access_token: string; expires_in: number }
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
    return cachedToken.value
  } catch (err) {
    console.warn('[MauticSync] token request error:', (err as Error).message)
    return null
  }
}

async function mauticFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await getAccessToken()
  if (!token) return null
  try {
    return await fetch(`${process.env.MAUTIC_BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.warn(`[MauticSync] request to ${path} failed:`, (err as Error).message)
    return null
  }
}

export async function getContactIdForLead(leadId: string, orgId?: string): Promise<number | null> {
  if (orgId) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true } })
    if (!lead) return null
  }
  const res = await mauticFetch(`/api/contacts?search=${encodeURIComponent(`crmleadid:${leadId}`)}&limit=1`)
  if (!res?.ok) return null
  const data = (await res.json()) as { contacts?: Record<string, Record<string, unknown>> }
  const first = data.contacts ? Object.values(data.contacts)[0] : null
  if (!first || typeof first.id !== 'number') return null
  return orgId && !hasOrgTag(first, orgId) ? null : first.id
}

async function getOwnedContactId(contactId: string, orgId: string): Promise<number | null> {
  if (!/^\d{1,20}$/.test(contactId)) return null
  const res = await mauticFetch(`/api/contacts/${contactId}`)
  if (!res?.ok) return null
  const data = (await res.json()) as { contact?: Record<string, unknown> }
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

  const existingId = await getContactIdForLead(lead.id)
  const res = existingId
    ? await mauticFetch(`/api/contacts/${existingId}/edit`, { method: 'PATCH', body: JSON.stringify(payload) })
    : await mauticFetch('/api/contacts/new', { method: 'POST', body: JSON.stringify(payload) })

  if (!res?.ok) {
    if (res) console.warn('[MauticSync] upsert failed:', await res.text())
    return
  }

  const segmentAlias = SEGMENT_BY_STATUS[lead.status]
  if (!segmentAlias) return

  const data = (await res.json()) as { contact?: { id: number } }
  const contactId = data.contact?.id ?? existingId
  if (contactId) await addToSegment(contactId, segmentAlias)
}

async function addToSegment(contactId: number, segmentAlias: string): Promise<void> {
  const res = await mauticFetch(`/api/segments/${segmentAlias}/contact/${contactId}/add`, { method: 'POST' })
  if (res && !res.ok) console.warn(`[MauticSync] add to segment ${segmentAlias} failed:`, await res.text())
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
  await addToSegment(contactId, segmentAlias)
  return true
}

/** Disparo manual de una plantilla puntual (sección 7.3 de la plataforma). */
export async function sendEmailToLead(leadId: string, mauticEmailId: string, orgId?: string): Promise<boolean> {
  const resolvedOrgId = orgId ?? (await prisma.lead.findUnique({ where: { id: leadId }, select: { orgId: true } }))?.orgId
  if (!resolvedOrgId) return false
  const contactId = await getContactIdForLead(leadId, resolvedOrgId)
  if (!contactId) return false
  const res = await mauticFetch(`/api/emails/${mauticEmailId}/contact/${contactId}/send`, { method: 'POST' })
  return Boolean(res?.ok)
}

/**
 * Campañas / plantillas de Mautic (sección 7 de BACKEND_PENDIENTE_PAGINAS.md).
 * Igual que ya advierte `postizSync.service.ts` sobre la API de Postiz: los
 * paths exactos de la REST API de Mautic no se pudieron verificar contra un
 * despliegue real en este entorno (no hay instancia conectada). Se escriben
 * con la forma documentada típica de Mautic 4/5 — normalizar contra un
 * despliegue real antes de confiar en esto en producción.
 */

interface MauticCampaign {
  id: number
  name: string
  description?: string | null
  isPublished?: boolean
  publishUp?: string | null
  publishDown?: string | null
  category?: unknown
}

/** GET /api/campaigns — Mautic devuelve `{ campaigns: { "1": {...}, ... } }`. */
export async function getCampaigns(orgId: string): Promise<MauticCampaign[] | null> {
  const res = await mauticFetch('/api/campaigns')
  if (!res?.ok) return null
  const data = (await res.json()) as { campaigns?: Record<string, MauticCampaign> }
  return data.campaigns ? Object.values(data.campaigns).filter(campaign => ownedCampaign(campaign, orgId)) : []
}

/** POST /api/campaigns/new. */
export async function createCampaign(orgId: string, name: string, description?: string): Promise<MauticCampaign | null> {
  const res = await mauticFetch('/api/campaigns/new', {
    method: 'POST',
    body: JSON.stringify({ name: `${campaignPrefix(orgId)} ${name}`, description }),
  })
  if (!res?.ok) return null
  const data = (await res.json()) as { campaign?: MauticCampaign }
  return data.campaign && ownedCampaign(data.campaign, orgId) ? data.campaign : null
}

/**
 * GET /api/emails — en Mautic los "emails" son las plantillas/asset
 * reutilizable, pero la instancia es compartida entre organizaciones
 * (P0-04/EM-01): tras traer la lista remota se cruza con
 * `MauticAssetBinding(orgId, assetType='template')` y solo se devuelven las
 * plantillas vinculadas a esa organización. Si la organización todavía no
 * tiene ningún binding, se crean automáticamente para lo que exista en ese
 * momento en Mautic (migración progresiva, no bloqueante) — a partir de ahí
 * solo se listan las plantillas ya vinculadas.
 */
export async function getEmailTemplates(orgId: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await mauticFetch('/api/emails')
  if (!res?.ok) return null
  const data = (await res.json()) as { emails?: Record<string, Record<string, unknown>> }
  const remote = data.emails ? Object.values(data.emails) : []

  const bindings = await prisma.mauticAssetBinding.findMany({
    where: { orgId, assetType: 'template' },
    select: { externalId: true },
  })
  let boundIds = new Set(bindings.map(b => b.externalId))

  if (boundIds.size === 0 && remote.length > 0) {
    await prisma.mauticAssetBinding.createMany({
      data: remote.map(email => ({
        orgId,
        assetType: 'template' as const,
        externalId: String(email.id),
        name: String(email.name ?? email.subject ?? email.id ?? ''),
      })),
      skipDuplicates: true,
    })
    boundIds = new Set(remote.map(email => String(email.id)))
  }

  return remote.filter(email => boundIds.has(String(email.id)))
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
export async function sendTestEmail(emailId: string, testContactId: string): Promise<boolean> {
  const res = await mauticFetch(`/api/emails/${emailId}/send/${testContactId}`, { method: 'POST' })
  return Boolean(res?.ok)
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
  })
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
  })
  return Boolean(res?.ok)
}

/** GET /api/campaigns/:id — Mautic suele incluir conteos/stats en el detalle. */
export async function getCampaignStats(campaignId: string, orgId?: string): Promise<Record<string, unknown> | null> {
  const res = await mauticFetch(`/api/campaigns/${campaignId}`)
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
