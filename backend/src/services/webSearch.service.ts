/**
 * Búsqueda web para la investigación de prospectos.
 *
 * Un resultado de búsqueda ya viene con su cita: el snippet es texto que el
 * buscador afirma haber encontrado en esa URL. Eso encaja con la regla de la
 * cadena —nada se afirma sin cita— sin tener que descargar la página entera.
 *
 * ponytail: un solo proveedor (Brave), una clave, sin capa de abstracción.
 * Cambiar de buscador es reescribir `search()`, no montar un registro de
 * proveedores para el que hoy solo hay uno.
 */

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const MAX_RESULTS = 6

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchAttempt {
  results: SearchResult[]
  attempted: boolean
  ok: boolean
  requestId?: string
  status?: number
}

export function isSearchConfigured(): boolean {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim())
}

function stripHighlight(value: string): string {
  // Brave marca las coincidencias con <strong>; el texto sin marcar es el que
  // se puede citar literalmente.
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

async function performSearch(query: string, opts: { count?: number; country?: string } = {}): Promise<SearchAttempt> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!apiKey || !query.trim()) return { results: [], attempted: false, ok: false }
  const params = new URLSearchParams({
    q: query.trim().slice(0, 380),
    count: String(Math.min(opts.count ?? MAX_RESULTS, 20)),
    country: opts.country ?? (process.env.BRAVE_SEARCH_COUNTRY?.trim() || 'ES'),
    search_lang: 'es',
    safesearch: 'moderate',
  })
  try {
    const response = await fetch(`${ENDPOINT}?${params}`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      signal: AbortSignal.timeout(8_000),
    })
    const requestId = response.headers.get('x-request-id') ?? undefined
    if (!response.ok) {
      console.warn(`[WebSearch] Brave respondió ${response.status}`)
      return { results: [], attempted: true, ok: false, requestId, status: response.status }
    }
    const payload = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
    const results = (payload.web?.results ?? [])
      .map(result => ({
        title: stripHighlight(String(result.title ?? '')),
        url: String(result.url ?? ''),
        snippet: stripHighlight(String(result.description ?? '')),
      }))
      .filter(result => result.url && result.snippet)
    return { results, attempted: true, ok: true, requestId, status: response.status }
  } catch (error) {
    console.warn('[WebSearch] fallo de búsqueda:', (error as Error).message)
    return { results: [], attempted: true, ok: false }
  }
}

/**
 * Variante observable para el adapter: conserva si hubo intento y si Brave
 * respondió correctamente. El servicio legado sigue degradando a [] mediante
 * `search`, pero el router no confunde un fallo con una búsqueda vacía.
 */
export async function searchWithStatus(query: string, opts: { count?: number; country?: string } = {}): Promise<SearchAttempt> {
  return performSearch(query, opts)
}

/** Una consulta. Devuelve [] si no hay clave, si falla o si no hay resultados. */
export async function search(query: string, opts: { count?: number; country?: string } = {}): Promise<SearchResult[]> {
  return (await performSearch(query, opts)).results
}

/**
 * Varias consultas a la vez, deduplicadas por URL. Se lanzan en paralelo
 * porque son independientes y en serie multiplicarían la espera del borrador.
 */
export async function searchMany(queries: string[], perQuery = 4): Promise<SearchResult[]> {
  const batches = await Promise.all(queries.slice(0, 5).map(query => search(query, { count: perQuery })))
  const byUrl = new Map<string, SearchResult>()
  for (const result of batches.flat()) {
    if (!byUrl.has(result.url)) byUrl.set(result.url, result)
  }
  return [...byUrl.values()]
}
