import { prisma } from '../lib/prisma'
import type { LeadStatus } from '@prisma/client'

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

async function findContactByLeadId(leadId: string): Promise<number | null> {
  const res = await mauticFetch(`/api/contacts?search=${encodeURIComponent(`crmleadid:${leadId}`)}&limit=1`)
  if (!res?.ok) return null
  const data = (await res.json()) as { contacts?: Record<string, { id: number }> }
  const first = data.contacts ? Object.values(data.contacts)[0] : null
  return first?.id ?? null
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
    tags: [`org-${lead.orgId}`],
    crmleadid: lead.id,
  }

  const existingId = await findContactByLeadId(lead.id)
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
export async function sendLeadToSegment(leadId: string, segmentAlias: string): Promise<boolean> {
  const contactId = await findContactByLeadId(leadId)
  if (!contactId) return false
  await addToSegment(contactId, segmentAlias)
  return true
}

/** Disparo manual de una plantilla puntual (sección 7.3 de la plataforma). */
export async function sendEmailToLead(leadId: string, mauticEmailId: string): Promise<boolean> {
  const contactId = await findContactByLeadId(leadId)
  if (!contactId) return false
  const res = await mauticFetch(`/api/emails/${mauticEmailId}/contact/${contactId}/send`, { method: 'POST' })
  return Boolean(res?.ok)
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
  type: 'open' | 'click',
  detail?: string
): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: crmLeadId } })
  if (!lead) return
  const customFields = (lead.customFields as Record<string, unknown>) ?? {}
  const activity = Array.isArray(customFields.mauticActivity) ? customFields.mauticActivity : []
  activity.unshift({ type, detail, at: new Date().toISOString() })
  await prisma.lead.update({
    where: { id: crmLeadId },
    data: { customFields: { ...customFields, mauticActivity: activity.slice(0, 50) } as any },
  })
}
