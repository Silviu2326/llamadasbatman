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

/** Fichas de conocimiento que entran en el prompt (las mejor puntuadas). */
export const KNOWLEDGE_ENTRIES = 8
/** Caracteres por ficha. Antes eran 400: un PDF de tarifas quedaba en su portada. */
export const KNOWLEDGE_CHARS_PER_ENTRY = 1_500
/** Candidatas que se leen de la base antes de puntuar. */
const KNOWLEDGE_CANDIDATES = 60
/**
 * Presupuesto global del system prompt en caracteres (~6k tokens). Por encima
 * se recortan proporcionalmente las secciones de contexto (conocimiento,
 * lead, perfil, guion propio); las directivas fijas y el guion base no.
 */
export const PROMPT_CHAR_BUDGET = (() => {
  const raw = Number(process.env.PROMPT_CHAR_BUDGET)
  return Number.isFinite(raw) && raw >= 4_000 ? Math.floor(raw) : 24_000
})()
/** Por debajo de esto una sección recortada ya no dice nada útil. */
const SECTION_MIN_CHARS = 240
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

// ---------------------------------------------------------------------------
// Base de conocimiento: selección por relevancia, no por fecha.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(('de la que el en y a los del se las por un para con no una su al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros ' +
  'the of and to in a is that for on with as it by this be are from or an at was were which their has have not but its can will our you your they them he she we all any into than then so if about more').split(/\s+/).filter(Boolean))

/** Minúsculas sin acentos, troceado en palabras de tres letras o más. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9ñ]+/)
    .filter(token => token.length >= 3 && !STOPWORDS.has(token))
}

export interface KnowledgeCandidate {
  id: string
  name: string
  content: string
  updatedAt?: Date | string | null
}

export interface RankedKnowledge extends KnowledgeCandidate {
  score: number
  /** Extracto elegido alrededor de la primera coincidencia. */
  snippet: string
}

function bestWindow(content: string, tokens: string[], size: number): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  if (clean.length <= size) return clean
  const haystack = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let first = -1
  for (const token of tokens) {
    const index = haystack.indexOf(token)
    if (index !== -1 && (first === -1 || index < first)) first = index
  }
  // Sin coincidencia (o coincidencia al principio): el arranque del documento,
  // que es donde suele estar el resumen.
  if (first <= size / 2) return cap(clean, size)
  let start = Math.max(0, first - Math.floor(size / 4))
  const boundary = clean.lastIndexOf(' ', start)
  if (boundary > 0 && start - boundary < 80) start = boundary + 1
  return `…${cap(clean.slice(start), size - 1)}`
}

/**
 * Ranking léxico simple: cuántas palabras de la consulta aparecen en el
 * título (peso 3) y en el contenido (peso 1, hasta cinco apariciones por
 * palabra). Sin consulta, o con empate, gana la ficha actualizada más
 * recientemente. Es deliberadamente simple: corre en cada llamada antes del
 * primer turno y no puede depender de un servicio externo de embeddings.
 */
export function rankKnowledgeEntries(entries: KnowledgeCandidate[], query: string, options: { limit?: number; charsPerEntry?: number } = {}): RankedKnowledge[] {
  const limit = options.limit ?? KNOWLEDGE_ENTRIES
  const charsPerEntry = options.charsPerEntry ?? KNOWLEDGE_CHARS_PER_ENTRY
  const tokens = [...new Set(tokenize(query))]
  const scored = entries.map(entry => {
    const title = tokenize(entry.name)
    const body = entry.content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    let score = 0
    for (const token of tokens) {
      if (title.includes(token)) score += 3
      let count = 0
      let from = 0
      while (count < 5) {
        const index = body.indexOf(token, from)
        if (index === -1) break
        count += 1
        from = index + token.length
      }
      score += count
    }
    return { ...entry, score, snippet: bestWindow(entry.content, tokens, charsPerEntry) }
  })
  const time = (value: KnowledgeCandidate['updatedAt']): number => {
    const date = value instanceof Date ? value : value ? new Date(value) : null
    return date && Number.isFinite(date.getTime()) ? date.getTime() : 0
  }
  return scored
    .sort((a, b) => b.score - a.score || time(b.updatedAt) - time(a.updatedAt))
    .slice(0, limit)
}

