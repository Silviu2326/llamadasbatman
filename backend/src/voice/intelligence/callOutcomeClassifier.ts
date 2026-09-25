import { z } from 'zod'
import {
  CALL_OUTCOME,
  CLASSIFIABLE_CALL_OUTCOMES,
  QUALIFYING_CALL_OUTCOMES,
  normalizeCallOutcome,
  type CallOutcome,
} from '../../lib/callOutcome'
import type { AgentRuntimeConfig } from '../runtimeConfig'
import { streamCerebras, streamOpenAICompatible, type ChatMessage } from './llm/cerebrasStream'

/**
 * Clasificación del resultado de una llamada al colgar.
 *
 * Hasta ahora `Call.outcome` era casi siempre `none`: solo se mapeaban el
 * opt-out y la petición de transferencia, así que `interested` y
 * `meeting_scheduled` eran inalcanzables desde voz y nada aguas abajo
 * (reunión automática, señal a Ads, estado del lead) se disparaba nunca.
 *
 * Aquí el LLM primario del agente (el mismo Cerebras que conversó) lee la
 * transcripción por turnos y devuelve un JSON estricto. Todo lo que no valide
 * cae en `fallbackOutcome`, que reproduce el mapeo antiguo: el clasificador
 * puede mejorar el resultado, nunca empeorarlo ni bloquear la ingesta.
 */

export type TranscriptRole = 'agente' | 'prospecto'

export interface TranscriptTurn {
  role: TranscriptRole
  text: string
  /** Milisegundos desde el inicio de la llamada. */
  atMs: number
}

export type CallSentiment = 'positive' | 'neutral' | 'negative'

export interface ClassifiedOutcome {
  outcome: CallOutcome
  /** Dos o tres frases en español. */
  summary: string
  sentiment: CallSentiment
  /** ISO 8601 si el prospecto pidió que se le llame en otro momento. */
  callbackAt: string | null
  /** ISO 8601 si se acordó una reunión con fecha y hora. */
  meetingAt: string | null
  highIntent: boolean
  source: 'llm' | 'fallback'
}

export interface ClassifyInput {
  turns: TranscriptTurn[]
  /** Estado interno del contexto de llamada (`optout`, `human_requested`, `voicemail`, `ivr`, `en_curso`...). */
  ctxOutcome: string
  transferRequested?: boolean
  /** Motivo de fin que dio la telefonía (`remote_hangup`, `silence_timeout`...). */
  endReason?: string
  language?: 'es' | 'en'
  timeZone?: string
  /** Momento de referencia para resolver fechas relativas. */
  now?: Date
  startedAt?: Date
  durationSeconds?: number
  businessName?: string
}

export interface ClassifierOptions {
  runtime?: Pick<AgentRuntimeConfig, 'primaryLlm'>
  timeoutMs?: number
  /** Inyectable en pruebas: devuelve el texto completo de la respuesta del modelo. */
  complete?: (messages: ChatMessage[], signal: AbortSignal) => Promise<string>
  env?: NodeJS.ProcessEnv
}

const SENTIMENTS: Record<string, CallSentiment> = {
  positive: 'positive', positivo: 'positive', positiva: 'positive',
  neutral: 'neutral', neutro: 'neutral', neutra: 'neutral',
  negative: 'negative', negativo: 'negative', negativa: 'negative',
}

const SUMMARY_MAX = 600

const responseSchema = z.object({
  outcome: z.string().trim().min(1).max(60),
  summary: z.string().trim().min(1).max(4000),
  sentiment: z.preprocess(
    value => (typeof value === 'string' ? SENTIMENTS[value.trim().toLowerCase()] ?? value : value),
    z.enum(['positive', 'neutral', 'negative']),
  ),
  callbackAt: z.union([z.string(), z.null()]).optional(),
  meetingAt: z.union([z.string(), z.null()]).optional(),
  highIntent: z.union([z.boolean(), z.string(), z.null()]).optional(),
}).strict()

