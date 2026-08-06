import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { diagnoseOrganization, type LandingDiagnosis } from './landingDiagnostics.service'

/**
 * Variantes de landing — docs/vendrava/landings.md §5.4 y §5.5.
 *
 * Regla que gobierna todo el fichero: **una variante siempre nace con
 * justificación escrita**, nunca como cambio cosmético sin hipótesis. Sin
 * hipótesis, un experimento no enseña nada: gane o pierda, nadie sabe por qué.
 *
 * Por eso las variantes se generan **a partir de un diagnóstico** de la fase 2,
 * que ya trae evidencia, impacto estimado y confianza. Cuando no hay LLM
 * configurado, la variante se sigue generando de forma determinista a partir de
 * esa misma evidencia: lo que no se hace nunca es inventar una hipótesis.
 */

/** Estados de la variante (§5.5). */
export const VARIANT_STATUS = {
  GENERATED: 'generated',
  PENDING_APPROVAL: 'pending_approval',
  ACTIVE: 'active',
  WINNER: 'winner',
  LOSER: 'loser',
  INCONCLUSIVE: 'inconclusive',
  DISCARDED: 'discarded',
} as const

/** Estados del ciclo de vida de la landing (§5.5). */
export const LANDING_LIFECYCLE = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  EXPERIMENTING: 'experimenting',
  WINNER: 'winner',
  PAUSED: 'paused',
  ARCHIVED: 'archived',
} as const

/**
 * Campos del contenido que una variante puede cambiar. La lista es cerrada a
 * propósito: precios, garantías, testimonios y condiciones legales exigen
 * aprobación humana explícita (§10) y no entran aquí ni por descuido.
 */
const PATCHABLE_FIELDS = ['title', 'offer', 'leadMagnet', 'adCopy', 'optionalFields', 'hiddenFields'] as const
export type PatchableField = (typeof PATCHABLE_FIELDS)[number]

export class VariantError extends Error {}

/**
 * Los diagnósticos hablan en castellano ("email", "franja horaria") y el
 * formulario en nombres de campo. El parche tiene que llevar el nombre técnico.
 */
const FIELD_KEYS: Record<string, string> = {
  nombre: 'name',
  'teléfono': 'phone',
  email: 'email',
  'franja horaria': 'contactTime',
  consentimiento: 'consent',
}

function getClient(): Anthropic | null {
  const apiKey = process.env.CLAUDE_API_KEY
  return apiKey ? new Anthropic({ apiKey }) : null
}

/**
 * Propuesta determinista a partir del diagnóstico. Es el camino que se usa sin
 * LLM y también el respaldo cuando el modelo devuelve algo inservible: la
 * página nunca se queda sin propuesta por un fallo de proveedor.
 */
function deterministicProposal(diagnosis: LandingDiagnosis, content: Record<string, unknown>) {
  if (diagnosis.type === 'form_field_abandonment') {
    // El campo va en el nombre del diagnóstico; se recupera de la evidencia.
    const label = /«([^»]+)»/.exec(diagnosis.title)?.[1] ?? 'email'
    const field = FIELD_KEYS[label] ?? label
    return {
      name: `Formulario sin «${label}»`,
      // Retirar, no "hacer opcional": el formulario público ya solo exige
      // nombre, teléfono y consentimiento.
      patch: { hiddenFields: [field] },
      justification: `${diagnosis.evidence[0]} Esta variante lo retira del formulario para comprobar si el envío sube sin perder calidad de lead.`,
    }
  }

  if (diagnosis.type === 'possible_message_mismatch') {
    const promise = typeof content.adCopy === 'string' ? content.adCopy : ''
    return {
      name: 'Hero con la promesa del anuncio',
      patch: { title: promise.split(/[.!?]/)[0]?.trim().slice(0, 120) || 'La promesa del anuncio, en el hero' },
      justification: `${diagnosis.evidence[0]} Esta variante lleva al hero la promesa concreta del anuncio para comprobar si el rebote baja.`,
    }
  }

  return {
    name: 'Hero más directo',
    patch: { title: typeof content.title === 'string' ? `${content.title}`.slice(0, 120) : 'Nueva propuesta de hero' },
    justification: `${diagnosis.evidence[0]} Esta variante prueba un hero más directo sobre el mismo público.`,
  }
}

