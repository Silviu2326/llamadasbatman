import { clearAccessToken, getAccessToken, refreshAccessToken } from './authSession'

function request(path, options) {
  const token = getAccessToken()
  const locale = typeof window !== 'undefined'
    ? window.localStorage?.getItem('vozia:locale:v1') || 'es'
    : 'es'
  return fetch(path, {
    ...options,
    credentials: options.credentials ?? 'same-origin',
    headers: {
      'Content-Type': 'application/json',
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
