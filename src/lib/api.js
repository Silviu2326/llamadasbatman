import { clearAccessToken, getAccessToken, refreshAccessToken } from './authSession'

// La cabecera JSON solo se envía cuando de verdad viaja un cuerpo JSON. Fastify
// rechaza `Content-Type: application/json` con cuerpo vacío
// (FST_ERR_CTP_EMPTY_JSON_BODY -> 400), y muchas acciones del producto son POST
// sin payload: validar/publicar/pausar campañas, favoritos, duplicar, takeover…
// Anunciarla siempre hacía que todas ellas fallasen con "Bad Request".
function jsonContentType(body) {
  if (typeof body !== 'string' || body.length === 0) return null
  return { 'Content-Type': 'application/json' }
}

function request(path, options) {
  const token = getAccessToken()
  const locale = typeof window !== 'undefined'
    ? window.localStorage?.getItem('vozia:locale:v1') || 'es'
    : 'es'
  return fetch(path, {
    ...options,
    credentials: options.credentials ?? 'same-origin',
    headers: {
      ...jsonContentType(options.body),
      'Accept-Language': locale,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
}

export async function apiFetch(path, options = {}) {
  let response = await request(path, options)
  const isAuthEndpoint = path.startsWith('/api/auth/')
  if (response.status === 401 && !isAuthEndpoint) {
    const refreshed = await refreshAccessToken()
    if (refreshed) response = await request(path, options)
  }
  if (response.status === 401 && !isAuthEndpoint) {
    clearAccessToken()
    if (window.location.pathname !== '/login') window.location.assign('/login')
  }
  return response
}
