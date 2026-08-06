import { prisma } from '../lib/prisma'

/**
 * Chequeo de especificidad — idea 27, la casilla que faltaba de
 * `docs/vendrava/semana.md` día 3.
 *
 * El prompt ya prohibía inventar cifras. Eso evita la mentira, pero no evita lo
 * otro: la frase de folleto que no dice nada ("amplia experiencia", "precios
 * competitivos"). Este servicio hace las dos mitades que pide el documento —**se
 * marca y se sustituye por datos de la base de conocimiento**— con tres reglas
 * que no se negocian:
 *
 * - **El dato sale de la base de conocimiento o no sale.** Nunca se rellena un
 *   hueco con un número plausible: si el negocio no ha escrito en ningún sitio
 *   cuántos años lleva, "amplia experiencia" se marca y se queda marcado, y la
 *   pantalla lo enseña como lo que es, un hueco.
 * - **La sustitución es determinista y citable.** Es un reemplazo de texto por
 *   un dato con su documento de origen, no una reescritura del modelo: se puede
 *   auditar qué frase se cambió por qué documento, y funciona sin clave de LLM.
 * - **Solo se sustituye lo que queda bien escrito.** Del documento no se pega la
 *   frase entera —"Contamos con Fundada en 1998 en Alicante en el sector" no es
 *   español—, sino la parte que encaja en el hueco: "experiencia desde 1998".
 *   Donde no hay una forma limpia de decirlo, se marca y decide la persona.
 */

/**
 * Qué clase de dato haría concreta cada vaguedad. No es una taxonomía del
 * negocio: es el enganche entre "lo que la frase promete" y "lo que la base de
 * conocimiento puede demostrar".
 */
export const FACT_KINDS = ['experiencia', 'precio', 'plazo', 'garantia', 'volumen', 'cobertura', 'certificacion', 'horario'] as const
export type FactKind = (typeof FACT_KINDS)[number]

export interface BrandFact {
  kind: FactKind
  /** La frase literal del documento. No se reformula: se cita. */
  text: string
  /** Documento de la base de conocimiento del que sale. */
  sourceId: string
  sourceName: string
}

export interface SpecificityFlag {
  /** La frase vacía tal cual apareció. */
  phrase: string
  kind: FactKind
  /** Por qué no dice nada, en el idioma del usuario. */
  why: string
  /** Con qué se sustituyó, si había dato. `null` = queda marcado. */
  replacedWith: string | null
  /** La frase literal del documento que sostiene la sustitución. */
  sourceQuote: string | null
  sourceName: string | null
}

export interface SpecificityReview {
  text: string
  flags: SpecificityFlag[]
  replaced: number
  /** Vaguedades que siguen ahí porque no había dato con el que sustituirlas. */
  unresolved: number
}

/**
 * Vaguedades de folleto. Cada una declara qué dato la haría verdadera y cómo
 * queda la frase al colocarlo (`template`): `{dato}` es el dato de la base de
 * conocimiento y `$1` lo que capturó el patrón, para conservar el sustantivo de
 * la frase original ("respuesta rápida" → "respuesta en 48 horas").
 *
 * `template: null` es deliberado: hay vaguedades —"somos líderes del sector",
 * "soluciones a medida"— que ningún dato sustituye sin cambiar lo que la frase
 * dice. Esas se marcan y las resuelve quien revisa. Marcar sin sustituir es
 * media idea 27; sustituir mal sería romperla.
 */
