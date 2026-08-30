import { askJson, fastModel, isDeepseekConfigured, smartModel } from '../lib/deepseek'
import type { ProspectResearch, ResearchFact } from './prospectResearch.service'
import { availableStrategies, followupPlanFor, strategyById, type EmailKind, type EmailStrategy } from '../data/emailStrategies'

/**
 * El copywriter: escribe tres emails distintos, los juzga y pule el ganador.
 *
 * Por qué tres y no uno: la calidad de un email frío está casi toda en el
 * ángulo, y un modelo al que le pides "el mejor email" te da el ángulo más
 * obvio. Pidiendo tres ángulos deliberadamente distintos y eligiendo después
 * con criterio se gana más que afinando el prompt de una sola pasada.
 *
 * El juez es un paso aparte a propósito: quien escribe algo es mal juez de lo
 * que acaba de escribir, y aquí además se juzga con una rúbrica que el que
 * escribe no ha visto.
 */

/**
 * Lo que el sistema **supone** del negocio, separado de lo que sabe.
 *
 * Este paso existe para que asumir sea una decisión visible y no algo que se
 * cuela en el email disfrazado de hecho. El redactor puede usar la hipótesis
 * para elegir el enfoque; no puede afirmarla. `assumptions` es la lista de lo
 * que no está verificado, y se enseña en pantalla.
 */
export interface ProspectHypothesis {
  sells: string
  buyer: string
  likelyPain: string
  caresAbout: string
  objection: string
  confidence: 'alta' | 'media' | 'baja'
  assumptions: string[]
}

export interface EmailVariant {
  /** Estrategia con la que se escribió esta versión. */
  strategyId: string
  strategyName: string
  angle: string
  subject: string
  body: string
  ps: string | null
}

export interface VariantScore {
  index: number
  /** 0–10 cada uno. */
  specificity: number
  credibility: number
  easyToReply: number
  naturalness: number
  total: number
  verdict: string
}

export interface CopyResult {
  subject: string
  preheader: string
  body: string
  kind: EmailKind
  /** Envío número N para este lead. 1 = primer contacto. */
  attempt: number
  /** Lo que se supuso antes de escribir, con lo asumido marcado. */
  hypothesis: ProspectHypothesis | null
  /** Las estrategias elegidas para este prospecto y por qué. */
  strategyPlan: Array<{ id: string; name: string; why: string }>
  /** Todas las versiones y sus notas, para poder ver por qué ganó la que ganó. */
  variants: EmailVariant[]
  scores: VariantScore[]
  winner: number
  polished: boolean
}

/**
 * Las reglas del oficio, escritas una vez. Las ve el que escribe y las vuelve
 * a ver el que pule; el juez usa la rúbrica de más abajo, que es distinta a
 * propósito para que no premie el cumplimiento formal de esta lista.
 */
const COPY_RULES = `REGLAS DE ESCRITURA (email frío en español a un negocio que no te conoce)

LA PRIMERA LÍNEA
- Tiene que ser imposible de enviar a otro negocio. Un detalle concreto de ESTE, sacado de los hechos verificados.
- Prohibido abrir con "he visto en vuestra web", "he estado mirando vuestra página", "me he fijado en que": delata que es automático y quema la credibilidad en siete palabras. Menciona el detalle como quien ya conoce el negocio.
- Prohibido abrir con un halago ("me encanta lo que hacéis", "tenéis un negocio precioso").
- Prohibido abrir hablando de ti o de tu agencia.

EL CUERPO
- Entre 50 y 90 palabras. Un email largo no se lee en el móvil, y el 70% se abre en el móvil.
- UNA sola idea. Si tienes tres hallazgos, elige el que más dinero les cuesta y calla los otros dos.
- Frases cortas. Palabra llana antes que palabra técnica: "la web tarda en cargar", no "el LCP está por encima del umbral".
- Nada de superlativos, nada de "revolucionar", "potenciar", "maximizar", "impulsar", "en el mundo digital de hoy".
- Nada de cifras inventadas ni promesas de resultados. Si no está en los hechos, no se dice.
- Ni una sola pregunta retórica.

LA PETICIÓN
- Una sola, y pequeña. Una pregunta que se responda con una palabra.
- Prohibido pedir una reunión de 30 minutos, una llamada, una demo o un hueco en el calendario en el primer email. Eso se pide cuando ya han contestado.
- Ejemplos de buena petición: "¿os lo mando por escrito?", "¿lo veis vosotros o lo lleva alguien de fuera?", "¿te interesa que te diga cuál es?".

EL ASUNTO
- De 3 a 6 palabras. En minúscula, como se escribe a un compañero.
- Concreto y del negocio, no del servicio: "el formulario de la web" gana a "mejora tu presencia digital".
- Sin emoji, sin signos de exclamación, sin la palabra gratis, sin mayúsculas.

LA FIRMA Y LA POSDATA
- Firma con el nombre de la agencia, sin cargo ni eslogan.
- La posdata es opcional y solo vale si lleva el detalle más específico de todos. Se lee más que el cuerpo. Si no tienes un detalle bueno, no pongas posdata.
- Sin enlaces ni adjuntos en el primer email.`

