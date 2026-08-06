import Anthropic from '@anthropic-ai/sdk'
import { findResidualPii } from '../lib/pseudonymize'
import { BrandFact, SpecificityFlag, pieceTextFields, reviewPieceBody } from './contentSpecificity.service'

/**
 * Editor adversario — idea 21, `docs/vendrava/roadmap.md` fase 2.
 *
 * Ninguna pieza se enseña sin pasar por aquí. El orden no es casual:
 *
 * 1. **PII primero, y es bloqueante.** Un teléfono o un email de cliente dentro
 *    de un post es el único fallo de este producto que no se puede deshacer una
 *    vez publicado. Se enmascara siempre, y la pieza queda marcada para que
 *    nadie la apruebe sin mirarla.
 * 2. **Especificidad después**, con los datos de la base de conocimiento
 *    (idea 27). Determinista y auditable.
 * 3. **Crítica y reescritura al final**, y solo si hay clave. El modelo puede
 *    mejorar el texto, pero **su reescritura se vuelve a someter a las dos
 *    comprobaciones anteriores**: un editor que arregla el estilo y reintroduce
 *    un dato inventado es peor que no tener editor. Si la reescritura empeora
 *    cualquiera de las dos, se descarta y se conserva la versión anterior.
 *
 * Todo el servicio funciona sin `CLAUDE_API_KEY`: sin ella se hacen los pasos 1
 * y 2, que son los que protegen, y se dice que no hubo crítica.
 */

export interface CriticReport {
  version: string
  pii: {
    /** Categorías encontradas. El valor nunca se guarda en el informe. */
    found: string[]
    masked: number
    /** Con PII detectada la pieza no puede aprobarse a ciegas. */
    blocking: boolean
  }
  specificity: {
    replaced: number
    unresolved: number
    flags: SpecificityFlag[]
  }
  critique: {
    /** Qué le vio el editor. Se enseña en la Sala junto a la pieza. */
    issues: string[]
    rewritten: boolean
    /** Por qué se descartó la reescritura, si se descartó. */
    discardedReason: string | null
    /** `false` = no había clave; la pieza pasó solo los pasos deterministas. */
    ran: boolean
  }
  /** Sin PII y sin vaguedades sin resolver. */
  passed: boolean
}

export const CRITIC_VERSION = 'critic-1'

function getClient(): Anthropic | null {
  const apiKey = process.env.CLAUDE_API_KEY
  return apiKey ? new Anthropic({ apiKey }) : null
}

/**
 * Datos de contacto del propio negocio. Su teléfono en un post es una llamada a
 * la acción, no una fuga: enmascararlo sería romper la pieza por celo.
 */
export interface OwnContact {
  phone?: string | null
  email?: string | null
}

function digits(value: string) {
  return value.replace(/\D/g, '')
}

/**
 * Enmascara la PII de un texto. Devuelve qué categorías aparecieron, nunca el
 * valor: el informe se guarda en base de datos y se enseña en la interfaz.
 */
export function maskPii(text: string, own: OwnContact = {}) {
  const ownPhone = own.phone ? digits(own.phone) : null
  const ownEmail = own.email?.toLowerCase().trim() || null
  const found = new Set<string>()
  let masked = 0

  const residues = findResidualPii(text)
  if (!residues.length) return { text, found: [] as string[], masked: 0 }

  let output = text
  // Se recorre categoría a categoría con los mismos patrones de la
  // seudonimización: lo que allí protege las transcripciones, aquí protege lo
  // que se va a publicar.
  const rules: { category: string; pattern: RegExp }[] = [
    { category: 'EMAIL', pattern: /\b[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g },
    { category: 'IBAN', pattern: /\b[A-Z]{2}\d{2}[ ]?(?:[\dA-Z]{4}[ ]?){3,7}[\dA-Z]{1,4}\b/g },
    { category: 'DNI', pattern: /\b(?:[XYZ]\d{7}|\d{8})[-\s]?[A-HJ-NP-TV-Z]\b/gi },
    { category: 'TEL', pattern: /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,14}\d/g },
  ]

  for (const rule of rules) {
    output = output.replace(rule.pattern, match => {
      if (rule.category === 'TEL' && ownPhone && digits(match) === ownPhone) return match
      if (rule.category === 'EMAIL' && ownEmail && match.toLowerCase() === ownEmail) return match
      found.add(rule.category)
      masked += 1
      return '[dato eliminado]'
    })
  }

  return { text: output, found: Array.from(found), masked }
}

function maskPieceBody(format: string, body: Record<string, any>, own: OwnContact) {
  const clone = JSON.parse(JSON.stringify(body ?? {})) as Record<string, any>
  const found = new Set<string>()
  let masked = 0

  for (const field of pieceTextFields(format, clone)) {
    if (!field.value.trim()) continue
    const result = maskPii(field.value, own)
    if (!result.masked) continue
    result.found.forEach(category => found.add(category))
    masked += result.masked
    let node: any = clone
    for (let index = 0; index < field.path.length - 1; index++) node = node[field.path[index]]
    node[field.path[field.path.length - 1]] = result.text
  }

  return { body: clone, found: Array.from(found), masked }
}

