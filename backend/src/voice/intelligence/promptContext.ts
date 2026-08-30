import { prisma } from '../../lib/prisma'
import { agentPlaybook, playbookDirective, type CallDirection } from '../agentPlaybooks'
import { callStrategy, strategyDirective } from '../callStrategies'
import { getBusinessProfileSource } from '../../services/businessProfile.service'

/**
 * Enriquecimiento del system prompt con lo que la organización ya sabe:
 * ficha del lead, historial, base de conocimiento y directrices de fases.
 * Un solo punto para simulador y telefonía real; todo capado en tamaño para
 * no inflar la latencia del LLM con contexto que no cabe en una llamada.
 */

const KNOWLEDGE_ENTRIES = 6
const KNOWLEDGE_CHARS_PER_ENTRY = 400
const NOTE_LIMIT = 3
/**
 * Hallazgos de auditoría que entran en el prompt. Tres son los que caben en una
 * llamada: el guion abre con uno y guarda los otros para cuando pregunten.
 */
const AUDIT_FINDINGS_LIMIT = 3

function cap(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

// ponytail: fases fijas de venta consultiva — playbook dinámico por agente
// cuando el modelo Playbook se enlace con Agent.
// El producto de voz es solo en inglés (decisión del 11/08/2026): el andamiaje
// del prompt también, para que el modelo no reciba instrucciones en un idioma
// y una orden de hablar en otro.
//
// Las fases ya no son fijas: cada tipo de agente trae las suyas desde
// `agentPlaybooks.ts`. Un recepcionista no "descubre la necesidad", atiende.

// El TTS no hace streaming: la primera frase no suena hasta estar sintetizada
// entera. Abrir con 3-4 palabras la deja en ~0,4 s de audio en vez de 1,5 s, y
// además esas fórmulas se repiten, así que el motor las sirve de su caché.
const OPENING_DIRECTIVE = `HOW TO SPEAK (this drives latency, respect it):
- Open every turn with a very short phrase of three or four words: "Absolutely.", "Got it.", "Good question.", "Sure, go ahead.". The content goes in the second sentence.
- Short sentences separated by full stops, never long paragraphs: the system starts speaking as soon as the first one is done.
- Two or three sentences per turn at most. This is a phone call, not an email.`

const SIGNAL_DIRECTIVE = `SIGNALS IN THE CONVERSATION:
- The caller's messages may carry a tone annotation, e.g. [tone: annoyed]. Adapt: annoyed → be brief and do not push; interested → move towards the close; confused → explain more simply; sad or uneasy → empathise before continuing. Never mention the annotation.
- If a message carries [uncertain transcript], confirm what you understood before answering ("Do you mean…?").`

/**
 * Forma de `DigitalAuditResult` que se usa aquí. Se declara suelta y laxa a
 * propósito: `LeadAudit.result` es un Json histórico y una auditoría vieja
 * puede no traer todos los campos. Lo que falte se omite; nada revienta.
 */
type StoredAudit = {
  website?: unknown
  webAlive?: unknown
  webInfo?: { isHttps?: unknown; loadMs?: unknown } | null
  publicScore?: unknown
  opportunities?: Array<{ title?: unknown; pitch?: unknown; impact?: unknown }> | null
  benchmark?: { sector?: unknown; city?: unknown; avgRating?: unknown; avgReviews?: unknown } | null
  auditedAt?: unknown
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/**
 * Hallazgos concretos de la web del prospecto.
 *
 * Es el gancho de la campaña: el guion abre con *"I ran a check on your website
 * this morning"*, y sin estos datos el agente no puede sostener esa frase — y
 * las reglas de voz le prohíben expresamente inventarse hechos de la empresa,
 * así que se quedaría mudo justo en la apertura.
 */
export function auditSection(audit: StoredAudit, fields: Record<string, unknown>): string | null {
  const lines: string[] = []

  const website = str(audit.website) ?? str(fields.website)
  if (website) lines.push(`Their website: ${website}`)

  const loadMs = num(audit.webInfo?.loadMs)
  // Google marca en rojo por encima de 2,5 s: por debajo no es argumento.
  if (loadMs && loadMs >= 2_500) lines.push(`Loads in ${(loadMs / 1000).toFixed(1)} seconds on the first request (Google flags anything over 2.5)`)
  if (audit.webAlive === false) lines.push('Their site did not respond when we checked it')
  if (audit.webInfo && audit.webInfo.isHttps === false) lines.push('No HTTPS: browsers show "Not secure" before visitors get in')

  const score = num(audit.publicScore)
  if (score !== null) lines.push(`Overall digital presence score: ${score}/100`)

  const findings = Array.isArray(audit.opportunities) ? audit.opportunities : []
  const ranked = findings
    .filter(item => str(item?.title))
    .sort((a, b) => (a?.impact === 'ALTO' ? -1 : 0) - (b?.impact === 'ALTO' ? -1 : 0))
    .slice(0, AUDIT_FINDINGS_LIMIT)
  for (const item of ranked) {
    const pitch = str(item.pitch)
    lines.push(`Issue: ${cap(str(item.title)!, 90)}${pitch ? ` — ${cap(pitch, 140)}` : ''}`)
  }

  // La comparación con su gremio y su ciudad convence más que cualquier nota:
  // es su número contra el de sus competidores, no una opinión nuestra.
  const avgRating = num(audit.benchmark?.avgRating)
  const avgReviews = num(audit.benchmark?.avgReviews)
  const theirRating = num(fields.rating)
  const theirReviews = num(fields.userRatingCount)
  if (avgRating !== null && theirRating !== null) {
    lines.push(`Google rating ${theirRating.toFixed(1)} vs ${avgRating.toFixed(1)} average for their trade in their city`)
  }
  if (avgReviews !== null && theirReviews !== null) {
    lines.push(`${theirReviews} reviews vs ${Math.round(avgReviews)} average for their trade`)
  }

  if (!lines.length) return null

  const when = str(audit.auditedAt)?.slice(0, 10)
  return [
    `WEBSITE AUDIT${when ? ` (run on ${when})` : ''} — these are measured facts about THEIR business:`,
    ...lines.map(line => `- ${line}`),
    'Use ONE of these to open, the strongest one. Keep the rest for when they ask.',
    'Say the number, not the jargon: "it takes six and a half seconds to load", never "poor Core Web Vitals".',
    'Never state a figure that is not on this list.',
  ].join('\n')
}

async function leadSection(orgId: string, leadId: string): Promise<string | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId },
    select: {
      name: true, company: true, source: true, status: true, attempts: true, tags: true,
      // Trae web, sector, ciudad y las señales de Places. Sin esto el agente
      // llama sin saber nada del negocio al que está llamando.
      customFields: true,
    },
  })
  if (!lead) return null

  const [notes, lastCall] = await Promise.all([
    prisma.leadNote.findMany({
      where: { leadId, orgId },
      orderBy: { createdAt: 'desc' },
      take: NOTE_LIMIT,
      select: { text: true, createdAt: true },
    }),
    prisma.call.findFirst({
      where: { leadId, orgId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { summary: true, outcome: true, sentiment: true, createdAt: true },
    }),
  ])

  const fields = (lead.customFields ?? {}) as Record<string, unknown>
  const trade = str(fields.sector)
  const city = str(fields.city)

  // `auditLead` deja el resultado en dos sitios: dentro de customFields y en la
  // tabla LeadAudit. Se prefiere el de customFields porque ya está cargado —
  // en una llamada en directo, una consulta menos antes del primer turno.
  let audit = (fields.digitalAudit ?? null) as StoredAudit | null
  if (!audit) {
    const stored = await prisma.leadAudit.findFirst({
      where: { leadId, orgId },
      orderBy: { createdAt: 'desc' },
      select: { result: true },
    })
    audit = (stored?.result ?? null) as StoredAudit | null
  }

  const lines = [
    `Name: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
    trade || city ? `Business: ${[trade, city].filter(Boolean).join(' in ')}` : null,
    lead.source ? `Source: ${lead.source}` : null,
    `CRM status: ${lead.status} · previous contact attempts: ${lead.attempts}`,
    lead.tags.length ? `Tags: ${lead.tags.join(', ')}` : null,
    lastCall?.summary ? `Last call (${lastCall.createdAt.toISOString().slice(0, 10)}): ${cap(lastCall.summary, 300)}${lastCall.outcome !== 'none' ? ` · outcome: ${lastCall.outcome}` : ''}` : null,
    ...notes.map(note => `Note (${note.createdAt.toISOString().slice(0, 10)}): ${cap(note.text, 200)}`),
  ].filter(Boolean)

  return [
    `CUSTOMER CONTEXT (use it naturally, do not recite it):\n${lines.join('\n')}`,
    audit ? auditSection(audit, fields) : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function knowledgeSection(orgId: string): Promise<string | null> {
  const entries = await prisma.knowledgeBase.findMany({
    where: { orgId, isActive: true, content: { not: null } },
    orderBy: { updatedAt: 'desc' },
    take: KNOWLEDGE_ENTRIES,
    select: { name: true, content: true },
  })
  if (!entries.length) return null

  const body = entries
    .map(entry => `- ${entry.name}: ${cap(entry.content ?? '', KNOWLEDGE_CHARS_PER_ENTRY)}`)
    .join('\n')
  return `SUPPLEMENTARY KNOWLEDGE BASE (documents, processes and detailed answers):\n${body}\nUse this after the structured company profile. If sources conflict, the structured company profile wins for prices and commercial terms.`
}

function money(priceCents: number | null, currency: string): string {
  if (priceCents === null) return 'Price on request'
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(priceCents / 100)
}

const PERIOD_LABEL: Record<string, string> = {
  one_time: 'one-time', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly', custom: 'custom period',
}

export function renderBusinessProfilePrompt(source: NonNullable<Awaited<ReturnType<typeof getBusinessProfileSource>>>): string {
  const { company, profile } = source
  const offers = profile.offers.filter(offer => offer.active && offer.name.trim())
  const lines = [
    `Company: ${company.name}`,
    company.industry ? `Industry: ${company.industry}` : null,
    profile.description ? `What the company does: ${cap(profile.description, 700)}` : null,
    profile.idealCustomer ? `Ideal customer: ${cap(profile.idealCustomer, 500)}` : null,
    profile.valueProposition ? `Value proposition: ${cap(profile.valueProposition, 500)}` : null,
    profile.differentiators.length ? `Differentiators: ${profile.differentiators.map(item => cap(item, 180)).join('; ')}` : null,
    company.website ? `Website: ${company.website}` : null,
    company.phone ? `Contact phone: ${company.phone}` : null,
    offers.length ? `OFFERS AND EXACT PRICES:\n${offers.map(offer => {
      const included = offer.includes.length ? ` Includes: ${offer.includes.map(item => cap(item, 140)).join('; ')}.` : ''
      const conditions = offer.conditions ? ` Conditions: ${cap(offer.conditions, 300)}.` : ''
      return `- ${offer.name}: ${money(offer.priceCents, offer.currency)} ${PERIOD_LABEL[offer.billingPeriod] ?? offer.billingPeriod}. ${cap(offer.description, 350)}.${included}${conditions}`
    }).join('\n')}` : 'OFFERS AND EXACT PRICES: No active offers are configured. Never quote a price.',
    profile.commercialGuardrails.discountPolicy ? `Discount policy: ${cap(profile.commercialGuardrails.discountPolicy, 500)}` : null,
    profile.commercialGuardrails.paymentTerms ? `Payment terms: ${cap(profile.commercialGuardrails.paymentTerms, 500)}` : null,
    profile.commercialGuardrails.guarantees ? `Guarantees: ${cap(profile.commercialGuardrails.guarantees, 500)}` : null,
    profile.commercialGuardrails.forbiddenClaims ? `Forbidden claims: ${cap(profile.commercialGuardrails.forbiddenClaims, 700)}` : null,
  ].filter(Boolean)
  return `AUTHORITATIVE COMPANY PROFILE (shared by every agent):\n${lines.join('\n')}\nNever invent, infer or round a price, discount, deadline, guarantee or included service. If it is not stated here, say you need to confirm it.`
}

/**
 * Persona por defecto cuando el playbook no trae `base_prompt`.
 *
 * Antes, un playbook sin guion dejaba el prompt sin ninguna línea de identidad
 * y la persona de respaldo del motor se presentaba con una marca fija. El
 * nombre de la empresa sale del perfil de negocio de la propia organización,
 * así que el agente nunca dice una marca que no sea la del cliente.
 */
export function defaultPersona(agentName?: string | null, companyName?: string | null): string | null {
  const company = companyName?.trim()
  if (!company) return null
  const name = agentName?.trim() || 'Alex'
  return `You are ${name}, an AI voice assistant calling on behalf of ${company}.`
}

export function renderAgentOperatingNotes(options: {
  keyMessages?: string | null
  escalationRules?: string | null
  customPlaybook?: string | null
}): string | null {
  const keyMessages = options.keyMessages?.trim()
  const escalationRules = options.escalationRules?.trim()
  const customPlaybook = options.customPlaybook?.trim()
  const sections = [
    customPlaybook ? `CUSTOM ORGANIZATION PLAYBOOK (follow it inside the role and call strategy):\n${cap(customPlaybook, 4_500)}` : null,
    keyMessages ? `PRIORITY MESSAGES (use only when relevant; do not recite them):\n${cap(keyMessages, 2_000)}` : null,
    escalationRules ? `CUSTOM ESCALATION RULES:\n${cap(escalationRules, 2_000)}` : null,
  ].filter(Boolean)
  return sections.length ? sections.join('\n\n') : null
}

const FORMALITY_DIRECTIVE: Record<string, string> = {
  tu: 'Address the person informally (Spanish "tú", first name, relaxed register).',
  usted: 'Address the person formally ("usted" in Spanish, surname and courtesy title if you know it). Never slip into informal address.',
}

const VERBOSITY_DIRECTIVE: Record<string, string> = {
  brief: 'One or two short sentences per turn. Answer, then hand the turn back.',
  balanced: 'Two or three sentences per turn: enough to explain, never a monologue.',
  detailed: 'Up to four sentences when you are explaining something the person asked about; stay short everywhere else.',
}

/**
 * Comportamiento configurado por el usuario en el alta del agente
 * (Agent.settings.behavior). Se renderiza al final del prompt: lo que el
 * cliente configura pesa más que las directivas genéricas de estilo.
 */
export function renderBehaviorNotes(behavior: unknown): string | null {
  if (!behavior || typeof behavior !== 'object' || Array.isArray(behavior)) return null
  const value = (key: string): string => {
    const raw = (behavior as Record<string, unknown>)[key]
    return typeof raw === 'string' ? raw.trim() : ''
  }
  const lines = [
    FORMALITY_DIRECTIVE[value('formality')] ?? null,
    VERBOSITY_DIRECTIVE[value('verbosity')] ?? null,
    value('openingLine') ? `Open the call with this exact sentence, then continue naturally: "${cap(value('openingLine'), 300)}"` : null,
    value('structure') ? `Follow this call structure unless the person derails it: ${cap(value('structure'), 2_000)}` : null,
    value('doNotSay') ? `NEVER say or promise the following, under any phrasing: ${cap(value('doNotSay'), 1_000)}` : null,
  ].filter(Boolean)
  return lines.length ? `AGENT BEHAVIOUR CONFIGURED BY THE CUSTOMER (overrides the generic style rules above):\n${lines.map(line => `- ${line}`).join('\n')}` : null
}

export async function buildIntelligentPrompt(options: {
  orgId: string
  basePrompt: string
  leadId?: string | null
  agentType?: string | null
  direction?: CallDirection
  strategyId?: string | null
  keyMessages?: string | null
  escalationRules?: string | null
  customPlaybook?: string | null
  behavior?: unknown
  /** Nombre configurado del agente, para la persona por defecto. */
  agentName?: string | null
}): Promise<string> {
  const { orgId, basePrompt, leadId, agentType, direction = 'outbound' } = options
  const playbook = agentPlaybook(agentType)
  const strategy = callStrategy(options.strategyId, playbook.type, direction)
  const sections: Array<string | null> = [basePrompt.trim() || null]

  try {
    const [lead, profileSource, knowledge] = await Promise.all([
      leadId ? leadSection(orgId, leadId) : Promise.resolve(null),
      getBusinessProfileSource(orgId),
      knowledgeSection(orgId),
    ])
    // Sin guion propio, la identidad se compone con la empresa real de la
    // organización en lugar de dejar que actúe la persona de respaldo.
    if (!sections[0]) sections[0] = defaultPersona(options.agentName, profileSource?.company.name)
    sections.push(lead, profileSource ? renderBusinessProfilePrompt(profileSource) : null, knowledge)
  } catch (error) {
    // El contexto es mejora, no requisito: sin BD la llamada sale igual.
    console.warn('[VOICE_PROMPT] context enrichment failed:', error)
  }

  sections.push(
    playbookDirective(playbook, direction),
    strategyDirective(strategy),
    renderAgentOperatingNotes(options),
    SIGNAL_DIRECTIVE,
    OPENING_DIRECTIVE,
    renderBehaviorNotes(options.behavior),
  )
  return sections.filter(Boolean).join('\n\n')
}