function extractJsonObject(raw: string): string | null {
  const unfenced = raw.replace(/```(?:json)?/gi, '').trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return unfenced.slice(start, end + 1)
}

/**
 * Una fecha solo vale si es ISO 8601 parseable y no está en el pasado: un
 * modelo que devuelve "ayer" como fecha de reunión no ha entendido la llamada.
 */
export function normalizeFutureIso(value: unknown, now: Date): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || /^(null|none|n\/a|no|-)$/i.test(trimmed)) return null
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  // Cinco minutos de tolerancia: un "ahora mismo" redondeado hacia atrás no es un error.
  if (parsed.getTime() < now.getTime() - 5 * 60_000) return null
  // Más de un año vista no es una cita, es una alucinación.
  if (parsed.getTime() > now.getTime() + 366 * 24 * 60 * 60_000) return null
  return parsed.toISOString()
}

function cleanSummary(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length > SUMMARY_MAX ? `${collapsed.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : collapsed
}

/**
 * Función pura: texto del modelo → resultado validado, o `null` si no se
 * puede confiar en la respuesta. Nunca lanza.
 */
export function parseOutcomeResponse(raw: string, options: { now?: Date } = {}): ClassifiedOutcome | null {
  const now = options.now ?? new Date()
  const json = extractJsonObject(raw ?? '')
  if (!json) return null
  let candidate: unknown
  try { candidate = JSON.parse(json) } catch { return null }
  const parsed = responseSchema.safeParse(candidate)
  if (!parsed.success) return null
  const outcome = normalizeCallOutcome(parsed.data.outcome)
  if (!outcome || !(CLASSIFIABLE_CALL_OUTCOMES as readonly string[]).includes(outcome)) return null
  const highIntentRaw = parsed.data.highIntent
  const highIntent = typeof highIntentRaw === 'boolean'
    ? highIntentRaw
    : typeof highIntentRaw === 'string' ? /^(true|sí|si|yes|1)$/i.test(highIntentRaw.trim()) : false
  return {
    outcome,
    summary: cleanSummary(parsed.data.summary),
    sentiment: parsed.data.sentiment,
    callbackAt: normalizeFutureIso(parsed.data.callbackAt, now),
    meetingAt: normalizeFutureIso(parsed.data.meetingAt, now),
    highIntent,
    source: 'llm',
  }
}

function prospectTurns(turns: TranscriptTurn[]): number {
  return turns.filter(turn => turn.role === 'prospecto' && turn.text.trim()).length
}

/**
 * El mapeo que existía antes del clasificador. Es lo que se guarda cuando el
 * modelo no responde, tarda más de la cuenta o devuelve algo inválido.
 */
export function fallbackOutcome(input: ClassifyInput): ClassifiedOutcome {
  const spoken = prospectTurns(input.turns)
  const ctx = input.ctxOutcome
  let outcome: CallOutcome = CALL_OUTCOME.NONE
  if (ctx === 'optout') outcome = CALL_OUTCOME.NOT_INTERESTED
  else if (input.transferRequested || ctx === 'human_requested' || ctx === 'transferido') outcome = CALL_OUTCOME.HUMAN_REQUESTED
  else {
    const normalized = normalizeCallOutcome(ctx)
    if (normalized && normalized !== CALL_OUTCOME.INTERESTED && normalized !== CALL_OUTCOME.MEETING_SCHEDULED) outcome = normalized
  }
  const seconds = input.durationSeconds ?? 0
  const en = input.language === 'en'
  const summary = outcome === CALL_OUTCOME.NOT_INTERESTED && ctx === 'optout'
    ? (en ? 'The contact asked not to receive any more calls. The opt-out was recorded and the call ended.' : 'El contacto pidió no recibir más llamadas. Se registró el opt-out y se colgó.')
    : outcome === CALL_OUTCOME.HUMAN_REQUESTED
      ? (en ? 'The contact asked to speak with a team member. Human follow-up is pending.' : 'El contacto pidió hablar con una persona del equipo. Queda pendiente el seguimiento humano.')
      : outcome === CALL_OUTCOME.CALLBACK_REQUESTED
        ? (en ? 'The contact asked to be called at another time. A callback is pending.' : 'El contacto pidió que le llamen en otro momento. Queda pendiente volver a llamar.')
      : outcome === CALL_OUTCOME.VOICEMAIL || outcome === CALL_OUTCOME.IVR
        ? (en ? 'Voicemail or an automated switchboard answered. No conversation took place.' : 'Contestó un buzón o una centralita automática. No hubo conversación.')
        : spoken === 0
          ? (en ? `Only the agent spoke during ${seconds} seconds; the contact did not speak. No classifiable outcome.` : `Solo habló el agente durante ${seconds} segundos; el contacto no llegó a intervenir. Sin resultado clasificable.`)
          : (en ? `The call lasted ${seconds} seconds with ${spoken} contact turns. Automatic classification was unavailable; review the transcript and set the outcome manually.` : `Llamada de ${seconds} segundos con ${spoken} intervenciones del contacto. El clasificador automático no estuvo disponible; revisa la transcripción y fija el resultado a mano.`)
  return { outcome, summary, sentiment: 'neutral', callbackAt: null, meetingAt: null, highIntent: false, source: 'fallback' }
}

/** Buzón o centralita detectados por el AMD durante la llamada. */
export function machineOutcome(ctxOutcome: string): CallOutcome | null {
  if (ctxOutcome === 'voicemail') return CALL_OUTCOME.VOICEMAIL
  if (ctxOutcome === 'ivr') return CALL_OUTCOME.IVR
  return null
}

/**
 * Lo que la llamada ya sabe con certeza gana al modelo: un opt-out detectado
 * por reglas es `not_interested` aunque el LLM oiga entusiasmo, un buzón
 * detectado por el AMD sigue siendo buzón aunque su saludo parezca una persona,
 * y sin ningún turno del prospecto no puede haber interés ni reunión.
 */
export function applyOutcomeGuardrails(result: ClassifiedOutcome, input: ClassifyInput): ClassifiedOutcome {
  const spoken = prospectTurns(input.turns)
  const machine = machineOutcome(input.ctxOutcome)
  let outcome = result.outcome
  if (machine) outcome = machine
  else if (input.ctxOutcome === 'optout') outcome = CALL_OUTCOME.NOT_INTERESTED
  else if (input.transferRequested || input.ctxOutcome === 'human_requested') outcome = CALL_OUTCOME.HUMAN_REQUESTED
  else if (spoken === 0 && ![CALL_OUTCOME.VOICEMAIL, CALL_OUTCOME.IVR, CALL_OUTCOME.NO_ANSWER, CALL_OUTCOME.BUSY].includes(outcome as never)) {
    outcome = CALL_OUTCOME.NONE
  }
  const qualifying = (QUALIFYING_CALL_OUTCOMES as readonly string[]).includes(outcome)
  return {
    ...result,
    outcome,
    meetingAt: outcome === CALL_OUTCOME.MEETING_SCHEDULED ? result.meetingAt : null,
    callbackAt: outcome === CALL_OUTCOME.HUMAN_REQUESTED || outcome === CALL_OUTCOME.CALLBACK_REQUESTED || outcome === CALL_OUTCOME.INTERESTED ? result.callbackAt : null,
    highIntent: qualifying && result.highIntent,
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function localNow(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
    }).formatToParts(now)
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
    return `${get('weekday')} ${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} (${get('timeZoneName') || timeZone})`
  } catch {
    return now.toISOString()
  }
}

export function buildClassifierMessages(input: ClassifyInput): ChatMessage[] {
  const now = input.now ?? new Date()
  const timeZone = input.timeZone || 'Europe/Madrid'
  const definitions = [
    `- "meeting_scheduled": el contacto aceptó una reunión o demo con fecha u hora concretas.`,
    `- "interested": el contacto mostró interés real (pidió información, precios, una llamada posterior) sin cerrar fecha.`,
    `- "human_requested": el contacto pidió hablar con una persona del equipo (que le llame un comercial, un responsable...).`,
    `- "callback_requested": el contacto pidió que le llamen en otro momento concreto; indica ese momento en callbackAt.`,
    `- "not_interested": el contacto rechazó la propuesta o pidió no ser contactado.`,
    `- "wrong_number": quien contestó no es el contacto ni conoce a la empresa.`,
    `- "voicemail": contestó un buzón de voz o contestador.`,
    `- "ivr": contestó una centralita automática con opciones.`,
    `- "none": hubo conversación pero sin resultado claro, o la llamada se cortó antes de tiempo.`,
  ].join('\n')
  const system = [
    'Eres el analista de resultados de llamadas comerciales de Vendrava. Recibes la transcripción de una llamada telefónica saliente hecha por un agente de voz con IA a un contacto.',
    'Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin comentarios y sin texto antes ni después, con exactamente estas claves:',
    '{"outcome": string, "summary": string, "sentiment": "positive"|"neutral"|"negative", "callbackAt": string|null, "meetingAt": string|null, "highIntent": boolean}',
    'Valores admitidos de "outcome":',
    definitions,
    'Reglas:',
    `- "summary": dos o tres frases en ${input.language === 'en' ? 'inglés (English)' : 'español'}, en tercera persona, con lo que dijo el contacto y el siguiente paso acordado. Sin inventar datos.`,
    '- "sentiment": actitud del contacto hacia la propuesta, no el tono del agente.',
    '- "meetingAt": solo si "outcome" es "meeting_scheduled" y se acordó una fecha u hora; en ISO 8601 con zona horaria. Si dijo "mañana a las diez", calcula la fecha exacta a partir de la fecha actual.',
    '- "callbackAt": solo si el contacto pidió una llamada en otro momento concreto; en ISO 8601 con zona horaria. Si no dio momento, null.',
    '- "highIntent": true solo si el contacto expresó intención clara de comprar, contratar o reunirse.',
    '- Si el contacto no habló en ningún momento, "outcome" no puede ser "interested", "meeting_scheduled" ni "not_interested".',
    `Fecha y hora actuales: ${localNow(now, timeZone)}. Zona horaria del contacto: ${timeZone}.`,
  ].join('\n')
  const lines = input.turns
    .filter(turn => turn.text.trim())
    .map(turn => `[${formatClock(turn.atMs)}] ${turn.role}: ${turn.text.trim()}`)
  const user = [
    input.businessName ? `Empresa del contacto: ${input.businessName}` : null,
    `Duración: ${input.durationSeconds ?? Math.round((now.getTime() - (input.startedAt?.getTime() ?? now.getTime())) / 1000)} s.`,
    input.endReason ? `Motivo de fin según la telefonía: ${input.endReason}.` : null,
    'Transcripción (agente = IA, prospecto = contacto):',
    lines.length ? lines.join('\n') : '(sin turnos transcritos)',
  ].filter(Boolean).join('\n')
  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}

async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let text = ''
  for await (const delta of stream) {
    text += delta
    if (text.length > 8000) break
  }
  return text
}

