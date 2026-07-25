// El access token vive únicamente en memoria. La sesión persistente es una
// cookie HttpOnly gestionada por el backend, por lo que una XSS no puede leer
// ni exfiltrar una credencial de larga duración desde localStorage.
let accessToken = null
let refreshPromise = null

export function getAccessToken() {
  return accessToken
}

export function hasAccessToken() {
  return Boolean(accessToken)
}

export function setAccessToken(token) {
  accessToken = typeof token === 'string' && token ? token : null
}

export function clearAccessToken() {
  accessToken = null
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(async response => {
        if (!response.ok) return null
        const data = await response.json()
        if (!data?.token) return null
        setAccessToken(data.token)
        return data
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export async function revokeSession() {
  const token = getAccessToken()
  clearAccessToken()
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: 'same-origin',
    })
  } catch {
    // El borrado local sigue siendo correcto si no hay red; el cookie expirará
    // o se revocará en el siguiente logout autenticado.
  }
}
