import { useState, useEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from './Sidebar'
import AppErrorBoundary from './AppErrorBoundary'
import { RiMenuLine } from 'react-icons/ri'
import { useI18n } from '../i18n'

export default function ProtectedRoute() {
  const { locale } = useI18n()
  const { token, isRestoring } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const location = useLocation()

  // Close sidebar on page navigation (mobile).
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!sidebarOpen) return
    const frame = requestAnimationFrame(() => {
      document.querySelector('.sidebar-aside a, .sidebar-aside button')?.focus()
    })
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setSidebarOpen(false)
      requestAnimationFrame(() => menuButtonRef.current?.focus())
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [sidebarOpen])

  const closeSidebar = () => {
    setSidebarOpen(false)
    requestAnimationFrame(() => menuButtonRef.current?.focus())
  }

  if (isRestoring) return <main aria-busy="true" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text-2)' }}>{locale === 'en' ? 'Restoring session…' : 'Restaurando sesión…'}</main>
  if (!token) return <Navigate to="/login" replace />

  return (
    <div style={{ display: 'flex', height: '100dvh', background: 'var(--bg)', overflow: 'hidden' }}>
      <Sidebar isOpen={sidebarOpen} />

      <div
        className={`mobile-backdrop${sidebarOpen ? ' open' : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <header
          className="mobile-header"
          style={{
            alignItems: 'center', gap: 14,
            height: 54, padding: '0 16px', flexShrink: 0,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => sidebarOpen ? closeSidebar() : setSidebarOpen(true)}
            aria-label={sidebarOpen ? (locale === 'en' ? 'Close navigation menu' : 'Cerrar menú de navegación') : (locale === 'en' ? 'Open navigation menu' : 'Abrir menú de navegación')}
            aria-expanded={sidebarOpen}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, flexShrink: 0,
              background: sidebarOpen ? 'var(--line)' : 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 9, color: 'var(--muted)', cursor: 'pointer',
              transition: 'background .15s',
            }}
          >
            <RiMenuLine aria-hidden="true" style={{ width: 18, height: 18 }} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <img src="/logo.png" alt="Vendrava" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: -0.4 }}>Vendrava</span>
          </div>
        </header>

        <main id="main-content" style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
          {/* Un fallo de render de una página no debe tumbar el shell: la navegación sigue
              viva y cambiar de ruta (key) resetea el boundary. */}
          <AppErrorBoundary key={location.pathname}>
            <Outlet />
          </AppErrorBoundary>
        </main>
      </div>
    </div>
  )
}