/** Cuántas estrategias se prueban por prospecto. */
const VARIANTS = 3

function factsBlock(facts: ResearchFact[]): string {
  if (!facts.length) return 'No hay hechos verificados: escribe solo sobre los problemas detectados.'
  return facts.map((fact, index) => `${index + 1}. ${fact.claim}\n   cita literal: "${fact.quote}"\n   fuente: ${fact.url}`).join('\n')
}

export interface CopyInput {
  businessName: string
  sector: string | null
  city: string | null
  senderOrg: string
  /** Los problemas de la auditoría, ya ordenados por gravedad. */
  findings: Array<{ title: string; pitch: string; impact: string }>
  auditSummary: string
  research: ProspectResearch | null
  voice: string | null
  /** Casos y resultados reales del remitente. Habilita `caso_parecido`. */
  caseMaterial?: string[]
  /** `followup` cuando ya se le escribió antes. Cambia el catálogo entero. */
  kind?: EmailKind
  /** Lo que ya se le mandó, del más antiguo al más reciente. */
  previousEmails?: Array<{ subject: string; body: string; sentAt: string; strategyId?: string }>
  /** Intentos que quedan en la secuencia, contando este. 1 = toca cerrar. */
  remainingAttempts?: number
}

/**
 * Lo ya enviado, para el redactor. Va completo y no resumido a propósito: el
 * fallo de un seguimiento no es repetir el argumento, es repetir la frase de
 * apertura, y eso solo se evita viendo el texto.
 */
function historyBlock(input: CopyInput): string {
  const previous = input.previousEmails ?? []
  if (!previous.length) return ''
  return `

YA LE HAS ESCRITO ${previous.length} ${previous.length === 1 ? 'VEZ' : 'VECES'} Y NO HA CONTESTADO:
${previous.map((email, index) => `--- Envío ${index + 1} (${email.sentAt.slice(0, 10)})${email.strategyId ? ` · estrategia ${email.strategyId}` : ''} ---
Asunto: ${email.subject}
${email.body}`).join('\n\n')}

REGLAS QUE IMPONE ESE HISTORIAL:
- No repitas ninguna frase de apertura de los envíos anteriores. Ni parecida.
- No repitas el argumento que ya no funcionó. Si lo único que tienes es ese, cámbiale el enfoque o usa otro hallazgo.
- No reproches el silencio. Ni "no he tenido respuesta", ni "quizá se te pasó", ni "insisto".
- No resumas los emails anteriores. Quien no los leyó tampoco leerá el resumen.`
}

function contextBlock(input: CopyInput): string {
  return `NEGOCIO: ${input.businessName}${input.sector ? ` · ${input.sector}` : ''}${input.city ? ` · ${input.city}` : ''}
QUIÉN ESCRIBE: ${input.senderOrg}

PROBLEMAS DETECTADOS EN SU PRESENCIA DIGITAL:
${input.findings.map((finding, index) => `${index + 1}. ${finding.title} — ${finding.pitch} (impacto ${finding.impact})`).join('\n')}

RESUMEN TÉCNICO: ${input.auditSummary}

HECHOS VERIFICADOS SOBRE ESTE NEGOCIO:
${factsBlock(input.research?.facts ?? [])}`
}