const GENERIC_PATTERNS: { pattern: RegExp; kind: FactKind; why: string; template: string | null }[] = [
  { pattern: /\b(?:amplia|dilatada|larga|gran)\s+experiencia\b/gi, kind: 'experiencia', why: 'No dice cuánta.', template: '{dato}' },
  { pattern: /\b(?:muchos|varios|numerosos)\s+a[ñn]os\s+(?:de\s+experiencia|en\s+el\s+sector)\b/gi, kind: 'experiencia', why: 'No dice cuántos años.', template: '{dato}' },
  { pattern: /\b(?:l[ií]deres?|referentes?)\s+(?:del|en\s+el)\s+(?:sector|mercado)\b/gi, kind: 'volumen', why: 'Liderazgo sin dato que lo sostenga.', template: null },
  { pattern: /\b(precios?|tarifas?)\s+(?:muy\s+)?(?:competitiv[oa]s?|ajustad[oa]s?|imbatibles?|sin\s+competencia)\b/gi, kind: 'precio', why: 'No dice cuánto cuesta.', template: '{dato}' },
  { pattern: /\b(?:la\s+)?mejor\s+(?:relaci[óo]n\s+calidad[- ]precio|calidad\s+del\s+mercado)\b/gi, kind: 'precio', why: 'Comparación sin cifra.', template: '{dato}' },
  { pattern: /\b(entrega|respuesta|servicio|instalaci[óo]n)\s+(?:r[áa]pid[ao]s?|inmediat[ao]s?|[áa]gil(?:es)?)\b/gi, kind: 'plazo', why: 'No dice en cuánto tiempo.', template: '$1 {dato}' },
  { pattern: /\ben\s+(?:muy\s+)?poco\s+tiempo\b/gi, kind: 'plazo', why: 'No dice en cuánto tiempo.', template: '{dato}' },
  { pattern: /\b(?:m[áa]xima|total|plena)\s+garant[ií]a\b/gi, kind: 'garantia', why: 'No dice qué cubre ni cuánto dura.', template: '{dato}' },
  { pattern: /\b(?:totalmente|100\s?%)\s+garantizad[oa]s?\b/gi, kind: 'garantia', why: 'No dice qué cubre ni cuánto dura.', template: 'con {dato}' },
  { pattern: /\b(?:miles|cientos|multitud)\s+de\s+(?:clientes|empresas|familias|proyectos)\b/gi, kind: 'volumen', why: 'No dice cuántos.', template: '{dato}' },
  { pattern: /\b(?:muchos|numerosos)\s+(?:clientes|casos|proyectos)\s+(?:satisfechos|de\s+[ée]xito)\b/gi, kind: 'volumen', why: 'No dice cuántos.', template: '{dato}' },
  { pattern: /\b(atenci[óo]n|trato|servicio)\s+(?:personalizad[ao]|de\s+calidad)\b/gi, kind: 'horario', why: 'No dice cuándo ni cómo se atiende.', template: '$1 {dato}' },
  { pattern: /\b(cobertura|presencia)\s+(?:nacional|total|en\s+toda\s+espa[ñn]a)\b/gi, kind: 'cobertura', why: 'No dice dónde se trabaja de verdad.', template: '$1 {dato}' },
  { pattern: /\b(profesionales|equipo|t[ée]cnicos)\s+(?:altamente\s+)?(?:cualificad[oa]s?|especializad[oa]s?)\b/gi, kind: 'certificacion', why: 'No dice en qué está certificado el equipo.', template: '$1 con {dato}' },
  { pattern: /\bsoluciones?\s+(?:a\s+medida|integrales?|innovadoras?)\b/gi, kind: 'cobertura', why: 'No dice qué se hace exactamente.', template: null },
]

/**
 * Palabras que delatan de qué habla una frase de la base de conocimiento. El
 * orden importa: la primera que coincide gana, y las más específicas van antes.
 */
const KIND_SIGNALS: { kind: FactKind; pattern: RegExp }[] = [
  { kind: 'certificacion', pattern: /\b(certificad[oa]|certificaci[óo]n|acreditad[oa]|homologad[oa]|iso\s*\d|colegiad[oa]|licencia)\b/i },
  { kind: 'garantia', pattern: /\b(garant[ií]a|garantizad[oa]s?|cubre|cobertura de \d)\b/i },
  { kind: 'precio', pattern: /(\d+\s*(?:€|eur|euros)|\b(?:precio|tarifa|cuesta|desde)\b\s*\d)/i },
  { kind: 'plazo', pattern: /\b\d+\s*(horas?|d[ií]as?|semanas?|meses?|minutos?)\b/i },
  { kind: 'experiencia', pattern: /\b(desde\s+(?:19|20)\d{2}|fundad[ao]|\d+\s+años)\b/i },
  { kind: 'horario', pattern: /\b(\d{1,2}[:.]\d{2}|horario|lunes a|24\s*\/\s*7|festivos)\b/i },
  { kind: 'cobertura', pattern: /\b(provincia|comarca|municipios?|radio de \d+|km|zona de)\b/i },
  { kind: 'volumen', pattern: /\b\d{2,}\s*(clientes|empresas|proyectos|instalaciones|obras|familias|pacientes)\b/i },
]

