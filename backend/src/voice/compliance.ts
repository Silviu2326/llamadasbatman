import { prisma } from '../lib/prisma'
import { assertConsumptionLimit } from '../access-control/consumption'
import { createTwilioClient, getTwilioIntegrationConfig } from '../services/twilioIntegration.service'

const LADA_TZ: Record<string, string> = {
  '55': 'America/Mexico_City',
  '33': 'America/Mexico_City',
  '81': 'America/Monterrey',
  '664': 'America/Tijuana',
  '686': 'America/Hermosillo',
}

// Bilingual (ES/EN): detection scans one flat list — phrases are specific
// enough that no language switch is needed.
const OPTOUT_PHRASES = [
  'no me llamen', 'no me vuelvan a llamar', 'quiten mi número',
  'no me contacten', 'bórrenme', 'elimínenme', 'no quiero que me llamen',
  'quíteme de la lista', 'quitenme de la lista', 'déjenme en paz', 'dejenme en paz',
  'do not call me', "don't call me", 'do not call again', 'stop calling',
  'remove me from your list', 'take me off your list', 'remove my number',
  'do not contact me', "don't contact me", 'unsubscribe me', 'leave me alone',
  'put me on the do not call list',
]

const TRANSFER_PHRASES = [
  'hablar con una persona', 'hablar con un humano', 'hablar con un agente',
  'pásame con alguien', 'pasame con alguien', 'pásame con una persona',
  'quiero hablar con alguien real', 'no quiero hablar con un robot', 'no quiero hablar con un bot',
  'necesito un humano', 'quiero un representante', 'quiero hablar con un supervisor',
  'speak to a person', 'speak to a human', 'speak to an agent', 'speak with a person',
  'talk to a person', 'talk to a human', 'talk to an agent', 'talk to someone real',
  'i want a human', 'i need a human', 'transfer me to a person', 'transfer me to an agent',
  'connect me with a person', "i don't want to talk to a robot", "i don't want to talk to a bot",
  'speak to a supervisor', 'talk to a supervisor', 'i want a representative',
]

const HOUR_START = parseInt(process.env.CALL_HOUR_START ?? '9')
const HOUR_END = parseInt(process.env.CALL_HOUR_END ?? '20')

/** Normalizes common national/international input into an E.164 number. */
export function normalizeE164(phone: string): string | null {
  const raw = phone.trim()
  if (!raw) return null

  let digits = raw.replace(/[().\s-]/g, '')
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  if (!digits.startsWith('+')) {
    if (!/^\d+$/.test(digits)) return null
    const countryCode = (process.env.DEFAULT_PHONE_COUNTRY_CODE ?? '52').replace(/^\+/, '')
    digits = digits.length === 10 ? `+${countryCode}${digits}` : `+${digits}`
  }

  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return null
  return digits
}

/**
 * Resolves the timezone to judge the called party's local time in.
 *
 * `timeZone` is the stored one (Google Places returns it per business); it wins
 * whenever we have it. Mexican numbers keep deriving it from the LADA. North
 * American numbers (+1) span six timezones, so the area code is useless as a
 * proxy — without a stored zone we return null and the call is refused rather
 * than dialled at a guessed hour. `DEFAULT_CALL_TIMEZONE` is the deliberate
 * escape hatch for single-timezone operations.
 */
function resolveCallTimeZone(phone?: string, timeZone?: string | null): string | null {
  const explicit = timeZone?.trim()
  if (explicit) return explicit
  if (phone?.startsWith('+52')) return LADA_TZ[phone.slice(3, 5)] ?? 'America/Mexico_City'
  const configured = process.env.DEFAULT_CALL_TIMEZONE?.trim()
  if (configured) return configured
  if (phone?.startsWith('+1')) return null
  return 'America/Mexico_City'
}