/**
 * Paso 1 — pensar antes de escribir. Traduce hallazgos técnicos y frases
 * sueltas de su web en una idea de a quién le estás escribiendo.
 *
 * La parte que importa es `assumptions`: obligar a separar lo deducido de lo
 * verificado. Un modelo que no tiene dónde poner sus suposiciones las mete en
 * el email como si fueran hechos.
 */
export async function buildHypothesis(input: CopyInput): Promise<ProspectHypothesis | null> {
  const parsed = await askJson<Record<string, unknown>>({
    model: smartModel(),
    label: 'hypothesis',
    maxTokens: 900,
    system: 'Eres un analista comercial. Antes de que nadie escriba un email, tu trabajo es entender a quién se lo estamos escribiendo.',
    prompt: `${contextBlock(input)}

Piensa quién es este negocio y qué le importa. Sé concreto: "clínica dental de barrio que vive de la ortodoncia infantil" sirve; "empresa del sector salud" no.

Separa con honestidad lo que sabes de lo que supones. Todo lo que no salga de los hechos verificados o de los problemas detectados va en "assumptions", aunque estés bastante seguro.

Responde solo JSON:
{"sells":"qué vende de verdad, en sus palabras",
 "buyer":"quién le compra, en una línea",
 "likelyPain":"lo que más dinero le está costando ahora mismo, conectando lo técnico con su negocio",
 "caresAbout":"qué le haría parar de borrar correos y leer",
 "objection":"qué pensará al ver un email de una agencia",
 "confidence":"alta|media|baja",
 "assumptions":["lo que has supuesto y no está verificado"]}`,
  })
  if (!parsed) return null
  const text = (key: string, max = 300) => typeof parsed[key] === 'string' ? String(parsed[key]).trim().slice(0, max) : ''
  const sells = text('sells')
  if (!sells) return null
  const confidence = ['alta', 'media', 'baja'].includes(String(parsed.confidence)) ? String(parsed.confidence) as ProspectHypothesis['confidence'] : 'baja'
  return {
    sells,
    buyer: text('buyer'),
    likelyPain: text('likelyPain', 400),
    caresAbout: text('caresAbout'),
    objection: text('objection'),
    confidence,
    assumptions: Array.isArray(parsed.assumptions)
      ? parsed.assumptions.filter((item): item is string => typeof item === 'string').map(item => item.trim().slice(0, 240)).slice(0, 8)
      : [],
  }
}

/**
 * Paso 2 — elegir estrategias. Tres deliberadamente distintas: si el selector
 * devolviera tres parecidas, el juez elegiría entre tres versiones del mismo
 * email y el paso dejaría de aportar.
 */
