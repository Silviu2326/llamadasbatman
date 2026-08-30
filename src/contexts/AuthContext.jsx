import { createContext, useContext, useEffect, useState } from 'react'
import { clearAccessToken, getAccessToken, refreshAccessToken, revokeSession, setAccessToken } from '../lib/authSession'
import { loadBrandForHost, setBrand } from '../lib/brand'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAccessToken())
  const [user, setUser] = useState(null)
  const [isRestoring, setIsRestoring] = useState(true)

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

  const logout = async () => {
    await revokeSession()
    clearAccessToken()
    setToken(null)
    setUser(null)
    await loadBrandForHost()
  }

  return (
    <AuthContext.Provider value={{ token, user, isRestoring, login, logout, switchOrganization }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
