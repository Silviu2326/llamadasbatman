export function classifyFetchError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return /failed to fetch|network|load failed|offline|timed out|timeout/.test(message)
    ? 'disconnected'
    : 'error'
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
