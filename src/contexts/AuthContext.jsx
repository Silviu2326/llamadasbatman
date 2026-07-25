import { createContext, useContext, useEffect, useState } from 'react'
import { clearAccessToken, getAccessToken, refreshAccessToken, revokeSession, setAccessToken } from '../lib/authSession'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAccessToken())
  const [user, setUser] = useState(null)
  const [isRestoring, setIsRestoring] = useState(true)

  useEffect(() => {
    let active = true
    refreshAccessToken().then(data => {
      if (!active || !data) return
      setToken(data.token)
      setUser(data.user ?? null)
    }).finally(() => { if (active) setIsRestoring(false) })
    return () => { active = false }
  }, [])

  const login = (t, u) => {
    setAccessToken(t)
    setToken(getAccessToken())
    setUser(u)
  }

  const logout = async () => {
    await revokeSession()
    clearAccessToken()
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, isRestoring, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
