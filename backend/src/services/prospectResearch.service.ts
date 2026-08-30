import { fetchHtml, normalizeUrl } from './digitalAudit.service'
import { askJson, fastModel, isDeepseekConfigured, smartModel } from '../lib/deepseek'
import { isSearchConfigured, searchMany, type SearchResult } from './webSearch.service'

/**
 * Cadena de investigación de un prospecto: recolectar → extraer → verificar →
 * consolidar → elegir ángulo.
 *
 * El principio es el mismo que sostiene el resto del outbound, llevado un paso
 * más allá: **el modelo no decide qué es cierto, el código lo comprueba**. Cada
 * hecho que el modelo extrae viene con una cita literal, y esa cita tiene que
 * aparecer palabra por palabra en el texto de la página o el hecho se tira. Un
 * modelo puede inventarse una cita; no puede hacer que aparezca en una web que
 * no la tiene.
 *
 * Sin esa comprobación esto sería un generador de plausibilidades sobre el
 * negocio de un desconocido, que es la manera más rápida de quemar un dominio.
 */

const MAX_PAGES = 5
const MAX_CHARS_PER_PAGE = 12_000
const MAX_FACTS_PER_PAGE = 4
const MIN_QUOTE_CHARS = 12

/** Rutas que suelen decir algo del negocio, por orden de interés. */
const INTERESTING_PATHS = [
  /sobre|about|quienes|nosotros|equipo|historia/i,
  /servicio|service|tratamiento|producto|clases|carta/i,
  /precio|tarifa|price|plan|bono/i,
  /contacto|contact|cita|reserva|booking|horario/i,
  /blog|noticia|actualidad/i,
]

export interface ResearchSource {
  url: string
  title: string | null
  text: string
  /** `web` = página del negocio. `search` = resultado de búsqueda externo. */
  kind?: 'web' | 'search'
}

export interface ResearchFact {
  /** Lo que se afirma, en una frase. */
  claim: string
  /** De dónde sale. */
  url: string
  /** Fragmento literal de la página que lo sostiene. */
  quote: string
}

export interface ProspectResearch {
  sources: ResearchSource[]
  facts: ResearchFact[]
  /** Hechos que el modelo devolvió y el código descartó por cita no literal. */
  discarded: number
  /** El gancho elegido, en una frase. `null` si no hubo con qué elegirlo. */
  angle: string | null
  /** Las consultas que el modelo decidió buscar por su cuenta. */
  queries: string[]
  /** `false` cuando no había clave de modelo: solo se recolectó. */
  analyzed: boolean
}

/** Texto plano de una página, sin script/style, con los espacios colapsados. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(quot|#34);/gi, '"')
    .replace(/&(apos|#39);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleOf(html: string): string | null {
  return html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i)?.[1].replace(/\s+/g, ' ').trim() || null
}

/**
 * Enlaces internos que merece la pena leer, ordenados por lo que suelen
 * contar. Se queda con el primero de cada categoría: cinco páginas que dicen
 * cosas distintas valen más que cinco variantes de la misma.
 */
export function pickInternalLinks(html: string, baseUrl: string, limit = MAX_PAGES - 1): string[] {
  let origin: string
  try {
    origin = new URL(baseUrl).origin
  } catch {
    return []
  }
  const candidates = new Map<string, string>()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    let resolved: URL
    try {
      resolved = new URL(match[1], baseUrl)
    } catch {
      continue
    }
    if (resolved.origin !== origin) continue
    resolved.hash = ''
    const href = resolved.toString()
    if (href.replace(/\/$/, '') === baseUrl.replace(/\/$/, '')) continue
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|docx?|xlsx?)$/i.test(resolved.pathname)) continue
    const category = INTERESTING_PATHS.findIndex(pattern => pattern.test(resolved.pathname))
    if (category === -1) continue
    if (!candidates.has(String(category))) candidates.set(String(category), href)
  }
  return [...candidates.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, href]) => href)
    .slice(0, limit)
}

/** Paso 1 — recolectar. Solo código: descarga y limpia, no interpreta. */
export async function collectSources(website: string): Promise<ResearchSource[]> {
  const homeUrl = normalizeUrl(website)
  if (!homeUrl) return []
  const home = await fetchHtml(homeUrl)
  if (home.status !== 200 || home.html.length < 200) return []

  const sources: ResearchSource[] = [{
    url: home.info.finalUrl || homeUrl,
    title: titleOf(home.html),
    text: htmlToText(home.html).slice(0, MAX_CHARS_PER_PAGE),
  }]

  // En paralelo: son páginas independientes y en serie multiplicarían la
  // espera de una importación por el número de páginas.
  const links = pickInternalLinks(home.html, home.info.finalUrl || homeUrl)
  const pages = await Promise.all(links.map(async url => {
    const page = await fetchHtml(url, 8_000).catch(() => null)
    if (!page || page.status !== 200 || page.html.length < 200) return null
    const text = htmlToText(page.html)
    if (text.length < 120) return null
    return { url, title: titleOf(page.html), text: text.slice(0, MAX_CHARS_PER_PAGE) }
  }))
  return sources.concat(pages.filter((page): page is ResearchSource => page !== null))
}

