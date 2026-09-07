import { useCallback, useEffect, useState } from 'react'
import { backOffice, formatDate, relativeTime, sessionState } from './backOfficeApi'
import { ActionDialog, Badge, EmptyState, ErrorNote, Pager, Spinner } from './ui'

/** `enabled` evita que la lista oculta se recargue en cada cambio de la visible. */
function useList(fetcher, filters, page, enabled) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError('')
    try {
      setData(await fetcher({ ...filters, page }))
    } catch (caught) {
      setError(caught.message)
    } finally {
      setLoading(false)
    }
  }, [enabled, fetcher, filters, page])

  useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load }
}

export default function SessionsSection({ onOpenUser, onOpenOrganization, notify }) {
  const [view, setView] = useState('sessions')
  const [page, setPage] = useState(1)
  const [sessionFilters, setSessionFilters] = useState({ activeOnly: 'true', impersonatedOnly: '' })
  const [keyFilters, setKeyFilters] = useState({ activeOnly: 'true' })
  const [dialog, setDialog] = useState(null)
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState(false)

  const sessions = useList(backOffice.sessions, sessionFilters, page, view === 'sessions')
  const apiKeys = useList(backOffice.apiKeys, keyFilters, page, view === 'keys')
  const active = view === 'sessions' ? sessions : apiKeys

  async function run(action, message) {
    setBusy(true)
    setDialogError('')
    try {
      await action()
      setDialog(null)
      notify(message)
      await active.reload()
    } catch (caught) {
      setDialogError(caught.message)
    } finally {
      setBusy(false)
    }
  }

  function switchView(next) {
    setView(next)
    setPage(1)
  }

  return <div className="bo-section">
    <div className="bo-toolbar">
      <div className="bo-segmented" role="group" aria-label="Tipo de credencial">
        <button type="button" className={view === 'sessions' ? 'is-active' : ''} onClick={() => switchView('sessions')}>Sesiones</button>
        <button type="button" className={view === 'keys' ? 'is-active' : ''} onClick={() => switchView('keys')}>Claves de API</button>
      </div>
      {view === 'sessions' ? <>
        <label className="bo-check">
          <input type="checkbox" checked={sessionFilters.activeOnly === 'true'} onChange={event => { setPage(1); setSessionFilters(current => ({ ...current, activeOnly: event.target.checked ? 'true' : '' })) }} />
          <span>Solo activas</span>
        </label>
        <label className="bo-check">
          <input type="checkbox" checked={sessionFilters.impersonatedOnly === 'true'} onChange={event => { setPage(1); setSessionFilters(current => ({ ...current, impersonatedOnly: event.target.checked ? 'true' : '' })) }} />
          <span>Solo suplantaciones</span>
        </label>
      </> : <label className="bo-check">
        <input type="checkbox" checked={keyFilters.activeOnly === 'true'} onChange={event => { setPage(1); setKeyFilters({ activeOnly: event.target.checked ? 'true' : '' }) }} />
        <span>Solo vigentes</span>
      </label>}
    </div>

    <ErrorNote error={active.error} onRetry={active.reload} />
    {active.loading && !active.data ? <Spinner label="Cargando" /> : null}

    {view === 'sessions' && sessions.data ? sessions.data.sessions.length ? <>
      <div className="bo-table-wrap">
        <table>
          <thead><tr><th scope="col">Estado</th><th scope="col">Persona</th><th scope="col">Organización</th><th scope="col">Abierta</th><th scope="col">Último uso</th><th scope="col">Caduca</th><th scope="col"></th></tr></thead>
          <tbody>
            {sessions.data.sessions.map(session => {
              const state = sessionState(session)
              return <tr key={session.id}>
                <td>
                  <Badge tone={state.tone}>{state.label}</Badge>
                  {session.impersonator ? <small className="bo-muted">por {session.impersonator.email}</small> : null}
                </td>
                <td>
                  <button type="button" className="bo-link bo-link--strong" onClick={() => onOpenUser(session.user.id)}>{session.user.name}</button>
                  <small className="bo-muted">{session.user.email}</small>
                </td>
                <td>
                  {session.activeOrgId
                    ? <button type="button" className="bo-link" onClick={() => onOpenOrganization(session.activeOrgId)}><code>{session.activeOrgId}</code></button>
                    : '—'}
                </td>
                <td title={formatDate(session.createdAt, true)}>{relativeTime(session.createdAt)}</td>
                <td>{relativeTime(session.lastUsedAt)}</td>
                <td title={formatDate(session.expiresAt, true)}>{relativeTime(session.expiresAt)}</td>
                <td>
                  {session.revokedAt || new Date(session.expiresAt) <= new Date()
                    ? null
                    : <button type="button" className="bo-button bo-button--small bo-button--danger" onClick={() => { setDialogError(''); setDialog({ kind: 'session', session }) }}>Revocar</button>}
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <Pager page={sessions.data.page} pages={sessions.data.pages} total={sessions.data.total} busy={sessions.loading} onChange={setPage} />
    </> : <EmptyState title="No hay sesiones que mostrar">Quita el filtro para ver también las revocadas y caducadas.</EmptyState> : null}

    {view === 'keys' && apiKeys.data ? apiKeys.data.apiKeys.length ? <>
      <div className="bo-table-wrap">
        <table>
          <thead><tr><th scope="col">Clave</th><th scope="col">Organización</th><th scope="col">Actúa como</th><th scope="col">Último uso</th><th scope="col">Creada</th><th scope="col"></th></tr></thead>
          <tbody>
            {apiKeys.data.apiKeys.map(key => <tr key={key.id}>
              <td>
                <strong>{key.name}</strong>
                <small className="bo-muted"><code>{key.prefix}…</code></small>
              </td>
              <td><button type="button" className="bo-link" onClick={() => onOpenOrganization(key.org.id)}>{key.org.name}</button></td>
              <td>
                <button type="button" className="bo-link" onClick={() => onOpenUser(key.user.id)}>{key.user.email}</button>
              </td>
              <td>{relativeTime(key.lastUsedAt)}</td>
              <td title={formatDate(key.createdAt, true)}>{formatDate(key.createdAt)}</td>
              <td>
                {key.revokedAt
                  ? <Badge tone="muted">Revocada</Badge>
                  : <button type="button" className="bo-button bo-button--small bo-button--danger" onClick={() => { setDialogError(''); setDialog({ kind: 'key', key }) }}>Revocar</button>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager page={apiKeys.data.page} pages={apiKeys.data.pages} total={apiKeys.data.total} busy={apiKeys.loading} onChange={setPage} />
    </> : <EmptyState title="No hay claves de API">Quita el filtro para ver también las revocadas.</EmptyState> : null}

    {dialog?.kind === 'session' ? <ActionDialog
      title={`Revocar la sesión de ${dialog.session.user.email}`}
      description="Tendrá que volver a iniciar sesión en ese dispositivo."
      confirmLabel="Revocar" danger
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(() => backOffice.revokeSession(dialog.session.id, { reason }), 'Sesión revocada.')}
    /> : null}

    {dialog?.kind === 'key' ? <ActionDialog
      title={`Revocar la clave «${dialog.key.name}»`}
      description="Cualquier integración que la use dejará de funcionar de inmediato. No se puede deshacer."
      confirmLabel="Revocar" danger
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(() => backOffice.revokeApiKey(dialog.key.id, { reason }), 'Clave revocada.')}
    /> : null}
  </div>
}
