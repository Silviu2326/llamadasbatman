import { leadCallQueue } from '../jobs/leadCallDispatch'
import { createLead } from './leads.service'
import { prisma } from '../lib/prisma'
import { sendLeadEvent } from './metaConversions.service'
import { syncContact } from './mauticSync.service'

/**
 * Encola la llamada de un lead ya existente con prioridad máxima y sin delay.
 * Punto único de entrada para el SLA de "<30s desde que entra el lead"
 * (ver META_ADS_AUTOMATION.md). Si Redis no está disponible, no revienta:
 * el lead queda creado igual, solo no se dispara la llamada automática.
 */
export async function enqueueLeadCall(orgId: string, leadId: string): Promise<boolean> {
  if (!leadCallQueue) {
    console.warn(`[LeadIngestion] cola no disponible, lead ${leadId} no fue encolado`)
    return false
  }
  await leadCallQueue.add(
    'call',
    { orgId, leadId },
    { priority: 1, removeOnComplete: 1000, removeOnFail: 1000 }
  )
  return true
}

/**
 * Entry point genérico para cualquier fuente de leads (Meta Lead Ads, landing
 * propia, futuras integraciones) — crea el Lead y dispara la llamada. Las
 * fuentes concretas (webhook de Meta, submit de landing) llaman esta función
 * directamente en vez de pasar por el endpoint HTTP manual de /api/leads.
 */
export async function ingestLead(
  orgId: string,
  input: {
    name: string
    phone?: string
    email?: string
    company?: string
    campaignId?: string
    source: string
    externalLeadId?: string
    customFields?: Record<string, unknown>
  }
) {
  // Idempotencia: Meta reintenta el webhook si no confirmamos rápido, no
  // queremos duplicar el lead ni volver a llamarlo.
  if (input.externalLeadId) {
    const existing = await prisma.lead.findUnique({
      where: { orgId_externalLeadId: { orgId, externalLeadId: input.externalLeadId } },
    })
    if (existing) return existing
  }

  const lead = await createLead(orgId, input)
  await enqueueLeadCall(orgId, lead.id)
  await sendLeadEvent(orgId, lead).catch(() => {})
  await syncContact(lead).catch(() => {})
  return lead
}
