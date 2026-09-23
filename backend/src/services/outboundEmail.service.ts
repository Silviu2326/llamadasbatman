import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { assertEmailSendAllowed } from '../lib/emailCompliance'
import { assertConsumptionLimit } from '../access-control/consumption'
import { reviewPiece, type CriticReport } from './contentCritic.service'
import { extractBrandFacts } from './contentSpecificity.service'
import { getOwnerVoice, voiceInstructions } from './ownerVoice.service'
import { sendTransactionalEmailDetailed, isTransactionalEmailConfigured } from './transactionalEmail.service'
import { createNativeEmailDeliverySnapshot } from './nativeMarketingEmail.service'
import { ensureConversationForLead } from './conversations.service'
import { researchProspect, type ProspectResearch } from './prospectResearch.service'
import { writeColdEmail, type CopyResult } from './emailCopy.service'
import { isSafeToSend, verdictForLead } from './emailDiscovery.service'
import type { DigitalAuditResult, Opportunity } from './digitalAudit.service'

/**
 * Email frío escrito por lead a partir de su auditoría digital.
 *
 * La diferencia con una campaña de marketing es el destinatario de una sola
 * persona: aquí el cuerpo es distinto en cada envío, así que no puede ser una
 * plantilla remota. Va por el proveedor transaccional y se registra igual —
 * `EmailDelivery` y `Message`— para que las métricas y la bandeja de entrada
 * sigan viendo lo mismo que ven de las campañas.
 *
 * La regla que sostiene todo esto: **los hallazgos los pone el código, no el
 * modelo**. Se extraen de `digitalAudit` y se le entregan como lista cerrada.
 * El modelo redacta sobre ellos y nada más. Un email frío que se inventa un
 * defecto de la web del destinatario no es una torpeza, es la manera más
 * rápida de quemar un dominio y una marca.
 */

const MAX_FINDINGS = 3
const SUBJECT_MAX = 90

export interface OutboundFinding {
  title: string
  pitch: string
  impact: string
  product: string
}

export interface OutboundDraft {
  leadId: string
  subject: string
  preheader: string
  body: string
  /** Los hallazgos reales sobre los que se ha escrito, para poder auditarlo. */
  findings: OutboundFinding[]
  /** Lo que la cadena de investigación verificó de su web. Vacío si no hubo. */
  research: ProspectResearch | null
  /** Las tres versiones, sus notas y cuál ganó. `null` sin clave de modelo. */
  copy: CopyResult | null
  report: CriticReport | null
  /** Motivo por el que este borrador no se puede enviar. `null` = enviable. */
  blocked: string | null
  /** `false` cuando no había clave de modelo y el cuerpo es el de respaldo. */
  written: boolean
}

export class OutboundEmailError extends Error {
  constructor(public code: string, message: string, public statusCode = 400) {
    super(message)
    this.name = 'OutboundEmailError'
  }
}

function readAudit(customFields: unknown): DigitalAuditResult | null {
  const fields = customFields && typeof customFields === 'object' && !Array.isArray(customFields)
    ? customFields as Record<string, unknown>
    : {}
  const audit = fields.digitalAudit
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) return null
  const candidate = audit as Partial<DigitalAuditResult>
  return typeof candidate.summary === 'string' ? candidate as DigitalAuditResult : null
}

/**
 * Los hallazgos que merecen un email: los de mayor severidad primero y como
 * mucho tres. Un correo frío con siete problemas se lee como un informe
 * automático, que es justo lo que es cuando lleva siete.
 */
export function selectFindings(audit: DigitalAuditResult): OutboundFinding[] {
  const weight: Record<Opportunity['severity'], number> = { high: 3, medium: 2, low: 1 }
  return [...(audit.opportunities ?? [])]
    .sort((a, b) => (weight[b.severity] ?? 0) - (weight[a.severity] ?? 0))
    .slice(0, MAX_FINDINGS)
    .map(opportunity => ({
      title: opportunity.title,
      pitch: opportunity.pitch,
      impact: opportunity.impact,
      product: opportunity.product,
    }))
}

