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
  if (includesAny(speech, [
    'marque', 'pulse', 'extensión', 'extension', 'opción', 'opcion',
    'press 1', 'press one', 'press the', 'dial the extension', 'for sales press', 'main menu',
    'please listen carefully', 'your call is important',
  ])) {
    return { classification: 'IVR', confidence: 0.91, reason: 'opening_speech_ivr_signal' }
  }
  if (includesAny(speech, ['número equivocado', 'numero equivocado', 'aquí no trabaja', 'aqui no trabaja'])) {
    return { classification: 'WRONG_NUMBER', confidence: 0.9, reason: 'opening_speech_wrong_number_signal' }
  }
  return { classification: 'UNKNOWN', confidence: 0.35, reason: 'insufficient_amd_signal' }
}
