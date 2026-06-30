import { useState, useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from './Sidebar'
import { RiMenuLine } from 'react-icons/ri'

export default function ProtectedRoute() {
  const { token } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Close sidebar on page navigation (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  if (!token) return <Navigate to="/login" replace />

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#080c14', overflow: 'hidden' }}>
      <Sidebar isOpen={sidebarOpen} />

      {/* Backdrop — CSS shows it only on mobile when open */}
      <div
        className={`mobile-backdrop${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Content column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Mobile-only header — CSS hides it on desktop */}
        <header
          className="mobile-header"
          style={{
            alignItems: 'center', gap: 14,
            height: 54, padding: '0 16px', flexShrink: 0,
            background: '#0d1117',
            borderBottom: '1px solid #1e2433',
          }}
        >
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, flexShrink: 0,
              background: sidebarOpen ? '#1e2433' : 'transparent',
              border: '1px solid #1e2433',
              borderRadius: 9, color: '#94a3b8', cursor: 'pointer',
              transition: 'background .15s',
            }}
          >
            <RiMenuLine style={{ width: 18, height: 18 }} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <img src="/logo.png" alt="VozIA" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.4 }}>VozIA</span>
          </div>
        </header>

        {/* Page content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
