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

const HOUR_START = parseInt(process.env.CALL_HOUR_START ?? '9')
const HOUR_END = parseInt(process.env.CALL_HOUR_END ?? '20')

export function withinLegalHours(phone?: string, now?: Date): boolean {
  const tz = phone?.startsWith('+52') ? (LADA_TZ[phone.slice(3, 5)] ?? 'America/Mexico_City') : 'America/Mexico_City'
  const d = now ? new Date(now.toLocaleString('en-US', { timeZone: tz })) : new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  return d.getHours() >= HOUR_START && d.getHours() < HOUR_END
}

export function detectOptout(text: string): boolean {
  const t = text.toLowerCase()
  return OPTOUT_PHRASES.some(p => t.includes(p))
}

// ponytail: Redis opt-out list skipped — use a simple in-memory set; add Prisma/Redis when needed
const _optouts = new Set<string>()

export async function canCall(phone: string): Promise<{ allowed: boolean; reason: string }> {
  if (_optouts.has(phone)) return { allowed: false, reason: 'optout' }
  if (!withinLegalHours(phone)) return { allowed: false, reason: 'outside_hours' }
  return { allowed: true, reason: '' }
}

export async function registerOptout(phone: string, reason = 'manual'): Promise<void> {
  _optouts.add(phone)
  console.info('[COMPLIANCE] Opt-out registrado:', phone, reason)
}

export function disclosureLine(agentName = 'Alex'): string {
  if (process.env.DISCLOSE_AI === 'false') return ''
  return `Hola, le llama ${agentName}, un asistente de IA.`
}

export function mustGetRecordingConsent(): string {
  return '¿Le parece bien si grabamos esta llamada para mejorar la calidad del servicio?'
}
