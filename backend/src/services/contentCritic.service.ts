import { askJson, isDeepseekConfigured, smartModel } from '../lib/deepseek'
import { findResidualPii } from '../lib/pseudonymize'
import { newSensitiveClaims } from '../lib/sensitiveContent'
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
 * Todo el servicio funciona sin `DEEPSEEK_API_KEY`: sin ella se hacen los pasos 1
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
    /** Qué le vio el panel, con la lente que lo vio delante. Se enseña en la Sala. */
    issues: string[]
    rewritten: boolean
    /** Por qué se descartó la última reescritura descartada, si se descartó alguna. */
    discardedReason: string | null
    /** `false` = no había clave; la pieza pasó solo los pasos deterministas. */
    ran: boolean
    /** Qué hizo cada lente del panel. Sin esto no se sabe cuál aporta. */
    passes: Array<{
      lens: string
      label: string
      issues: number
      /** `true` si su reescritura sobrevivió a las comprobaciones. */
      applied: boolean
      discardedReason: string | null
    }>
  }
  /** Sin PII y sin vaguedades sin resolver. */
  passed: boolean
}

/** `critic-2`: una sola crítica pasó a ser el panel de `CREATIVE_LENSES`. */
export const CRITIC_VERSION = 'critic-2'

/**
 * Todas las lentes corren sobre el razonador de DeepSeek: su trabajo es juzgar
 * un texto y decidir qué sobra, que es exactamente para lo que sirve pensar
 * antes de responder. `askJson` ya recorta el JSON del final de su respuesta.
 */