function defaultComplete(runtime: Pick<AgentRuntimeConfig, 'primaryLlm'> | undefined, env: NodeJS.ProcessEnv) {
  const provider = runtime?.primaryLlm.provider === 'groq' || runtime?.primaryLlm.provider === 'deepseek' ? runtime.primaryLlm.provider : 'cerebras'
  const model = runtime?.primaryLlm.model?.trim() || 'gpt-oss-120b'
  const apiKey = env[`${provider.toUpperCase()}_API_KEY`]
  return async (messages: ChatMessage[], signal: AbortSignal): Promise<string> => {
    if (!apiKey) throw new Error(`CLASSIFIER_MISSING_${provider.toUpperCase()}_API_KEY`)
    const options = { apiKey, model, messages, signal, maxTokens: 450, temperature: 0.1 }
    if (provider === 'cerebras') return collect(streamCerebras({ ...options, reasoningEffort: 'low' }))
    const baseUrl = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.deepseek.com/v1'
    return collect(streamOpenAICompatible({ ...options, baseUrl, provider }))
  }
}

/**
 * Clasifica con el LLM primario del agente y un límite de tiempo estricto.
 * Nunca lanza: cualquier fallo devuelve el mapeo de respaldo para que la
 * ingesta de la llamada no dependa de un proveedor externo.
 */