/**
 * Normaliza para comparar citas: minúsculas, sin acentos, espacios colapsados
 * y sin puntuación de bordes. Tolera que el modelo cambie mayúsculas o corte
 * por una coma; no tolera que se invente la frase.
 */
function canonical(value: string): string {
  return value
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[«»"“”'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Paso 3 — verificar. La cita tiene que aparecer literalmente en la página.
 * Aquí es donde la cadena se gana el derecho a existir.
 */
export function verifyFacts(facts: ResearchFact[], sources: ResearchSource[]): { kept: ResearchFact[]; discarded: number } {
  const byUrl = new Map(sources.map(source => [source.url, canonical(source.text)]))
  const seen = new Set<string>()
  const kept: ResearchFact[] = []
  let discarded = 0
  for (const fact of facts) {
    const haystack = byUrl.get(fact.url)
    const quote = canonical(fact.quote ?? '')
    if (!haystack || quote.length < MIN_QUOTE_CHARS || !haystack.includes(quote)) {
      discarded++
      continue
    }
    const key = canonical(fact.claim ?? '')
    if (!key || seen.has(key)) { discarded++; continue }
    seen.add(key)
    kept.push({ claim: fact.claim.trim(), url: fact.url, quote: fact.quote.trim() })
  }
  return { kept, discarded }
}

/**
 * Paso 2 — el modelo decide qué buscar. Esto es lo que convierte la cadena en
 * investigación de verdad: ve lo que la web del negocio cuenta de sí mismo y
 * decide qué le falta saber, en vez de ejecutar una lista de consultas fija.
 *
 * Lo que se busca fuera es lo que el negocio no controla —reseñas, prensa,
 * directorios—, que es justo donde están los ganchos que no se pueden fingir.
 */
export async function planQueries(businessName: string, city: string | null, sector: string | null, ownFacts: ResearchFact[], orgId?: string): Promise<string[]> {
  const parsed = await askJson<{ queries?: unknown }>({
    model: smartModel(),
    label: 'plan',
    maxTokens: 500,
    usage: orgId ? { orgId, feature: 'prospect_research' } : undefined,
    prompt: `Vas a escribir un email frío a este negocio y necesitas saber de él lo que su propia web no cuenta.

NEGOCIO: ${businessName}${sector ? ` · ${sector}` : ''}${city ? ` · ${city}` : ''}
LO QUE YA SABES POR SU WEB:
${ownFacts.length ? ownFacts.map(fact => `- ${fact.claim}`).join('\n') : '- Nada todavía.'}

Escribe entre 2 y 4 búsquedas web que te darían el mejor gancho para un email frío. Piensa en lo que el negocio NO controla: qué dicen sus clientes, si ha salido en prensa, si ha abierto o cambiado algo hace poco, cómo lo describen los directorios del sector.

No busques cosas genéricas del sector ni consejos de marketing: solo cosas de ESTE negocio. No repitas lo que ya sabes.

Responde solo JSON: {"queries":["...","..."]}`,
  })
  const queries = Array.isArray(parsed?.queries) ? parsed.queries : []
  return queries
    .filter((query): query is string => typeof query === 'string' && query.trim().length > 3)
    .map(query => query.trim().slice(0, 200))
    .slice(0, 4)
}

/** Los resultados de búsqueda entran en la cadena como fuentes citables. */
function searchResultsAsSources(results: SearchResult[]): ResearchSource[] {
  return results.map(result => ({
    url: result.url,
    title: result.title || null,
    // El snippet es la cita disponible: lo que el buscador afirma haber
    // encontrado ahí. No se descarga la página — con el snippet basta para
    // sostener un gancho, y descargar prensa ajena multiplicaría la espera.
    text: `${result.title}. ${result.snippet}`,
    kind: 'search' as const,
  }))
}

/** Paso 3 — extraer. Una llamada por fuente, en paralelo. */
async function extractFacts(sources: ResearchSource[], orgId?: string): Promise<ResearchFact[]> {
  const perPage = await Promise.all(sources.map(async source => {
    const parsed = await askJson<unknown>({
      model: fastModel(),
      label: 'extract',
      maxTokens: 900,
      usage: orgId ? { orgId, feature: 'prospect_research' } : undefined,
      prompt: `Extrae de este texto hasta ${MAX_FACTS_PER_PAGE} hechos concretos sobre el negocio: qué vende, a quién, qué promete, horarios, ubicación, años de actividad, equipo, precios, qué dicen sus clientes, qué ha cambiado hace poco.

REGLAS
- Solo hechos que estén escritos en el texto. Nada de deducciones ni de contexto general del sector.
- Cada hecho lleva "quote": un fragmento COPIADO LITERALMENTE del texto, entre 12 y 200 caracteres, sin cambiar ni una palabra. Si no puedes copiar un fragmento que lo sostenga, no incluyas el hecho.
- Ignora menús, cookies, avisos legales y pies de página.
- Si la página no dice nada útil del negocio, devuelve [].

TEXTO DE ${source.url}:
"""
${source.text}
"""

Responde solo JSON: {"facts":[{"claim":"...","quote":"..."}]}`,
    })
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { facts?: unknown })?.facts) ? (parsed as { facts: unknown[] }).facts : []
    return list
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(item => ({
        claim: String(item.claim ?? '').slice(0, 300),
        quote: String(item.quote ?? '').slice(0, 300),
        url: source.url,
      }))
      .filter(fact => fact.claim && fact.quote)
      .slice(0, MAX_FACTS_PER_PAGE)
  }))
  return perPage.flat()
}

