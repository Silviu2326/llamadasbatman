import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RiAlertLine,
  RiArrowRightLine,
  RiCheckboxCircleLine,
  RiCloseLine,
  RiFileList3Line,
  RiGroupLine,
  RiInformationLine,
  RiLock2Line,
  RiRefreshLine,
  RiShieldCheckLine,
  RiTimeLine,
  RiUserAddLine,
  RiUserSettingsLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import PageLoadingState from '../components/ui/PageLoadingState'
import './access-control.css'

const API_ROOT = '/api/access-control'

const ROLE_COPY = {
  owner: { label: 'Propietario', description: 'Titular de la organización y decisiones de máximo alcance.', critical: true },
  admin: { label: 'Administrador', description: 'Configura equipos, integraciones y políticas generales.', critical: true },
  revenue_ops: { label: 'Operaciones de revenue', description: 'Diseña procesos, automatizaciones y experimentación comercial.' },
  sales_manager: { label: 'Responsable de ventas', description: 'Coordina pipeline, equipo y aprobación de cambios comerciales.' },
  sales_rep: { label: 'Comercial', description: 'Trabaja oportunidades y contactos asignados.' },
  marketing_growth: { label: 'Marketing / Growth', description: 'Gestiona campañas, audiencias, activos y experimentos.' },
  analyst: { label: 'Analista', description: 'Consulta métricas y prepara análisis operativos.' },
  compliance: { label: 'Cumplimiento', description: 'Revisa consentimiento, auditoría y políticas reguladas.' },
  finance_controller: { label: 'Control financiero', description: 'Revisa costes y aprueba gasto sin poder solicitarlo.' },
  guest: { label: 'Invitado', description: 'Acceso mínimo y no operativo a la organización.' },
  agent: { label: 'Agente (legacy)', description: 'Compatibilidad temporal con el operador anterior.' },
  viewer: { label: 'Lector (legacy)', description: 'Compatibilidad temporal con el lector anterior.' },
}

const ROLE_ALIASES = {
  owner: 'owner',
  propietario: 'owner',
  admin: 'admin',
  administrator: 'admin',
  administrador: 'admin',
  revenueops: 'revenue_ops',
  revenue_ops: 'revenue_ops',
  salesmanager: 'sales_manager',
  sales_manager: 'sales_manager',
  salesrep: 'sales_rep',
  sales_rep: 'sales_rep',
  marketinggrowth: 'marketing_growth',
  marketing_growth: 'marketing_growth',
  analyst: 'analyst',
  compliance: 'compliance',
  financecontroller: 'finance_controller',
  finance_controller: 'finance_controller',
  guest: 'guest',
  agent: 'agent',
  viewer: 'viewer',
}

