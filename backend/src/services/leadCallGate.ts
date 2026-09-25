import { prisma } from '../lib/prisma'
import { enqueueLeadCall } from '../jobs/leadCallDispatch'

/**
 * Clave idempotente del trabajo de llamada de un lead dentro de su campaña.
 * Es la misma que `campaignCallDedupeKey` (campaigns.service): arrancar la
 * campaña, el consentimiento de voz al importar y `autoCall` convergen en un
 * único trabajo `lead-call-dispatch` por lead y campaña, nunca en dos marcados.
 */
export function leadCampaignCallDedupeKey(leadId: string, campaignId: string) {
  return `lead-call:${leadId}:${campaignId}`
}

/**
 * Devuelve el `campaignId` del lead solo si la campaña está `active` y su
 * agente publicado (`lifecycleStatus === 'active'`). Con la campaña en
 * borrador el worker rechazaría el trabajo escribiendo «Llamada no realizada:
 * la campaña no está activa» en el timeline de cada lead; es ruido, no una
 * llamada. Al arrancar la campaña, `startCampaign` ya encola a los leads
 * `new` elegibles, así que aquí basta con no encolar.
 */
export async function findActiveCampaignForLeadCall(orgId: string, leadId: string): Promise<string | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId },
    select: { campaignId: true, campaign: { select: { status: true, agent: { select: { isActive: true, lifecycleStatus: true } } } } },
  })
  if (!lead?.campaignId || lead.campaign?.status !== 'active') return null
  const agent = lead.campaign.agent
  if (!agent?.isActive || agent.lifecycleStatus !== 'active') return null
  return lead.campaignId
}

/**
 * Encola la llamada automática de un lead (consentimiento de voz, autoCall)
 * únicamente si su campaña puede marcar ya, con la clave idempotente de
 * campaña. Devuelve `false` sin ruido cuando no procede.
 */
export async function enqueueCampaignLeadCall(orgId: string, leadId: string, delayMs = 0): Promise<boolean> {
  const campaignId = await findActiveCampaignForLeadCall(orgId, leadId)
  if (!campaignId) return false
  return enqueueLeadCall(orgId, leadId, leadCampaignCallDedupeKey(leadId, campaignId), delayMs, { campaignId, onFinished: 'ignore' })
}