export async function selectStrategies(
  input: CopyInput,
  hypothesis: ProspectHypothesis | null
): Promise<Array<{ strategy: EmailStrategy; why: string }>> {
  const kind = input.kind ?? 'outbound'
  const catalog = availableStrategies(Boolean(input.caseMaterial?.length), kind)

  // En el último intento no se elige: se cierra. Un cierre de hilo compitiendo
  // contra un recordatorio es una elección que no hay que dejar abierta —
  // quien no ha contestado en cuatro emails no quiere un quinto recordatorio.
  if (kind === 'followup' && (input.remainingAttempts ?? 99) <= 1) {
    const closing = strategyById('ruptura')
    if (closing) return [{ strategy: closing, why: 'Último intento de la secuencia: se cierra el hilo.' }]
  }

  const parsed = await askJson<{ picks?: unknown }>({
    model: smartModel(),
    label: 'strategy',
    maxTokens: 800,
    system: 'Eres director creativo de una agencia. Eliges con qué estrategia se ataca cada prospecto.',
    prompt: `${contextBlock(input)}
${hypothesis ? `
QUIÉN CREES QUE ES:
- Vende: ${hypothesis.sells}
- Le compra: ${hypothesis.buyer}
- Le duele: ${hypothesis.likelyPain}
- Le haría leer: ${hypothesis.caresAbout}
- Objeción que tendrá: ${hypothesis.objection}` : ''}

${historyBlock(input)}

ESTRATEGIAS DISPONIBLES:
${catalog.map(strategy => `[${strategy.id}] ${strategy.name} — ${strategy.summary}
   Usar cuando: ${strategy.useWhen}
   Evitar cuando: ${strategy.avoidWhen}`).join('\n')}
${kind === 'followup' ? `\nEs el envío número ${(input.previousEmails?.length ?? 0) + 1}. Por defecto tocaría "${followupPlanFor(input.previousEmails?.length ?? 1, input.remainingAttempts ?? 99)}", pero cámbialo si lo que ya se envió aconseja otra cosa.` : ''}

Elige ${Math.min(VARIANTS, catalog.length)} para probar con ESTE negocio, y que sean distintas entre sí: se van a comparar, así que varias versiones del mismo enfoque no sirven de nada.

Respeta los "evitar cuando". Una estrategia brillante en el sector equivocado no obtiene respuesta.

Responde solo JSON: {"picks":[{"id":"...","why":"por qué esta con este negocio"}]}`,
  })

  const picks = Array.isArray(parsed?.picks) ? parsed.picks : []
  const chosen: Array<{ strategy: EmailStrategy; why: string }> = []
  for (const pick of picks) {
    if (!pick || typeof pick !== 'object') continue
    const record = pick as Record<string, unknown>
    const strategy = strategyById(String(record.id ?? ''))
    // Si el modelo devuelve un id inventado o uno bloqueado por falta de
    // casos, se ignora en vez de arrastrarlo: el catálogo manda.
    if (!strategy || !catalog.includes(strategy) || chosen.some(item => item.strategy.id === strategy.id)) continue
    chosen.push({ strategy, why: typeof record.why === 'string' ? record.why.trim().slice(0, 240) : '' })
  }

  // Relleno determinista: sin selección utilizable se usan las primeras del
  // catálogo, que están ordenadas de más general a más arriesgada.
  for (const strategy of catalog) {
    if (chosen.length >= VARIANTS) break
    if (!chosen.some(item => item.strategy.id === strategy.id)) chosen.push({ strategy, why: '' })
  }
  return chosen.slice(0, VARIANTS)
}

function parseVariant(value: unknown, strategy: EmailStrategy, angle: string): EmailVariant | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const subject = typeof record.subject === 'string' ? record.subject.trim() : ''
  const body = typeof record.body === 'string' ? record.body.trim() : ''
  if (!subject || body.length < 30) return null
  const ps = typeof record.ps === 'string' && record.ps.trim() ? record.ps.trim() : null
  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    angle,
    subject: subject.slice(0, 90),
    body: body.slice(0, 2_500),
    // Hay estilos que prohíben la posdata; que el modelo la escriba igual no
    // la mete en el email.
    ps: strategy.id === 'una_pregunta' ? null : ps?.slice(0, 240) ?? null,
  }
}

/** Paso 3 — una versión por estrategia, en paralelo. */
async function draftVariants(
  input: CopyInput,
  hypothesis: ProspectHypothesis | null,
  plan: Array<{ strategy: EmailStrategy; why: string }>
): Promise<EmailVariant[]> {
  const shared = `${contextBlock(input)}
${hypothesis ? `
QUIÉN ES Y QUÉ LE IMPORTA (esto es interpretación, no lo afirmes en el email — úsalo para elegir qué decir y cómo):
- Vende: ${hypothesis.sells}
- Le compra: ${hypothesis.buyer}
- Le duele: ${hypothesis.likelyPain}
- Le haría leer: ${hypothesis.caresAbout}
- Objeción que tendrá: ${hypothesis.objection}
${hypothesis.assumptions.length ? `- SIN VERIFICAR (no lo des por cierto en el texto): ${hypothesis.assumptions.join(' · ')}` : ''}` : ''}
${input.caseMaterial?.length ? `\nCASOS REALES DEL REMITENTE (los únicos que puedes contar):\n${input.caseMaterial.map(item => `- ${item}`).join('\n')}` : ''}
${input.research?.angle ? `\nÁNGULO SUGERIDO POR EL ANALISTA: ${input.research.angle}` : ''}
${input.voice ? `\nVOZ DE QUIEN FIRMA:\n${input.voice}` : ''}${historyBlock(input)}`

  const drafts = await Promise.all(plan.map(async ({ strategy, why }) => {
    const parsed = await askJson<unknown>({
      model: smartModel(),
      label: `draft:${strategy.id}`,
      maxTokens: 1_400,
      system: 'Eres un copywriter especializado en email frío B2B en España. Escribes como una persona que conoce el negocio del que habla, no como una agencia que manda plantillas.',
      prompt: `${COPY_RULES}

${shared}

ESTRATEGIA DE ESTA VERSIÓN: ${strategy.name}
${why ? `Por qué esta estrategia con este negocio: ${why}\n` : ''}
ESTRUCTURA: ${strategy.structure}

REGLAS PROPIAS DE ESTE ESTILO (mandan sobre las generales si chocan):
${strategy.guidance}

LONGITUD OBJETIVO DEL CUERPO: entre ${strategy.targetWords[0]} y ${strategy.targetWords[1]} palabras.

Escribe el email. Responde solo JSON: {"subject":"...","body":"...","ps":"..."} — deja "ps" vacío si este estilo no la lleva o si no tienes un detalle lo bastante bueno.`,
    })
    return parseVariant(parsed, strategy, why || strategy.summary)
  }))
  return drafts.filter((variant): variant is EmailVariant => variant !== null)
}

