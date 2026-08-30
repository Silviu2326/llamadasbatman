import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n'
import AppShell from './AppShell'

export default function ProtectedRoute() {
  const { locale } = useI18n()
  const { token, isRestoring } = useAuth()

  if (isRestoring) {
    return <main aria-busy="true" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text-2)' }}>{locale === 'en' ? 'Restoring session…' : 'Restaurando sesión…'}</main>
  }
  if (!token) return <Navigate to="/login" replace />

  return <AppShell><Outlet /></AppShell>
}