/** Ids de fichas elegidas para un agente, o null cuando usa todas las de la organización. */
export function knowledgeIdsFromSettings(settings: unknown): string[] | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null
  const raw = (settings as Record<string, unknown>).knowledgeIds
  if (!Array.isArray(raw)) return null
  const ids = raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return ids.length ? ids : null
}

export interface KnowledgeSectionOptions {
  /** Restringe a estas fichas (Agent.settings.knowledgeIds). Null o vacío = todas. */
  knowledgeIds?: string[] | null
  /** Texto contra el que se puntúa: nombre, sector, objetivo, último turno. */
  query?: string
}

export interface KnowledgeSectionResult {
  text: string | null
  entries: Array<{ id: string; name: string; score: number; chars: number }>
  /** Fichas candidatas que había antes de puntuar. */
  candidates: number
}

export async function knowledgeSection(orgId: string, options: KnowledgeSectionOptions = {}): Promise<KnowledgeSectionResult> {
  const ids = options.knowledgeIds?.length ? options.knowledgeIds : null
  const rows = await prisma.knowledgeBase.findMany({
    where: { orgId, isActive: true, content: { not: null }, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: KNOWLEDGE_CANDIDATES,
    select: { id: true, name: true, content: true, updatedAt: true },
  })
  const candidates = rows
    .map(row => ({ id: row.id, name: row.name, content: (row.content ?? '').trim(), updatedAt: row.updatedAt }))
    .filter(row => row.content.length > 0)
  if (!candidates.length) return { text: null, entries: [], candidates: 0 }

  const ranked = rankKnowledgeEntries(candidates, options.query ?? '')
  const body = ranked.map(entry => `- ${entry.name}: ${entry.snippet}`).join('\n')
  return {
    text: `SUPPLEMENTARY KNOWLEDGE BASE (documents, processes and detailed answers):\n${body}\nUse this after the structured company profile. If sources conflict, the structured company profile wins for prices and commercial terms.`,
    entries: ranked.map(entry => ({ id: entry.id, name: entry.name, score: entry.score, chars: entry.snippet.length })),
    candidates: candidates.length,
  }
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

export interface PromptSource {
  /** Sección del prompt. */
  kind: 'base_prompt' | 'persona' | 'lead' | 'company_profile' | 'knowledge' | 'phases' | 'strategy' | 'operating_notes' | 'signals' | 'style' | 'behavior'
  label: string
  /** Caracteres antes del presupuesto. */
  chars: number
  /** Caracteres que entraron de verdad. */
  charsIncluded: number
  /** Solo para `knowledge`: fichas que entraron y su puntuación. */
  entries?: Array<{ id: string; name: string; score: number; chars: number }>
}

export interface IntelligentPromptOptions {
  orgId: string
  basePrompt: string
  leadId?: string | null
  /**
   * Agente que habla. Con él se leen `settings.knowledgeIds` (fichas elegidas)
   * y rol/descripción para puntuar el conocimiento. Sin él, entran todas las
   * fichas de la organización puntuadas contra nombre y tipo de agente.
   */
  agentId?: string | null
  agentType?: string | null
  direction?: CallDirection
  strategyId?: string | null
  keyMessages?: string | null
  escalationRules?: string | null
  customPlaybook?: string | null
  behavior?: unknown
  /** Nombre configurado del agente, para la persona por defecto. */
  agentName?: string | null
  /** Último turno del interlocutor, si el prompt se reconstruye a mitad de llamada. */
  lastUserTurn?: string | null
  /** Presupuesto de caracteres; por defecto PROMPT_CHAR_BUDGET. */
  charBudget?: number
}

export interface IntelligentPromptResult {
  prompt: string
  sources: PromptSource[]
  totalChars: number
  budget: number
  /** true si hubo que recortar alguna sección para entrar en el presupuesto. */
  trimmed: boolean
}

type Section = { kind: PromptSource['kind']; label: string; text: string; shrinkable: boolean; entries?: PromptSource['entries'] }

/**
 * Recorte proporcional: el exceso sobre el presupuesto se reparte entre las
 * secciones recortables según su tamaño. Las fijas (guion base, fases,
 * estilo, comportamiento) nunca se tocan: sin ellas el agente no sabe ni quién
 * es ni cómo hablar.
 */
export function applyPromptBudget(sections: Section[], budget: number): { sections: Section[]; trimmed: boolean } {
  const total = sections.reduce((sum, section) => sum + section.text.length, 0)
  if (total <= budget) return { sections, trimmed: false }
  const shrinkable = sections.filter(section => section.shrinkable)
  const shrinkableChars = shrinkable.reduce((sum, section) => sum + section.text.length, 0)
  if (!shrinkableChars) return { sections, trimmed: false }
  const excess = total - budget
  let trimmed = false
  const next = sections.map(section => {
    if (!section.shrinkable) return section
    const share = Math.ceil(excess * (section.text.length / shrinkableChars))
    const target = Math.max(SECTION_MIN_CHARS, section.text.length - share)
    if (target >= section.text.length) return section
    trimmed = true
    // Se recorta por líneas para no partir una viñeta por la mitad.
    let text = section.text.slice(0, target)
    const lastBreak = text.lastIndexOf('\n')
    if (lastBreak > SECTION_MIN_CHARS) text = text.slice(0, lastBreak)
    return { ...section, text: `${text.trimEnd()}\n[…trimmed to fit the prompt budget]` }
  })
  return { sections: next, trimmed }
}

async function agentKnowledgeContext(orgId: string, agentId: string | null | undefined): Promise<{ knowledgeIds: string[] | null; query: string }> {
  if (!agentId) return { knowledgeIds: null, query: '' }
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId },
    select: { name: true, role: true, description: true, settings: true, org: { select: { industry: true } } },
  })
  if (!agent) return { knowledgeIds: null, query: '' }
  return {
    knowledgeIds: knowledgeIdsFromSettings(agent.settings),
    query: [agent.name, agent.role, agent.description, agent.org.industry].filter(Boolean).join(' '),
  }
}

