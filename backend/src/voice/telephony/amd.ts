export type ContactClassification =
  | 'HUMAN'
  | 'VOICEMAIL'
  | 'IVR'
  | 'GATEKEEPER'
  | 'DECISION_MAKER'
  | 'WRONG_NUMBER'
  | 'FAX_OR_NOISE'
  | 'UNKNOWN'

export type AmdInput = {
  callSid?: string
  answeredBy?: string
  machineDetectionDuration?: string
  callStatus?: string
  speechResult?: string
  digits?: string
}

export type AmdClassification = {
  classification: ContactClassification
  confidence: number
  reason: string
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some(term => value.includes(term))
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Saludos de buzón y contestador (ES/EN). Se comparan sin acentos porque el
 * STT en streaming los coloca de forma irregular.
 *
 * Las frases FUERTES son inequívocas: una sola basta para colgar. Las DÉBILES
 * aparecen también en boca de personas ("el gerente no está disponible ahora",
 * "¿para hablar con quién?"), así que solo cuentan cuando coinciden dos
 * distintas. Colgar a una persona por una frase suelta cuesta un lead.
 */
const VOICEMAIL_STRONG_PHRASES = [
  'deje su mensaje', 'deja tu mensaje', 'dejar su mensaje', 'despues de la senal', 'despues del tono',
  'despues de oir la senal', 'tras la senal', 'buzon de voz', 'servicio de mensajes',
  'el telefono movil al que llama', 'el numero al que llama', 'el numero marcado',
  'esta apagado o fuera de cobertura', 'apagado o fuera de cobertura', 'grabe su mensaje', 'graba tu mensaje',
  'leave a message', 'leave your message', 'after the tone', 'after the beep', 'voicemail', 'voice mail',
  'the person you are calling', 'the number you have dialed', 'record your message',
]

const VOICEMAIL_WEAK_PHRASES = [
  'contestador', 'no esta disponible', 'no se encuentra disponible', 'mensaje de voz',
  'is not available', 'cannot take your call', "can't take your call", 'mailbox',
]

const IVR_STRONG_PHRASES = [
  'pulse 1', 'pulse uno', 'marque 1', 'marque uno', 'press 1', 'press one', 'si conoce la extension',
  'dial the extension', 'for sales press', 'main menu', 'please listen carefully', 'your call is important',
  'menu de opciones',
]

const IVR_WEAK_PHRASES = [
  'marque', 'pulse', 'extension', 'opcion', 'para hablar con', 'press the',
]

function countHits(text: string, terms: string[]): number {
  return terms.filter(term => text.includes(term)).length
}

const WRONG_NUMBER_PHRASES = [
  'numero equivocado', 'aqui no trabaja', 'se ha equivocado', 'te has equivocado', 'no es aqui',
  'no conozco esa empresa', 'aqui no es', 'wrong number',
]

export type OpeningSpeechClassification = {
  classification: Extract<ContactClassification, 'VOICEMAIL' | 'IVR' | 'WRONG_NUMBER' | 'HUMAN' | 'UNKNOWN'>
  confidence: number
  reason: string
}

/**
 * Clasifica lo primero que se oye al descolgar en la ruta Zadarma, donde no
 * hay AMD de proveedor: se aplica sobre la transcripción (parcial o final) de
 * los primeros segundos. Solo `VOICEMAIL` e `IVR` autorizan a colgar; el resto
 * deja seguir la conversación.
 */
export function classifyOpeningSpeech(speech: string): OpeningSpeechClassification {
  const text = stripAccents((speech ?? '').trim().toLowerCase())
  if (!text) return { classification: 'UNKNOWN', confidence: 0, reason: 'no_speech' }
  const voicemailStrong = countHits(text, VOICEMAIL_STRONG_PHRASES)
  const voicemailWeak = countHits(text, VOICEMAIL_WEAK_PHRASES)
  if (voicemailStrong > 0 || voicemailWeak >= 2) {
    const hits = voicemailStrong + voicemailWeak
    return { classification: 'VOICEMAIL', confidence: Math.min(0.97, (voicemailStrong ? 0.8 : 0.72) + hits * 0.08), reason: 'opening_speech_voicemail_signal' }
  }
  const ivrStrong = countHits(text, IVR_STRONG_PHRASES)
  const ivrWeak = countHits(text, IVR_WEAK_PHRASES)
  if (ivrStrong > 0 || ivrWeak >= 2) return { classification: 'IVR', confidence: ivrStrong ? 0.9 : 0.8, reason: 'opening_speech_ivr_signal' }
  if (includesAny(text, WRONG_NUMBER_PHRASES)) return { classification: 'WRONG_NUMBER', confidence: 0.85, reason: 'opening_speech_wrong_number_signal' }
  return { classification: 'HUMAN', confidence: 0.6, reason: 'opening_speech_conversational' }
}

export function classifyAmd(input: AmdInput): AmdClassification {
  const answeredBy = (input.answeredBy ?? '').trim().toLowerCase()
  const speech = (input.speechResult ?? '').trim().toLowerCase()

  if (answeredBy === 'fax') return { classification: 'FAX_OR_NOISE', confidence: 0.99, reason: 'twilio_answered_by_fax' }
  if (answeredBy.startsWith('machine')) return { classification: 'VOICEMAIL', confidence: 0.98, reason: `twilio_${answeredBy}` }
  if (answeredBy === 'human') {
    if (includesAny(speech, [
      'recepción', 'recepcion', 'secretaría', 'secretaria', 'centralita', '¿con quién', 'con quien',
      // El motor de voz llama en inglés: sin estas frases, una recepcionista
      // inglesa se clasificaba como decisor y el agente le soltaba el pitch.
      'reception', 'front desk', 'switchboard', 'who may i say', "who's calling", 'who is calling',
      'may i ask what this is regarding', 'can i take a message',
    ])) {
      return { classification: 'GATEKEEPER', confidence: 0.78, reason: 'opening_speech_gatekeeper_signal' }
    }
    return { classification: 'HUMAN', confidence: 0.86, reason: 'twilio_answered_by_human' }
  }
  const opening = classifyOpeningSpeech(speech)
  if (opening.classification === 'VOICEMAIL') return { classification: 'VOICEMAIL', confidence: opening.confidence, reason: opening.reason }
  if (opening.classification === 'IVR') return { classification: 'IVR', confidence: 0.91, reason: 'opening_speech_ivr_signal' }
  if (opening.classification === 'WRONG_NUMBER') return { classification: 'WRONG_NUMBER', confidence: 0.9, reason: 'opening_speech_wrong_number_signal' }
  return { classification: 'UNKNOWN', confidence: 0.35, reason: 'insufficient_amd_signal' }
}
