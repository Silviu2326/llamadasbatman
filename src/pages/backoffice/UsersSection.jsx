import { useCallback, useEffect, useState } from 'react'
import { RiArrowLeftLine, RiFileCopyLine, RiSearchLine } from 'react-icons/ri'
import { backOffice, formatDate, relativeTime, sessionState } from './backOfficeApi'
import { ActionDialog, Badge, EmptyState, ErrorNote, Field, Pager, Spinner } from './ui'

function UserList({ catalog, onOpen, onImpersonate }) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ q: '', role: '', platformAdminsOnly: '' })
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await backOffice.users({ ...filters, page }))
    } catch (caught) {
      setError(caught.message)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { load() }, [load])

  function applySearch(event) {
    event.preventDefault()
    setPage(1)
    setFilters(current => ({ ...current, q: search.trim() }))
  }

  return <div className="bo-section">
    <div className="bo-toolbar">
      <form className="bo-search" onSubmit={applySearch}>
        <RiSearchLine aria-hidden="true" />
        <input type="search" value={search} placeholder="Nombre, email o ID" aria-label="Buscar usuarios" onChange={event => setSearch(event.target.value)} />
        <button type="submit" className="bo-button">Buscar</button>
      </form>
      <label className="bo-inline-field">
        <span>Rol</span>
        <select value={filters.role} onChange={event => { setPage(1); setFilters(current => ({ ...current, role: event.target.value })) }}>
          <option value="">Todos</option>
          {catalog.allRoles.map(role => <option key={role.key} value={role.key}>{role.label}</option>)}
        </select>
      </label>
      <label className="bo-check">
        <input
          type="checkbox"
          checked={filters.platformAdminsOnly === 'true'}
          onChange={event => { setPage(1); setFilters(current => ({ ...current, platformAdminsOnly: event.target.checked ? 'true' : '' })) }}
        />
        <span>Solo operadores</span>
      </label>
    </div>

    <ErrorNote error={error} onRetry={load} />
    {loading && !data ? <Spinner label="Cargando usuarios" /> : null}

    {data ? data.users.length ? <>
      <div className="bo-table-wrap">
        <table>
          <thead><tr><th scope="col">Usuario</th><th scope="col">Organizaciones</th><th scope="col">Alta</th><th scope="col">Acciones</th></tr></thead>
          <tbody>
            {data.users.map(user => <tr key={user.id}>
              <td>
                <button type="button" className="bo-link bo-link--strong" onClick={() => onOpen(user.id)}>{user.name}</button>
                <small className="bo-muted">{user.email}</small>
              </td>
              <td>
                <div className="bo-chips">
                  {user.memberships.map(membership => <span key={membership.orgId} className="bo-chip" title={`${membership.org.name} · ${membership.role} · ${membership.status}`}>
                    {membership.org.name}<small>{membership.role}</small>
                  </span>)}
                  {user.isPlatformAdmin ? <Badge tone="warn">Operador</Badge> : null}
                </div>
              </td>
              <td title={formatDate(user.createdAt, true)}>{formatDate(user.createdAt)}</td>
              <td className="bo-row-actions">
                <button type="button" className="bo-button bo-button--small" disabled={user.isPlatformAdmin} onClick={() => onImpersonate(user)}>Entrar como</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pages={data.pages} total={data.total} busy={loading} onChange={setPage} />
    </> : <EmptyState title="Ningún usuario coincide">Prueba con otro término o quita los filtros.</EmptyState> : null}
  </div>
}

function UserDetail({ id, catalog, onBack, onOpenOrganization, onImpersonate, notify }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState({ name: '', email: '' })
  const [temporaryPassword, setTemporaryPassword] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await backOffice.user(id)
      setData(result)
      setProfile({ name: result.user.name, email: result.user.email })
    } catch (caught) {
      setError(caught.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function run(action, successMessage) {
    setBusy(true)
    setDialogError('')
    try {
      const result = await action()
      setDialog(null)
      notify(successMessage)
      await load()
      return result
    } catch (caught) {
      setDialogError(caught.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Spinner label="Cargando el usuario" />
  if (!data) return <div className="bo-section"><ErrorNote error={error} onRetry={load} /></div>

  const { user } = data
  const profileChanged = profile.name !== user.name || profile.email !== user.email

  return <div className="bo-section">
    <button type="button" className="bo-back" onClick={onBack}><RiArrowLeftLine aria-hidden="true" />Volver a usuarios</button>
    <ErrorNote error={error} onRetry={load} />

    <header className="bo-detail-head">
      <div>
        <h2>{user.name}</h2>
        <p className="bo-muted"><code>{user.id}</code> · {user.email} · alta {formatDate(user.createdAt)}</p>
      </div>
      <div className="bo-detail-badges">
        {user.isPlatformAdmin ? <Badge tone="warn">Operador de plataforma</Badge> : null}
        {user.preference ? <Badge tone="neutral">{user.preference.locale}</Badge> : null}
      </div>
    </header>

    {user.isPlatformAdmin ? <p className="bo-note bo-note--warn">
      Es operador de plataforma. El privilegio no se concede ni se retira desde aquí: se hace en el servidor con
      <code> npm run platform:admin -- {user.email} [--revoke]</code>. Si esta interfaz pudiera otorgarlo, comprometer una sola
      cuenta bastaría para crear operadores nuevos y revocarla dejaría de servir de nada.
    </p> : null}

    <div className="bo-split">
      <section className="bo-card">
        <h3>Datos de la cuenta</h3>
        <div className="bo-form-grid">
          <Field label="Nombre"><input value={profile.name} onChange={event => setProfile(current => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Email" hint="Cambiarlo cierra todas sus sesiones."><input type="email" value={profile.email} onChange={event => setProfile(current => ({ ...current, email: event.target.value }))} /></Field>
        </div>
        <div className="bo-row-actions">
          <button type="button" className="bo-button bo-button--primary" disabled={!profileChanged} onClick={() => { setDialogError(''); setDialog({ kind: 'profile' }) }}>Guardar</button>
          <button type="button" className="bo-button" onClick={() => { setDialogError(''); setDialog({ kind: 'password' }) }}>Resetear contraseña</button>
          <button type="button" className="bo-button bo-button--danger" onClick={() => { setDialogError(''); setDialog({ kind: 'revokeAll' }) }}>Cerrar todas sus sesiones</button>
        </div>
        {temporaryPassword ? <div className="bo-secret" role="status">
          <p>Contraseña temporal — se muestra una sola vez. Entrégasela por un canal seguro:</p>
          <div>
            <code>{temporaryPassword}</code>
            <button type="button" className="bo-button bo-button--small" onClick={() => navigator.clipboard?.writeText(temporaryPassword)}>
              <RiFileCopyLine aria-hidden="true" />Copiar
            </button>
            <button type="button" className="bo-button bo-button--small" onClick={() => setTemporaryPassword('')}>Ocultar</button>
          </div>
        </div> : null}
      </section>

      <section className="bo-card">
        <h3>Organizaciones ({user.memberships.length})</h3>
        <ul className="bo-mini-list">
          {user.memberships.map(membership => <li key={membership.id}>
            <div>
              <button type="button" className="bo-link bo-link--strong" onClick={() => onOpenOrganization(membership.orgId)}>{membership.org.name}</button>
              <small className="bo-muted">
                {catalog.allRoles.find(role => role.key === membership.role)?.label || membership.role} · {membership.status}
                {membership.isDefault ? ' · por defecto' : ''}
              </small>
            </div>
            <button type="button" className="bo-button bo-button--small" disabled={user.isPlatformAdmin || membership.status !== 'active'} onClick={() => onImpersonate(user, membership.orgId)}>
              Entrar como
            </button>
          </li>)}
        </ul>
      </section>
    </div>

    <section className="bo-card">
      <h3>Sesiones ({data.sessions.length})</h3>
      {data.sessions.length ? <div className="bo-table-wrap">
        <table>
          <thead><tr><th scope="col">Estado</th><th scope="col">Abierta</th><th scope="col">Último uso</th><th scope="col">Caduca</th><th scope="col">Organización</th><th scope="col"></th></tr></thead>
          <tbody>
            {data.sessions.map(session => {
              const state = sessionState(session)
              return <tr key={session.id}>
                <td>
                  <Badge tone={state.tone}>{state.label}</Badge>
                  {session.impersonator ? <small className="bo-muted">por {session.impersonator.email}</small> : null}
                </td>
                <td title={formatDate(session.createdAt, true)}>{relativeTime(session.createdAt)}</td>
                <td>{relativeTime(session.lastUsedAt)}</td>
                <td title={formatDate(session.expiresAt, true)}>{relativeTime(session.expiresAt)}</td>
                <td className="bo-muted"><code>{session.activeOrgId || '—'}</code></td>
                <td>
                  {state.label === 'Activa' || state.label === 'Suplantación'
                    ? <button type="button" className="bo-button bo-button--small bo-button--danger" onClick={() => { setDialogError(''); setDialog({ kind: 'revokeSession', session }) }}>Revocar</button>
                    : null}
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div> : <p className="bo-muted">Sin sesiones registradas.</p>}
    </section>

    {data.platformAudit.length ? <section className="bo-card">
      <h3>Lo que se ha hecho sobre esta cuenta desde el back office</h3>
      <div className="bo-table-wrap">
        <table>
          <thead><tr><th scope="col">Cuándo</th><th scope="col">Operador</th><th scope="col">Acción</th><th scope="col">Motivo</th></tr></thead>
          <tbody>
            {data.platformAudit.map(entry => <tr key={entry.id}>
              <td title={formatDate(entry.createdAt, true)}>{relativeTime(entry.createdAt)}</td>
              <td>{entry.actorEmail}</td>
              <td><code>{entry.action}</code></td>
              <td className="bo-reason">{entry.reason || '—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section> : null}

    {dialog?.kind === 'profile' ? <ActionDialog
      title="Guardar cambios de la cuenta"
      description={profile.email !== user.email ? 'Cambias el email: se cerrarán todas sus sesiones.' : undefined}
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(
        () => backOffice.updateUser(id, {
          ...(profile.name !== user.name ? { name: profile.name } : {}),
          ...(profile.email !== user.email ? { email: profile.email } : {}),
          reason,
        }),
        'Cuenta actualizada.',
      )}
    /> : null}

    {dialog?.kind === 'password' ? <ActionDialog
      title="Resetear la contraseña"
      description="Se genera una contraseña temporal, se cierran todas sus sesiones y se te muestra una sola vez. No se envía ningún correo."
      confirmLabel="Resetear" danger
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={async reason => {
        const result = await run(() => backOffice.resetPassword(id, { reason }), 'Contraseña reseteada.')
        if (result?.temporaryPassword) setTemporaryPassword(result.temporaryPassword)
      }}
    /> : null}

    {dialog?.kind === 'revokeAll' ? <ActionDialog
      title="Cerrar todas las sesiones"
      description="Tendrá que volver a iniciar sesión en todos sus dispositivos."
      confirmLabel="Cerrar sesiones" danger
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(() => backOffice.revokeUserSessions(id, { reason }), 'Sesiones cerradas.')}
    /> : null}

    {dialog?.kind === 'revokeSession' ? <ActionDialog
      title="Revocar esta sesión"
      confirmLabel="Revocar" danger
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(() => backOffice.revokeSession(dialog.session.id, { reason }), 'Sesión revocada.')}
    /> : null}
  </div>
}

export default function UsersSection({ catalog, focusId, onFocus, onOpenOrganization, onImpersonate, notify }) {
  if (focusId) {
    return <UserDetail
      id={focusId}
      catalog={catalog}
      onBack={() => onFocus(null)}
      onOpenOrganization={onOpenOrganization}
      onImpersonate={onImpersonate}
      notify={notify}
    />
  }
  return <UserList catalog={catalog} onOpen={onFocus} onImpersonate={onImpersonate} />
}
