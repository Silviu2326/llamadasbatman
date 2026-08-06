import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { createPseudonymizer, findResidualPii } from '../lib/pseudonymize'

/**
 * Detector de oportunidades de contenido — el Radar de
 * `docs/vendrava/pantallas.md` §1 y `semana.md` día 1.
 *
 * Tres reglas que definen si esta pantalla vale algo:
 *
 * 1. **Nada sale hacia el LLM sin seudonimizar** (README, no negociable). Si la
 *    red de seguridad detecta PII superviviente, se descarta esa conversación
 *    en vez de analizarla: perder una semana de análisis es preferible a mandar
 *    el teléfono de un cliente a un tercero.
 * 2. **Toda oportunidad se verifica contra sus fuentes.** El modelo devuelve
 *    los ids de las conversaciones que la sustentan; los que no existen se
 *    descartan, y si al hacerlo la oportunidad se queda sin evidencia, se cae
 *    entera. Una tarjeta con "8 menciones" que no se pueden abrir es peor que
 *    no tener tarjeta.
 * 3. **Nunca se rellena** (idea 26). Si no hay señales suficientes, se guardan
 *    menos oportunidades, o ninguna, y la pantalla lo dice.
 */

export const OPPORTUNITY_TYPES = [
  'objection',
  'faq',
  'competitor',
  'pre_purchase',
  'emotional',
  'success_story',
] as const

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number]

/** Máximo y mínimo de la pantalla: 5 por defecto, nunca más de 7. */
const MAX_OPPORTUNITIES = 7
/** Menciones mínimas para que algo sea una señal y no una anécdota. */
const MIN_EVIDENCE_COUNT = 3
/** Ventana de análisis. */
const WINDOW_DAYS = 7

export class ContentOpportunityError extends Error {}

function getClient(): Anthropic | null {
  const apiKey = process.env.CLAUDE_API_KEY
  return apiKey ? new Anthropic({ apiKey }) : null
}

/** Lunes de la semana de una fecha, en UTC. */
export function weekOf(date = new Date()) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - weekday)
  return day
}

interface SourceDocument {
  id: string
  kind: 'call' | 'conversation'
  text: string
}

/**
 * Reúne el material de la semana y lo devuelve **ya seudonimizado**, junto con
 * el mapeo para auditoría (que no sale de aquí).
 */
export async function collectWeeklyMaterial(orgId: string, now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const [calls, conversations, contacts] = await Promise.all([
    prisma.call.findMany({
      where: { orgId, createdAt: { gte: since }, transcript: { not: null } },
      select: { id: true, transcript: true },
      take: 500,
    }),
    prisma.conversation.findMany({
      where: { orgId, createdAt: { gte: since } },
      select: { id: true, messages: { select: { body: true }, take: 50 } },
      take: 200,
    }),
    prisma.lead.findMany({ where: { orgId }, select: { name: true }, take: 2000 }),
  ])

  const pseudonymizer = createPseudonymizer(contacts.map(contact => contact.name).filter(Boolean))
  const documents: SourceDocument[] = []
  const rejected: { id: string; reason: string }[] = []

  const push = (id: string, kind: SourceDocument['kind'], raw: string) => {
    if (!raw?.trim()) return
    const text = pseudonymizer.apply(raw)
    const residues = findResidualPii(text)
    if (residues.length) {
      // Se descarta, no se envía. Es la red de seguridad de la regla 1.
      rejected.push({ id, reason: `PII superviviente (${residues.map(r => r.category).join(', ')})` })
      return
    }
    documents.push({ id, kind, text })
  }

  for (const call of calls) push(call.id, 'call', call.transcript ?? '')
  for (const conversation of conversations) {
    push(conversation.id, 'conversation', conversation.messages.map(message => message.body ?? '').join('\n'))
  }

  return { documents, rejected, pseudonymizer, scanned: calls.length + conversations.length }
}

const DETECTOR_PROMPT = `Eres el analista de una agencia de contenido para pymes españolas.
Recibes conversaciones reales YA ANONIMIZADAS (los tokens [CLIENTE_1], [TEL_1] sustituyen datos personales).

Tu trabajo es encontrar patrones que se REPITAN entre conversaciones distintas y que den pie a contenido útil.

Reglas innegociables:
- Solo propones algo si aparece en AL MENOS 3 conversaciones distintas.
- Cada oportunidad cita los ids exactos de las conversaciones donde aparece. No inventes ids.
- Si no encuentras patrones repetidos, devuelves una lista vacía. NUNCA rellenes con ideas genéricas.
- No inventes datos, cifras, promesas ni garantías.
- NUNCA cites textualmente lo que dijo una persona, ni entrecomillado ni sin comillas. Resume en tus palabras: "ocho personas preguntan por el plazo", no la frase que dijeron.
- Español de España.

Tipos válidos: objection, faq, competitor, pre_purchase, emotional, success_story.

Devuelve SOLO JSON válido:
{"opportunities":[{"type":"objection","title":"...","summary":"...","objective":"...","evidenceSummary":"...","sourceIds":["id1","id2","id3"]}]}`

