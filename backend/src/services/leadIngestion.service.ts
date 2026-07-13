import { enqueueLeadCall as enqueueLeadCallJob } from '../jobs/leadCallDispatch'
import { createLead } from './leads.service'
import { prisma } from '../lib/prisma'
import { sendLeadEvent } from './metaConversions.service'
import { ChannelConsentInput } from './conversations.service'

/**
 * Encola la llamada de un lead ya existente con prioridad máxima y sin delay.
 * Punto único de entrada para el SLA de "<30s desde que entra el lead"
 * (ver META_ADS_AUTOMATION.md). Si Redis no está disponible, no revienta:
 * el lead queda creado igual, solo no se dispara la llamada automática.
 */
export async function enqueueLeadCall(orgId: string, leadId: string): Promise<boolean> {
  return enqueueLeadCallJob(orgId, leadId)
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
    consent?: ChannelConsentInput
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

  // Fuentes automáticas (webhook Meta, landing) no tienen un usuario detrás.
  // createLead() ya sincroniza Mautic y orquesta conversación/consentimiento/
  // evento lead.created (FND-05) — aquí solo queda lo específico de esta
  // fuente: el evento de conversión a Meta.
  const lead = await createLead(orgId, null, input)
  await sendLeadEvent(orgId, lead).catch(() => {})
  return lead
}
