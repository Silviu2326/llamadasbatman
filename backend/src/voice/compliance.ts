import { prisma } from '../lib/prisma'

const LADA_TZ: Record<string, string> = {
  '55': 'America/Mexico_City',
  '33': 'America/Mexico_City',
  '81': 'America/Monterrey',
  '664': 'America/Tijuana',
  '686': 'America/Hermosillo',
}

const OPTOUT_PHRASES = [
  'no me llamen', 'no me vuelvan a llamar', 'quiten mi número',
  'no me contacten', 'bórrenme', 'elimínenme', 'no quiero que me llamen',
  'quíteme de la lista', 'quitenme de la lista', 'déjenme en paz', 'dejenme en paz',
]

const TRANSFER_PHRASES = [
  'hablar con una persona', 'hablar con un humano', 'hablar con un agente',
  'pásame con alguien', 'pasame con alguien', 'pásame con una persona',
  'quiero hablar con alguien real', 'no quiero hablar con un robot', 'no quiero hablar con un bot',
  'necesito un humano', 'quiero un representante', 'quiero hablar con un supervisor',
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
  const tz = phone?.startsWith('+52') ? (LADA_TZ[phone.slice(3, 5)] ?? 'America/Mexico_City') : 'America/Mexico_City'
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

export async function canCall(orgId: string, phone: string): Promise<{ allowed: boolean; reason: string }> {
  const normalizedPhone = normalizeE164(phone)
  if (!normalizedPhone) return { allowed: false, reason: 'invalid_phone' }
  const optOut = await prisma.optOut.findUnique({ where: { orgId_phone: { orgId, phone: normalizedPhone } } })
  if (optOut) return { allowed: false, reason: 'optout' }
  if (!withinLegalHours(normalizedPhone)) return { allowed: false, reason: 'outside_hours' }
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

export function disclosureLine(agentName = 'Alex'): string {
  if (process.env.DISCLOSE_AI === 'false') return ''
  return `Hola, le llama ${agentName}, un asistente de IA.`
}

export function mustGetRecordingConsent(): string {
  return '¿Le parece bien si grabamos esta llamada para mejorar la calidad del servicio?'
}
