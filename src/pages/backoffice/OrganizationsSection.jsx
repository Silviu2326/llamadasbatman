import { useCallback, useEffect, useState } from 'react'
import { RiAddLine, RiArrowLeftLine, RiSearchLine } from 'react-icons/ri'
import { backOffice, formatDate, formatMoney, formatNumber, relativeTime } from './backOfficeApi'
import { ActionDialog, Badge, EmptyState, ErrorNote, Field, Pager, Spinner } from './ui'

function OrganizationList({ catalog, onOpen, onCreated, notify }) {
  const [filters, setFilters] = useState({ q: '', plan: '' })
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ name: '', plan: 'free', email: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await backOffice.organizations({ ...filters, page }))
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

  async function create(reason) {
    setBusy(true)
    setDialogError('')
    try {
      const result = await backOffice.createOrganization({ ...draft, email: draft.email || undefined, reason })
      setCreating(false)
      setDraft({ name: '', plan: 'free', email: '' })
      notify(`Organización «${result.organization.name}» creada.`)
      onCreated(result.organization.id)
    } catch (caught) {
      setDialogError(caught.message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="bo-section">
    <div className="bo-toolbar">
      <form className="bo-search" onSubmit={applySearch}>
        <RiSearchLine aria-hidden="true" />
        <input type="search" value={search} placeholder="Nombre, email, web o ID" aria-label="Buscar organizaciones" onChange={event => setSearch(event.target.value)} />
        <button type="submit" className="bo-button">Buscar</button>
      </form>
      <label className="bo-inline-field">
        <span>Plan</span>
        <select value={filters.plan} onChange={event => { setPage(1); setFilters(current => ({ ...current, plan: event.target.value })) }}>
          <option value="">Todos</option>
          {catalog.plans.map(plan => <option key={plan} value={plan}>{plan}</option>)}
        </select>
      </label>
      <button type="button" className="bo-button bo-button--primary" onClick={() => { setDialogError(''); setCreating(true) }}>
        <RiAddLine aria-hidden="true" />Nueva organización
      </button>
    </div>

    <ErrorNote error={error} onRetry={load} />
    {loading && !data ? <Spinner label="Cargando organizaciones" /> : null}

    {data ? data.organizations.length ? <>
      <div className="bo-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Organización</th><th scope="col">Plan</th><th scope="col">Miembros</th>
              <th scope="col">Leads</th><th scope="col">Campañas</th><th scope="col">Saldo</th><th scope="col">Alta</th>
            </tr>
          </thead>
          <tbody>
            {data.organizations.map(org => <tr key={org.id}>
              <td>
                <button type="button" className="bo-link bo-link--strong" onClick={() => onOpen(org.id)}>{org.name}</button>
                <small className="bo-muted">{org.email || org.website || org.id}</small>
              </td>
              <td><Badge tone={org.plan === 'free' ? 'neutral' : 'accent'}>{org.plan}</Badge></td>
              <td>{formatNumber(org._count.memberships)}</td>
              <td>{formatNumber(org._count.leads)}</td>
              <td>{formatNumber(org._count.campaigns)}</td>
              <td>{org.wallet ? formatMoney(org.wallet.balanceCents, org.wallet.currency) : '—'}</td>
              <td title={formatDate(org.createdAt, true)}>{formatDate(org.createdAt)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pages={data.pages} total={data.total} busy={loading} onChange={setPage} />
    </> : <EmptyState title="Ninguna organización coincide">Prueba con otro término o quita el filtro de plan.</EmptyState> : null}

    {creating ? <ActionDialog
      title="Crear organización"
      description="Se crea vacía y en el plan indicado. Puedes asignarle un propietario existente por su ID de usuario."
      confirmLabel="Crear"
      busy={busy}
      error={dialogError}
      onClose={() => setCreating(false)}
      onSubmit={create}
    >
      <Field label="Nombre"><input value={draft.name} required minLength={2} maxLength={160} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></Field>
      <Field label="Plan">
        <select value={draft.plan} onChange={event => setDraft(current => ({ ...current, plan: event.target.value }))}>
          {catalog.plans.map(plan => <option key={plan} value={plan}>{plan}</option>)}
        </select>
      </Field>
      <Field label="Email de contacto" hint="Opcional."><input type="email" value={draft.email} onChange={event => setDraft(current => ({ ...current, email: event.target.value }))} /></Field>
      <Field label="ID del propietario" hint="Opcional. Si lo indicas, esa persona entra como owner.">
        <input value={draft.ownerUserId || ''} onChange={event => setDraft(current => ({ ...current, ownerUserId: event.target.value.trim() || undefined }))} />
      </Field>
    </ActionDialog> : null}
  </div>
}

function OrganizationDetail({ id, catalog, onBack, onOpenUser, onImpersonate, notify }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await backOffice.organization(id)
      setData(result)
      setProfile({
        name: result.organization.name,
        plan: result.organization.plan,
        email: result.organization.email || '',
        website: result.organization.website || '',
        industry: result.organization.industry || '',
        mauticEnabled: result.organization.mauticEnabled,
        metricoolEnabled: result.organization.metricoolEnabled,
      })
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
      await action()
      setDialog(null)
      notify(successMessage)
      await load()
    } catch (caught) {
      setDialogError(caught.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Spinner label="Cargando la organización" />
  if (!data) return <div className="bo-section"><ErrorNote error={error} onRetry={load} /></div>

  const { organization: org } = data
  // Solo se envían los campos que de verdad cambian: el backend rechaza un
  // patch vacío y la auditoría no debe llenarse de cambios que no lo son.
  const profileChanges = Object.fromEntries(
    Object.entries(profile).filter(([key, value]) => value !== '' && value !== (org[key] ?? '')),
  )

  return <div className="bo-section">
    <button type="button" className="bo-back" onClick={onBack}><RiArrowLeftLine aria-hidden="true" />Volver a organizaciones</button>
    <ErrorNote error={error} onRetry={load} />

    <header className="bo-detail-head">
      <div>
        <h2>{org.name}</h2>
        <p className="bo-muted"><code>{org.id}</code> · alta {formatDate(org.createdAt)} · {org.currency} · {org.timezone}</p>
      </div>
      <div className="bo-detail-badges">
        <Badge tone={org.plan === 'free' ? 'neutral' : 'accent'}>{org.plan}</Badge>
        {org.mauticEnabled ? <Badge tone="ok">Mautic</Badge> : null}
        {org.metricoolEnabled ? <Badge tone="ok">Metricool</Badge> : null}
        {org.stripeCustomerId ? <Badge tone="neutral">Stripe</Badge> : null}
        {org.agencyClientWorkspace ? <Badge tone="warn">Cliente de agencia</Badge> : null}
      </div>
    </header>

    <dl className="bo-stat-row bo-stat-row--compact">
      {[
        ['Miembros', org._count.memberships], ['Leads', org._count.leads], ['Cuentas', org._count.accounts],
        ['Campañas', org._count.campaigns], ['Llamadas', org._count.calls], ['Agentes', org._count.agents],
        ['Trabajos', org._count.jobs], ['Activos', org._count.assets],
      ].map(([label, value]) => <div key={label} className="bo-stat bo-stat--mini"><dt>{label}</dt><dd>{formatNumber(value)}</dd></div>)}
    </dl>

    <div className="bo-split">
      <section className="bo-card">
        <h3>Datos y plan</h3>
        <div className="bo-form-grid">
          <Field label="Nombre"><input value={profile.name} onChange={event => setProfile(current => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Plan">
            <select value={profile.plan} onChange={event => setProfile(current => ({ ...current, plan: event.target.value }))}>
              {catalog.plans.map(plan => <option key={plan} value={plan}>{plan}</option>)}
            </select>
          </Field>
          <Field label="Email"><input type="email" value={profile.email} onChange={event => setProfile(current => ({ ...current, email: event.target.value }))} /></Field>
          <Field label="Web"><input type="url" value={profile.website} onChange={event => setProfile(current => ({ ...current, website: event.target.value }))} /></Field>
          <Field label="Sector"><input value={profile.industry} onChange={event => setProfile(current => ({ ...current, industry: event.target.value }))} /></Field>
          <label className="bo-check"><input type="checkbox" checked={profile.mauticEnabled} onChange={event => setProfile(current => ({ ...current, mauticEnabled: event.target.checked }))} /><span>Mautic activo</span></label>
          <label className="bo-check"><input type="checkbox" checked={profile.metricoolEnabled} onChange={event => setProfile(current => ({ ...current, metricoolEnabled: event.target.checked }))} /><span>Metricool activo</span></label>
        </div>
        <button
          type="button"
          className="bo-button bo-button--primary"
          disabled={!Object.keys(profileChanges).length}
          onClick={() => { setDialogError(''); setDialog({ kind: 'profile' }) }}
        >
          Guardar {Object.keys(profileChanges).length ? `(${Object.keys(profileChanges).length} cambio${Object.keys(profileChanges).length === 1 ? '' : 's'})` : ''}
        </button>
      </section>

      <section className="bo-card">
        <h3>Wallet</h3>
        <p className="bo-hero">{org.wallet ? formatMoney(org.wallet.balanceCents, org.wallet.currency) : formatMoney(0, org.currency)}</p>
        <p className="bo-muted">
          {org.wallet ? `Actualizado ${relativeTime(org.wallet.updatedAt)}` : 'Todavía no tiene wallet; el primer ajuste lo crea.'}
        </p>
        <button type="button" className="bo-button" onClick={() => { setDialogError(''); setDialog({ kind: 'wallet', amount: '' }) }}>Ajustar saldo</button>
        {data.walletMovements.length ? <ul className="bo-mini-list">
          {data.walletMovements.slice(0, 6).map(movement => <li key={movement.id}>
            <span className={movement.amountCents >= 0 ? 'bo-amount bo-amount--in' : 'bo-amount bo-amount--out'}>
              {movement.amountCents >= 0 ? '+' : ''}{formatMoney(movement.amountCents, org.currency)}
            </span>
            <span className="bo-muted">{movement.reason} · {relativeTime(movement.createdAt)}</span>
          </li>)}
        </ul> : null}
      </section>
    </div>

    <section className="bo-card">
      <h3>Miembros ({data.members.length})</h3>
      <div className="bo-table-wrap">
        <table>
          <thead><tr><th scope="col">Persona</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Desde</th><th scope="col">Acciones</th></tr></thead>
          <tbody>
            {data.members.map(member => <tr key={member.id}>
              <td>
                <button type="button" className="bo-link bo-link--strong" onClick={() => onOpenUser(member.user.id)}>{member.user.name}</button>
                <small className="bo-muted">{member.user.email}{member.user.isPlatformAdmin ? ' · operador' : ''}</small>
              </td>
              <td>
                <select
                  value={member.role}
                  aria-label={`Rol de ${member.user.name}`}
                  onChange={event => { setDialogError(''); setDialog({ kind: 'role', member, role: event.target.value }) }}
                >
                  {catalog.allRoles.map(role => <option key={role.key} value={role.key}>{role.label}</option>)}
                </select>
              </td>
              <td>
                <select
                  value={member.status}
                  aria-label={`Estado de ${member.user.name}`}
                  onChange={event => { setDialogError(''); setDialog({ kind: 'status', member, status: event.target.value }) }}
                >
                  <option value="active">Activo</option>
                  <option value="invited">Invitado</option>
                  <option value="suspended">Suspendido</option>
                </select>
              </td>
              <td title={formatDate(member.createdAt, true)}>{formatDate(member.createdAt)}</td>
              <td className="bo-row-actions">
                <button type="button" className="bo-button bo-button--small" disabled={member.user.isPlatformAdmin} onClick={() => onImpersonate(member.user, org.id)}>Entrar como</button>
                <button type="button" className="bo-button bo-button--small bo-button--danger" onClick={() => { setDialogError(''); setDialog({ kind: 'remove', member }) }}>Quitar</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <button type="button" className="bo-button" onClick={() => { setDialogError(''); setDialog({ kind: 'add', userId: '', role: 'sales_rep' }) }}>
        <RiAddLine aria-hidden="true" />Añadir miembro por ID de usuario
      </button>
    </section>

    <div className="bo-split">
      <section className="bo-card">
        <h3>Claves de API ({data.apiKeys.length})</h3>
        {data.apiKeys.length ? <ul className="bo-mini-list">
          {data.apiKeys.map(key => <li key={key.id}>
            <div>
              <strong>{key.name}</strong> <code>{key.prefix}…</code>
              <small className="bo-muted">{key.user?.email} · usada {relativeTime(key.lastUsedAt) }</small>
            </div>
            {key.revokedAt
              ? <Badge tone="muted">Revocada</Badge>
              : <button type="button" className="bo-button bo-button--small bo-button--danger" onClick={() => { setDialogError(''); setDialog({ kind: 'revokeKey', key }) }}>Revocar</button>}
          </li>)}
        </ul> : <p className="bo-muted">Sin claves de API.</p>}
      </section>

      <section className="bo-card">
        <h3>Integraciones conectadas ({data.integrations.length})</h3>
        {data.integrations.length ? <ul className="bo-mini-list">
          {data.integrations.map(item => <li key={item.id}>
            <strong>{item.provider}</strong>
            <span className="bo-muted">actualizada {relativeTime(item.updatedAt)}</span>
          </li>)}
        </ul> : <p className="bo-muted">Sin credenciales de integración.</p>}
        <p className="bo-note">Los secretos no se muestran nunca: el back office indica qué hay conectado, no permite leer las credenciales de un cliente.</p>
      </section>
    </div>

    {data.recentAudit.length ? <section className="bo-card">
      <h3>Actividad reciente de la organización</h3>
      <div className="bo-table-wrap">
        <table>
          <thead><tr><th scope="col">Cuándo</th><th scope="col">Quién</th><th scope="col">Acción</th><th scope="col">Entidad</th></tr></thead>
          <tbody>
            {data.recentAudit.map(entry => <tr key={entry.id}>
              <td title={formatDate(entry.createdAt, true)}>{relativeTime(entry.createdAt)}</td>
              <td>{entry.actor?.email || 'sistema'}</td>
              <td><code>{entry.action}</code></td>
              <td className="bo-muted">{entry.entityType}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section> : null}

    {dialog?.kind === 'profile' ? <ActionDialog
      title="Guardar cambios de la organización"
      description={`Se modificará: ${Object.keys(profileChanges).join(', ')}.`}
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(() => backOffice.updateOrganization(id, { ...profileChanges, reason }), 'Organización actualizada.')}
    /> : null}

    {dialog?.kind === 'wallet' ? <ActionDialog
      title="Ajustar el saldo del wallet"
      description="En euros. Usa un valor negativo para descontar. Queda como movimiento de tipo «adjustment»."
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(
        () => backOffice.adjustWallet(id, { amountCents: Math.round(Number(dialog.amount) * 100), reason }),
        'Saldo ajustado.',
      )}
    >
      <Field label="Importe (€)" hint="Por ejemplo 50 para abonar 50 €, o -25 para descontar 25 €.">
        <input type="number" step="0.01" required value={dialog.amount} onChange={event => setDialog(current => ({ ...current, amount: event.target.value }))} />
      </Field>
    </ActionDialog> : null}

    {dialog?.kind === 'role' ? <ActionDialog
      title={`Cambiar el rol de ${dialog.member.user.name}`}
      description={`De «${dialog.member.role}» a «${dialog.role}». Se cerrarán sus sesiones en esta organización para que el cambio surta efecto de inmediato.`}
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(
        () => backOffice.setMembershipRole({ userId: dialog.member.user.id, orgId: id, role: dialog.role, reason }),
        'Rol actualizado.',
      )}
    /> : null}

    {dialog?.kind === 'status' ? <ActionDialog
      title={`Cambiar el estado de ${dialog.member.user.name}`}
      description={`De «${dialog.member.status}» a «${dialog.status}».${dialog.status !== 'active' ? ' Perderá el acceso y se cerrarán sus sesiones.' : ''}`}
      danger={dialog.status !== 'active'}
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(
        () => backOffice.setMembershipStatus({ userId: dialog.member.user.id, orgId: id, status: dialog.status, reason }),
        'Estado actualizado.',
      )}
    /> : null}

    {dialog?.kind === 'remove' ? <ActionDialog
      title={`Quitar a ${dialog.member.user.name} de la organización`}
      description="Deja de ser miembro y pierde el acceso. La cuenta de usuario no se borra."
      confirmLabel="Quitar" danger
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(() => backOffice.removeMembership({ userId: dialog.member.user.id, orgId: id, reason }), 'Miembro retirado.')}
    /> : null}

    {dialog?.kind === 'add' ? <ActionDialog
      title="Añadir un miembro"
      description="El usuario ya debe existir. Puedes copiar su ID desde la pestaña Usuarios."
      confirmLabel="Añadir"
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(() => backOffice.addMembership({ userId: dialog.userId.trim(), orgId: id, role: dialog.role, reason }), 'Miembro añadido.')}
    >
      <Field label="ID de usuario"><input required value={dialog.userId} onChange={event => setDialog(current => ({ ...current, userId: event.target.value }))} /></Field>
      <Field label="Rol">
        <select value={dialog.role} onChange={event => setDialog(current => ({ ...current, role: event.target.value }))}>
          {catalog.roles.map(role => <option key={role.key} value={role.key}>{role.label}</option>)}
        </select>
      </Field>
    </ActionDialog> : null}

    {dialog?.kind === 'revokeKey' ? <ActionDialog
      title={`Revocar la clave «${dialog.key.name}»`}
      description="Cualquier integración que la use dejará de funcionar de inmediato. No se puede deshacer."
      confirmLabel="Revocar" danger
      busy={busy} error={dialogError}
      onClose={() => setDialog(null)}
      onSubmit={reason => run(() => backOffice.revokeApiKey(dialog.key.id, { reason }), 'Clave revocada.')}
    /> : null}
  </div>
}

export default function OrganizationsSection({ catalog, focusId, onFocus, onOpenUser, onImpersonate, notify }) {
  if (focusId) {
    return <OrganizationDetail
      id={focusId}
      catalog={catalog}
      onBack={() => onFocus(null)}
      onOpenUser={onOpenUser}
      onImpersonate={onImpersonate}
      notify={notify}
    />
  }
  return <OrganizationList catalog={catalog} onOpen={onFocus} onCreated={onFocus} notify={notify} />
}
