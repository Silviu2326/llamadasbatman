import { useCallback, useEffect, useState } from 'react'
import { backOffice, formatDate, formatMoney, relativeTime } from './backOfficeApi'
import { DistributionBars, ErrorNote, Spinner, StatTile } from './ui'

export default function OverviewSection({ onOpenOrganization, onOpenUser }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await backOffice.overview())
    } catch (caught) {
      setError(caught.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading && !data) return <Spinner label="Cargando el estado de la plataforma" />

  return <div className="bo-section">
    <ErrorNote error={error} onRetry={load} />

    {data ? <>
      <dl className="bo-stat-row">
        <StatTile label="Organizaciones" value={data.totals.organizations} hint={`+${data.totals.newOrganizations30d} en 30 días`} />
        <StatTile label="Usuarios" value={data.totals.users} hint={`+${data.totals.newUsers30d} en 30 días`} />
        <StatTile label="Sesiones activas" value={data.totals.activeSessions} hint={data.totals.impersonations ? `${data.totals.impersonations} suplantando` : 'Sin suplantaciones'} tone={data.totals.impersonations ? 'warn' : undefined} />
        <StatTile label="Operadores de plataforma" value={data.totals.platformAdmins} hint="Acceso a este back office" />
        <StatTile label="Saldo total en wallets" value={formatMoney(data.totals.walletBalanceCents)} hint={`${data.totals.wallets} wallets`} />
      </dl>

      <div className="bo-split">
        <section className="bo-card">
          <h2>Organizaciones por plan</h2>
          <DistributionBars rows={data.plans.map(row => ({ key: row.plan, label: row.plan, count: row.count }))} emptyLabel="Todavía no hay organizaciones." />
        </section>
        <section className="bo-card">
          <h2>Miembros activos por rol</h2>
          <DistributionBars rows={data.roles.map(row => ({ key: row.role, label: row.label, count: row.count }))} emptyLabel="Todavía no hay membresías activas." />
        </section>
      </div>

      <section className="bo-card">
        <h2>Últimas acciones del back office</h2>
        {data.recentActions.length ? <div className="bo-table-wrap">
          <table>
            <thead><tr><th scope="col">Cuándo</th><th scope="col">Operador</th><th scope="col">Acción</th><th scope="col">Sobre</th><th scope="col">Motivo</th></tr></thead>
            <tbody>
              {data.recentActions.map(entry => <tr key={entry.id}>
                <td title={formatDate(entry.createdAt, true)}>{relativeTime(entry.createdAt)}</td>
                <td>{entry.actorEmail}</td>
                <td><code>{entry.action}</code></td>
                <td>
                  {entry.orgId
                    ? <button type="button" className="bo-link" onClick={() => onOpenOrganization(entry.orgId)}>{entry.orgId}</button>
                    : entry.targetUserId
                      ? <button type="button" className="bo-link" onClick={() => onOpenUser(entry.targetUserId)}>{entry.targetUserId}</button>
                      : <span className="bo-muted">{entry.entityType}</span>}
                </td>
                <td className="bo-reason">{entry.reason || '—'}</td>
              </tr>)}
            </tbody>
          </table>
        </div> : <p className="bo-muted">Todavía no se ha hecho nada desde el back office.</p>}
      </section>
    </> : null}
  </div>
}