interface RawOpportunity {
  type?: string
  title?: string
  summary?: string
  objective?: string
  evidenceSummary?: string
  sourceIds?: string[]
}

async function askDetector(documents: SourceDocument[]): Promise<RawOpportunity[]> {
  const client = getClient()
  if (!client) throw new ContentOpportunityError('Falta CLAUDE_API_KEY: el Radar no puede analizar conversaciones.')

  const payload = documents.map(document => ({ id: document.id, tipo: document.kind, texto: document.text.slice(0, 4000) }))
  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5',
    max_tokens: 3000,
    system: DETECTOR_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify({ conversaciones: payload }) }],
  })

  const block = response.content.find(item => item.type === 'text')
  if (!block || block.type !== 'text') return []
  const parsed = JSON.parse(block.text.replace(/^```json\s*|\s*```$/g, '').trim())
  return Array.isArray(parsed?.opportunities) ? parsed.opportunities : []
}

/**
 * Cita literal — la regla de privacidad del `README.md`: "las tarjetas muestran
 * conteos y paráfrasis, nunca la transcripción cruda; la cita literal de un
 * cliente solo se usa con `ContactConsent` y aprobación expresa".
 *
 * Como no existe forma de dar ese consentimiento por pieza, aquí la regla es la
 * mitad que sí se puede sostener: **nunca se cita**. Y no basta con pedírselo al
 * modelo en el prompt —un prompt no es una garantía—, así que lo que devuelve se
 * compara contra el material del que salió.
 *
 * La comparación es por palabras normalizadas: minúsculas, sin tildes ni
 * puntuación. Así "Si tardáis más de una semana, no me sirve" se reconoce
 * aunque el modelo cambie una coma o un acento, que es exactamente lo que hace
 * un modelo al "citar".
 */
const MIN_QUOTE_WORDS = 8

/**
 * Los diacríticos se separan (NFD) y se borran por su rango Unicode. El rango
 * se construye con escapes ASCII a propósito: escrito como caracteres
 * combinantes literales, el patrón es invisible en cualquier editor.
 */
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

function normalizeForQuotes(text: string) {
  return text
    .normalize('NFD').replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^\wñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Devuelve el tramo textual que `text` copia de alguna fuente, o `null` si no
 * copia ninguno. Ocho palabras seguidas idénticas no son una coincidencia del
 * idioma: son la frase de alguien.
 */
export function findLiteralQuote(text: string | null | undefined, sources: string[], minWords = MIN_QUOTE_WORDS) {
  const clean = normalizeForQuotes(text ?? '')
  if (!clean) return null
  const words = clean.split(' ')
  if (words.length < minWords) return null

  // Un solo índice para todas las fuentes: el separador impide que una ventana
  // case a caballo entre dos conversaciones distintas.
  const corpus = sources.map(normalizeForQuotes).join('   ')
  if (!corpus) return null

  for (let index = 0; index + minWords <= words.length; index++) {
    const window = words.slice(index, index + minWords).join(' ')
    if (corpus.includes(window)) return window
  }
  return null
}

/**
 * Valida una propuesta contra el material real. Devuelve `null` si no se
 * sostiene: tipo desconocido, ids inventados, evidencia por debajo del mínimo o
 * una cita literal donde tenía que haber una paráfrasis.
 *
 * `sources` es el material ya seudonimizado. Sin él la comprobación de citas no
 * se puede hacer, y se omite en vez de fingirse.
 */
export function verifyOpportunity(raw: RawOpportunity, validIds: Set<string>, sources: string[] = []) {
  if (!raw?.title?.trim() || !raw?.summary?.trim()) return null
  if (!OPPORTUNITY_TYPES.includes(raw.type as OpportunityType)) return null

  // Los ids que el modelo se haya inventado se caen aquí.
  const sourceIds = Array.from(new Set((raw.sourceIds ?? []).filter(id => validIds.has(id))))
  if (sourceIds.length < MIN_EVIDENCE_COUNT) return null

  // Título y resumen son la tarjeta: si citan a alguien, la oportunidad entera
  // se cae. Es la misma decisión que con la PII superviviente —perder una
  // tarjeta es más barato que publicar la frase de un cliente— y no se puede
  // arreglar recortando, porque lo que sobra es justamente lo que dice.
  if (findLiteralQuote(raw.title, sources) || findLiteralQuote(raw.summary, sources)) return null

  // La evidencia sí se puede perder sola: la tarjeta sigue teniendo conteos y
  // resumen, que es lo que el documento pide enseñar.
  const evidenceSummary = raw.evidenceSummary?.trim().slice(0, 600) ?? null
  const evidenceQuotes = findLiteralQuote(evidenceSummary, sources)

  return {
    type: raw.type as OpportunityType,
    title: raw.title.trim().slice(0, 200),
    summary: raw.summary.trim().slice(0, 1000),
    objective: raw.objective?.trim().slice(0, 200) ?? null,
    evidenceSummary: evidenceQuotes ? null : evidenceSummary,
    sourceIds,
    evidenceCount: sourceIds.length,
  }
}

/**
 * Ejecuta el análisis semanal y persiste las oportunidades verificadas.
 *
 * Reemplaza las propuestas de la misma semana en vez de acumular: dos análisis
 * el mismo lunes no deben duplicar tarjetas. Las descartadas por el usuario se
 * respetan.
 */
export async function refreshOpportunities(
  orgId: string,
  now = new Date(),
  // Inyectable para poder probar la cadena completa —recolección, verificación
  // y persistencia— sin depender de una clave de LLM ni de la respuesta de un
  // tercero. En producción siempre es `askDetector`.
  detector: (documents: SourceDocument[]) => Promise<RawOpportunity[]> = askDetector,
) {
  const { documents, rejected, scanned } = await collectWeeklyMaterial(orgId, now)
  const week = weekOf(now)

  if (documents.length < MIN_EVIDENCE_COUNT) {
    return { scanned, analyzed: documents.length, rejected: rejected.length, created: 0, opportunities: [] }
  }

  const validIds = new Set(documents.map(document => document.id))
  const raw = await detector(documents)
  // El material contra el que se comprueba que nadie ha sido citado. Ya está
  // seudonimizado: aquí no entra ni sale ningún nombre.
  const sources = documents.map(document => document.text)
  const verified = raw
    .map(item => verifyOpportunity(item, validIds, sources))
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.evidenceCount - a.evidenceCount)
    .slice(0, MAX_OPPORTUNITIES)

  const callIds = new Set(documents.filter(document => document.kind === 'call').map(document => document.id))

  await prisma.contentOpportunity.deleteMany({ where: { orgId, weekOf: week, status: 'proposed' } })
  const created = await prisma.$transaction(verified.map(item => prisma.contentOpportunity.create({
    data: {
      orgId,
      type: item.type,
      title: item.title,
      summary: item.summary,
      objective: item.objective,
      evidenceCount: item.evidenceCount,
      conversationsScanned: scanned,
      evidenceSummary: item.evidenceSummary,
      sourceRefs: {
        calls: item.sourceIds.filter(id => callIds.has(id)),
        conversations: item.sourceIds.filter(id => !callIds.has(id)),
      } as Prisma.InputJsonObject,
      weekOf: week,
    },
  })))

  return { scanned, analyzed: documents.length, rejected: rejected.length, created: created.length, opportunities: created }
}

