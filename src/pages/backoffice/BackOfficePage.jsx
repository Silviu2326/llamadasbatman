import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { RiShieldKeyholeLine } from 'react-icons/ri'
import { useAuth } from '../../contexts/AuthContext'
import ProductPageHeader from '../../components/ui/ProductPageHeader'
import PageLoadingState from '../../components/ui/PageLoadingState'
import { backOffice } from './backOfficeApi'
import { ActionDialog, ErrorNote, Field, Toast } from './ui'
import OverviewSection from './OverviewSection'
import OrganizationsSection from './OrganizationsSection'
import UsersSection from './UsersSection'
import PermissionsSection from './PermissionsSection'
import SessionsSection from './SessionsSection'
import AuditSection from './AuditSection'
import './backoffice.css'

/**
 * La sección vive en la ruta, no en la query: `/backoffice/usuarios`. Así la
 * sidebar la lista como un módulo más (ver `APP_MODULES`, espacio `backoffice`)
 * y no hay dos fuentes de verdad para «dónde estoy». El foco sobre una
 * organización o una persona sí sigue en la query, porque es un detalle dentro
 * de la sección y no un sitio al que se navega desde el menú.
 */
const ROOT = '/backoffice'
const SECTIONS = ['resumen', 'organizaciones', 'usuarios', 'permisos', 'credenciales', 'auditoria']
const DEFAULT_SECTION = SECTIONS[0]

function sectionFromPath(pathname) {
  const segment = pathname.replace(`${ROOT}`, '').split('/').filter(Boolean)[0]
  return SECTIONS.includes(segment) ? segment : DEFAULT_SECTION
}

function pathForSection(section) {
  return section === DEFAULT_SECTION ? ROOT : `${ROOT}/${section}`
}

