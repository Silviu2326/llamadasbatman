import { useMemo, useState } from 'react'
import { RiSearchLine } from 'react-icons/ri'
import { Badge, EmptyState } from './ui'

const SCOPE_LABEL = { own: 'Propios', team: 'Equipo', org: 'Organización' }
const SCOPE_MARK = { own: 'P', team: 'E', org: 'O' }

/**
 * La matriz es de solo lectura a propósito: el catálogo RBAC vive en el código
 * (`backend/src/access-control/catalog.ts`) y un permiso nuevo queda denegado
 * para todos hasta que alguien lo añada a un rol y eso pase por revisión. Aquí
 * se expone para poder auditarlo de un vistazo, no para editarlo en caliente.
 */
export default function PermissionsSection({ catalog }) {
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')
  const [showLegacy, setShowLegacy] = useState(false)

  const roles = useMemo(
    () => catalog.matrix.roles.filter(role => showLegacy || !role.legacy),
    [catalog.matrix.roles, showLegacy],
  )
  const groups = useMemo(
    () => [...new Set(catalog.matrix.permissions.map(permission => permission.group))].sort(),
    [catalog.matrix.permissions],
  )
  const permissions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return catalog.matrix.permissions.filter(permission => {
      if (group && permission.group !== group) return false
      if (!term) return true
      return permission.key.toLowerCase().includes(term)
    })
  }, [catalog.matrix.permissions, group, search])

  return <div className="bo-section">
    <div className="bo-toolbar">
      <div className="bo-search">
        <RiSearchLine aria-hidden="true" />
        <input type="search" value={search} placeholder="Buscar permiso, p. ej. leads.write" aria-label="Buscar permisos" onChange={event => setSearch(event.target.value)} />
      </div>
      <label className="bo-inline-field">
        <span>Grupo</span>
        <select value={group} onChange={event => setGroup(event.target.value)}>
          <option value="">Todos ({groups.length})</option>
          {groups.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="bo-check">
        <input type="checkbox" checked={showLegacy} onChange={event => setShowLegacy(event.target.checked)} />
        <span>Incluir roles heredados</span>
      </label>
    </div>

    <section className="bo-card">
      <h2>Roles ({roles.length})</h2>
      <div className="bo-role-grid">
        {roles.map(role => <article key={role.key} className="bo-role">
          <header><h3>{role.label}</h3>{role.legacy ? <Badge tone="muted">heredado</Badge> : null}</header>
          <p>{role.description}</p>
          <footer><code>{role.key}</code> · {role.permissionCount} permisos</footer>
        </article>)}
      </div>
    </section>

    <section className="bo-card">
      <h2>Matriz de permisos ({permissions.length})</h2>
      <p className="bo-note">
        Cada celda indica el alcance máximo concedido: <strong>P</strong> propios, <strong>E</strong> equipo,
        <strong> O</strong> toda la organización. Una celda vacía es denegación. Es el catálogo estático del servidor,
        no una copia editable: cambiarlo requiere revisión y despliegue.
      </p>
      {permissions.length ? <div className="bo-table-wrap bo-table-wrap--matrix">
        <table className="bo-matrix">
          <thead>
            <tr>
              <th scope="col">Permiso</th>
              {roles.map(role => <th key={role.key} scope="col" title={role.description}><span>{role.label}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {permissions.map(permission => <tr key={permission.key}>
              <th scope="row"><code>{permission.key}</code></th>
              {roles.map(role => {
                const grant = permission.roles.find(entry => entry.role === role.key)
                return <td key={role.key} className={grant ? `bo-cell bo-cell--${grant.scope}` : 'bo-cell'}>
                  {grant
                    ? <abbr title={`${role.label}: ${SCOPE_LABEL[grant.scope]}`}>{SCOPE_MARK[grant.scope]}</abbr>
                    : <span className="sr-only">Sin permiso</span>}
                </td>
              })}
            </tr>)}
          </tbody>
        </table>
      </div> : <EmptyState title="Ningún permiso coincide">Prueba con otro término o cambia el grupo.</EmptyState>}
    </section>

    <section className="bo-card">
      <h2>Planes y límites</h2>
      <div className="bo-table-wrap">
        <table>
          <thead><tr><th scope="col">Plan</th><th scope="col">Capacidades</th><th scope="col">Límites</th></tr></thead>
          <tbody>
            {catalog.matrix.plans.map(entry => <tr key={entry.plan}>
              <th scope="row"><Badge tone={entry.plan === 'free' ? 'neutral' : 'accent'}>{entry.plan}</Badge></th>
              <td>
                <div className="bo-chips">
                  {(entry.policy.capabilities || []).map(capability => <span key={capability} className="bo-chip">{capability}</span>)}
                </div>
              </td>
              <td>
                <div className="bo-chips">
                  {Object.entries(entry.policy.limits || {}).map(([resource, limit]) => (
                    <span key={resource} className="bo-chip">{resource}<small>{limit === null ? 'sin límite' : limit}</small></span>
                  ))}
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>
}