function criticAvailable(): boolean {
  return isDeepseekConfigured()
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

/**
 * Reglas que valen para cualquier lente. Van aparte del encargo concreto porque
 * el contrato de salida y las prohibiciones son los mismos para todas: sacarlos
 * a un sitio evita que arreglar el JSON en una lente lo deje roto en las otras.
 */
const CRITIC_SHELL = `Recibes una pieza ya escrita y la evidencia real en la que se apoya.
Tu trabajo NO es suavizar: es señalar lo que falla y devolver la pieza corregida.

Reglas de la reescritura, en cualquier caso:
- Conserva EXACTAMENTE la misma estructura JSON que recibes, con las mismas claves.
- No añadas ningún dato que no esté en la evidencia ni en los datos verificados.
- Si algo no se puede sostener, quítalo: acortar es preferible a rellenar.
- No toques nada que ya funcione: si una parte está bien, devuélvela igual.
- Español de España.

Devuelve SOLO JSON válido:
{"issues":["...","..."],"rewrite":{ ...la pieza con la misma forma que la recibida... }}
Si no hay nada que corregir desde tu encargo, devuelve issues vacío y rewrite igual a la pieza recibida.`

export interface CreativeLens {
  key: string
  label: string
  /** El encargo concreto de esta lente. Lo único que cambia entre pasadas. */
  brief: string
}

/**
 * El panel creativo. Cada lente es un encargo editorial distinto y se aplica en
 * cadena sobre el resultado de la anterior, con las mismas garantías: si una
 * reescritura rompe la forma, mete PII o queda más genérica, se descarta y la
 * cadena sigue desde la versión buena.
 *
 * El orden importa. `verdad` va primero porque es la que protege: pulir el
 * gancho de una frase que la evidencia no sostiene es pulir algo que hay que
 * borrar. Las tres siguientes son de oficio, y van de lo grande a lo pequeño.
 *
 * ponytail: cuatro pasadas son cuatro llamadas al modelo por pieza. Si el coste
 * pesa más que el acabado, `CONTENT_CRITIC_PASSES` recorta desde el final.
 */
export const CREATIVE_LENSES: CreativeLens[] = [
  {
    key: 'verdad',
    label: 'Editor adversario',
    brief: `Eres el editor más exigente de una agencia de contenido para pymes españolas.
Busca, por este orden:
1. Afirmaciones que la evidencia no sostiene (cifras, plazos, garantías, testimonios).
2. Frases de folleto que no dicen nada.
3. Promesas o superlativos vacíos.
4. Cualquier dato personal (nombre, teléfono, email) que se haya colado.
5. Textos que no suenan a este negocio.`,
  },
  {
    key: 'gancho',
    label: 'Apertura',
    brief: `Eres redactor publicitario y solo te ocupas de la PRIMERA línea.
Casi nadie pasa de ahí, así que es lo único que decide si la pieza existe.

Arregla la apertura si:
- Empieza contando quién es el negocio en vez de qué le pasa a quien lee.
- Es una pregunta retórica de las que todo el mundo se salta ("¿Sabías que...?").
- Tarda más de una frase en decir de qué va.
- Podría encabezar la pieza de cualquier competidor sin cambiar una palabra.

La apertura nueva sale de la evidencia: la duda concreta, el número concreto, la
situación concreta. No inventes una escena para tener un gancho.`,
  },
  {
    key: 'tijera',
    label: 'Tijera',
    brief: `Eres editor de mesa y cobras por lo que quitas.

Recorta sin piedad:
- Adverbios y adjetivos que no cambian el significado.
- Frases que repiten lo que ya dijo la anterior.
- Rodeos: "es importante destacar que", "cabe señalar", "en el mundo actual".
- Cualquier párrafo que el lector se saltaría sin perderse nada.

No resumas ni fusiones ideas: quita palabras, conserva todas las ideas que se
sostienen. Si la pieza ya está apretada, devuélvela igual.`,
  },
  {
    key: 'cierre',
    label: 'Cierre',
    brief: `Te ocupas solo del final de la pieza.

Un cierre sirve cuando quien lee sabe exactamente qué hacer después y por qué le
compensa hacerlo ahora. Arréglalo si:
- Termina resumiendo lo que acaba de decir.
- Pide una acción vaga ("contáctanos", "más información").
- Promete algo que la evidencia no sostiene para forzar la urgencia.

El siguiente paso tiene que ser concreto y del tamaño adecuado: nadie firma
después de un post, pero sí pregunta un plazo o pide un presupuesto.`,
  },
]

/**
 * Cuántas lentes corren. Por defecto todas; `1` deja el comportamiento anterior
 * (solo el editor adversario) y `0` apaga la crítica sin tocar los pasos
 * deterministas, que son los que protegen.
 */
function enabledLenses(): CreativeLens[] {
  const raw = Number(process.env.CONTENT_CRITIC_PASSES)
  if (!Number.isFinite(raw) || raw < 0) return CREATIVE_LENSES
  return CREATIVE_LENSES.slice(0, Math.min(raw, CREATIVE_LENSES.length))
}

interface CritiqueResponse {
  issues: string[]
  rewrite: Record<string, any> | null
}

async function askCritic(
  lens: CreativeLens,
  format: string,
  body: Record<string, any>,
  context: { evidence: string | null; facts: BrandFact[]; voice: string | null; orgId?: string },
): Promise<CritiqueResponse | null> {
  if (!criticAvailable()) return null

  const prompt = `${lens.brief}\n\n${CRITIC_SHELL}`
  // `askJson` no lanza: que una lente no conteste no puede dejar la pieza sin
  // las dos comprobaciones deterministas, que son las que de verdad protegen.
  const parsed = await askJson<{ issues?: unknown; rewrite?: unknown }>({
    model: smartModel(),
    maxTokens: 2500,
    label: `critic:${lens.key}`,
    // El ledger solo se alimenta cuando el llamador dice quién paga (§3).
    usage: context.orgId ? { orgId: context.orgId, feature: 'content_critic' } : undefined,
    system: context.voice ? `${prompt}\n\nVoz del negocio:\n${context.voice}` : prompt,
    prompt: JSON.stringify({
      formato: format,
      pieza: body,
      evidencia: context.evidence,
      datosVerificados: context.facts.map(fact => fact.text),
    }),
  })
  if (!parsed) return null
  return {
    issues: Array.isArray(parsed.issues) ? parsed.issues.map((issue: unknown) => String(issue).slice(0, 300)).slice(0, 8) : [],
    rewrite: parsed.rewrite && typeof parsed.rewrite === 'object' ? parsed.rewrite as Record<string, any> : null,
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
  // `orgId` es opcional para no romper llamadores; sin él la crítica corre
  // igual pero su consumo no se apunta en el ledger.
  context: { evidence: string | null; facts: BrandFact[]; voice: string | null; own?: OwnContact; orgId?: string },
): Promise<{ body: Record<string, any>; report: CriticReport }> {
  // 1 — PII. Bloqueante y siempre, con clave o sin ella.
  const pii = maskPieceBody(format, body, context.own ?? {})

  // 2 — Especificidad con los datos de la base de conocimiento.
  const specificity = reviewPieceBody(format, pii.body, context.facts)

  // 3 — Panel creativo: una lente detrás de otra, cada una sobre el resultado
  // aceptado de la anterior. La comprobación de cada pasada es la misma de
  // siempre, así que ninguna lente puede empeorar lo que protegen los pasos 1
  // y 2 por muy bien que escriba.
  let finalBody = specificity.body
  let specificityFinal = specificity
  let rewritten = false
  let discardedReason: string | null = null
  let anyRan = false
  const issues: string[] = []
  const passes: CriticReport['critique']['passes'] = []

  for (const lens of enabledLenses()) {
    const critique = await askCritic(lens, format, finalBody, context)
    if (!critique) {
      // Sin clave no corre ninguna; que falle una concreta no cancela el resto.
      passes.push({ lens: lens.key, label: lens.label, issues: 0, applied: false, discardedReason: 'La lente no respondió.' })
      continue
    }
    anyRan = true
    // La lente delante del hallazgo: sin eso, ocho apuntes sueltos en la Sala
    // no dicen quién los vio ni si se arreglaron.
    issues.push(...critique.issues.map(issue => `[${lens.label}] ${issue}`))

    let passDiscarded: string | null = null
    if (!critique.rewrite) {
      passDiscarded = null
    } else if (!rewriteKeepsShape(format, finalBody, critique.rewrite)) {
      passDiscarded = 'La reescritura no conservaba la forma de la pieza.'
    } else {
      const rewrittenPii = maskPieceBody(format, critique.rewrite, context.own ?? {})
      const rewrittenSpecificity = reviewPieceBody(format, rewrittenPii.body, context.facts)
      if (rewrittenPii.masked > 0) {
        // La lente metió PII que no estaba. Se descarta entera: no se premia.
        passDiscarded = 'La reescritura introducía datos personales.'
      } else if (rewrittenSpecificity.unresolved > specificityFinal.unresolved) {
        passDiscarded = 'La reescritura era más genérica que el original.'
      } else {
        finalBody = rewrittenSpecificity.body
        specificityFinal = rewrittenSpecificity
        rewritten = true
      }
    }

    if (passDiscarded) discardedReason = passDiscarded
    passes.push({
      lens: lens.key,
      label: lens.label,
      issues: critique.issues.length,
      applied: !passDiscarded && Boolean(critique.rewrite),
      discardedReason: passDiscarded,
    })
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
      issues: issues.slice(0, 24),
      rewritten,
      discardedReason,
      ran: anyRan,
      passes,
    },
    passed: pii.masked === 0 && specificityFinal.unresolved === 0,
  }

  return { body: finalBody, report }
}

// ─── El mismo panel, sobre texto suelto ──────────────────────────────────────

/**
 * Los artículos SEO no son piezas con campos: son Markdown. Comparten las
 * lentes —el encargo editorial es el mismo— pero no los pasos deterministas,
 * que trabajan sobre la forma de una pieza. Aquí las garantías son otras tres:
 * no aparece PII, no aparecen afirmaciones sensibles que no estuvieran, y el
 * artículo no se queda en la mitad.
 */
const CRITIC_SHELL_TEXT = `Recibes un artículo ya escrito en Markdown.
Tu trabajo NO es suavizar: es señalar lo que falla y devolver el artículo corregido.

Reglas de la reescritura, en cualquier caso:
- Devuelve el artículo ENTERO en Markdown, conservando su estructura de encabezados.
- No añadas datos, cifras, fuentes ni testimonios que no estuvieran ya en el texto.
- No introduzcas precios, garantías, afirmaciones legales o sanitarias ni prueba social.
- Si algo no se puede sostener, quítalo: acortar es preferible a rellenar.
- No toques lo que ya funcione.
- Español de España.

Devuelve SOLO JSON válido:
{"issues":["...","..."],"rewrite":"el artículo completo en Markdown"}
Si no hay nada que corregir desde tu encargo, devuelve issues vacío y rewrite con el texto recibido.`

export interface TextReviewReport {
  version: string
  issues: string[]
  ran: boolean
  rewritten: boolean
  passes: CriticReport['critique']['passes']
}

/**
 * Recorte máximo que se acepta de una pasada. La lente `tijera` está para
 * quitar, así que un texto más corto es su trabajo bien hecho — pero un modelo
 * que devuelve tres párrafos de un artículo de mil palabras no ha recortado: se
 * ha cortado. El umbral separa una cosa de la otra.
 */
const MIN_LENGTH_RATIO = 0.55

export async function reviewArticleText(
  markdown: string,
  // Opcional por compatibilidad: los llamadores que lo pasen apuntan el
  // consumo de las lentes en el ledger.
  usage?: { orgId: string },
): Promise<{ text: string; report: TextReviewReport }> {
  const passes: CriticReport['critique']['passes'] = []
  const issues: string[] = []
  let current = markdown
  let ran = false
  let rewritten = false

  if (!criticAvailable()) {
    return { text: current, report: { version: CRITIC_VERSION, issues, ran, rewritten, passes } }
  }

  for (const lens of enabledLenses()) {
    const raw = await askJson<{ issues?: unknown; rewrite?: unknown }>({
      model: smartModel(),
      maxTokens: 4000,
      label: `critic-text:${lens.key}`,
      usage: usage?.orgId ? { orgId: usage.orgId, feature: 'content_critic' } : undefined,
      system: `${lens.brief}\n\n${CRITIC_SHELL_TEXT}`,
      prompt: current,
    })
    const parsed = raw
      ? {
        issues: Array.isArray(raw.issues) ? raw.issues.map((item: unknown) => String(item).slice(0, 300)).slice(0, 8) : [],
        rewrite: typeof raw.rewrite === 'string' ? raw.rewrite.trim() : null,
      }
      : null

    if (!parsed) {
      passes.push({ lens: lens.key, label: lens.label, issues: 0, applied: false, discardedReason: 'La lente no respondió.' })
      continue
    }
    ran = true
    issues.push(...parsed.issues.map(issue => `[${lens.label}] ${issue}`))

    let discarded: string | null = null
    if (!parsed.rewrite) {
      discarded = null
    } else if (parsed.rewrite.length < current.length * MIN_LENGTH_RATIO) {
      discarded = 'La reescritura devolvía el artículo cortado.'
    } else if (findResidualPii(parsed.rewrite).length > findResidualPii(current).length) {
      discarded = 'La reescritura introducía datos personales.'
    } else {
      const claims = newSensitiveClaims(current, parsed.rewrite)
      if (claims.length) {
        discarded = `La reescritura ${claims.join(' y ')}.`
      } else {
        current = parsed.rewrite
        rewritten = true
      }
    }

    passes.push({
      lens: lens.key,
      label: lens.label,
      issues: parsed.issues.length,
      applied: !discarded && Boolean(parsed.rewrite),
      discardedReason: discarded,
    })
  }

  return { text: current, report: { version: CRITIC_VERSION, issues: issues.slice(0, 24), ran, rewritten, passes } }
}