/**
 * Cuerpo determinista con los mismos hallazgos, para cuando no hay clave de
 * modelo. No es un email bonito, pero es cierto y se puede mandar; la
 * alternativa —no tener nada— es peor y esconde que falta configuración.
 */
function fallbackBody(businessName: string, findings: OutboundFinding[], senderName: string) {
  return [
    `Hola, ${businessName}:`,
    '',
    'He revisado vuestra presencia digital y he anotado esto:',
    ...findings.map(finding => `- ${finding.title}: ${finding.pitch}`),
    '',
    '¿Te viene bien que te lo cuente en diez minutos?',
    '',
    senderName,
  ].join('\n')
}

/**
 * Token de baja: HMAC del lead con un secreto del servidor. Sin tabla —no hace
 * falta guardar nada para verificarlo— y no se puede adivinar ni derivar de un
 * id de lead. Rotar el secreto invalida todos los enlaces de golpe.
 */
export function unsubscribeToken(leadId: string): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || ''
  return createHmac('sha256', secret).update(`unsubscribe:${leadId}`).digest('base64url').slice(0, 32)
}

export function verifyUnsubscribeToken(leadId: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(leadId))
  const received = Buffer.from(token ?? '')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/**
 * Un email frío sin salida es spam, aquí y ante la ley. El enlace de baja no
 * es opcional ni configurable: se compone siempre y, si no hay dirección
 * pública con la que componerlo, el envío se bloquea antes de salir.
 */
export function unsubscribeUrl(leadId: string): string | null {
  const base = (process.env.PUBLIC_HOST || process.env.APP_URL || '').trim().replace(/\/$/, '')
  if (!base) return null
  return `${base}/api/public/email/unsubscribe/${leadId}/${unsubscribeToken(leadId)}`
}

function textToHtml(text: string, optOutUrl: string) {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111">${
    escape(text).split(/\n{2,}/).map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`).join('')
  }<p style="margin-top:28px;font-size:12px;color:#666">Si no quieres recibir más correos nuestros, <a href="${escape(optOutUrl)}" style="color:#666">dilo aquí</a> y no volvemos a escribirte.</p></div>`
}

/**
 * Redacta —sin enviar— el email para un lead. Se puede llamar tantas veces
 * como se quiera: no toca nada, solo devuelve el borrador y por qué no se
 * podría mandar, si es que no se puede.
 */
/**
 * Lo que ya se le mandó a este lead desde aquí, de lo más antiguo a lo más
 * reciente. Es lo que convierte el segundo email en un seguimiento y no en
 * otro email frío escrito como si el primero no existiera.
 */
async function previousOutboundEmails(orgId: string, leadId: string) {
  const messages = await prisma.message.findMany({
    where: { orgId, leadId, channel: 'email', direction: 'outbound' },
    orderBy: { createdAt: 'asc' },
    take: 6,
    select: { body: true, sentAt: true, createdAt: true, metadata: true },
  })
  return messages
    .filter(message => (message.metadata as Record<string, unknown> | null)?.source === 'outbound_ai')
    .map(message => {
      // Se guardó como "asunto\n\ncuerpo"; se parte para que el redactor vea
      // los asuntos anteriores y no repita ninguno.
      const [subject, ...rest] = (message.body ?? '').split('\n\n')
      const metadata = (message.metadata as Record<string, unknown> | null) ?? {}
      return {
        subject: (subject ?? '').trim(),
        body: rest.join('\n\n').trim(),
        sentAt: (message.sentAt ?? message.createdAt).toISOString(),
        strategyId: typeof metadata.strategyId === 'string' ? metadata.strategyId : undefined,
      }
    })
}