function listFrom(payload, names) {
  if (Array.isArray(payload)) return payload
  for (const name of names) {
    if (Array.isArray(payload?.[name])) return payload[name]
    if (Array.isArray(payload?.data?.[name])) return payload.data[name]
  }
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function itemFrom(payload, names) {
  if (!payload || typeof payload !== 'object') return payload
  for (const name of names) {
    if (payload[name] && typeof payload[name] === 'object') return payload[name]
    if (payload.data?.[name] && typeof payload.data[name] === 'object') return payload.data[name]
  }
  return payload.data && typeof payload.data === 'object' ? payload.data : payload
}

function errorFrom(payload, fallback) {
  return payload?.error?.message || payload?.error || payload?.message || fallback
}

async function requestJson(path, options) {
  const response = await apiFetch(path, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorFrom(payload, 'No pudimos completar la operación.'))
  return payload
}

function asText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function roleKey(role) {
  return String(typeof role === 'string' ? role : role?.key || role?.id || role?.value || role?.name || '').trim()
}

function normalizedRoleKey(role) {
  return ROLE_ALIASES[roleKey(role).toLowerCase().replace(/[\s-]/g, '')] || roleKey(role).toLowerCase()
}

function roleMeta(role) {
  const key = normalizedRoleKey(role)
  const apiRole = roleKey(role) || key
  const source = typeof role === 'object' ? role : {}
  const preset = ROLE_COPY[key]
  return {
    key,
    apiRole,
    label: asText(source.label || source.displayName || source.name, preset?.label || apiRole.replaceAll('_', ' ')),
    description: asText(source.description, preset?.description || 'Rol definido en el catálogo de la organización.'),
    critical: Boolean(source.critical ?? source.requiresApproval ?? preset?.critical),
    legacy: Boolean(source.legacy),
  }
}

function memberRole(member) {
  return member.role?.key || member.role?.id || member.role || member.roleKey || member.roleId || 'viewer'
}

function memberName(member) {
  return asText(member.name || member.fullName || member.user?.name || member.email || member.user?.email, 'Usuario sin identificar')
}

function memberEmail(member) {
  return asText(member.email || member.user?.email)
}

function memberId(member) {
  return member.userId || member.user?.id || member.id
}

function requestStatus(request) {
  return String(request.status || 'pending').toLowerCase()
}

function requestRole(request) {
  return request.requestedRole || request.payload?.requestedRole || request.role || request.targetRole || request.newRole || 'viewer'
}

function requestUser(request) {
  const user = request.user || request.requester || request.member || {}
  return asText(user.name || request.userName || request.requesterName || user.email || request.userEmail, 'Usuario sin identificar')
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat(localeCode(getLocale()), { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function PermissionGroup({ group }) {
  return <article className="ac-permission-group">
    <h3>{group.label}</h3>
    <ul>{group.permissions.map(permission => <li key={permission.key}><RiCheckboxCircleLine aria-hidden="true" /><span>{permission.label}</span>{permission.description ? <small>{permission.description}</small> : null}</li>)}</ul>
  </article>
}

function RoleCard({ role, assignedCount }) {
  return <article className="ac-role-card">
    <div className="ac-role-card-head"><span className={role.critical ? 'critical' : ''}><RiShieldCheckLine aria-hidden="true" /></span>{role.critical ? <em>Elevado</em> : null}</div>
    <h3>{role.label}</h3>
    <p>{role.description}</p>
    <footer><span>{assignedCount} {assignedCount === 1 ? 'persona asignada' : 'personas asignadas'}</span></footer>
  </article>
}

function MemberRow({ member, roles, saving, canManage, onChange }) {
  const currentRole = memberRole(member)
  const id = memberId(member)
  const name = memberName(member)
  const role = roleMeta(currentRole)

  return <tr>
    <td><div className="ac-member"><span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span><div><strong>{name}</strong>{memberEmail(member) ? <small>{memberEmail(member)}</small> : null}</div></div></td>
    <td><span className={role.critical ? 'ac-role-badge critical' : 'ac-role-badge'}>{role.label}</span></td>
    <td><label className="ac-role-select"><span className="sr-only">Solicitar cambio de rol de {name}</span><select value={currentRole} disabled={saving || !id || !canManage} onChange={event => onChange(member, event.target.value)}>{roles.map(item => <option key={item.apiRole} value={item.apiRole}>{item.label}</option>)}</select>{saving ? <RiRefreshLine className="ac-spin" aria-label="Guardando cambio" /> : null}</label></td>
  </tr>
}

function RequestRow({ request, busy, onDecide }) {
  const status = requestStatus(request)
  const role = roleMeta(requestRole(request))
  const pending = ['pending', 'requested', 'open'].includes(status)
  const approved = ['approved', 'consumed'].includes(status)
  const reason = asText(request.reason || request.justification || request.message)
  const title = request.type === 'paid_experiment'
    ? 'Solicita aprobar gasto de experimento'
    : request.type === 'playbook_change'
      ? 'Solicita aprobar un cambio de playbook'
      : `Solicita ${role.label}`

  return <article className="ac-request-card">
    <div className="ac-request-top"><div><span>{requestUser(request)}</span><h3>{title}</h3></div><span className={`ac-status ${pending ? 'pending' : approved ? 'approved' : 'rejected'}`}><i aria-hidden="true" />{pending ? 'Pendiente' : approved ? 'Aprobada' : 'Rechazada'}</span></div>
    {reason ? <p>{reason}</p> : <p className="ac-no-reason">Sin justificación registrada.</p>}
    <footer><span><RiTimeLine aria-hidden="true" />{formatDate(request.createdAt || request.requestedAt)}</span>{pending ? <div><button type="button" className="ac-text-button danger" disabled={busy} onClick={() => onDecide(request, 'reject')}>Rechazar</button><button type="button" className="ac-button primary compact" disabled={busy} onClick={() => onDecide(request, 'approve')}><RiCheckboxCircleLine aria-hidden="true" />{busy ? 'Guardando' : 'Aprobar'}</button></div> : null}</footer>
  </article>
}

function EmptyState({ icon: Icon, title, children, action }) {
  return <div className="ac-empty"><span><Icon aria-hidden="true" /></span><h3>{title}</h3><div>{children}</div>{action}</div>
}

function ElevationModal({ members, roles, saving, error, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({ userId: memberId(members[0]) || '', role: roles.find(role => role.critical)?.apiRole || roles[0]?.apiRole || '', reason: '' }))
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.querySelector('select')?.focus()
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, saving])

  function submit(event) {
    event.preventDefault()
    if (!form.userId || !form.role || !form.reason.trim()) return
    onSubmit({ userId: form.userId, role: form.role, reason: form.reason.trim() })
  }

  return <div className="ac-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <form ref={dialogRef} className="ac-modal" role="dialog" aria-modal="true" aria-labelledby="ac-request-title" onSubmit={submit}>
      <header><div><span>Solicitud de elevación</span><h2 id="ac-request-title">Pide un cambio de acceso</h2><p>El solicitante no debe aprobar su propia elevación; otra persona autorizada decide el resultado.</p></div><button type="button" className="ac-icon-button" disabled={saving} onClick={onClose} aria-label="Cerrar"><RiCloseLine aria-hidden="true" /></button></header>
      <div className="ac-modal-body">
        <label className="ac-field"><span>Persona</span><select value={form.userId} required onChange={event => setForm(current => ({ ...current, userId: event.target.value }))}>{members.map(member => <option key={memberId(member)} value={memberId(member)}>{memberName(member)}</option>)}</select></label>
        <label className="ac-field"><span>Rol solicitado</span><select value={form.role} required onChange={event => setForm(current => ({ ...current, role: event.target.value }))}>{roles.map(role => <option key={role.apiRole} value={role.apiRole}>{role.label}</option>)}</select></label>
        <label className="ac-field wide"><span>Justificación</span><textarea value={form.reason} rows="4" maxLength="800" required onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} placeholder="Explica el alcance y la duración necesaria." /></label>
        <aside><RiInformationLine aria-hidden="true" /><span>La solicitud deja trazabilidad de quién pidió el cambio, el rol y la decisión posterior.</span></aside>
      </div>
      {error ? <p className="ac-modal-error" role="alert"><RiAlertLine aria-hidden="true" />{error}</p> : null}
      <footer className="ac-modal-actions"><button type="button" className="ac-button subtle" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className="ac-button primary" disabled={saving}>{saving ? 'Enviando…' : 'Enviar solicitud'}</button></footer>
    </form>
  </div>
}

export default function AccessControlPage() {
  const { locale } = useI18n()
  const [catalog, setCatalog] = useState({ roles: [], permissions: [], canManage: false, currentRole: '' })
  const [members, setMembers] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestError, setRequestError] = useState('')

  async function loadAccessControl({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setLoadError('')
    const responses = await Promise.allSettled([
      requestJson(`${API_ROOT}/catalog`),
      requestJson(`${API_ROOT}/members`),
      requestJson(`${API_ROOT}/requests`),
    ])
    const [catalogResult, membersResult, requestsResult] = responses
    const failures = []
    if (catalogResult.status === 'fulfilled') {
      const data = itemFrom(catalogResult.value, ['catalog']) || {}
      const rawRoles = data.roles
      setCatalog({
        roles: Array.isArray(rawRoles) ? rawRoles : rawRoles && typeof rawRoles === 'object' ? Object.values(rawRoles) : [],
        permissions: data.permissions || data.permissionGroups || [],
        canManage: data.canManage === true,
        currentRole: data.currentRole || '',
      })
    } else { setCatalog({ roles: [], permissions: [], canManage: false, currentRole: '' }); failures.push('catálogo') }
    if (membersResult.status === 'fulfilled') setMembers(listFrom(membersResult.value, ['members', 'items']))
    else { setMembers([]); failures.push('miembros') }
    if (requestsResult.status === 'fulfilled') setRequests(listFrom(requestsResult.value, ['requests', 'items']))
    else { setRequests([]); failures.push('solicitudes') }
    if (failures.length) setLoadError(failures.length === 3 ? 'No pudimos cargar los controles de acceso. Comprueba tus permisos o la conexión.' : `No se pudo actualizar: ${failures.join(', ')}.`)
    if (!silent) setLoading(false)
  }

  useEffect(() => { loadAccessControl() }, [])

  const roles = useMemo(() => listFrom(catalog, ['roles']).map(roleMeta), [catalog])
  const applicationRoles = useMemo(() => roles.filter(role => !role.legacy), [roles])
  const permissionGroups = useMemo(() => {
    const source = catalog.permissions
    if (Array.isArray(source) && source.every(item => Array.isArray(item.permissions))) return source.map(group => ({ label: asText(group.label || group.name, 'Permisos'), permissions: group.permissions.map(permission => ({ key: permission.key || permission.id || permission.name, label: asText(permission.label || permission.name, 'Permiso'), description: asText(permission.description) })) }))
    const flattened = Array.isArray(source) ? source : []
    const groups = new Map()
    flattened.forEach(permission => {
      const raw = typeof permission === 'string' ? { key: permission, label: permission, group: permission.split('.')[0] } : permission
      const group = asText(raw.group || raw.category, 'Otros permisos')
      const entry = groups.get(group) || []
      entry.push({ key: raw.key || raw.id || raw.name, label: asText(raw.label || raw.name || raw.key, 'Permiso'), description: asText(raw.description) })
      groups.set(group, entry)
    })
    return [...groups.entries()].map(([label, permissions]) => ({ label, permissions }))
  }, [catalog])
  const roleCounts = useMemo(() => {
    const counts = {}
    for (const member of members) {
      const key = normalizedRoleKey(memberRole(member))
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [members])
  const pendingRequests = useMemo(() => requests.filter(request => ['pending', 'requested', 'open'].includes(requestStatus(request))), [requests])

  async function changeRole(member, role) {
    const id = memberId(member)
    if (!id || role === memberRole(member)) return
    const key = `member-${id}`
    setBusyKey(key)
    setNotice('')
    try {
      const payload = await requestJson(`${API_ROOT}/requests`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'role_elevation',
          targetUserId: id,
          reason: `Solicitud de cambio de rol de ${memberRole(member)} a ${role}.`,
          payload: { requestedRole: role },
        }),
      })
      const requested = itemFrom(payload, ['request', 'approvalRequest'])
      if (requested?.id) setRequests(current => [requested, ...current])
      setNotice('Cambio enviado para aprobación; el rol actual se mantiene hasta que otra persona lo apruebe.')
    } catch (error) {
      setLoadError(error.message || 'No pudimos actualizar el rol.')
    } finally {
      setBusyKey('')
    }
  }

  async function submitRequest(input) {
    setBusyKey('create-request')
    setRequestError('')
    try {
      const payload = await requestJson(`${API_ROOT}/requests`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'role_elevation',
          targetUserId: input.userId,
          reason: input.reason,
          payload: { requestedRole: input.role },
        }),
      })
      const saved = itemFrom(payload, ['request', 'approvalRequest', 'item'])
      setRequests(current => [saved, ...current])
      setShowRequestModal(false)
      setNotice('Solicitud enviada para revisión.')
    } catch (error) {
      setRequestError(error.message || 'No pudimos enviar la solicitud.')
    } finally {
      setBusyKey('')
    }
  }

  async function decideRequest(request, decision) {
    const key = `request-${request.id}`
    setBusyKey(key)
    setNotice('')
    try {
      const payload = await requestJson(`${API_ROOT}/requests/${request.id}/${decision}`, { method: 'POST', body: JSON.stringify({}) })
      const saved = itemFrom(payload, ['request', 'approvalRequest', 'item'])
      const status = decision === 'approve' ? 'approved' : 'rejected'
      setRequests(current => current.map(item => item.id === request.id ? { ...item, ...saved, status: saved?.status || status } : item))
      if (decision === 'approve' && saved?.member) setMembers(current => current.map(member => memberId(member) === memberId(saved.member) ? { ...member, ...saved.member } : member))
      setNotice(decision === 'approve' ? 'Solicitud aprobada.' : 'Solicitud rechazada.')
    } catch (error) {
      setLoadError(error.message || 'No pudimos revisar la solicitud.')
    } finally {
      setBusyKey('')
    }
  }

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading access controls' : 'Cargando accesos y permisos'} />

  return <main className="ac-page">
    <header className="ac-page-header"><div className="ac-heading"><span><RiLock2Line aria-hidden="true" /></span><div><h1>{locale === 'en' ? 'Access and permissions' : 'Accesos y permisos'}</h1><p>{locale === 'en' ? 'Manage organization roles, review elevations and preserve separation of duties.' : 'Administra roles de la organización, revisa elevaciones y conserva la separación de funciones.'}</p></div></div></header>

    <section className="ac-command" aria-label="Resumen de gobierno de accesos"><div><span>Gobierno empresarial</span><h2>El acceso correcto, con una decisión trazable.</h2><p>Los permisos se organizan por función. Para accesos elevados, el flujo de solicitud y aprobación evita que una sola persona concentre toda la decisión.</p></div><dl><div><dt>{applicationRoles.length}</dt><dd>roles operativos</dd></div><div><dt>{members.length}</dt><dd>miembros visibles</dd></div><div><dt>{pendingRequests.length}</dt><dd>revisiones pendientes</dd></div></dl></section>

    {loadError ? <div className="ac-load-error" role="alert"><RiAlertLine aria-hidden="true" /><span>{loadError}</span><button type="button" onClick={loadAccessControl}>Reintentar</button></div> : null}

    <section className="ac-section" aria-labelledby="ac-roles-title"><div className="ac-section-header"><div><span>Catálogo de roles</span><h2 id="ac-roles-title">Responsabilidades de la organización</h2><p>Los roles se cargan desde la política de la organización y se muestran con nombres comprensibles en español.</p></div></div>{loading ? <div className="ac-state"><i /><p>Cargando catálogo de roles…</p></div> : applicationRoles.length ? <div className="ac-role-grid">{applicationRoles.map(role => <RoleCard key={role.apiRole} role={role} assignedCount={roleCounts[role.key] || 0} />)}</div> : <EmptyState icon={RiShieldCheckLine} title="El catálogo de roles no está disponible"><p>No se inventan roles ni permisos: aparecerán cuando el servidor entregue la política aplicable a esta organización.</p></EmptyState>}</section>

    <section className="ac-section ac-sod" aria-labelledby="ac-sod-title"><div className="ac-sod-icon"><RiUserSettingsLine aria-hidden="true" /></div><div><span>Separación de funciones (SoD)</span><h2 id="ac-sod-title">Solicitar no es aprobar</h2><p>La elevación de acceso debe contar con una justificación y una revisión de otra persona autorizada. El servidor es quien aplica estas reglas y registra el resultado.</p></div></section>

    <section className="ac-grid">
      <section className="ac-section ac-members" aria-labelledby="ac-members-title"><div className="ac-section-header"><div><span>Miembros</span><h2 id="ac-members-title">Acceso actual</h2><p>Cambiar un rol crea una solicitud revisable; el servidor aplica la separación de funciones.</p></div><button type="button" className="ac-button primary" disabled={loading || !catalog.canManage || !members.length || !applicationRoles.length} onClick={() => { setRequestError(''); setShowRequestModal(true) }}><RiUserAddLine aria-hidden="true" />Solicitar acceso</button></div>{loading ? <div className="ac-state compact"><i /><p>Cargando miembros…</p></div> : members.length ? <div className="ac-table-wrap"><table><thead><tr><th scope="col">Miembro</th><th scope="col">Rol actual</th><th scope="col">Solicitar cambio</th></tr></thead><tbody>{members.map(member => <MemberRow key={memberId(member)} member={member} roles={roles} saving={busyKey === `member-${memberId(member)}`} canManage={catalog.canManage} onChange={changeRole} />)}</tbody></table></div> : <EmptyState icon={RiGroupLine} title="No hay miembros que mostrar"><p>Cuando existan usuarios dentro de tu alcance, sus roles aparecerán aquí.</p></EmptyState>}</section>

      <section className="ac-section ac-requests" aria-labelledby="ac-requests-title"><div className="ac-section-header"><div><span>Flujo de aprobación</span><h2 id="ac-requests-title">Solicitudes de acceso</h2><p>Decide cada petición con el contexto registrado.</p></div></div>{loading ? <div className="ac-state compact"><i /><p>Cargando solicitudes…</p></div> : requests.length ? <div className="ac-request-list">{requests.map(request => <RequestRow key={request.id} request={request} busy={busyKey === `request-${request.id}`} onDecide={decideRequest} />)}</div> : <EmptyState icon={RiFileList3Line} title="No hay solicitudes"><p>Las peticiones de acceso aparecerán aquí cuando alguien solicite una elevación o cuando la política requiera aprobación.</p></EmptyState>}</section>
    </section>

    <section className="ac-section ac-permissions" aria-labelledby="ac-permissions-title"><div className="ac-section-header"><div><span>Permisos</span><h2 id="ac-permissions-title">Capacidades agrupadas</h2><p>Consulta cómo se reparte el acceso sin perder de vista el ámbito de cada permiso.</p></div></div>{loading ? <div className="ac-state compact"><i /><p>Cargando permisos…</p></div> : permissionGroups.length ? <div className="ac-permission-grid">{permissionGroups.map(group => <PermissionGroup key={group.label} group={group} />)}</div> : <EmptyState icon={RiLock2Line} title="No hay permisos que mostrar"><p>El catálogo del servidor definirá los permisos y sus agrupaciones cuando estén disponibles.</p></EmptyState>}</section>

    {notice ? <div className="ac-toast" role="status"><RiCheckboxCircleLine aria-hidden="true" /><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Cerrar aviso"><RiCloseLine aria-hidden="true" /></button></div> : null}
    {showRequestModal ? <ElevationModal members={members} roles={applicationRoles} saving={busyKey === 'create-request'} error={requestError} onClose={() => { if (busyKey !== 'create-request') setShowRequestModal(false) }} onSubmit={submitRequest} /> : null}
  </main>
}