/**
 * Cómo se dice cada dato dentro de una frase. Del documento se extrae la parte
 * que cabe en el hueco, no la frase entera: es la diferencia entre "experiencia
 * desde 1998" y "Fundada en 1998 en Alicante y especializada en aerotermia".
 *
 * Si ningún patrón encaja con el documento, el dato no se usa aunque sea de la
 * clase correcta: antes marcado que mal escrito.
 */
const CLAUSE_PATTERNS: Record<FactKind, { pattern: RegExp; clause: string }[]> = {
  experiencia: [
    { pattern: /\bdesde\s+(?:el\s+a[ñn]o\s+)?((?:19|20)\d{2})\b/i, clause: 'experiencia desde $1' },
    { pattern: /\bfundad[ao]s?\s+en\s+((?:19|20)\d{2})\b/i, clause: 'experiencia desde $1' },
    { pattern: /\b(\d{1,3})\s+a[ñn]os\s+(?:de\s+)?(?:experiencia|en\s+el\s+sector|trabajando)\b/i, clause: '$1 años de experiencia' },
  ],
  volumen: [
    { pattern: /\b(\d[\d.]*)\s+(clientes|empresas|proyectos|instalaciones|obras|familias|pacientes|alumnos|reformas)\b/i, clause: '$1 $2' },
  ],
  precio: [
    // Solo "desde": convertir "el mantenimiento cuesta 90 €" en "precios desde
    // 90 €" sería extrapolar un precio a todo el catálogo.
    { pattern: /\b(?:desde|a\s+partir\s+de)\s+(\d[\d.,]*\s*(?:€|eur(?:os)?))/i, clause: 'desde $1' },
  ],
  plazo: [
    { pattern: /\ben\s+(\d+\s*(?:horas?|d[ií]as?|semanas?|meses?|minutos?))\b/i, clause: 'en $1' },
    { pattern: /\b(\d+\s*(?:horas?|d[ií]as?|semanas?|meses?|minutos?))\b/i, clause: 'en $1' },
  ],
  garantia: [
    // Solo la duración: del documento "Garantía de 5 años en todas nuestras
    // instalaciones" cabe "garantía de 5 años", no la coletilla entera.
    { pattern: /\bgarant[ií]a\s+de\s+(\d+\s*(?:a[ñn]os?|meses|d[íi]as?))\b/i, clause: 'garantía de $1' },
    { pattern: /\b(\d+\s*a[ñn]os)\s+de\s+garant[ií]a\b/i, clause: 'garantía de $1' },
  ],
  certificacion: [
    { pattern: /\b(ISO\s?\d{4,5}(?::\d{4})?)\b/i, clause: 'certificación $1' },
    { pattern: /\bacreditad[oa]s?\s+por\s+([^\s,.;]+(?:\s+[^\s,.;]+){0,2})/i, clause: 'acreditación de $1' },
    { pattern: /\bhomologad[oa]s?\s+por\s+([^\s,.;]+(?:\s+[^\s,.;]+){0,2})/i, clause: 'homologación de $1' },
  ],
  cobertura: [
    { pattern: /\b(?:en|de)\s+((?:toda\s+)?(?:la\s+)?(?:provincia|comarca|zona|isla|regi[óo]n)\s+de\s+[^\s,.;]+(?:\s+[^\s,.;]+){0,1})/i, clause: 'en $1' },
    { pattern: /\bradio\s+de\s+(\d+\s*km)\b/i, clause: 'en un radio de $1' },
    { pattern: /\b(\d+)\s+municipios\b/i, clause: 'en $1 municipios' },
  ],
  horario: [
    { pattern: /\b(de\s+lunes\s+a\s+[^,.;]{2,40})/i, clause: '$1' },
    { pattern: /\b(\d{1,2}[:.]\d{2}\s*a\s*\d{1,2}[:.]\d{2})\b/i, clause: 'de $1' },
    { pattern: /\b(24\s*\/\s*7)\b/i, clause: '$1' },
  ],
}