const VARIANT_PROMPT = `Eres el estratega de conversión de una pyme española.
A partir de un diagnóstico con evidencia real, propones UNA variante de landing.

Reglas innegociables:
- La justificación cita la evidencia del diagnóstico. Nada de "mejorará la conversión".
- No inventes datos, cifras, garantías, precios ni testimonios.
- Solo puedes cambiar: title, offer, leadMagnet, adCopy, optionalFields.
- Español de España, tono del negocio, sin superlativos vacíos.

Devuelve SOLO JSON válido:
{"name":"...","justification":"...","patch":{"title":"..."}}`

async function llmProposal(diagnosis: LandingDiagnosis, content: Record<string, unknown>, brandContext: string) {
  const client = getClient()
  if (!client) return null

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 900,
      system: VARIANT_PROMPT,
      messages: [{
        role: 'user',
        content: JSON.stringify({
          diagnostico: { titulo: diagnosis.title, problema: diagnosis.problem, evidencia: diagnosis.evidence, recomendacion: diagnosis.recommendation },
          landingActual: content,
          contextoDeMarca: brandContext.slice(0, 4000),
        }),
      }],
    })
    const text = response.content.find(block => block.type === 'text')
    if (!text || text.type !== 'text') return null
    const parsed = JSON.parse(text.text.replace(/^```json\s*|\s*```$/g, '').trim())
    if (typeof parsed?.name !== 'string' || typeof parsed?.justification !== 'string' || !parsed?.patch) return null

    // Se filtra el parche contra la lista cerrada: el modelo no decide qué
    // campos son tocables.
    const patch: Record<string, unknown> = {}
    for (const field of PATCHABLE_FIELDS) {
      if (parsed.patch[field] !== undefined) patch[field] = parsed.patch[field]
    }
    if (!Object.keys(patch).length) return null

    return { name: parsed.name.slice(0, 140), justification: parsed.justification.slice(0, 1200), patch }
  } catch {
    // Un fallo del proveedor no puede dejar la página sin propuesta.
    return null
  }
}

async function brandContextFor(orgId: string) {
  const bases = await prisma.knowledgeBase.findMany({
    where: { orgId, isActive: true },
    select: { name: true, content: true },
    take: 5,
  })
  return bases.map(base => `${base.name}: ${base.content ?? ''}`).join('\n\n')
}

function nextKey(existing: string[]) {
  // 'a' queda reservada para el control: la versión publicada actual.
  const used = new Set(existing)
  for (const letter of 'bcdefghijklmnopqrstuvwxyz') {
    if (!used.has(letter)) return letter
  }
  throw new VariantError('Demasiadas variantes para esta landing.')
}

/**
 * Genera una variante a partir de un diagnóstico activo de la landing.
 *
 * No se puede generar "porque sí": si la landing no tiene diagnóstico, no hay
 * hipótesis que probar y el experimento no enseñaría nada.
 */