export async function draftOutboundEmail(
  orgId: string,
  leadId: string,
  opts: { tone?: string; research?: boolean; remainingAttempts?: number } = {}
): Promise<OutboundDraft> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId } })
  if (!lead) throw new OutboundEmailError('LEAD_NOT_FOUND', 'El lead no existe o no pertenece a la organización.', 404)

  const audit = readAudit(lead.customFields)
  if (!audit) {
    throw new OutboundEmailError(
      'AUDIT_REQUIRED',
      'Este lead no tiene auditoría digital. Sin hallazgos reales no se escribe un email frío: audítalo primero.',
    )
  }
  const findings = selectFindings(audit)
  if (!findings.length) {
    throw new OutboundEmailError(
      'NO_FINDINGS',
      'La auditoría no encontró nada que contar. Escribir de todas formas sería escribir humo.',
    )
  }

  const customFields = (lead.customFields as Record<string, unknown>) ?? {}
  const website = (customFields.website as string | undefined) ?? audit.website ?? null
  const businessName = lead.company || lead.name
  const [org, brandFacts, voice, previous, research] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, phone: true, email: true } }),
    extractBrandFacts(orgId),
    getOwnerVoice(orgId),
    previousOutboundEmails(orgId, leadId),
    // La investigación se rehace en cada borrador: es lo que hace que el email
    // hable del negocio de hoy y no del de la semana en que se importó.
    opts.research === false || !website
      ? Promise.resolve(null)
      : researchProspect(website, audit.summary, businessName, {
        city: (customFields.city as string | undefined) ?? null,
        sector: (customFields.sector as string | undefined) ?? null,
        orgId,
      }),
  ])
  const senderOrg = org?.name ?? 'nuestra agencia'

  // Tres versiones, un juez y un editor. Ver emailCopy.service.
  const written = await writeColdEmail({
    businessName,
    sector: (customFields.sector as string | undefined) ?? null,
    city: (customFields.city as string | undefined) ?? null,
    senderOrg,
    findings,
    auditSummary: audit.summary,
    research,
    voice: voiceInstructions(voice),
    // Solo los hechos de marca que sirven para contar un caso. Sin ellos la
    // estrategia "caso parecido" ni se ofrece: prometer un resultado que no
    // ocurrió es la única forma de que este sistema mienta.
    caseMaterial: brandFacts
      .filter(fact => fact.kind === 'experiencia' || fact.kind === 'volumen' || fact.kind === 'garantia')
      .map(fact => `${fact.text} (${fact.sourceName})`)
      .slice(0, 6),
    kind: previous.length ? 'followup' : 'outbound',
    previousEmails: previous,
    remainingAttempts: opts.remainingAttempts,
  })

  const draft = written ?? {
    subject: `${findings[0].title} — ${businessName}`.slice(0, SUBJECT_MAX),
    preheader: audit.summary.slice(0, 140),
    body: fallbackBody(businessName, findings, senderOrg),
  }

  // Mismo editor adversario que el contenido publicado: PII bloqueante,
  // especificidad contra la base de conocimiento y crítica con reescritura que
  // vuelve a pasar los dos pasos anteriores.
  const { body: reviewed, report } = await reviewPiece('email', draft as unknown as Record<string, unknown>, {
    // La evidencia que ve el crítico incluye lo investigado: si no, marcaría
    // como vaguedad sin resolver justamente lo que sí está verificado.
    evidence: [audit.summary, ...(research?.facts ?? []).map(fact => fact.claim)].join('. '),
    facts: brandFacts,
    voice: voiceInstructions(voice),
    own: { phone: org?.phone, email: org?.email },
    orgId,
  })

  const consent = lead.email ? await assertEmailSendAllowed(orgId, leadId, 'marketing') : { allowed: false as const, reason: 'no_email' }
  const blocked = !lead.email
    ? 'El lead no tiene email.'
    : !consent.allowed
      ? `El consentimiento no permite escribirle (${consent.reason}).`
      : report.pii.blocking
        ? 'El borrador contenía datos personales y se han enmascarado: revísalo antes de enviarlo.'
        : !await isTransactionalEmailConfigured(orgId)
          ? 'Conecta el proveedor de email y una dirección remitente verificada para tu organización.'
          : !unsubscribeUrl(leadId)
            ? 'Falta PUBLIC_HOST o APP_URL: sin enlace de baja no se manda un email frío.'
            : null

  return {
    leadId,
    subject: String(reviewed.subject ?? draft.subject),
    preheader: String(reviewed.preheader ?? ''),
    body: String(reviewed.body ?? draft.body),
    findings,
    research,
    copy: written,
    report,
    blocked,
    written: written !== null,
  }
}

