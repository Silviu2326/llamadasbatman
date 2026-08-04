import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

const ADMIN_ROLES = new Set(['owner', 'admin'])

function permissionList(payload) {
  const catalog = payload?.catalog || payload?.data || payload || {}
  const granted = Array.isArray(catalog.grantedPermissions) ? catalog.grantedPermissions : []
  return new Set(granted.map(item => typeof item === 'string' ? item : item?.key).filter(Boolean))
}

export default function AdminRoute({ children, permission }) {
  const { locale } = useI18n()
  const { token, user, isRestoring } = useAuth()
  const [access, setAccess] = useState('checking')

  useEffect(() => {
    let active = true

    async function checkAccess() {
      if (isRestoring || !token) return

      // Legacy admin-only routes keep their existing role guard until they
      // declare a concrete backend permission.
      if (!permission) {
        if (active) setAccess(ADMIN_ROLES.has(user?.role) ? 'allowed' : 'denied')
        return
      }

      try {
        const response = await apiFetch('/api/access-control/catalog')
        const payload = await response.json().catch(() => null)
        const allowed = response.ok && permissionList(payload).has(permission)
        if (active) setAccess(allowed ? 'allowed' : 'denied')
      } catch {
        // No capability response means no access. The route must fail closed.
        if (active) setAccess('denied')
      }
    }

    checkAccess()
    return () => { active = false }
  }, [isRestoring, permission, token, user?.role])

  if (isRestoring || (token && access === 'checking')) {
    return <main aria-busy="true" style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 32, background: 'var(--bg)', color: 'var(--text-2)' }}>{locale === 'en' ? 'Checking permissions…' : 'Comprobando permisos…'}</main>
  }
  if (!token || access !== 'allowed') return <Navigate to="/dashboard" replace />
  return children
}
