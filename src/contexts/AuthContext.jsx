import { createContext, useContext, useEffect, useState } from 'react'
import { clearAccessToken, getAccessToken, refreshAccessToken, revokeSession, setAccessToken } from '../lib/authSession'
import { loadBrandForHost, setBrand } from '../lib/brand'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAccessToken())
  const [user, setUser] = useState(null)
  const [isRestoring, setIsRestoring] = useState(true)
  // Suplantación activa desde el back office: { sessionId, expiresAt, operator, target }.
  const [impersonation, setImpersonation] = useState(null)

  useEffect(() => {
    let active = true
    // La marca por dominio pinta el login; la de la organización la sustituye
    // en cuanto hay sesión. Sin marca de organización se mantiene la del host.
    loadBrandForHost()
    refreshAccessToken().then(data => {
      if (!active || !data) return
      setToken(data.token)
      setUser(data.user ?? null)
      if (data.brand) setBrand(data.brand)
    }).finally(() => { if (active) setIsRestoring(false) })
    return () => { active = false }
  }, [])

  const login = (t, u, brand) => {
    setAccessToken(t)
    setToken(getAccessToken())
    setUser(u)
    if (brand) setBrand(brand)
  }

  const switchOrganization = async orgId => {
    const response = await fetch('/api/auth/select-organization', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
      body: JSON.stringify({ orgId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.token) throw new Error(data.error || 'No se pudo cambiar de organización')
    setAccessToken(data.token)
    setToken(data.token)
    setUser(data.user ?? null)
    if (data.brand) setBrand(data.brand)
    else await loadBrandForHost()
    return data
  }

  /**
   * Sustituye el token en memoria por el de la sesión suplantada.
   *
   * La cookie de refresco del operador no se toca: el backend nunca entrega el
   * secreto de la sesión suplantada, así que sigue apuntando a su propia
   * sesión. Por eso `stopImpersonation` solo tiene que pedir un refresco normal
   * para recuperar la identidad real — y por eso recargar la página también
   * devuelve al operador a su cuenta.
   */
  const startImpersonation = payload => {
    setImpersonation({
      sessionId: payload.sessionId,
      expiresAt: payload.expiresAt,
      operator: user,
      target: payload.user,
      organization: payload.organization,
    })
    setAccessToken(payload.token)
    setToken(payload.token)
    setUser(payload.user ?? null)
    if (payload.brand) setBrand(payload.brand)
  }

  const stopImpersonation = async () => {
    const sessionId = impersonation?.sessionId
    setImpersonation(null)
    clearAccessToken()
    setToken(null)
    const restored = await refreshAccessToken()
    if (restored) {
      setToken(restored.token)
      setUser(restored.user ?? null)
      if (restored.brand) setBrand(restored.brand)
      // Cortar la sesión suplantada exige el token del operador, así que va
      // después de restaurarlo. Si falla, la sesión caduca sola en 30 minutos.
      if (sessionId) {
        await fetch(`/api/backoffice/impersonate/${encodeURIComponent(sessionId)}/stop`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Authorization: `Bearer ${restored.token}` },
        }).catch(() => {})
      }
    } else {
      setUser(null)
      await loadBrandForHost()
    }
    return Boolean(restored)
  }

  const logout = async () => {
    await revokeSession()
    clearAccessToken()
    setToken(null)
    setUser(null)
    setImpersonation(null)
    await loadBrandForHost()
  }

  return (
    <AuthContext.Provider value={{ token, user, isRestoring, impersonation, login, logout, switchOrganization, startImpersonation, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
