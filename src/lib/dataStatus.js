export function classifyFetchError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return /failed to fetch|network|load failed|offline|timed out|timeout/.test(message)
    ? 'disconnected'
    : 'error'
}

/**
 * Fallos que se arreglan solos si se vuelve a preguntar en un segundo.
 *
 * El Postgres de la plataforma es serverless y suspende el cómputo tras unos
 * minutos sin tráfico: la primera petición después de esa pausa puede fallar al
 * conectar, y `middlewares/authenticate.ts` la devuelve como 503 con el código
 * DATABASE_UNAVAILABLE. Lo mismo pasa mientras el backend se reinicia, cuando el
 * proxy de desarrollo responde 5xx porque nadie escucha todavía. En los tres
 * casos no hay nada que «comprobar»: hay que reintentar.
 */
export function isRetryableDataError(error) {
  if (error?.code === 'DATABASE_UNAVAILABLE') return true
  const status = Number(error?.status)
  if (Number.isFinite(status)) return status >= 500 && status !== 501
  return classifyFetchError(error) === 'disconnected'
}

/** Espera creciente entre reintentos, en milisegundos. */
export function retryDelayMs(attempt) {
  return [700, 1600, 3200][attempt] ?? 3200
}

// A successful HTTP response is not automatically a live data state.  A
// number of endpoints legitimately return an empty object/array when the
// integration is connected but has not produced activity yet.  Keeping this
// check in one place prevents pages from showing fabricated zeroes or
// claiming that a metric is synchronized just because `response.ok` was true.
export function hasMeaningfulPayload(payload, {
  numericKeys = [],
  collectionKeys = [],
} = {}) {
  if (!payload || typeof payload !== 'object') return false
  if (numericKeys.some(key => payload[key] != null && Number.isFinite(Number(payload[key])))) return true
  if (collectionKeys.some(key => Array.isArray(payload[key]) && payload[key].length > 0)) return true
  if (Array.isArray(payload)) return payload.length > 0
  return false
}

export function statusForPayload({ loading = false, error = '', payload, demo = false, numericKeys, collectionKeys } = {}) {
  if (loading) return 'loading'
  if (error) return error === 'disconnected' ? 'disconnected' : 'error'
  if (demo) return 'demo'
  return hasMeaningfulPayload(payload, { numericKeys, collectionKeys }) ? 'live' : 'empty'
}

export function statusForCollection({ loading = false, error = '', items = [], demo = false } = {}) {
  if (loading) return 'loading'
  if (error) return error === 'disconnected' ? 'disconnected' : 'error'
  if (demo) return 'demo'
  return Array.isArray(items) && items.length > 0 ? 'live' : 'empty'
}

export function statusMessage(status, {
  loading = 'Cargando datos reales…',
  live = 'Datos reales sincronizados con tu organización.',
  empty = 'La conexión está disponible, pero todavía no hay datos para mostrar.',
  disconnected = 'No se pudo conectar con la fuente de datos.',
  error = 'La fuente de datos devolvió un error.',
  demo = 'Modo demo explícito: estos datos no representan actividad real.',
} = {}) {
  return { loading, live, empty, disconnected, error, demo }[status] || error
}