export async function buildIntelligentPromptDetailed(options: IntelligentPromptOptions): Promise<IntelligentPromptResult> {
  const { orgId, basePrompt, leadId, agentType, direction = 'outbound' } = options
  const playbook = agentPlaybook(agentType)
  const strategy = callStrategy(options.strategyId, playbook.type, direction)
  const budget = options.charBudget ?? PROMPT_CHAR_BUDGET
  const sections: Section[] = []
  let base = basePrompt.trim()
  let personaText: string | null = null
  let lead: string | null = null
  let profileText: string | null = null
  let knowledge: KnowledgeSectionResult = { text: null, entries: [], candidates: 0 }

  try {
    const agentContext = await agentKnowledgeContext(orgId, options.agentId)
    const query = [
      agentContext.query,
      options.agentName,
      playbook.label,
      playbook.objective,
      options.lastUserTurn,
    ].filter(Boolean).join(' ')
    const [leadText, profileSource, knowledgeResult] = await Promise.all([
      leadId ? leadSection(orgId, leadId) : Promise.resolve(null),
      getBusinessProfileSource(orgId),
      knowledgeSection(orgId, { knowledgeIds: agentContext.knowledgeIds, query }),
    ])
    lead = leadText
    knowledge = knowledgeResult
    profileText = profileSource ? renderBusinessProfilePrompt(profileSource) : null
    // Sin guion propio, la identidad se compone con la empresa real de la
    // organización en lugar de dejar que actúe la persona de respaldo.
    if (!base) personaText = defaultPersona(options.agentName, profileSource?.company.name)
  } catch (error) {
    // El contexto es mejora, no requisito: sin BD la llamada sale igual.
    console.warn('[VOICE_PROMPT] context enrichment failed:', error)
  }

  if (base) sections.push({ kind: 'base_prompt', label: 'Agent script', text: base, shrinkable: false })
  else if (personaText) sections.push({ kind: 'persona', label: 'Default persona', text: personaText, shrinkable: false })
  if (lead) sections.push({ kind: 'lead', label: 'Customer context', text: lead, shrinkable: true })
  if (profileText) sections.push({ kind: 'company_profile', label: 'Authoritative company profile', text: profileText, shrinkable: true })
  if (knowledge.text) sections.push({ kind: 'knowledge', label: 'Supplementary knowledge base', text: knowledge.text, shrinkable: true, entries: knowledge.entries })
  sections.push({ kind: 'phases', label: `Phases: ${playbook.label}`, text: playbookDirective(playbook, direction), shrinkable: false })
  sections.push({ kind: 'strategy', label: `Strategy: ${strategy.id}`, text: strategyDirective(strategy), shrinkable: false })
  const notes = renderAgentOperatingNotes(options)
  if (notes) sections.push({ kind: 'operating_notes', label: 'Playbook, key messages and escalation', text: notes, shrinkable: true })
  sections.push({ kind: 'signals', label: 'Conversation signals', text: SIGNAL_DIRECTIVE, shrinkable: false })
  sections.push({ kind: 'style', label: 'Speaking style', text: OPENING_DIRECTIVE, shrinkable: false })
  const behavior = renderBehaviorNotes(options.behavior)
  if (behavior) sections.push({ kind: 'behavior', label: 'Customer-configured behaviour', text: behavior, shrinkable: false })

  const budgeted = applyPromptBudget(sections, budget)
  const sources: PromptSource[] = sections.map((section, index) => ({
    kind: section.kind,
    label: section.label,
    chars: section.text.length,
    charsIncluded: budgeted.sections[index]!.text.length,
    ...(section.entries ? { entries: section.entries } : {}),
  }))
  const prompt = budgeted.sections.map(section => section.text).join('\n\n')
  const result: IntelligentPromptResult = { prompt, sources, totalChars: prompt.length, budget, trimmed: budgeted.trimmed }
  // Traza de qué entró: la VoiceTrace se crea después de construir el prompt
  // en los runtimes, así que aquí queda al menos el registro en el log.
  if (knowledge.entries.length || budgeted.trimmed) {
    console.info('[VOICE_PROMPT] sources', JSON.stringify({
      orgId, agentId: options.agentId ?? null, chars: prompt.length, budget, trimmed: budgeted.trimmed,
      knowledge: knowledge.entries.map(entry => ({ id: entry.id, name: entry.name, score: entry.score, chars: entry.chars })),
      candidates: knowledge.candidates,
    }))
  }
  return result
}