export default function BackOfficePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { startImpersonation } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [matrix, setMatrix] = useState(null)
  const [bootError, setBootError] = useState('')
  const [notice, setNotice] = useState('')
  const [impersonating, setImpersonating] = useState(null)
  const [impersonationError, setImpersonationError] = useState('')
  const [busy, setBusy] = useState(false)

  const activeId = sectionFromPath(location.pathname)
  const focusOrg = searchParams.get('org') || null
  const focusUser = searchParams.get('usuario') || null

  // Los enlaces antiguos usaban `?tab=`. Se traducen a la ruta equivalente en
  // vez de romperse: sale barato y evita que un marcador guardado aterrice
  // siempre en el resumen.
  const legacyTab = searchParams.get('tab')
  useEffect(() => {
    if (!legacyTab) return
    const params = new URLSearchParams(searchParams)
    params.delete('tab')
    const target = SECTIONS.includes(legacyTab) ? legacyTab : DEFAULT_SECTION
    navigate({ pathname: pathForSection(target), search: params.toString() }, { replace: true })
  }, [legacyTab, navigate, searchParams])

  // Una sección inventada (`/backoffice/loquesea`) no casa con ningún módulo y
  // dejaría al shell pintando el espacio equivocado en el rail. Se normaliza a
  // la ruta canónica de la sección que se va a renderizar de todos modos.
  const canonicalPath = pathForSection(activeId)
  useEffect(() => {
    if (legacyTab || location.pathname === canonicalPath) return
    navigate({ pathname: canonicalPath, search: searchParams.toString() }, { replace: true })
  }, [canonicalPath, legacyTab, location.pathname, navigate, searchParams])

  const loadMatrix = useCallback(async () => {
    setBootError('')
    try {
      setMatrix(await backOffice.permissions())
    } catch (caught) {
      setBootError(caught.message)
    }
  }, [])

  useEffect(() => { loadMatrix() }, [loadMatrix])

  /** Un solo sitio decide la URL: sección y foco viajan juntos y son enlazables. */
  const go = useCallback(({ section, ...focus }) => {
    const params = new URLSearchParams(searchParams)
    params.delete('tab')
    for (const [key, value] of Object.entries(focus)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    if (section) navigate({ pathname: pathForSection(section), search: params.toString() })
    else setSearchParams(params)
  }, [navigate, searchParams, setSearchParams])

  const openOrganization = useCallback(id => go({ section: 'organizaciones', org: id, usuario: null }), [go])
  const openUser = useCallback(id => go({ section: 'usuarios', usuario: id, org: null }), [go])
  const notify = useCallback(message => setNotice(message), [])

  const catalog = useMemo(() => ({
    matrix,
    // `roles` son los que se ofrecen al asignar: solo los vigentes, para no
    // meter a nadie nuevo en un rol heredado. `allRoles` incluye los heredados
    // porque un desplegable cuyo valor actual es 'agent' o 'viewer' necesita esa
    // opción para mostrarse correctamente en vez de aparecer vacío.
    roles: (matrix?.roles || []).filter(role => !role.legacy),
    allRoles: matrix?.roles || [],
    plans: (matrix?.plans || []).map(entry => entry.plan),
  }), [matrix])

  async function confirmImpersonation(reason) {
    setBusy(true)
    setImpersonationError('')
    try {
      const result = await backOffice.impersonate({
        userId: impersonating.user.id,
        orgId: impersonating.orgId || undefined,
        reason,
      })
      startImpersonation(result)
      setImpersonating(null)
      // Se sale del back office a propósito: la sesión suplantada no puede
      // usarlo, así que quedarse aquí solo produciría 403 en cada llamada.
      navigate('/dashboard')
    } catch (caught) {
      setImpersonationError(caught.message)
    } finally {
      setBusy(false)
    }
  }

  if (bootError) {
    return <main className="bo-page">
      <ErrorNote error={bootError} onRetry={loadMatrix} />
    </main>
  }
  if (!matrix) return <PageLoadingState label="Cargando el back office" />

  return <main className="bo-page dark-scroll">
    <ProductPageHeader
      Icon={RiShieldKeyholeLine}
      title="Back office"
      description="Consola de operador: todas las organizaciones, usuarios, permisos y credenciales de la plataforma. Cada acción queda registrada con tu nombre y el motivo."
    />

    <div className="bo-body">
      {activeId === 'resumen' ? <OverviewSection onOpenOrganization={openOrganization} onOpenUser={openUser} /> : null}

      {activeId === 'organizaciones' ? <OrganizationsSection
        catalog={catalog}
        focusId={focusOrg}
        onFocus={id => go({ org: id })}
        onOpenUser={openUser}
        onImpersonate={(user, orgId) => { setImpersonationError(''); setImpersonating({ user, orgId }) }}
        notify={notify}
      /> : null}

      {activeId === 'usuarios' ? <UsersSection
        catalog={catalog}
        focusId={focusUser}
        onFocus={id => go({ usuario: id })}
        onOpenOrganization={openOrganization}
        onImpersonate={(user, orgId) => { setImpersonationError(''); setImpersonating({ user, orgId }) }}
        notify={notify}
      /> : null}

      {activeId === 'permisos' ? <PermissionsSection catalog={catalog} /> : null}

      {activeId === 'credenciales' ? <SessionsSection
        onOpenUser={openUser}
        onOpenOrganization={openOrganization}
        notify={notify}
      /> : null}

      {activeId === 'auditoria' ? <AuditSection onOpenUser={openUser} onOpenOrganization={openOrganization} /> : null}
    </div>

    {impersonating ? <ActionDialog
      title={`Entrar como ${impersonating.user.name}`}
      description="Verás la plataforma exactamente como la ve esa persona. La sesión dura 30 minutos, no se renueva y no puede volver al back office. Todo lo que hagas queda registrado a tu nombre."
      confirmLabel="Entrar como esta persona"
      danger
      busy={busy}
      error={impersonationError}
      onClose={() => setImpersonating(null)}
      onSubmit={confirmImpersonation}
    >
      <Field label="Cuenta">
        <input value={`${impersonating.user.name} · ${impersonating.user.email}`} readOnly />
      </Field>
    </ActionDialog> : null}

    <Toast message={notice} onClose={() => setNotice('')} />
  </main>
}
