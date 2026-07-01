export const VALID_ESTRUCTURAS = new Set([
  'AIDA', 'SPIN', 'SNAP', 'CHALLENGER', 'CONSULTIVA',
  'SANDLER', 'FAB', 'STORYTELLING', 'PAS', 'BYAF', 'NEAT', 'SOLUTION', 'VALUE',
])

export const VALID_FORMATOS = new Set([
  'directo', 'cercano', 'consultivo', 'challenger', 'storyteller',
  'snap', 'empatico', 'urgente', 'tecnico', 'social_proof', 'mini_closer',
])

export interface GuruBrief {
  objetivo: string
  estructura: string
  formato: string
  tono: string
  maxFrases: number
  siguienteObjetivo: string
  fraseGuia: string
  puntosClave: string[]
  prohibiciones: string[]
  bucleDetectado: boolean
  objecionTipo: string
  stallDetectado: boolean
}

export function defaultBrief(): GuruBrief {
  return {
    objetivo: 'agendar demo',
    estructura: 'AIDA',
    formato: 'cercano',
    tono: 'profesional_cercano',
    maxFrases: 3,
    siguienteObjetivo: '',
    fraseGuia: '',
    puntosClave: [],
    prohibiciones: [],
    bucleDetectado: false,
    objecionTipo: '',
    stallDetectado: false,
  }
}

export function briefToSystemPrompt(brief: GuruBrief): string {
  const lines = [
    '=== INSTRUCCIONES DEL GURU ===',
    `Estructura de venta: ${brief.estructura}`,
    `Formato/personalidad: ${brief.formato}`,
    `Objetivo este turno: ${brief.siguienteObjetivo || brief.objetivo}`,
    `Tono: ${brief.tono}`,
    `Máximo ${brief.maxFrases} frases.`,
  ]
  if (brief.fraseGuia) lines.push(`Frase guía (adaptar): ${brief.fraseGuia}`)
  if (brief.objecionTipo) lines.push(`Objeción activa: ${brief.objecionTipo}`)
  if (brief.puntosClave.length) { lines.push('Puntos clave:'); brief.puntosClave.forEach(p => lines.push(`  - ${p}`)) }
  if (brief.prohibiciones.length) { lines.push('PROHIBIDO:'); brief.prohibiciones.forEach(p => lines.push(`  - ${p}`)) }
  if (brief.bucleDetectado) lines.push('ALERTA: BUCLE DETECTADO — cambia COMPLETAMENTE el enfoque')
  if (brief.stallDetectado) lines.push('ALERTA: SIN PROGRESO — necesitas un cambio de ritmo')
  lines.push('=== FIN GURU ===')
  return lines.join('\n')
}