/**
 * Paso 4 — juzgar. La rúbrica no es la lista de reglas ni la guía de la
 * estrategia: pregunta por el resultado (¿contestaría este señor?) en vez de
 * por el cumplimiento. Al juez ni se le dice qué estrategia usó cada versión,
 * a propósito — si lo supiera puntuaría lo bien ejecutado que está el estilo,
 * que no es lo que se está decidiendo.
 */
async function judgeVariants(input: CopyInput, variants: EmailVariant[]): Promise<VariantScore[]> {
  if (variants.length < 2) return []
  const parsed = await askJson<{ scores?: unknown }>({
    model: smartModel(),
    label: 'judge',
    maxTokens: 1_600,
    system: 'Eres el dueño de un negocio pequeño con la bandeja llena. Recibes ocho emails comerciales al día y borras siete sin abrirlos. Juzgas sin piedad.',
    prompt: `Estos ${variants.length} emails van dirigidos a ${input.businessName}${input.city ? `, en ${input.city}` : ''}.${input.kind === 'followup' ? `

Es un seguimiento: a este señor ya le escribieron ${input.previousEmails?.length ?? 1} ${(input.previousEmails?.length ?? 1) === 1 ? 'vez' : 'veces'} y no contestó. Júzgalos sabiendo eso — insistir con el mismo argumento vale menos que cambiar de tema, y un email que no pide nada no es un email flojo.` : ''}

${variants.map((variant, index) => `--- VERSIÓN ${index + 1} ---
Asunto: ${variant.subject}
${variant.body}${variant.ps ? `\nP.D. ${variant.ps}` : ''}`).join('\n\n')}

Puntúa cada versión de 0 a 10 en:
- specificity: ¿podrías mandar este mismo email a otro negocio del sector cambiando el nombre? Si sí, es un 0. Si al cambiar el nombre deja de tener sentido, es un 10.
- credibility: ¿afirma algo que no puede saber? ¿promete resultados? ¿suena a plantilla? Cuanto más verificable y menos vendido, más alto.
- easyToReply: ¿cuánto esfuerzo te pide? Una pregunta de una palabra es un 10; pedir una reunión es un 2. Un email que no pide nada en absoluto también es un 10: cero fricción es cero fricción.
- naturalness: ¿lo ha escrito una persona o una máquina? Penaliza "he visto en vuestra web", jerga de marketing, adjetivos vacíos y entusiasmo impostado.

Sé duro: la media de un email comercial real está en 3 o 4.

Responde solo JSON: {"scores":[{"index":1,"specificity":0,"credibility":0,"easyToReply":0,"naturalness":0,"verdict":"una frase con lo que sobra o falta"}]}`,
  })
  const raw = Array.isArray(parsed?.scores) ? parsed.scores : []
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => {
      const clamp = (value: unknown) => Math.max(0, Math.min(10, Number(value) || 0))
      const specificity = clamp(item.specificity)
      const credibility = clamp(item.credibility)
      const easyToReply = clamp(item.easyToReply)
      const naturalness = clamp(item.naturalness)
      return {
        index: Math.max(1, Number(item.index) || 1) - 1,
        specificity,
        credibility,
        easyToReply,
        naturalness,
        // La especificidad pesa doble: es lo único que separa este email de
        // los otros siete que ese señor va a borrar esta mañana.
        total: specificity * 2 + credibility + easyToReply + naturalness,
        verdict: typeof item.verdict === 'string' ? item.verdict.trim().slice(0, 300) : '',
      }
    })
    .filter(score => score.index >= 0 && score.index < variants.length)
}