/**
 * Vuelve a pasar por el editor adversario un borrador editado a mano. Que lo
 * escriba una persona no exime: la PII se enmascara igual, y el que la mete no
 * suele ser el modelo sino quien pega un dato de otro cliente sin darse cuenta.
 */
export async function reviewEditedDraft(
  orgId: string,
  draft: OutboundDraft,
  edits: { subject?: string; body?: string }
): Promise<OutboundDraft> {
  const [org, facts, voice] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { phone: true, email: true } }),
    extractBrandFacts(orgId),
    getOwnerVoice(orgId),
  ])
  const candidate = {
    subject: edits.subject ?? draft.subject,
    preheader: draft.preheader,
    body: edits.body ?? draft.body,
  }
  const { body: reviewed, report } = await reviewPiece('email', candidate as unknown as Record<string, unknown>, {
    evidence: draft.findings.map(finding => finding.title).join('; '),
    facts,
    voice: voiceInstructions(voice),
    own: { phone: org?.phone, email: org?.email },
    orgId,
  })
  return {
    ...draft,
    subject: String(reviewed.subject ?? candidate.subject),
    body: String(reviewed.body ?? candidate.body),
    report,
    blocked: report.pii.blocking ? 'El texto editado contenía datos personales y se han enmascarado: revísalo antes de enviarlo.' : draft.blocked,
  }
}

export interface OutboundSendResult {
  deliveryId: string
  status: 'accepted' | 'failed'
  subject: string
  messageId: string | null
}

/**
 * Envía el email de un lead. Si no se le pasa borrador lo redacta en el
 * momento — así un paso de secuencia escribe con la auditoría del día en que
 * toca escribir, no con la del día en que se configuró la secuencia.
 *
 * `idempotencyScope` decide qué es "el mismo email": dos llamadas con el mismo
 * ámbito reutilizan el envío y no escriben dos veces.
 */