export function withinLegalHours(phone?: string, now?: Date, timeZone?: string | null): boolean {
  const tz = resolveCallTimeZone(phone, timeZone)
  if (!tz) return false
  const d = now ? new Date(now.toLocaleString('en-US', { timeZone: tz })) : new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  return d.getHours() >= HOUR_START && d.getHours() < HOUR_END
}

export function detectOptout(text: string): boolean {
  const t = text.toLowerCase()
  return OPTOUT_PHRASES.some(p => t.includes(p))
}

export function detectTransferRequest(text: string): boolean {
  const t = text.toLowerCase()
  return TRANSFER_PHRASES.some(p => t.includes(p))
}

export type LineType = 'landline' | 'mobile' | 'voip' | 'unknown'

/**
 * Asks Twilio Lookup whether a number is a landline, a mobile or VoIP
 * (~0.008 $ per number).
 *
 * This is the gate that decides what is legal to do with a number, not a
 * nice-to-have: under the TCPA an artificial voice may not call a mobile
 * without prior express written consent, while a business landline is outside
 * that prohibition. Failing to classify returns 'unknown', which the callers
 * treat as "needs consent".
 */
export async function lookupLineType(orgId: string, phone: string): Promise<LineType> {
  const normalizedPhone = normalizeE164(phone)
  if (!normalizedPhone) return 'unknown'
  const config = await getTwilioIntegrationConfig(orgId)
  if (!config) return 'unknown'
  try {
    const result = await createTwilioClient(config)
      .lookups.v2.phoneNumbers(normalizedPhone)
      .fetch({ fields: 'line_type_intelligence' })
    const type = (result.lineTypeIntelligence as { type?: string } | undefined)?.type
    switch (type) {
      case 'landline':
        return 'landline'
      case 'mobile':
        return 'mobile'
      case 'voip':
      case 'nonFixedVoip':
      case 'fixedVoip':
        return 'voip'
      default:
        return 'unknown'
    }
  } catch (error) {
    console.warn(`[COMPLIANCE] lookup de ${normalizedPhone} falló:`, (error as Error).message)
    return 'unknown'
  }
}

/** Enrichment written by the lead pipeline into `Lead.customFields`. */
type LeadCallContext = { callTimeZone?: string | null; lineType?: LineType }

async function leadCallContext(orgId: string, leadId?: string): Promise<LeadCallContext> {
  if (!leadId) return {}
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId },
    select: { customFields: true },
  })
  const fields = (lead?.customFields ?? {}) as Record<string, unknown>
  return {
    callTimeZone: typeof fields.callTimeZone === 'string' ? fields.callTimeZone : null,
    lineType: typeof fields.lineType === 'string' ? (fields.lineType as LineType) : undefined,
  }
}

export async function canCall(orgId: string, phone: string, leadId?: string): Promise<{ allowed: boolean; reason: string }> {
  const normalizedPhone = normalizeE164(phone)
  if (!normalizedPhone) return { allowed: false, reason: 'invalid_phone' }
  // Techo de gasto del plan: una llamada arranca cuatro proveedores de pago,
  // así que la cuota se comprueba antes de marcar, no después.
  try {
    await assertConsumptionLimit(orgId, 'call_minutes', 1)
  } catch {
    return { allowed: false, reason: 'quota_exceeded' }
  }
  const optOut = await prisma.optOut.findUnique({ where: { orgId_phone: { orgId, phone: normalizedPhone } } })
  if (optOut) return { allowed: false, reason: 'optout' }

  const { callTimeZone, lineType } = await leadCallContext(orgId, leadId)
  if (!withinLegalHours(normalizedPhone, undefined, callTimeZone)) {
    // A +1 number with no stored timezone lands here: we cannot prove the local
    // hour, so we do not dial. The pipeline stores the zone during enrichment.
    return { allowed: false, reason: 'outside_hours' }
  }

  // Opt-in gate: when the org requires documented voice consent, a lead
  // without a granted ContactConsent(channel=voice) cannot be called.
  if (process.env.REQUIRE_VOICE_CONSENT === 'true' && leadId) {
    const consent = await prisma.contactConsent.findFirst({
      where: { orgId, leadId, channel: 'voice', status: 'granted' },
      select: { expiresAt: true },
    })
    const granted = Boolean(consent) && !(consent!.expiresAt && consent!.expiresAt < new Date())
    // Business-landline exemption: the TCPA's artificial-voice prohibition
    // covers mobiles and residential lines, not business landlines. It stays
    // behind a flag because acting on it is a legal decision that belongs to
    // the operator (and their counsel), not a default.
    const landlineExempt =
      process.env.ALLOW_COLD_CALL_BUSINESS_LANDLINE === 'true' && lineType === 'landline'
    if (!granted && !landlineExempt) {
      return { allowed: false, reason: 'missing_voice_consent' }
    }
  }
  return { allowed: true, reason: '' }
}