/** Paso 5 — pulir el ganador con lo que el juez le reprochó. */
async function polish(input: CopyInput, winner: EmailVariant, critique: string): Promise<EmailVariant | null> {
  const strategy = strategyById(winner.strategyId)
  const parsed = await askJson<unknown>({
    model: smartModel(),
    label: 'polish',
    maxTokens: 1_200,
    system: 'Eres el editor de un copywriter. Cortas, no añades.',
    prompt: `${COPY_RULES}

Este email va a ${input.businessName}. Un lector duro le ha puesto esta pega:
"${critique || 'Ninguna pega concreta: busca tú lo que sobra.'}"

${strategy ? `Está escrito con la estrategia "${strategy.name}". Al arreglarlo, respétala:
${strategy.guidance}
Longitud objetivo: ${strategy.targetWords[0]}–${strategy.targetWords[1]} palabras.
` : ''}
ASUNTO: ${winner.subject}
CUERPO:
${winner.body}${winner.ps ? `\nP.D. ${winner.ps}` : ''}

Arréglalo. Reglas del arreglo:
- No inventes ni un dato nuevo. Solo puedes quitar, reordenar y reescribir lo que ya está.
- Si sobran palabras, quítalas: casi siempre el email mejora acercándose al límite bajo del objetivo.
- Si el email ya cumple, devuélvelo tal cual.

Responde solo JSON: {"subject":"...","body":"...","ps":"..."}`,
  })
  return strategy ? parseVariant(parsed, strategy, winner.angle) : null
}

/** Preheader: la línea que se ve en la bandeja debajo del asunto. */
function preheaderFrom(body: string): string {
  const firstSentence = body.split('\n').find(line => line.trim().length > 20)?.trim() ?? body.trim()
  return firstSentence.split(/(?<=[.?!])\s/)[0].slice(0, 140)
}

function render(variant: EmailVariant, senderOrg: string): string {
  const body = variant.body.trim()
  const signed = new RegExp(senderOrg.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(body)
  return [body, signed ? '' : senderOrg, variant.ps ? `P.D. ${variant.ps}` : '']
    .filter(Boolean)
    .join('\n\n')
}

/**
 * La tubería completa. Devuelve `null` cuando no hay clave: quien llama
 * decide qué hacer sin ella (hoy, un cuerpo de respaldo con los hallazgos).
 */
export async function writeColdEmail(input: CopyInput): Promise<CopyResult | null> {
  if (!isDeepseekConfigured()) return null

  // Pensar antes de elegir, elegir antes de escribir. La hipótesis alimenta la
  // selección de estrategia, así que estos dos van en serie a propósito.
  const hypothesis = await buildHypothesis(input)
  const plan = await selectStrategies(input, hypothesis)

  const variants = await draftVariants(input, hypothesis, plan)
  if (!variants.length) return null

  const scores = await judgeVariants(input, variants)
  const winnerIndex = pickWinner(scores)
  const winner = variants[winnerIndex] ?? variants[0]
  const best = scores.find(score => score.index === winnerIndex) ?? null

  const polished = await polish(input, winner, best?.verdict ?? '')
  const final = polished ?? winner

  return {
    subject: final.subject,
    preheader: preheaderFrom(final.body),
    body: render(final, input.senderOrg),
    kind: input.kind ?? 'outbound',
    attempt: (input.previousEmails?.length ?? 0) + 1,
    hypothesis,
    strategyPlan: plan.map(item => ({ id: item.strategy.id, name: item.strategy.name, why: item.why })),
    variants,
    scores,
    winner: winnerIndex,
    polished: polished !== null,
  }
}

/** Expuesto para las pruebas: la regla de desempate no puede cambiar sin querer. */
export function pickWinner(scores: VariantScore[]): number {
  if (!scores.length) return 0
  return scores.reduce((a, b) => (b.total > a.total ? b : a)).index
}

export { COPY_RULES, VARIANTS, preheaderFrom, render, fastModel }