function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}|\$(\d)/g, (_, name: string | undefined, group: string | undefined) => {
    const key = name ?? `$${group}`
    return (values[key] ?? '').trim()
  }).replace(/\s+/g, ' ').trim()
}

/**
 * La parte citable de un dato: lo que se puede colocar dentro de la frase. Es lo
 * que impide que la sustitución produzca una oración rota.
 */
export function clauseFor(fact: BrandFact): string | null {
  for (const option of CLAUSE_PATTERNS[fact.kind]) {
    const match = option.pattern.exec(fact.text)
    if (!match) continue
    const values: Record<string, string> = {}
    match.forEach((value, index) => { if (index > 0) values[`$${index}`] = value ?? '' })
    const clause = fillTemplate(option.clause, values)
    if (clause) return clause
  }
  return null
}

/** Una frase sirve como hecho si trae un dato comprobable, no una opinión. */
function classifyFact(sentence: string): FactKind | null {
  for (const signal of KIND_SIGNALS) {
    if (signal.pattern.test(sentence)) return signal.kind
  }
  return null
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?;\n])\s+|\n+/)
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * Hechos de la marca — lo único con lo que se puede sustituir una vaguedad.
 *
 * Salen de la base de conocimiento activa de la organización, frase a frase, y
 * solo sobreviven las que traen un dato. Se conserva la frase literal y su
 * documento: cambiar "amplia experiencia" por "desde 1998" solo es honesto si
 * se puede señalar dónde lo dijo el negocio.
 */