export async function listOpportunities(orgId: string, now = new Date()) {
  const week = weekOf(now)
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  // El respaldo de la cabecera cuenta lo mismo que analiza el Radar —llamadas
  // con transcripción **y** hilos de inbox—; contar solo llamadas dejaba la
  // cifra corta justo cuando la pantalla está vacía y hay que explicar por qué.
  const [opportunities, callsThisWeek, conversationsThisWeek] = await Promise.all([
    prisma.contentOpportunity.findMany({
      where: { orgId, weekOf: week, status: { not: 'dismissed' } },
      orderBy: { evidenceCount: 'desc' },
    }),
    prisma.call.count({ where: { orgId, createdAt: { gte: since }, transcript: { not: null } } }),
    prisma.conversation.count({ where: { orgId, createdAt: { gte: since } } }),
  ])

  return {
    weekOf: week,
    // La cabecera de la pantalla estrella: "ha analizado N conversaciones y ha
    // encontrado M oportunidades".
    conversationsAnalyzed: opportunities[0]?.conversationsScanned ?? callsThisWeek + conversationsThisWeek,
    opportunities,
  }
}

export async function dismissOpportunity(orgId: string, id: string, reason?: string) {
  const opportunity = await prisma.contentOpportunity.findFirst({ where: { id, orgId } })
  if (!opportunity) throw new ContentOpportunityError('Oportunidad no encontrada')

  return prisma.contentOpportunity.update({
    where: { id },
    data: { status: 'dismissed', dismissedReason: reason?.slice(0, 500) ?? null },
  })
}

/**
 * Evidencias de una oportunidad: conteos y paráfrasis, **nunca transcripción
 * cruda** (README). Devuelve a qué llamadas apunta para poder abrirlas desde el
 * CRM, no su contenido.
 */
export async function opportunityEvidence(orgId: string, id: string) {
  const opportunity = await prisma.contentOpportunity.findFirst({ where: { id, orgId } })
  if (!opportunity) throw new ContentOpportunityError('Oportunidad no encontrada')

  const refs = (opportunity.sourceRefs ?? {}) as { calls?: string[]; conversations?: string[] }
  const calls = await prisma.call.findMany({
    where: { orgId, id: { in: refs.calls ?? [] } },
    select: { id: true, createdAt: true, outcome: true, lead: { select: { id: true, name: true } } },
  })

  return {
    id: opportunity.id,
    title: opportunity.title,
    evidenceCount: opportunity.evidenceCount,
    summary: opportunity.evidenceSummary ?? opportunity.summary,
    // Referencias para abrir la llamada en el CRM. El texto no se devuelve.
    calls: calls.map(call => ({ id: call.id, at: call.createdAt, outcome: call.outcome, leadId: call.lead.id })),
    conversations: refs.conversations ?? [],
  }
}