const CRITIC_PROMPT = `Eres el editor más exigente de una agencia de contenido para pymes españolas.
Recibes una pieza ya escrita y la evidencia real en la que se apoya.

Tu trabajo NO es suavizar: es señalar lo que falla y devolver la pieza corregida.

Busca, por este orden:
1. Afirmaciones que la evidencia no sostiene (cifras, plazos, garantías, testimonios).
2. Frases de folleto que no dicen nada.
3. Promesas o superlativos vacíos.
4. Cualquier dato personal (nombre, teléfono, email) que se haya colado.
5. Textos que no suenan a este negocio.

Reglas de la reescritura:
- Conserva EXACTAMENTE la misma estructura JSON que recibes, con las mismas claves.
- No añadas ningún dato que no esté en la evidencia ni en los datos verificados.
- Si algo no se puede sostener, quítalo: acortar es preferible a rellenar.
- Español de España.

Devuelve SOLO JSON válido:
{"issues":["...","..."],"rewrite":{ ...la pieza con la misma forma que la recibida... }}
Si la pieza no tiene nada que corregir, devuelve issues vacío y rewrite igual a la pieza recibida.`

interface CritiqueResponse {
  issues: string[]
  rewrite: Record<string, any> | null
}

async function askCritic(
  format: string,
  body: Record<string, any>,
  context: { evidence: string | null; facts: BrandFact[]; voice: string | null },
): Promise<CritiqueResponse | null> {
  const client = getClient()
  if (!client) return null

  try {
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5',
      max_tokens: 2500,
      system: context.voice ? `${CRITIC_PROMPT}\n\nVoz del negocio:\n${context.voice}` : CRITIC_PROMPT,
      messages: [{
        role: 'user',
        content: JSON.stringify({
          formato: format,
          pieza: body,
          evidencia: context.evidence,
          datosVerificados: context.facts.map(fact => fact.text),
        }),
      }],
    })
    const block = response.content.find(item => item.type === 'text')
    if (!block || block.type !== 'text') return null
    const parsed = JSON.parse(block.text.replace(/^```json\s*|\s*```$/g, '').trim())
    return {
      issues: Array.isArray(parsed?.issues) ? parsed.issues.map((issue: unknown) => String(issue).slice(0, 300)).slice(0, 8) : [],
      rewrite: parsed?.rewrite && typeof parsed.rewrite === 'object' ? parsed.rewrite : null,
    }
  } catch {
    // Que el editor no conteste no puede dejar la pieza sin las dos
    // comprobaciones que sí protegen.
    return null
  }
}

/**
 * La reescritura tiene que traer las mismas claves con contenido. Una que
 * devuelve `{"post": …}` cuando se le pasó `{"text": …}`, o que vacía la mitad
 * de las slides, no es una corrección: es otra pieza.
 */
export function rewriteKeepsShape(format: string, original: Record<string, any>, rewrite: Record<string, any>) {
  const originalFields = pieceTextFields(format, original).filter(field => field.value.trim())
  const rewriteFields = new Map(pieceTextFields(format, rewrite).map(field => [field.path.join('.'), field.value]))
  if (!originalFields.length) return false
  return originalFields.every(field => (rewriteFields.get(field.path.join('.')) ?? '').trim().length > 0)
}

/**
 * Pasa una pieza por el editor adversario y devuelve el cuerpo final y el
 * informe. Nunca lanza: una pieza sin crítica es peor que una pieza, pero una
 * generación caída por el crítico es no tener nada.
 */
export async function reviewPiece(
  format: string,
  body: Record<string, any>,
  context: { evidence: string | null; facts: BrandFact[]; voice: string | null; own?: OwnContact },
): Promise<{ body: Record<string, any>; report: CriticReport }> {
  // 1 — PII. Bloqueante y siempre, con clave o sin ella.
  const pii = maskPieceBody(format, body, context.own ?? {})

  // 2 — Especificidad con los datos de la base de conocimiento.
  const specificity = reviewPieceBody(format, pii.body, context.facts)

  // 3 — Crítica y reescritura.
  const critique = await askCritic(format, specificity.body, context)
  let finalBody = specificity.body
  let specificityFinal = specificity
  let rewritten = false
  let discardedReason: string | null = null

  if (critique?.rewrite) {
    if (!rewriteKeepsShape(format, specificity.body, critique.rewrite)) {
      discardedReason = 'La reescritura no conservaba la forma de la pieza.'
    } else {
      const rewrittenPii = maskPieceBody(format, critique.rewrite, context.own ?? {})
      const rewrittenSpecificity = reviewPieceBody(format, rewrittenPii.body, context.facts)
      if (rewrittenPii.masked > 0) {
        // El editor metió PII que no estaba. Se descarta entera: no se premia.
        discardedReason = 'La reescritura introducía datos personales.'
      } else if (rewrittenSpecificity.unresolved > specificity.unresolved) {
        discardedReason = 'La reescritura era más genérica que el original.'
      } else {
        finalBody = rewrittenSpecificity.body
        specificityFinal = rewrittenSpecificity
        rewritten = true
      }
    }
  }

  const report: CriticReport = {
    version: CRITIC_VERSION,
    pii: { found: pii.found, masked: pii.masked, blocking: pii.masked > 0 },
    specificity: {
      replaced: specificityFinal.replaced,
      unresolved: specificityFinal.unresolved,
      flags: specificityFinal.flags,
    },
    critique: {
      issues: critique?.issues ?? [],
      rewritten,
      discardedReason,
      ran: critique !== null,
    },
    passed: pii.masked === 0 && specificityFinal.unresolved === 0,
  }

  return { body: finalBody, report }
}