export async function extractBrandFacts(orgId: string, limit = 40): Promise<BrandFact[]> {
  const documents = await prisma.knowledgeBase.findMany({
    where: { orgId, isActive: true, content: { not: null } },
    select: { id: true, name: true, content: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  const facts: BrandFact[] = []
  const seen = new Set<string>()

  for (const document of documents) {
    for (const sentence of splitSentences(document.content ?? '')) {
      // Ni fragmentos sueltos ni párrafos enteros: lo primero no se entiende
      // fuera de contexto y lo segundo no cabe dentro de un post.
      if (sentence.length < 12 || sentence.length > 180) continue
      const kind = classifyFact(sentence)
      if (!kind) continue
      const key = sentence.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      facts.push({ kind, text: sentence.replace(/[.;]$/, ''), sourceId: document.id, sourceName: document.name })
      if (facts.length >= limit) return facts
    }
  }

  return facts
}

/**
 * Bloque de datos verificados para el prompt. Se le da al redactor **antes** de
 * escribir: es más barato que reescribir después, y el chequeo posterior deja
 * de tener trabajo cuando el modelo ya escribió concreto.
 */
export function factsInstructions(facts: BrandFact[]) {
  if (!facts.length) return null
  return [
    'Datos verificados del negocio (de su base de conocimiento). Son los ÚNICOS datos que puedes afirmar:',
    ...facts.slice(0, 15).map(fact => `- ${fact.text}`),
    'Prefiere siempre uno de estos datos a una frase genérica. Si no hay dato para algo, no lo afirmes.',
  ].join('\n')
}

/**
 * Marca lo genérico y lo sustituye cuando hay con qué.
 *
 * Cada dato se gasta una sola vez: repetir "desde 1998" en tres frases del
 * mismo post no lo hace más concreto, lo hace un eslogan.
 */
export function reviewSpecificity(text: string, facts: BrandFact[]): SpecificityReview {
  if (!text?.trim()) return { text: text ?? '', flags: [], replaced: 0, unresolved: 0 }

  // Copia local: `reviewPieceBody` pasa la misma reserva por todos los campos de
  // la pieza y necesita saber qué se gastó aquí.
  const pool = [...facts]
  const flags: SpecificityFlag[] = []
  let output = text

  for (const generic of GENERIC_PATTERNS) {
    // `replace` con función: se decide dato a dato, y si el dato se agota las
    // apariciones siguientes se marcan en vez de sustituirse.
    output = output.replace(new RegExp(generic.pattern.source, 'gi'), (match, ...groups: unknown[]) => {
      const captures: Record<string, string> = {}
      for (const [index, value] of groups.entries()) {
        if (typeof value === 'string') captures[`$${index + 1}`] = value
      }

      let replacement: { clause: string; fact: BrandFact } | null = null
      if (generic.template) {
        for (const [index, fact] of pool.entries()) {
          if (fact.kind !== generic.kind) continue
          const clause = clauseFor(fact)
          if (!clause) continue
          // Un dato ya escrito en el texto no se repite: quedaría de eslogan.
          if (output.toLowerCase().includes(clause.toLowerCase())) continue
          pool.splice(index, 1)
          replacement = { clause, fact }
          break
        }
      }

      const written = replacement ? fillTemplate(generic.template as string, { ...captures, dato: replacement.clause }) : null
      flags.push({
        phrase: match,
        kind: generic.kind,
        why: generic.why,
        replacedWith: written,
        sourceQuote: replacement?.fact.text ?? null,
        sourceName: replacement?.fact.sourceName ?? null,
      })
      return written ?? match
    })
  }

  return {
    text: output,
    flags,
    replaced: flags.filter(flag => flag.replacedWith).length,
    unresolved: flags.filter(flag => !flag.replacedWith).length,
  }
}

/** Los campos de texto de una pieza, por formato. */
export function pieceTextFields(format: string, body: Record<string, any>): { path: string[]; value: string }[] {
  if (format === 'post') return [{ path: ['text'], value: String(body.text ?? '') }]
  if (format === 'carousel') {
    return [
      { path: ['title'], value: String(body.title ?? '') },
      ...(Array.isArray(body.slides) ? body.slides : []).map((slide: unknown, index: number) => ({
        path: ['slides', String(index)],
        value: String(slide ?? ''),
      })),
    ]
  }
  if (format === 'reel_script' || format === 'voiceover') {
    return [
      { path: ['hook'], value: String(body.hook ?? '') },
      { path: ['body'], value: String(body.body ?? '') },
      { path: ['cta'], value: String(body.cta ?? '') },
    ]
  }
  if (format === 'stories') {
    return (Array.isArray(body.stories) ? body.stories : []).flatMap((story: any, index: number) => [
      { path: ['stories', String(index), 'text'], value: String(story?.text ?? '') },
      { path: ['stories', String(index), 'sticker'], value: String(story?.sticker ?? '') },
    ])
  }
  if (format === 'email') {
    return [
      { path: ['subject'], value: String(body.subject ?? '') },
      { path: ['preheader'], value: String(body.preheader ?? '') },
      { path: ['body'], value: String(body.body ?? '') },
    ]
  }
  return []
}

/** Escribe un valor en la ruta que devuelve `pieceTextFields`. */
function setAtPath(body: Record<string, any>, path: string[], value: string) {
  let node: any = body
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index]
    if (node[key] === undefined || node[key] === null) node[key] = /^\d+$/.test(path[index + 1]) ? [] : {}
    node = node[key]
  }
  node[path[path.length - 1]] = value
}

/**
 * Pasa el chequeo por toda una pieza. Devuelve el cuerpo ya sustituido y el
 * informe: la pieza mejora sola donde había dato, y donde no lo había queda
 * dicho, que es lo que el Estudio y la Sala tienen que poder enseñar.
 */
export function reviewPieceBody(format: string, body: Record<string, any>, facts: BrandFact[]) {
  const clone = JSON.parse(JSON.stringify(body ?? {})) as Record<string, any>
  const flags: SpecificityFlag[] = []
  // La reserva de datos se consume entre todos los campos de la pieza: si el
  // titular ya usó "desde 1998", la slide 4 no lo repite.
  const pool = [...facts]

  for (const field of pieceTextFields(format, clone)) {
    if (!field.value.trim()) continue
    const review = reviewSpecificity(field.value, pool)
    if (!review.flags.length) continue

    for (const flag of review.flags) {
      if (!flag.sourceQuote) continue
      const index = pool.findIndex(fact => fact.text === flag.sourceQuote)
      if (index >= 0) pool.splice(index, 1)
    }
    flags.push(...review.flags)
    setAtPath(clone, field.path, review.text)
  }

  return {
    body: clone,
    flags,
    replaced: flags.filter(flag => flag.replacedWith).length,
    unresolved: flags.filter(flag => !flag.replacedWith).length,
  }
}
