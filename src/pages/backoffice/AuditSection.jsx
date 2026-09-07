import { useCallback, useEffect, useState } from 'react'
import { RiSearchLine } from 'react-icons/ri'
import { backOffice, formatDate, relativeTime } from './backOfficeApi'
import { EmptyState, ErrorNote, Pager, Spinner } from './ui'

function JsonPeek({ label, value }) {
  if (!value || (typeof value === 'object' && !Object.keys(value).length)) return null
  return <details className="bo-json"><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>
}

export default function AuditSection({ onOpenUser, onOpenOrganization }) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ action: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await backOffice.audit({ ...filters, page }))
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
    setFilters({ action: search.trim() })
  }

  return <div className="bo-section">
    <div className="bo-toolbar">
      <form className="bo-search" onSubmit={applySearch}>
        <RiSearchLine aria-hidden="true" />
        <input type="search" value={search} placeholder="Filtrar por acción, p. ej. impersonate" aria-label="Filtrar auditoría" onChange={event => setSearch(event.target.value)} />
        <button type="submit" className="bo-button">Filtrar</button>
      </form>
    </div>

    <p className="bo-note">
      Cada acción del back office se registra aquí con quién la hizo, sobre qué, el antes y el después, y el motivo escrito
      en ese momento. El registro no se borra al eliminar una organización ni al borrar al operador: por eso vive aparte de
      la auditoría de cada organización.
    </p>

    <ErrorNote error={error} onRetry={load} />
    {loading && !data ? <Spinner label="Cargando auditoría" /> : null}

    {data ? data.entries.length ? <>
      <div className="bo-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Cuándo</th><th scope="col">Operador</th><th scope="col">Acción</th>
              <th scope="col">Sobre</th><th scope="col">Motivo</th><th scope="col">Cambio</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map(entry => <tr key={entry.id}>
              <td title={formatDate(entry.createdAt, true)}>{relativeTime(entry.createdAt)}</td>
              <td>
                {entry.actorEmail}
                {entry.ip ? <small className="bo-muted">{entry.ip}</small> : null}
              </td>
              <td><code>{entry.action}</code></td>
              <td>
                <div className="bo-chips">
                  {entry.orgId ? <button type="button" className="bo-chip bo-chip--button" onClick={() => onOpenOrganization(entry.orgId)}>org<small>{entry.orgId}</small></button> : null}
                  {entry.targetUserId ? <button type="button" className="bo-chip bo-chip--button" onClick={() => onOpenUser(entry.targetUserId)}>usuario<small>{entry.targetUserId}</small></button> : null}
                  {!entry.orgId && !entry.targetUserId ? <span className="bo-muted">{entry.entityType}</span> : null}
                </div>
              </td>
              <td className="bo-reason">{entry.reason || '—'}</td>
              <td>
                <JsonPeek label="Antes" value={entry.before} />
                <JsonPeek label="Después" value={entry.after} />
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pages={data.pages} total={data.total} busy={loading} onChange={setPage} />
    </> : <EmptyState title="No hay entradas de auditoría">Aparecerán aquí en cuanto se haga la primera acción desde el back office.</EmptyState> : null}
  </div>
}
