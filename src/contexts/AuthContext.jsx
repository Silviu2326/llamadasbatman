import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('vozia_token'))
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('vozia_user')
    return u ? JSON.parse(u) : null
  })

  const login = (t, u) => {
    localStorage.setItem('vozia_token', t)
    localStorage.setItem('vozia_user', JSON.stringify(u))
    setToken(t)
    setUser(u)
  }

  const logout = () => {
    localStorage.removeItem('vozia_token')
    localStorage.removeItem('vozia_user')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