/** Paso 5 — elegir el ángulo entre lo que se ha verificado. */
async function chooseAngle(businessName: string, facts: ResearchFact[], auditSummary: string, orgId?: string): Promise<string | null> {
  if (!facts.length) return null
  const parsed = await askJson<{ angle?: unknown }>({
    model: smartModel(),
    label: 'angle',
    maxTokens: 600,
    usage: orgId ? { orgId, feature: 'prospect_research' } : undefined,
    prompt: `Eres responsable de captación de una agencia. Vas a escribir un email frío a ${businessName}.

HECHOS VERIFICADOS (lo único que puedes dar por cierto):
${facts.map((fact, index) => `${index + 1}. ${fact.claim} — "${fact.quote}"`).join('\n')}

DIAGNÓSTICO TÉCNICO DE SU PRESENCIA DIGITAL:
${auditSummary}

Elige el ángulo del email: la conexión entre algo específico de ESTE negocio y un problema real de su presencia digital que le esté costando clientes.

Un buen ángulo pasa esta prueba: si copiaras el email y lo mandaras a otro negocio del mismo sector, dejaría de tener sentido. Un halago genérico o un problema técnico sin relación con lo que venden no la pasa.

Responde solo JSON: {"angle":"una frase con el ángulo","why":"por qué le va a importar a este negocio en concreto"}`,
  })
  const angle = typeof parsed?.angle === 'string' ? parsed.angle.trim() : ''
  return angle || null
}

/**
 * La cadena entera: recolectar → extraer de su web → decidir qué buscar →
 * buscar → extraer de lo encontrado → verificar todo → elegir ángulo.
 *
 * Nunca lanza. Un email con auditoría y sin investigación es peor que uno con
 * las dos cosas, pero mucho mejor que ninguno: un fallo aquí degrada, no rompe.
 */
export async function researchProspect(
  website: string,
  auditSummary: string,
  businessName: string,
  // `orgId` sirve al ledger de consumo; sin él la cadena corre igual.
  context: { city?: string | null; sector?: string | null; orgId?: string } = {}
): Promise<ProspectResearch> {
  const empty: ProspectResearch = { sources: [], facts: [], discarded: 0, angle: null, queries: [], analyzed: false }
  try {
    const webSources = await collectSources(website)
    if (!isDeepseekConfigured()) return { ...empty, sources: webSources }

    // Primera pasada: lo que el negocio dice de sí mismo.
    const ownRaw = webSources.length ? await extractFacts(webSources, context.orgId) : []
    const own = verifyFacts(ownRaw, webSources)

    // Segunda pasada: lo que dicen los demás. El modelo decide qué preguntar
    // sabiendo ya lo que la web contaba, así no repite lo que tiene delante.
    let queries: string[] = []
    let searchSources: ResearchSource[] = []
    let searchFacts: ResearchFact[] = []
    let searchDiscarded = 0
    if (isSearchConfigured()) {
      queries = await planQueries(businessName, context.city ?? null, context.sector ?? null, own.kept, context.orgId)
      if (queries.length) {
        searchSources = searchResultsAsSources(await searchMany(queries))
        if (searchSources.length) {
          const verified = verifyFacts(await extractFacts(searchSources, context.orgId), searchSources)
          searchFacts = verified.kept
          searchDiscarded = verified.discarded
        }
      }
    }

    const sources = [...webSources, ...searchSources]
    // Se vuelve a deduplicar sobre el conjunto: la web y una reseña pueden
    // decir lo mismo, y repetirlo en el email lo hace sonar a informe.
    const { kept, discarded } = verifyFacts([...own.kept, ...searchFacts], sources)
    const angle = await chooseAngle(businessName, kept, auditSummary, context.orgId)
    return {
      sources,
      facts: kept,
      discarded: own.discarded + searchDiscarded + discarded,
      angle,
      queries,
      analyzed: true,
    }
  } catch (error) {
    console.warn('[ProspectResearch] la cadena falló:', (error as Error).message)
    return empty
  }
}