export async function sendOutboundEmail(
  orgId: string,
  leadId: string,
  opts: { draft?: OutboundDraft; idempotencyScope?: string; actorUserId?: string; remainingAttempts?: number } = {}
): Promise<OutboundSendResult> {
  const draft = opts.draft ?? await draftOutboundEmail(orgId, leadId, { remainingAttempts: opts.remainingAttempts })
  if (draft.blocked) throw new OutboundEmailError('DRAFT_BLOCKED', draft.blocked)

  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { id: true, email: true } })
  if (!lead?.email) throw new OutboundEmailError('LEAD_EMAIL_MISSING', 'El lead no tiene email.')

  // Se vuelve a comprobar aquí y no solo al redactar: entre el borrador y el
  // clic pudo llegar una baja, y esa es exactamente la carrera que hay que perder.
  const consent = await assertEmailSendAllowed(orgId, leadId, 'marketing')
  if (!consent.allowed) throw new OutboundEmailError('EMAIL_NOT_ALLOWED', `El consentimiento no permite escribirle (${consent.reason}).`)

  // Verificación del buzón antes de gastar cuota o crear la entrega. Sin esto
  // el rebote sube al 8-10 % y los dominios de envío se queman en dos semanas,
  // que es un daño que no se arregla dejando de enviar después.
  const verdict = await verdictForLead(orgId, leadId, lead.email)
  if (!isSafeToSend(verdict)) {
    throw new OutboundEmailError(
      'EMAIL_UNVERIFIED',
      `El buzón no se pudo confirmar (${verdict}): enviarle quemaría la reputación del dominio.`
    )
  }

  // Techo de gasto del plan, antes de crear la entrega para no contar como
  // enviado algo que no va a salir.
  try {
    await assertConsumptionLimit(orgId, 'emails_sent', 1)
  } catch (error) {
    throw new OutboundEmailError('CONSUMPTION_LIMIT_REACHED', (error as Error).message)
  }

  const scope = opts.idempotencyScope ?? `outbound:${leadId}`
  const optOutUrl = unsubscribeUrl(leadId)
  if (!optOutUrl) throw new OutboundEmailError('UNSUBSCRIBE_URL_MISSING', 'Falta PUBLIC_HOST o APP_URL: sin enlace de baja no se manda un email frío.')
  const delivery = await createNativeEmailDeliverySnapshot({ orgId, leadId, toAddress: lead.email, idempotencyScope: scope, subject: draft.subject, html: textToHtml(draft.body, optOutUrl), purpose: 'marketing' })
  if (delivery.status === 'accepted' || delivery.status === 'delivered') {
    return { deliveryId: delivery.id, status: 'accepted', subject: draft.subject, messageId: null }
  }

  const now = new Date()
  await prisma.emailDelivery.updateMany({
    where: { id: delivery.id, status: 'queued' },
    data: { status: 'processing', providerAttemptedAt: now, attempts: { increment: 1 } },
  })

  const sent = await sendTransactionalEmailDetailed({
    to: lead.email,
    subject: draft.subject,
    html: textToHtml(draft.body, optOutUrl),
    // Ledger de consumo: email frío, no aviso de sistema.
    idempotencyKey: delivery.idempotencyKey,
    usage: { orgId, capability: 'email.outbound' },
  })
  if (sent.status !== 'accepted') {
    await prisma.emailDelivery.updateMany({
      where: { id: delivery.id },
      data: { status: sent.status === 'uncertain' ? 'uncertain' : 'failed', failedAt: new Date(), failureCode: sent.status === 'uncertain' ? 'PROVIDER_OUTCOME_UNKNOWN' : 'PROVIDER_REJECTED', failureDetail: sent.status === 'uncertain' ? 'No se pudo confirmar si Resend aceptó el email.' : 'El proveedor transaccional no aceptó el email.' },
    })
    return { deliveryId: delivery.id, status: 'failed', subject: draft.subject, messageId: null }
  }

  await prisma.emailDelivery.updateMany({
    where: { id: delivery.id },
    data: { status: 'accepted', acceptedAt: new Date(), providerMessageId: sent.id },
  })

  // La bandeja de entrada tiene que ver el email que salió: si no, el equipo
  // llama a un lead sin saber qué se le escribió esta mañana.
  const conversation = await ensureConversationForLead(orgId, leadId)
  const message = await prisma.message.create({
    data: {
      orgId,
      conversationId: conversation.id,
      leadId,
      authorUserId: opts.actorUserId,
      channel: 'email',
      provider: 'resend',
      address: lead.email,
      direction: 'outbound',
      contentType: 'text',
      body: `${draft.subject}\n\n${draft.body}`,
      status: 'sent',
      sentAt: new Date(),
      metadata: {
        source: 'outbound_ai',
        deliveryId: delivery.id,
        findings: draft.findings.map(finding => finding.title),
        // La estrategia se guarda para que el siguiente seguimiento sepa qué
        // se probó ya y no repita el enfoque que no funcionó.
        strategyId: draft.copy?.variants[draft.copy.winner]?.strategyId,
      },
    },
    select: { id: true },
  })

  return { deliveryId: delivery.id, status: 'accepted', subject: draft.subject, messageId: message.id }
}