export async function generateVariant(orgId: string, actorUserId: string, landingKey: string, diagnosisType?: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { orgId, landingKey },
    select: { id: true, name: true, adAssets: true },
  })
  if (!campaign) throw new VariantError('Landing no encontrada')

  const version = await prisma.landingVersion.findFirst({
    where: { landingKey },
    orderBy: { version: 'desc' },
  })
  if (!version) throw new VariantError('La landing todavía no se ha servido: sin versión publicada no hay base sobre la que variar.')

  const diagnoses = await diagnoseOrganization(orgId)
  const candidates = diagnoses.filter(diagnosis => diagnosis.landingKey === landingKey)
  const diagnosis = diagnosisType
    ? candidates.find(item => item.type === diagnosisType)
    : candidates[0]
  if (!diagnosis) {
    throw new VariantError('Sin diagnóstico activo para esta landing: una variante sin hipótesis no enseña nada, gane o pierda.')
  }

  const content = version.content as Record<string, unknown>
  const proposal = await llmProposal(diagnosis, content, await brandContextFor(orgId))
    ?? deterministicProposal(diagnosis, content)

  const existing = await prisma.landingVariant.findMany({
    where: { landingKey },
    select: { key: true, patch: true, status: true, name: true },
  })

  // Proponer otra vez el mismo cambio que ya se está probando no aporta una
  // hipótesis nueva: solo llena la lista de duplicados.
  const duplicate = existing.find(item =>
    ['generated', 'pending_approval', 'active'].includes(item.status)
    && JSON.stringify(item.patch) === JSON.stringify(proposal.patch))
  if (duplicate) {
    throw new VariantError(`Ya existe una variante con este mismo cambio («${duplicate.name}», ${duplicate.status}). Decide sobre ella antes de proponer otra igual.`)
  }

  const variant = await prisma.landingVariant.create({
    data: {
      orgId,
      campaignId: campaign.id,
      landingKey,
      baseVersionId: version.id,
      key: nextKey(existing.map(item => item.key)),
      name: proposal.name,
      justification: proposal.justification,
      sourceDiagnosis: diagnosis.type,
      patch: proposal.patch as Prisma.InputJsonObject,
      status: VARIANT_STATUS.GENERATED,
      createdById: actorUserId,
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'landing.variant.generated',
    entityType: 'LandingVariant',
    entityId: variant.id,
    after: variant,
  })

  return variant
}

/**
 * Envía la variante a aprobación humana (N2). Toda variante pasa por aquí antes
 * de servirse a nadie: es la puerta que impide que un cambio automático llegue
 * a un visitante real sin que una persona lo haya visto.
 */
export async function requestVariantApproval(orgId: string, actorUserId: string, variantId: string) {
  const variant = await prisma.landingVariant.findFirst({ where: { id: variantId, orgId } })
  if (!variant) throw new VariantError('Variante no encontrada')
  if (variant.status !== VARIANT_STATUS.GENERATED) {
    throw new VariantError(`Una variante en estado «${variant.status}» no se puede enviar a aprobación.`)
  }

  const approval = await prisma.sensitiveApprovalRequest.create({
    data: {
      orgId,
      action: 'landing.variant.activate',
      requesterUserId: actorUserId,
      resourceType: 'LandingVariant',
      resourceId: variant.id,
      reason: variant.justification,
      payload: variant.patch as Prisma.InputJsonObject,
    },
  })

  return prisma.landingVariant.update({
    where: { id: variant.id },
    data: { status: VARIANT_STATUS.PENDING_APPROVAL, approvalRequestId: approval.id },
  })
}

export async function listVariants(orgId: string, landingKey?: string) {
  return prisma.landingVariant.findMany({
    where: { orgId, ...(landingKey ? { landingKey } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { baseVersion: { select: { version: true, publishedAt: true } } },
  })
}

export async function discardVariant(orgId: string, actorUserId: string, variantId: string, reason?: string) {
  const variant = await prisma.landingVariant.findFirst({ where: { id: variantId, orgId } })
  if (!variant) throw new VariantError('Variante no encontrada')
  if (variant.status === VARIANT_STATUS.ACTIVE) {
    throw new VariantError('Una variante activa se detiene parando el experimento, no descartándola.')
  }

  const discarded = await prisma.landingVariant.update({
    where: { id: variant.id },
    data: { status: VARIANT_STATUS.DISCARDED, decidedAt: new Date() },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'landing.variant.discarded',
    entityType: 'LandingVariant',
    entityId: variant.id,
    before: variant,
    after: { ...discarded, reason },
  })

  return discarded
}

/** Aplica el parche de una variante sobre el contenido de su versión base. */
export function applyPatch(content: Record<string, unknown>, patch: unknown) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return content
  const result = { ...content }
  for (const field of PATCHABLE_FIELDS) {
    const value = (patch as Record<string, unknown>)[field]
    if (value !== undefined) result[field] = value
  }
  return result
}
