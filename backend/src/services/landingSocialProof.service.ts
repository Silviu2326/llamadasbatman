import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { VariantError } from './landingVariants.service'

/**
 * Prueba social de la landing — docs/xarly/landings.md §5.4.
 *
 * La regla es corta y no admite atajos: **solo clientes ganados, con
 * `ContactConsent` y aprobación expresa**.
 *
 * Un matiz que decide el diseño de este fichero: el consentimiento que ya
 * existe en la base tiene `purpose = 'contact'` — la persona autorizó que la
 * llamaran, no que su nombre apareciera en una página pública. Reutilizarlo
 * para publicar un testimonio sería usar un permiso para algo que nadie
 * concedió. Por eso se exige un consentimiento propio con
 * `purpose = 'testimonial'`, y mientras no exista, el candidato aparece como
 * "falta permiso" en vez de como material publicable.
 */

export const TESTIMONIAL_PURPOSE = 'testimonial'

export interface SocialProofCandidate {
  leadId: string
  name: string
  company: string | null
  wonAt: Date | null
  valueCents: number | null
  /** granted | denied | missing */
  consent: 'granted' | 'denied' | 'missing'
  /** Si ya hay una solicitud de aprobación en curso o resuelta. */
  approval: { id: string; status: string } | null
  eligible: boolean
}

/**
 * Clientes ganados que podrían dar prueba social, con el estado real de su
 * permiso. Devuelve a todos, elegibles o no: ocultar a quien falta permiso
 * haría creer que no hay candidatos, cuando lo que falta es pedirlo.
 */
export async function listCandidates(orgId: string): Promise<SocialProofCandidate[]> {
  const opportunities = await prisma.opportunity.findMany({
    where: { orgId, stage: 'closed_won' },
    select: {
      leadId: true,
      value: true,
      actualCloseDate: true,
      updatedAt: true,
      lead: { select: { id: true, name: true, company: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })
  if (!opportunities.length) return []

  const leadIds = opportunities.map(opportunity => opportunity.leadId)

  const [consents, approvals] = await Promise.all([
    prisma.contactConsent.findMany({
      where: { orgId, leadId: { in: leadIds }, purpose: TESTIMONIAL_PURPOSE },
      select: { leadId: true, status: true },
    }),
    prisma.sensitiveApprovalRequest.findMany({
      where: { orgId, action: 'landing.social_proof.publish', resourceId: { in: leadIds } },
      select: { id: true, status: true, resourceId: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const consentByLead = new Map(consents.map(consent => [consent.leadId, consent.status]))
  const approvalByLead = new Map<string, { id: string; status: string }>()
  for (const approval of approvals) {
    if (!approvalByLead.has(approval.resourceId)) approvalByLead.set(approval.resourceId, { id: approval.id, status: approval.status })
  }

  return opportunities.map(opportunity => {
    const status = consentByLead.get(opportunity.leadId)
    const consent = status === 'granted' ? 'granted' : status ? 'denied' : 'missing'
    const approval = approvalByLead.get(opportunity.leadId) ?? null
    return {
      leadId: opportunity.leadId,
      name: opportunity.lead.name,
      company: opportunity.lead.company,
      wonAt: opportunity.actualCloseDate ?? opportunity.updatedAt,
      valueCents: opportunity.value === null ? null : Math.round(Number(opportunity.value) * 100),
      consent,
      approval,
      // Elegible = ganado + permiso expreso + aprobación concedida. Las tres.
      eligible: consent === 'granted' && approval?.status === 'approved',
    }
  })
}

/**
 * Pide aprobación para publicar un testimonio. Exige el consentimiento antes de
 * crear la solicitud: si no existe, ni siquiera llega a la sala de aprobación.
 */
export async function requestPublication(
  orgId: string,
  actorUserId: string,
  input: { leadId: string; quote: string; attribution?: string },
) {
  const quote = input.quote?.trim()
  if (!quote) throw new VariantError('El testimonio no puede estar vacío.')

  const lead = await prisma.lead.findFirst({ where: { id: input.leadId, orgId }, select: { id: true, name: true } })
  if (!lead) throw new VariantError('Cliente no encontrado')

  const won = await prisma.opportunity.findFirst({
    where: { orgId, leadId: lead.id, stage: 'closed_won' },
    select: { id: true },
  })
  if (!won) throw new VariantError('Solo se publica prueba social de clientes ganados.')

  const consent = await prisma.contactConsent.findFirst({
    where: { orgId, leadId: lead.id, purpose: TESTIMONIAL_PURPOSE, status: 'granted' },
    select: { id: true },
  })
  if (!consent) {
    throw new VariantError('Falta el consentimiento explícito para publicar el testimonio. El permiso de contacto no sirve: autoriza una llamada, no aparecer en una página pública.')
  }

  const approval = await prisma.sensitiveApprovalRequest.create({
    data: {
      orgId,
      action: 'landing.social_proof.publish',
      requesterUserId: actorUserId,
      resourceType: 'Lead',
      resourceId: lead.id,
      reason: `Publicar testimonio de ${input.attribution || lead.name} en la landing.`,
      payload: { quote, attribution: input.attribution ?? lead.name, consentId: consent.id } as Prisma.InputJsonObject,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'landing.social_proof.requested',
    entityType: 'SensitiveApprovalRequest',
    entityId: approval.id,
    after: { leadId: lead.id, consentId: consent.id },
  })

  return approval
}