/**
 * Frases con las que un prospecto acepta que le llame el agente. Se busca la
 * aceptación explícita, no el mero interés: "sounds interesting, tell me more"
 * NO es permiso para una llamada con voz artificial, y confundirlos es
 * exactamente lo que cuesta 500 $ por llamada.
 */
const VOICE_CONSENT_PHRASES = [
  'yes', 'yes please', 'sure', 'ok', 'okay', 'go ahead', 'sounds good',
  'call me', 'give me a call', 'you can call me', 'feel free to call',
  'please call', "let's talk", 'happy to talk', 'i agree',
  'sí', 'si', 'vale', 'de acuerdo', 'llámame', 'llamame', 'puedes llamarme',
  'pueden llamarme', 'adelante',
]

/**
 * Clasifica una respuesta entrante como aceptación de llamada.
 *
 * Solo acepta mensajes cortos: una respuesta de tres líneas que contenga "ok"
 * en medio no es un consentimiento, es una conversación. Y una negación en el
 * texto lo invalida entero.
 */
export function detectVoiceConsentReply(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[.!¡]+/g, '')
  if (!t || t.length > 80) return false
  if (detectOptout(t)) return false
  if (/\b(no|not|don'?t|nope|stop|never)\b/.test(t)) return false
  return VOICE_CONSENT_PHRASES.some(p => t === p || t.startsWith(`${p} `) || t.includes(` ${p} `))
}

/**
 * Registra el consentimiento de voz con su prueba.
 *
 * `evidence` guarda el texto literal que el prospecto vio o escribió, y
 * `metadata` el contexto que lo sitúa (IP, navegador, identificador del
 * mensaje). Sin eso el consentimiento no vale nada ante una reclamación, y no
 * se puede reconstruir después: o se captura en el momento, o no existe.
 */
export async function grantVoiceConsent(
  orgId: string,
  leadId: string,
  proof: { source: string; evidence: string; metadata?: Record<string, unknown>; expiresAt?: Date }
): Promise<void> {
  await prisma.contactConsent.upsert({
    where: { orgId_leadId_channel_purpose: { orgId, leadId, channel: 'voice', purpose: 'marketing' } },
    create: {
      orgId, leadId, channel: 'voice', purpose: 'marketing', status: 'granted',
      source: proof.source,
      evidence: proof.evidence.slice(0, 2000),
      metadata: (proof.metadata ?? {}) as any,
      expiresAt: proof.expiresAt,
    },
    update: {
      status: 'granted',
      source: proof.source,
      evidence: proof.evidence.slice(0, 2000),
      metadata: (proof.metadata ?? {}) as any,
      occurredAt: new Date(),
      expiresAt: proof.expiresAt,
    },
  })
  console.info('[COMPLIANCE] Consentimiento de voz registrado:', leadId, proof.source)
}

export async function registerOptout(orgId: string, phone: string, reason = 'manual'): Promise<void> {
  await prisma.optOut.upsert({
    where: { orgId_phone: { orgId, phone } },
    create: { orgId, phone, reason },
    update: { reason },
  })
  console.info('[COMPLIANCE] Opt-out registrado:', phone, reason)
}

/** 'en' when the agent language/accent is any English variant (en, en-US…). */
export function isEnglish(languageOrAccent?: string | null): boolean {
  return /^en\b/i.test(languageOrAccent ?? '')
}

export function disclosureLine(agentName = 'Alex', lang = 'es'): string {
  if (process.env.DISCLOSE_AI === 'false') return ''
  return isEnglish(lang)
    ? `Hello, this is ${agentName}, an AI assistant.`
    : `Hola, le llama ${agentName}, un asistente de IA.`
}

export function mustGetRecordingConsent(lang = 'es'): string {
  return isEnglish(lang)
    ? 'Is it okay if we record this call to improve our service quality?'
    : '¿Le parece bien si grabamos esta llamada para mejorar la calidad del servicio?'
}

export function emotionRecognitionDisclosure(lang = 'es'): string {
  const enabled = process.env.VOICE_EMOTION_RECOGNITION_ENABLED === 'true'
    || process.env.VOICE_ENGINE_SER_ENABLED === 'true'
  if (!enabled) return ''
  return isEnglish(lang)
    ? 'During the call, voice signals may be analysed to adapt the pace of the conversation.'
    : 'Durante la llamada podemos analizar señales de voz para adaptar el ritmo de la conversación.'
}

/**
 * Frase de apertura de una llamada comercial saliente: disclosure de IA +
 * presentación (+ pregunta de consentimiento de grabación si está pendiente).
 * Compartida por todos los pipelines de voz para que el agente hable primero
 * con el mismo guion y compliance, sea legacy o remoto.
 */
export function openingGreeting(options: {
  agentName?: string | null
  companyName?: string | null
  lang?: string | null
  recordingConsentPending?: boolean
} = {}): string {
  const name = options.agentName?.trim() || 'Alex'
  const company = options.companyName?.trim() || 'Vendrava'
  const lang = options.lang || 'es'
  let greeting = isEnglish(lang)
    ? `Hi, good day. This is ${name}${company ? `, from ${company}` : ''}. Is the person in charge available for a moment?`
    : `Hola, buenos días. Soy ${name}${company ? `, de ${company}` : ''}. ¿Está el responsable un momento?`
  const disclosure = disclosureLine(name, lang)
  if (disclosure) greeting = `${disclosure} ${greeting}`
  const emotionDisclosure = emotionRecognitionDisclosure(lang)
  if (emotionDisclosure) greeting = `${greeting} ${emotionDisclosure}`
  if (options.recordingConsentPending) greeting = `${greeting} ${mustGetRecordingConsent(lang)}`
  return greeting
}

const CONSENT_YES = [
  'sí', 'si', 'claro', 'de acuerdo', 'está bien', 'esta bien', 'me parece bien', 'adelante', 'por supuesto', 'ok', 'okay', 'vale',
  'yes', 'sure', 'of course', 'that is fine', "that's fine", 'go ahead', 'no problem', 'fine by me', 'alright', 'all right', 'yeah', 'yep',
]
const CONSENT_NO = [
  'no quiero', 'no me parece', 'prefiero que no', 'no lo permito', 'no grabes', 'no graben', 'sin grabar',
  'do not record', "don't record", 'no recording', 'i do not consent', "i don't consent", 'rather not', 'prefer not', 'not okay', 'not ok',
]

/** Classifies the prospect's reply to the recording-consent question. */
export function detectRecordingConsentResponse(text: string): 'granted' | 'denied' | null {
  const t = text.toLowerCase().trim()
  const padded = ` ${t} `
  if (CONSENT_NO.some(p => padded.includes(p))) return 'denied'
  // A reply that opens with a bare "no" is a denial unless it is an
  // affirmative idiom ("no problem" / "no hay problema").
  if (/^no\b/.test(t) && !/^no problem/.test(t) && !/^no hay problema/.test(t)) return 'denied'
  if (CONSENT_YES.some(p => padded.includes(` ${p} `))) return 'granted'
  return null
}