export async function classifyCallOutcome(input: ClassifyInput, options: ClassifierOptions = {}): Promise<ClassifiedOutcome> {
  const fallback = applyOutcomeGuardrails(fallbackOutcome(input), input)
  // Buzón, centralita o cero turnos del prospecto: no hay nada que leer y
  // llamar al modelo solo añadiría latencia y coste al colgar.
  const spoken = prospectTurns(input.turns)
  if (spoken === 0 || input.ctxOutcome === 'optout' || machineOutcome(input.ctxOutcome)) return fallback
  const timeoutMs = Math.min(8000, Math.max(500, options.timeoutMs ?? 8000))
  const complete = options.complete ?? defaultComplete(options.runtime, options.env ?? process.env)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const raw = await Promise.race([
      complete(buildClassifierMessages(input), controller.signal),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('CLASSIFIER_TIMEOUT')), { once: true })),
    ])
    const parsed = parseOutcomeResponse(raw, { now: input.now })
    if (!parsed) {
      console.warn('[CALL_CLASSIFIER] respuesta inválida del modelo; se usa el mapeo de respaldo')
      return fallback
    }
    return applyOutcomeGuardrails(parsed, input)
  } catch (error) {
    console.warn('[CALL_CLASSIFIER] fallo, se usa el mapeo de respaldo:', error instanceof Error ? error.message : 'unknown')
    return fallback
  } finally {
    clearTimeout(timer)
  }
}