export async function buildIntelligentPrompt(options: IntelligentPromptOptions): Promise<string> {
  return (await buildIntelligentPromptDetailed(options)).prompt
}

// ---------------------------------------------------------------------------
// Poda del historial de turnos.
// ---------------------------------------------------------------------------

export interface ConversationTurn {
  role: string
  content: string
}

/**
 * Conserva los turnos más recientes que caben en `budgetChars`. Si el turno
 * más reciente por sí solo no cabe, se recorta por el principio (lo último
 * dicho es lo que importa). El historial devuelto empieza siempre en un turno
 * que no sea del asistente cuando es posible, para no dejar una respuesta
 * huérfana como primer mensaje.
 *
 * Pendiente de conectar en pipelines/vendravaVoice.ts (fuera de este tramo).
 */
export function trimConversationHistory<T extends ConversationTurn>(turns: T[], budgetChars: number): T[] {
  if (!turns.length) return []
  const budget = Math.max(0, Math.floor(budgetChars))
  const kept: T[] = []
  let used = 0
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!
    const length = turn.content.length
    if (used + length > budget) {
      if (!kept.length && budget > 0) {
        kept.unshift({ ...turn, content: `…${turn.content.slice(length - (budget - 1))}` })
      }
      break
    }
    kept.unshift(turn)
    used += length
  }
  while (kept.length > 1 && kept[0]!.role === 'assistant') kept.shift()
  return kept
}
