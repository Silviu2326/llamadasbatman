import { prisma } from '../lib/prisma'

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

export function withinLegalHours(phone?: string, now?: Date): boolean {
  const defaultTz = process.env.DEFAULT_CALL_TIMEZONE?.trim() || 'America/Mexico_City'
  const tz = phone?.startsWith('+52') ? (LADA_TZ[phone.slice(3, 5)] ?? 'America/Mexico_City') : defaultTz
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

export async function canCall(orgId: string, phone: string, leadId?: string): Promise<{ allowed: boolean; reason: string }> {
  const normalizedPhone = normalizeE164(phone)
  if (!normalizedPhone) return { allowed: false, reason: 'invalid_phone' }
  const optOut = await prisma.optOut.findUnique({ where: { orgId_phone: { orgId, phone: normalizedPhone } } })
  if (optOut) return { allowed: false, reason: 'optout' }
  if (!withinLegalHours(normalizedPhone)) return { allowed: false, reason: 'outside_hours' }
  // Opt-in gate: when the org requires documented voice consent, a lead
  // without a granted ContactConsent(channel=voice) cannot be called.
  if (process.env.REQUIRE_VOICE_CONSENT === 'true' && leadId) {
    const consent = await prisma.contactConsent.findFirst({
      where: { orgId, leadId, channel: 'voice', status: 'granted' },
      select: { expiresAt: true },
    })
    if (!consent || (consent.expiresAt && consent.expiresAt < new Date())) {
      return { allowed: false, reason: 'missing_voice_consent' }
    }
  }
  return { allowed: true, reason: '' }
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
  const company = options.companyName?.trim() || 'VozIA'
  const lang = options.lang || 'es'
  let greeting = isEnglish(lang)
    ? `Hi, good day. This is ${name}${company ? `, from ${company}` : ''}. Is the person in charge available for a moment?`
    : `Hola, buenos días. Soy ${name}${company ? `, de ${company}` : ''}. ¿Está el responsable un momento?`
  const disclosure = disclosureLine(name, lang)
  if (disclosure) greeting = `${disclosure} ${greeting}`
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
