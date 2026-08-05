/**
 * Seudonimización antes del LLM — `docs/xarly/README.md`, no negociable.
 *
 * Nombres, teléfonos, emails, DNI y direcciones se sustituyen por tokens
 * (`[CLIENTE_1]`, `[TEL_1]`) en el texto que sale hacia el modelo. **El mapeo no
 * sale del backend**: se devuelve aparte para poder auditar y nunca se serializa
 * junto al texto ni se guarda en la oportunidad.
 *
 * Dos decisiones que gobiernan el fichero:
 *
 * 1. **El orden de las reglas importa.** Un email contiene puntos y dígitos que
 *    el patrón de teléfono o de DNI mordería; una dirección contiene números.
 *    Se aplica de lo más específico a lo más general.
 * 2. **Mismo valor, mismo token, en todo el lote.** Si "Marta" es `[CLIENTE_1]`
 *    en tres llamadas distintas, el modelo puede contar "3 clientes
 *    preguntaron" sin que le lleguen los nombres. Un contador por documento
 *    haría que el mismo cliente pareciera tres personas.
 */

export type PseudonymCategory = 'CLIENTE' | 'TEL' | 'EMAIL' | 'DNI' | 'IBAN' | 'DIRECCION'

export interface Pseudonymizer {
  /** Sustituye la PII del texto por tokens estables. */
  apply(text: string): string
  /** Token → valor original. Solo para auditoría dentro del backend. */
  readonly mapping: ReadonlyMap<string, string>
  /** Cuántos valores distintos se sustituyeron, por categoría. */
  stats(): Record<PseudonymCategory, number>
}

/**
 * Patrones ordenados. Cada uno captura el valor completo para poder mapearlo.
 *
 * `EMAIL` va primero a propósito: `soporte@empresa.com` contiene una secuencia
 * que el patrón de teléfono podría reclamar si llegara antes.
 */
const PATTERNS: { category: PseudonymCategory; pattern: RegExp }[] = [
  { category: 'EMAIL', pattern: /\b[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g },
  { category: 'IBAN', pattern: /\b[A-Z]{2}\d{2}[ ]?(?:[\dA-Z]{4}[ ]?){3,7}[\dA-Z]{1,4}\b/g },
  // DNI/NIE españoles: 8 dígitos + letra, o X/Y/Z + 7 dígitos + letra.
  { category: 'DNI', pattern: /\b(?:[XYZ]\d{7}|\d{8})[-\s]?[A-HJ-NP-TV-Z]\b/gi },
  // Teléfonos: con prefijo internacional o nueve dígitos españoles, admitiendo
  // separadores habituales al dictarlos por teléfono.
  { category: 'TEL', pattern: /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,14}\d/g },
  // Direcciones postales: la vía y lo que la sigue hasta el final de la frase.
  {
    category: 'DIRECCION',
    pattern: /\b(?:calle|c\/|avenida|avda\.?|plaza|paseo|carrer|rúa|camino|carretera|ctra\.?)\s+[^.,;\n]{3,60}/gi,
  },
]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Nombres demasiado cortos o demasiado comunes no se sustituyen: reemplazar
 * "Ana" dentro de "manana" o convertir cada "Sol" en un token destrozaría el
 * texto y el modelo leería basura.
 */
const MIN_NAME_LENGTH = 4

export function createPseudonymizer(knownNames: string[] = []): Pseudonymizer {
  const mapping = new Map<string, string>()
  const tokenByValue = new Map<string, string>()
  const counters: Record<PseudonymCategory, number> = {
    CLIENTE: 0, TEL: 0, EMAIL: 0, DNI: 0, IBAN: 0, DIRECCION: 0,
  }

  function tokenFor(category: PseudonymCategory, value: string) {
    const key = `${category}:${value.toLowerCase().replace(/\s+/g, ' ').trim()}`
    const existing = tokenByValue.get(key)
    if (existing) return existing

    counters[category] += 1
    const token = `[${category}_${counters[category]}]`
    tokenByValue.set(key, token)
    mapping.set(token, value)
    return token
  }

  // Los nombres largos primero: sustituir "Marta" antes que "Marta Ruiz" dejaría
  // el apellido suelto en el texto que ve el modelo.
  const names = Array.from(new Set(
    knownNames
      .flatMap(name => [name, ...name.split(/\s+/)])
      .map(part => part.trim())
      .filter(part => part.length >= MIN_NAME_LENGTH)
  )).sort((a, b) => b.length - a.length)

  return {
    apply(text: string) {
      if (!text) return ''
      let result = text

      for (const { category, pattern } of PATTERNS) {
        result = result.replace(new RegExp(pattern.source, pattern.flags), match => {
          // Nunca se re-tokeniza lo ya tokenizado.
          if (/^\[[A-Z]+_\d+\]$/.test(match.trim())) return match
          return tokenFor(category, match.trim())
        })
      }

      for (const name of names) {
        result = result.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi'), match => tokenFor('CLIENTE', match))
      }

      return result
    },
    mapping,
    stats: () => ({ ...counters }),
  }
}

/**
 * Red de seguridad: detecta PII que haya sobrevivido a la seudonimización.
 *
 * Se usa como aserción antes de enviar nada al modelo. Si algún día un patrón
 * deja de cubrir un formato, es preferible fallar y no analizar esa semana que
 * mandar el teléfono de un cliente a un tercero.
 */
export function findResidualPii(text: string) {
  const residues: { category: PseudonymCategory; sample: string }[] = []
  for (const { category, pattern } of PATTERNS) {
    // Las direcciones son heurísticas: una frase que empieza por "calle" no
    // siempre es una dirección, y bloquear el análisis por eso sería peor.
    if (category === 'DIRECCION') continue
    const match = new RegExp(pattern.source, pattern.flags).exec(text)
    if (match) residues.push({ category, sample: match[0].slice(0, 12) })
  }
  return residues
}
